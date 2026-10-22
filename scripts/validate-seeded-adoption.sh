#!/usr/bin/env bash
# Rehearse schema changes against synthetic data.
#
# REHEARSAL=adopt|upgrade|both (default both). The mode is this argument.
# It is not chosen by looking at the database origin/main happens to create.
#
# adopt: build an un-adopted v1 database from the pinned pre-adoption commit,
# seed it through that commit's HTTP handlers, and require --plan to stamp.
# upgrade: build a database from current origin/main (already adopted), seed
# it through that app, and require --plan to be the forward action from
# main's revision to this branch's head.
#
# Set BATCH_PROOF=1 to also run the uncommitted batch-recreate check after
# adopt. That proof is local only; CI leaves it unset.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
py="${PY:-$root/.venv/bin/python}"
image="${SITE_IMAGE:-personal-site:development}"
rehearsal="${REHEARSAL:-both}"
case "$rehearsal" in
  adopt|upgrade|both) ;;
  *)
    echo "REHEARSAL must be adopt, upgrade, or both" >&2
    exit 2
    ;;
esac

# Last commit whose create_all path writes an un-adopted v1 database
# (PR #4). PR #5 is the first main that stamps site_alembic_version.
# Pinned so later main commits cannot turn this rehearsal into a stamp of
# an already-adopted file.
LEGACY_UNADOPTED_SHA="8dc554e8094237419571551ff82b0fbfe115bfbd"

work="$(mktemp -d /tmp/seed-validate.XXXXXX)"
report="/tmp/seed-validation-report.json"
project="seed-validate"
seed_port="${SEED_PORT:-8091}"
site_port="${SITE_PORT:-8095}"
seed_pid=""
created_network=0
legacy_tree=""
main_tree=""

cleanup() {
  status=$?
  if [[ -n "$seed_pid" ]]; then
    kill "$seed_pid" >/dev/null 2>&1 || true
    wait "$seed_pid" >/dev/null 2>&1 || true
  fi
  if [[ -f "$work/compose.env" ]]; then
    docker compose -p "$project" --env-file "$work/compose.env" --profile ops down -v >/dev/null 2>&1 || true
  fi
  if [[ "$created_network" -eq 1 ]]; then
    docker network rm monitoring >/dev/null 2>&1 || true
  fi
  if [[ -n "$legacy_tree" && -d "$legacy_tree" ]]; then
    git worktree remove --force "$legacy_tree" >/dev/null 2>&1 || true
  fi
  if [[ -n "$main_tree" && -d "$main_tree" ]]; then
    git worktree remove --force "$main_tree" >/dev/null 2>&1 || true
  fi
  if [[ "$status" -ne 0 && -f "$work/uvicorn.log" ]]; then
    echo "---- app log ----" >&2
    tail -n 40 "$work/uvicorn.log" >&2 || true
  fi
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

echo "Fetching pinned legacy commit and origin/main"
git fetch --no-tags origin "$LEGACY_UNADOPTED_SHA"
git fetch --no-tags origin main
git cat-file -e "${LEGACY_UNADOPTED_SHA}^{commit}"
git merge-base --is-ancestor "$LEGACY_UNADOPTED_SHA" "$(git rev-parse origin/main)"
if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "missing image $image; build it before the rehearsal" >&2
  exit 1
fi

mkdir -p "$work/web/finance" "$work/web/portfolio"
printf '<!doctype html><title>finance</title>\n' > "$work/web/finance/index.html"
printf '<!doctype html><title>portfolio</title>\n' > "$work/web/portfolio/index.html"
chmod 777 "$work"

stop_seed() {
  if [[ -n "$seed_pid" ]]; then
    kill "$seed_pid" >/dev/null 2>&1 || true
    wait "$seed_pid" >/dev/null 2>&1 || true
    seed_pid=""
  fi
}

compose_down() {
  if [[ -f "$work/compose.env" ]]; then
    docker compose -p "$project" --env-file "$work/compose.env" --profile ops down -v >/dev/null 2>&1 || true
  fi
}

ensure_network() {
  if ! docker network inspect monitoring >/dev/null 2>&1; then
    docker network create monitoring
    created_network=1
  fi
}

sha256_file() {
  "$py" - "$1" <<'PY'
import hashlib, sys
print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())
PY
}

create_database() {
  local tree="$1"
  local db="$2"
  echo "Creating database with $(git -C "$tree" rev-parse HEAD)"
  (cd "$tree" && PYTHONPATH="$tree" "$py" -m apps.server.migrate --output "$db")
}

seed_database() {
  local tree="$1"
  local db="$2"
  local session="$3"
  echo "Starting app from $(git -C "$tree" rev-parse --short HEAD)"
  pushd "$tree" >/dev/null
  PYTHONPATH="$tree" \
    SITE_DATABASE_URL="sqlite:///$db" \
    SITE_WEB_ROOT="$work/web/finance" \
    SITE_PORTFOLIO_ROOT="$work/web/portfolio" \
    SESSION_COOKIE_SECURE=0 \
    AUTH_SIGNUP_MODE=open \
    AUTH_IP_RATE_LIMIT_PER_MIN=100000 \
    RATE_LIMIT_PER_MIN=100000 \
    "$py" -m uvicorn apps.server.main:app --host 127.0.0.1 --port "$seed_port" --no-access-log \
    >"$work/uvicorn.log" 2>&1 &
  seed_pid=$!
  popd >/dev/null
  local attempt
  for attempt in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${seed_port}/api/auth/bootstrap-status" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$seed_pid" >/dev/null 2>&1; then
      echo "app exited before it accepted connections" >&2
      exit 1
    fi
    sleep 0.5
  done
  curl -fsS "http://127.0.0.1:${seed_port}/api/auth/bootstrap-status" >/dev/null
  echo "Seeding through the app's handlers"
  PYTHONPATH="$root" "$py" "$root/scripts/seed_dev_db.py" \
    --base-url "http://127.0.0.1:${seed_port}" \
    --session-file "$session"
  stop_seed
  "$py" - "$db" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
db.close()
PY
}

copy_database() {
  "$py" - "$1" "$2" <<'PY'
import sqlite3, sys
source, dest = sys.argv[1:]
with sqlite3.connect(source) as src, sqlite3.connect(dest) as dst:
    src.backup(dst)
PY
}

deploy_and_smoke() {
  local mode="$1"
  local plan_db="$2"
  local before_json="$3"
  local session="$4"
  local mode_report="$5"
  local out_dir
  out_dir="$(dirname "$plan_db")"
  ensure_network
  compose_down
  printf 'SESSION_COOKIE_SECURE=0\nSITE_PORT=%s\nSITE_IMAGE=%s\nSITE_SUBNET=10.87.0.0/28\n' \
    "$site_port" "$image" > "$work/compose.env"
  chmod 777 "$out_dir"
  # A WAL file mounted alone cannot open inside the read-only container.
  # The sha256 check already ran. Flatten this copy before loading it.
  "$py" - "$plan_db" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
journal = db.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
db.close()
if journal != "delete":
    raise SystemExit(f"could not flatten journal mode ({journal})")
PY
  chmod 644 "$plan_db"
  echo "Loading seeded database into the compose data volume ($mode)"
  docker compose -p "$project" --env-file "$work/compose.env" --profile ops run --rm --no-deps \
    --entrypoint python \
    -v "$plan_db:/seed/site.db:ro" \
    backup -c '
import os, sqlite3
from pathlib import Path
dest = Path("/data/site.db")
for extra in (dest, Path(str(dest) + "-wal"), Path(str(dest) + "-shm")):
    if extra.exists():
        extra.unlink()
with sqlite3.connect("file:/seed/site.db?mode=ro", uri=True) as src, sqlite3.connect(dest) as dst:
    src.backup(dst)
os.chmod(dest, 0o600)
'
  echo "Running backup, then migrate, then site ($mode)"
  docker compose -p "$project" --env-file "$work/compose.env" --profile ops run --rm --no-deps backup
  docker compose -p "$project" --env-file "$work/compose.env" --profile ops run --rm --no-deps migrate
  docker compose -p "$project" --env-file "$work/compose.env" up -d --no-build --wait --wait-timeout 90 site
  docker compose -p "$project" --env-file "$work/compose.env" --profile ops run --rm --no-deps \
    --entrypoint python \
    -v "$out_dir:/out" \
    backup -c '
import json, os, sqlite3
from pathlib import Path
dest = Path("/out/migrated.db")
with sqlite3.connect("/data/site.db") as src, sqlite3.connect(dest) as dst:
    src.backup(dst)
os.chmod(dest, 0o644)
names = sorted(path.name for path in Path("/backups").glob("premigrate-*.db"))
Path("/out/premigrate.json").write_text(json.dumps(names))
os.chmod("/out/premigrate.json", 0o644)
print(json.dumps(names))
'
  "$py" - "$mode" "$before_json" "$out_dir/migrated.db" "$session" "$out_dir/premigrate.json" "$mode_report" <<'PY'
import json, sqlite3, sys
mode, before_path, migrated, session_path, premigrate_path, report_path = sys.argv[1:]
before = json.load(open(before_path))
db = sqlite3.connect(f"file:{migrated}?mode=ro", uri=True)
tables = [row[0] for row in db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
)]
counts = {name: db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in tables}
integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
fk = [list(row) for row in db.execute("PRAGMA foreign_key_check")]
revision = db.execute("SELECT version_num FROM site_alembic_version").fetchone()[0]
premigrate = json.load(open(premigrate_path))
if integrity != "ok" or fk:
    raise SystemExit(json.dumps({"integrity": integrity, "fk": fk, "revision": revision}))
if mode == "adopt":
    compared = {key: value for key, value in counts.items() if key != "site_alembic_version"}
    if compared != before["counts"]:
        raise SystemExit("row counts changed\n" + json.dumps({"before": before["counts"], "after": compared}, indent=2))
    if revision != "site_schema_v1" or counts.get("site_alembic_version") != 1:
        raise SystemExit(json.dumps({"revision": revision, "counts": counts}))
    if not premigrate:
        raise SystemExit("migrate did not write a premigrate backup")
else:
    for name, value in before["counts"].items():
        if counts.get(name) != value:
            raise SystemExit(f"{name} changed from {value} to {counts.get(name)}")
    if revision != before["expected_head"] or counts.get("site_alembic_version") != 1:
        raise SystemExit(json.dumps({"revision": revision, "expected": before["expected_head"]}))
    action = before["plan"]["action"]
    if action == "current":
        if premigrate:
            raise SystemExit("no-op migrate wrote a premigrate backup: " + json.dumps(premigrate))
    elif action == "upgrade":
        label = before["source_revision"]
        if not any(label in name for name in premigrate):
            raise SystemExit(f"expected premigrate backup for {label}, found {premigrate}")
    else:
        raise SystemExit(f"unexpected action {action}")
session = json.load(open(session_path))
report = dict(before)
report.update({
    "mode": mode,
    "counts_before": before["counts"],
    "counts_after": counts,
    "integrity_after": integrity,
    "foreign_key_check_after": fk,
    "site_alembic_version": revision,
    "premigrate_backups": premigrate,
    "session_username": session["username"],
})
json.dump(report, open(report_path, "w"), indent=2)
print(f"{mode}: row counts held and revision is {revision}")
PY
  local cookie csrf base path code
  cookie="$("$py" -c 'import json,sys; print(json.load(open(sys.argv[1]))["cookie"])' "$session")"
  csrf="$("$py" -c 'import json,sys; print(json.load(open(sys.argv[1]))["csrf_token"])' "$session")"
  base="http://127.0.0.1:${site_port}"
  smoke() {
    path="$1"
    shift
    code="$(curl -sS -o "$work/body" -w '%{http_code}' "$base$path" "$@")"
    if [[ "$code" != "200" ]]; then
      echo "smoke $path -> $code" >&2
      cat "$work/body" >&2 || true
      exit 1
    fi
    echo "smoke $path 200"
  }
  smoke /health/ready
  smoke /health/live
  smoke /api/health
  smoke /travel/api/health
  smoke /media/api/health
  smoke /api/auth/me -H "Cookie: $cookie" -H "X-CSRF-Token: $csrf"
  smoke /api/vault/status -H "Cookie: $cookie" -H "X-CSRF-Token: $csrf"
  smoke /travel/api/home -H "Cookie: $cookie" -H "X-CSRF-Token: $csrf"
  smoke /media/api/library -H "Cookie: $cookie" -H "X-CSRF-Token: $csrf"
  "$py" - "$mode_report" <<'PY'
import json, sys
path = sys.argv[1]
report = json.load(open(path))
report["smoke"] = "passed"
json.dump(report, open(path, "w"), indent=2)
PY
  compose_down
}

run_adopt() {
  echo "Adoption rehearsal from $LEGACY_UNADOPTED_SHA"
  local dir="$work/adopt"
  mkdir -p "$dir"
  legacy_tree="$dir/src"
  git worktree add --detach "$legacy_tree" "$LEGACY_UNADOPTED_SHA"
  create_database "$legacy_tree" "$dir/site.db"
  "$py" - "$dir/site.db" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
assert db.execute("SELECT version_num FROM alembic_version").fetchone() == ("e0f6a2b3c4d5",)
names = {row[0] for row in db.execute("SELECT name FROM sqlite_master")}
assert "site_alembic_version" not in names, sorted(names)
assert db.execute("SELECT version FROM site_schema WHERE id=1").fetchone() == (1,)
print("legacy database has alembic_version e0f6a2b3c4d5 and no site_alembic_version")
PY
  seed_database "$legacy_tree" "$dir/site.db" "$dir/session.json"
  copy_database "$dir/site.db" "$dir/plan.db"
  local sha_before sha_after
  sha_before="$(sha256_file "$dir/plan.db")"
  echo "Adopt plan sha256 before: $sha_before"
  SITE_DATABASE_URL="sqlite:///$dir/plan.db" "$py" -m apps.server.migrations --plan --require-existing | tee "$dir/plan.out"
  sha_after="$(sha256_file "$dir/plan.db")"
  echo "Adopt plan sha256 after: $sha_after"
  if [[ "$sha_before" != "$sha_after" ]]; then
    echo "adopt plan changed the database bytes" >&2
    exit 1
  fi
  "$py" - "$dir/plan.db" "$dir/plan.out" "$dir/before.json" "$sha_before" "$sha_after" "$LEGACY_UNADOPTED_SHA" <<'PY'
import json, sqlite3, sys
path, plan_path, out, sha_before, sha_after, source = sys.argv[1:]
db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
tables = [row[0] for row in db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
)]
counts = {name: db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in tables}
report = {
    "mode": "adopt",
    "source_commit": source,
    "journal_mode": db.execute("PRAGMA journal_mode").fetchone()[0],
    "integrity_check": db.execute("PRAGMA integrity_check").fetchone()[0],
    "foreign_key_check": [list(row) for row in db.execute("PRAGMA foreign_key_check")],
    "alembic_version": db.execute("SELECT version_num FROM alembic_version").fetchone()[0],
    "site_schema": db.execute("SELECT version FROM site_schema WHERE id=1").fetchone()[0],
    "triggers_and_views": [list(row) for row in db.execute(
        "SELECT type, name FROM sqlite_master WHERE type IN ('trigger','view') ORDER BY 1, 2"
    )],
    "counts": counts,
    "total_rows": sum(counts.values()),
    "sha256_before_plan": sha_before,
    "sha256_after_plan": sha_after,
    "sha256_identical": sha_before == sha_after,
}
if report["journal_mode"] != "wal":
    raise SystemExit(f"journal_mode is {report['journal_mode']}")
if report["integrity_check"] != "ok" or report["foreign_key_check"] or report["alembic_version"] != "e0f6a2b3c4d5":
    raise SystemExit(json.dumps(report))
if report["site_schema"] != 1 or "site_alembic_version" in counts:
    raise SystemExit("database is not an unstamped v1 file")
text = open(plan_path, encoding="utf-8").read()
plan = json.loads(text.splitlines()[0])
if plan.get("state") != "adopt" or plan.get("action") != "stamp" or plan.get("head") != "site_schema_v1":
    raise SystemExit(text)
if plan.get("schema_diff") != [] or plan.get("foreign_key_check") != []:
    raise SystemExit(text)
sql = "\n".join(text.splitlines()[1:])
if "site_alembic_version" not in sql or "CREATE TABLE users" in sql:
    raise SystemExit(sql)
report["plan"] = plan
report["plan_sql"] = sql.strip() + "\n"
json.dump(report, open(out, "w"), indent=2)
print(json.dumps({"event": "seeded_adoption", "action": "stamp", "head": "site_schema_v1", "sha256_identical": True, "total_rows": report["total_rows"]}, indent=2))
PY
  deploy_and_smoke adopt "$dir/plan.db" "$dir/before.json" "$dir/session.json" "$dir/report.json"
  if [[ "${BATCH_PROOF:-}" == "1" ]]; then
    echo "Proving batch recreate leaves child rows in place"
    "$py" - "$dir/migrated.db" "$legacy_tree" "$image" "$dir/report.json" <<'PY'
import json, os, shutil, sqlite3, subprocess, sys, textwrap, time
from pathlib import Path

migrated, worktree, image, report_path = sys.argv[1:]
root = Path(migrated).parent
database = root / "rev2.db"
shutil.copy(migrated, database)
backups = root / "rev2-backups"
backups.mkdir()
versions = root / "versions"
versions.mkdir()
revision = versions / "site_schema_v2_batch.py"
revision.write_text(textwrap.dedent('''
    import sqlalchemy as sa
    from alembic import op
    revision = "site_schema_v2"
    down_revision = "site_schema_v1"
    branch_labels = None
    depends_on = None

    def upgrade():
        with op.batch_alter_table("users", recreate="always") as batch:
            batch.add_column(sa.Column("batch_marker", sa.Integer(), nullable=True))
        with op.batch_alter_table("user_entries", recreate="always") as batch:
            batch.add_column(sa.Column("batch_marker", sa.Integer(), nullable=True))

    def downgrade():
        pass
'''))

def counts(path):
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    names = [row[0] for row in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )]
    return {name: db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in names}

before = counts(database)
env = os.environ.copy()
env["SITE_DATABASE_URL"] = f"sqlite:///{database}"
env["SITE_BACKUP_DIR"] = str(backups)
env["PYTHONPATH"] = str(Path.cwd())
code = textwrap.dedent(f'''
    import os
    from pathlib import Path
    from alembic import command
    from apps.server.migrations import make_config
    database = Path({str(database)!r})
    extra = Path({str(versions)!r})
    real = Path("apps/server/alembic/versions")
    cfg = make_config(os.environ["SITE_DATABASE_URL"])
    cfg.set_main_option("version_path_separator", "os")
    cfg.set_main_option("version_locations", os.pathsep.join((str(real), str(extra))))
    from apps.server.migrations import backup_if_configured, current_revision
    backup_if_configured(database)
    command.upgrade(cfg, "head")
    print(current_revision(database))
''')
completed = subprocess.run([sys.executable, "-c", code], cwd=Path.cwd(), env=env, check=True, text=True, capture_output=True)
print(completed.stdout)
if "site_schema_v2" not in completed.stdout:
    raise SystemExit(completed.stdout + completed.stderr)
after = counts(database)
for name, value in before.items():
    if after.get(name) != value and name != "site_alembic_version":
        raise SystemExit(f"{name} changed from {value} to {after.get(name)}")
if after["site_alembic_version"] != 1:
    raise SystemExit(after)
premigrate = list(backups.glob("premigrate-*.db"))
if len(premigrate) != 1 or "site_schema_v1" not in premigrate[0].name:
    raise SystemExit(f"expected one premigrate-site_schema_v1 backup, found {premigrate}")

def snapshot(src, dest):
    if dest.exists():
        dest.unlink()
    with sqlite3.connect(src) as source, sqlite3.connect(dest) as copied:
        source.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        source.backup(copied)

def image_ready(path):
    target = root / "image-db"
    if target.exists():
        shutil.rmtree(target)
    target.mkdir()
    snapshot(path, target / "site.db")
    os.chmod(target, 0o777)
    os.chmod(target / "site.db", 0o666)
    probe = subprocess.run(
        ["docker", "run", "--rm", "--network", "none", "--read-only", "--user", "10001:10001",
         "--tmpfs", "/tmp:rw,size=64m,mode=1777",
         "-v", f"{target}:/data",
         "-e", "SITE_DATABASE_URL=sqlite:////data/site.db",
         image, "python", "-c",
         "from sqlalchemy import create_engine\n"
         "from apps.server.schema import assert_ready\n"
         "engine = create_engine('sqlite:////data/site.db')\n"
         "with engine.connect() as connection:\n"
         "    assert_ready(connection)\n"
         "print('ready')\n"],
        text=True, capture_output=True,
    )
    return probe.returncode, probe.stdout, probe.stderr

refused_code, refused_out, refused_err = image_ready(database)
if refused_code == 0:
    raise SystemExit("image accepted rev2 without a compatibility row\n" + refused_out + refused_err)
compatible = root / "rev2-compatible.db"
snapshot(database, compatible)
with sqlite3.connect(compatible) as db:
    db.execute(
        "CREATE TABLE site_revision_compatibility ("
        "revision VARCHAR(32) NOT NULL, compatible_head VARCHAR(32) NOT NULL, "
        "PRIMARY KEY (revision, compatible_head))"
    )
    db.execute(
        "INSERT INTO site_revision_compatibility (revision, compatible_head) VALUES ('site_schema_v2', 'site_schema_v1')"
    )
accepted_code, accepted_out, accepted_err = image_ready(compatible)
if accepted_code != 0 or "ready" not in accepted_out:
    raise SystemExit(accepted_err or accepted_out)

main_copy = root / "main-rev2.db"
snapshot(database, main_copy)
web_finance = root / "web" / "finance"
web_portfolio = root / "web" / "portfolio"
web_finance.mkdir(parents=True, exist_ok=True)
web_portfolio.mkdir(parents=True, exist_ok=True)
(web_finance / "index.html").write_text("<!doctype html><title>finance</title>\n")
(web_portfolio / "index.html").write_text("<!doctype html><title>portfolio</title>\n")
env = os.environ.copy()
env.update({
    "PYTHONPATH": worktree,
    "SITE_DATABASE_URL": f"sqlite:///{main_copy}",
    "SITE_WEB_ROOT": str(web_finance),
    "SITE_PORTFOLIO_ROOT": str(web_portfolio),
    "SESSION_COOKIE_SECURE": "0",
})
log = open(root / "uvicorn-previous.log", "w")
process = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "apps.server.main:app", "--host", "127.0.0.1", "--port", "8093"],
    cwd=worktree, env=env, stdout=log, stderr=subprocess.STDOUT,
)
try:
    ready = ""
    for _ in range(40):
        time.sleep(0.25)
        probe = subprocess.run(
            ["curl", "-fsS", "http://127.0.0.1:8093/health/ready"],
            text=True, capture_output=True,
        )
        if probe.returncode == 0:
            ready = probe.stdout
            break
    if '"status"' not in ready or '"ok"' not in ready:
        log.flush()
        detail = (root / "uvicorn-previous.log").read_text()[-2000:]
        raise SystemExit("previous main code refused the expanded database\n" + detail)
finally:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()

proof = {
    "revision": "site_schema_v2",
    "recreate": "always",
    "child_counts_unchanged": True,
    "premigrate_backup": premigrate[0].name,
    "image_without_compatibility": "refused",
    "image_with_compatibility": "accepted",
    "previous_main_code": "accepted",
}
saved = json.load(open(report_path))
saved["batch_proof"] = proof
json.dump(saved, open(report_path, "w"), indent=2)
print(json.dumps({"event": "batch_proof", **proof}, indent=2))
PY
  fi
}

run_upgrade() {
  local sha main_head dir sha_before sha_after
  sha="$(git rev-parse origin/main)"
  echo "Upgrade rehearsal from origin/main $sha"
  dir="$work/upgrade"
  mkdir -p "$dir"
  main_tree="$dir/src"
  git worktree add --detach "$main_tree" "$sha"
  main_head="$(cd "$main_tree" && PYTHONPATH="$main_tree" "$py" -c 'from apps.server.migrations import head_revision; print(head_revision())')"
  create_database "$main_tree" "$dir/site.db"
  "$py" - "$dir/site.db" "$main_head" <<'PY'
import sqlite3, sys
path, expected = sys.argv[1:]
db = sqlite3.connect(path)
names = {row[0] for row in db.execute("SELECT name FROM sqlite_master")}
if "site_alembic_version" not in names:
    raise SystemExit("origin/main did not adopt the database it created")
found = db.execute("SELECT version_num FROM site_alembic_version").fetchone()[0]
if found != expected:
    raise SystemExit(f"origin/main database is {found}, its head is {expected}")
print(f"origin/main database is adopted at {found}")
PY
  seed_database "$main_tree" "$dir/site.db" "$dir/session.json"
  copy_database "$dir/site.db" "$dir/plan.db"
  sha_before="$(sha256_file "$dir/plan.db")"
  echo "Upgrade plan sha256 before: $sha_before"
  SITE_DATABASE_URL="sqlite:///$dir/plan.db" "$py" -m apps.server.migrations --plan --require-existing | tee "$dir/plan.out"
  sha_after="$(sha256_file "$dir/plan.db")"
  echo "Upgrade plan sha256 after: $sha_after"
  if [[ "$sha_before" != "$sha_after" ]]; then
    echo "upgrade plan changed the database bytes" >&2
    exit 1
  fi
  "$py" - "$dir/plan.db" "$dir/plan.out" "$dir/before.json" "$sha_before" "$sha_after" "$sha" "$main_head" <<'PY'
import json, sqlite3, sys
from pathlib import Path
from alembic.script import ScriptDirectory
from apps.server.migrations import current_revision, head_revision, make_config

path, plan_path, out, sha_before, sha_after, source, main_head = sys.argv[1:]
path = Path(path)
db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
tables = [row[0] for row in db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
)]
counts = {name: db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in tables}
db_rev = current_revision(path)
head = head_revision()
if db_rev != main_head:
    raise SystemExit(f"seeded database is {db_rev}; origin/main head is {main_head}")
script = ScriptDirectory.from_config(make_config("sqlite://"))

def ancestors(revision):
    pending = [revision]
    seen = set()
    while pending:
        rev = pending.pop()
        if rev in seen:
            continue
        seen.add(rev)
        node = script.get_revision(rev)
        if node is None:
            raise SystemExit(f"revision {rev} is not in this branch's history")
        down = node.down_revision
        if down is None:
            continue
        if isinstance(down, (tuple, list)):
            pending.extend(down)
        else:
            pending.append(down)
    return seen

if db_rev == head:
    expected = "current"
elif db_rev in ancestors(head):
    expected = "upgrade"
else:
    raise SystemExit(f"{db_rev} is not an ancestor of this branch's head {head}; refusing to guess an action")
text = open(plan_path, encoding="utf-8").read()
plan = json.loads(text.splitlines()[0])
sql = "\n".join(text.splitlines()[1:]).strip()
if plan.get("state") != "managed" or plan.get("action") != expected or plan.get("revision") != db_rev or plan.get("head") != head:
    raise SystemExit(text)
if plan.get("foreign_key_check") not in (None, []):
    raise SystemExit(text)
if expected == "current" and sql:
    raise SystemExit(sql)
if expected == "upgrade" and (not sql or "CREATE TABLE site_alembic_version" in sql or "CREATE TABLE users" in sql):
    raise SystemExit(sql or text)
report = {
    "mode": "upgrade",
    "source_commit": source,
    "source_revision": db_rev,
    "expected_head": head,
    "expected_action": expected,
    "journal_mode": db.execute("PRAGMA journal_mode").fetchone()[0],
    "integrity_check": db.execute("PRAGMA integrity_check").fetchone()[0],
    "foreign_key_check": [list(row) for row in db.execute("PRAGMA foreign_key_check")],
    "alembic_version": db.execute("SELECT version_num FROM alembic_version").fetchone()[0],
    "triggers_and_views": [list(row) for row in db.execute(
        "SELECT type, name FROM sqlite_master WHERE type IN ('trigger','view') ORDER BY 1, 2"
    )],
    "counts": counts,
    "total_rows": sum(counts.values()),
    "sha256_before_plan": sha_before,
    "sha256_after_plan": sha_after,
    "sha256_identical": sha_before == sha_after,
    "plan": plan,
    "plan_sql": (sql + "\n") if sql else "",
}
if report["journal_mode"] != "wal" or report["integrity_check"] != "ok" or report["foreign_key_check"]:
    raise SystemExit(json.dumps(report))
if "site_alembic_version" not in counts:
    raise SystemExit("database is not adopted")
json.dump(report, open(out, "w"), indent=2)
print(json.dumps({
    "event": "seeded_upgrade",
    "source": source,
    "from": db_rev,
    "head": head,
    "action": expected,
    "sha256_identical": True,
    "total_rows": report["total_rows"],
    "foreign_key_check": [],
}, indent=2))
PY
  deploy_and_smoke upgrade "$dir/plan.db" "$dir/before.json" "$dir/session.json" "$dir/report.json"
}

if [[ "$rehearsal" == "adopt" || "$rehearsal" == "both" ]]; then
  run_adopt
fi
if [[ "$rehearsal" == "upgrade" || "$rehearsal" == "both" ]]; then
  run_upgrade
fi

"$py" - "$report" "$work" <<'PY'
import json, sys
from pathlib import Path
dest, work = sys.argv[1:]
root = Path(work)
body = {"event": "seeded_rehearsals"}
for mode in ("adopt", "upgrade"):
    path = root / mode / "report.json"
    if path.is_file():
        body[mode] = json.loads(path.read_text())
if not any(mode in body for mode in ("adopt", "upgrade")):
    raise SystemExit("no rehearsal report was written")
Path(dest).write_text(json.dumps(body, indent=2) + "\n")
print(json.dumps({
    "event": "seeded_rehearsals",
    "modes": [mode for mode in ("adopt", "upgrade") if mode in body],
    "adopt_action": body.get("adopt", {}).get("plan", {}).get("action"),
    "upgrade_action": body.get("upgrade", {}).get("plan", {}).get("action"),
}, indent=2))
PY
echo "Report: $report"
