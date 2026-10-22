#!/usr/bin/env bash
# Rehearse adopting a prod-shaped database.
# Builds site.db with current main's create_all path, seeds it through that
# app, plans the stamp, then runs backup, migrate, and the site container.
# Set BATCH_PROOF=1 to also run the uncommitted batch-recreate check. That
# proof is local only; CI leaves it unset.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
py="${PY:-$root/.venv/bin/python}"
image="${SITE_IMAGE:-personal-site:development}"
work="$(mktemp -d /tmp/seed-validate.XXXXXX)"
worktree="$work/main"
db="$work/prod-shaped.db"
plan_copy="$work/plan.db"
session="$work/session.json"
report="/tmp/seed-validation-report.json"
project="seed-validate"
seed_port="${SEED_PORT:-8091}"
site_port="${SITE_PORT:-8095}"
seed_pid=""

cleanup() {
  status=$?
  if [[ -n "$seed_pid" ]]; then
    kill "$seed_pid" >/dev/null 2>&1 || true
    wait "$seed_pid" >/dev/null 2>&1 || true
  fi
  if [[ -f "$work/compose.env" ]]; then
    docker compose -p "$project" --env-file "$work/compose.env" --profile ops down -v >/dev/null 2>&1 || true
  fi
  if [[ -d "$worktree" ]]; then
    git worktree remove --force "$worktree" >/dev/null 2>&1 || true
  fi
  if [[ "$status" -ne 0 && -f "$work/uvicorn-main.log" ]]; then
    echo "---- main app log ----" >&2
    tail -n 40 "$work/uvicorn-main.log" >&2 || true
  fi
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

echo "Fetching origin/main"
git fetch --no-tags origin main
main_sha="$(git rev-parse origin/main)"
git worktree add --detach "$worktree" "$main_sha"

mkdir -p "$work/web/finance" "$work/web/portfolio"
printf '<!doctype html><title>finance</title>\n' > "$work/web/finance/index.html"
printf '<!doctype html><title>portfolio</title>\n' > "$work/web/portfolio/index.html"

echo "Creating prod-shaped database with main at $main_sha"
# cwd has to be the worktree. python -m puts the current directory ahead of PYTHONPATH.
(cd "$worktree" && PYTHONPATH="$worktree" "$py" -m apps.server.migrate --output "$db")
"$py" - "$db" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
assert db.execute("SELECT version_num FROM alembic_version").fetchone() == ("e0f6a2b3c4d5",)
names = {row[0] for row in db.execute("SELECT name FROM sqlite_master")}
assert "site_alembic_version" not in names, names
assert db.execute("SELECT version FROM site_schema WHERE id=1").fetchone() == (1,)
print("prod-shaped database has alembic_version e0f6a2b3c4d5 and no site_alembic_version")
PY

echo "Starting main's app"
pushd "$worktree" >/dev/null
PYTHONPATH="$worktree" \
  SITE_DATABASE_URL="sqlite:///$db" \
  SITE_WEB_ROOT="$work/web/finance" \
  SITE_PORTFOLIO_ROOT="$work/web/portfolio" \
  SESSION_COOKIE_SECURE=0 \
  AUTH_SIGNUP_MODE=open \
  AUTH_IP_RATE_LIMIT_PER_MIN=100000 \
  RATE_LIMIT_PER_MIN=100000 \
  "$py" -m uvicorn apps.server.main:app --host 127.0.0.1 --port "$seed_port" --no-access-log \
  >"$work/uvicorn-main.log" 2>&1 &
seed_pid=$!
popd >/dev/null
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${seed_port}/api/auth/bootstrap-status" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$seed_pid" >/dev/null 2>&1; then
    echo "main app exited" >&2
    exit 1
  fi
  sleep 0.5
done
curl -fsS "http://127.0.0.1:${seed_port}/api/auth/bootstrap-status" >/dev/null

echo "Seeding through main's handlers"
PYTHONPATH="$root" "$py" "$root/scripts/seed_dev_db.py" \
  --base-url "http://127.0.0.1:${seed_port}" \
  --session-file "$session"
kill "$seed_pid"
wait "$seed_pid" || true
seed_pid=""

"$py" - "$db" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
db.close()
PY

"$py" - "$db" "$plan_copy" <<'PY'
import sqlite3, sys
source, dest = sys.argv[1:]
with sqlite3.connect(source) as src, sqlite3.connect(dest) as dst:
    src.backup(dst)
PY

sha_before="$("$py" - "$plan_copy" <<'PY'
import hashlib, sys
print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())
PY
)"
echo "Plan sha256 before: $sha_before"
SITE_DATABASE_URL="sqlite:///$plan_copy" "$py" -m apps.server.migrations --plan --require-existing | tee "$work/plan.out"
sha_after="$("$py" - "$plan_copy" <<'PY'
import hashlib, sys
print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())
PY
)"
echo "Plan sha256 after: $sha_after"
if [[ "$sha_before" != "$sha_after" ]]; then
  echo "plan changed the database bytes" >&2
  exit 1
fi

"$py" - "$plan_copy" "$work/plan.out" "$work/before.json" <<'PY'
import json, sqlite3, sys
path, plan_path, out = sys.argv[1:]
db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
tables = [row[0] for row in db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
)]
counts = {name: db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in tables}
report = {
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
json.dump(report, sys.stdout, indent=2)
print()
PY

docker network inspect monitoring >/dev/null 2>&1 || docker network create monitoring
printf 'SESSION_COOKIE_SECURE=0\nSITE_PORT=%s\nSITE_IMAGE=%s\nSITE_SUBNET=10.87.0.0/28\n' \
  "$site_port" "$image" > "$work/compose.env"

echo "Loading seeded database into the compose data volume"
# The container user is 10001. A world-writable export directory is what that
# user can write on this host; the data volume itself is already mode 700/10001.
chmod 777 "$work"
# A WAL file mounted alone cannot open inside the read-only container. The
# sha256 check already ran. Flatten this copy to a single file before loading it.
"$py" - "$plan_copy" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
mode = db.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
db.close()
if mode != "delete":
    raise SystemExit(f"could not flatten journal mode ({mode})")
PY
chmod 644 "$plan_copy"
docker compose -p "$project" --env-file "$work/compose.env" --profile ops run --rm --no-deps \
  --entrypoint python \
  -v "$plan_copy:/seed/site.db:ro" \
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

echo "Running backup, then migrate, then site"
docker compose -p "$project" --env-file "$work/compose.env" --profile ops run --rm --no-deps backup
docker compose -p "$project" --env-file "$work/compose.env" --profile ops run --rm --no-deps migrate
docker compose -p "$project" --env-file "$work/compose.env" up -d --no-build --wait --wait-timeout 90 site

docker compose -p "$project" --env-file "$work/compose.env" --profile ops run --rm --no-deps \
  --entrypoint python \
  -v "$work:/out" \
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

"$py" - "$work/before.json" "$work/migrated.db" "$session" "$work/premigrate.json" "$report" <<'PY'
import json, sqlite3, sys
before_path, migrated, session_path, premigrate_path, report_path = sys.argv[1:]
before = json.load(open(before_path))
db = sqlite3.connect(f"file:{migrated}?mode=ro", uri=True)
tables = [row[0] for row in db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
)]
counts = {name: db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in tables}
integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
fk = [list(row) for row in db.execute("PRAGMA foreign_key_check")]
revision = db.execute("SELECT version_num FROM site_alembic_version").fetchone()[0]
compared = {key: value for key, value in counts.items() if key != "site_alembic_version"}
if compared != before["counts"]:
    raise SystemExit("row counts changed\n" + json.dumps({"before": before["counts"], "after": compared}, indent=2))
if integrity != "ok" or fk or revision != "site_schema_v1" or counts.get("site_alembic_version") != 1:
    raise SystemExit(json.dumps({"integrity": integrity, "fk": fk, "revision": revision, "counts": counts}))
premigrate = json.load(open(premigrate_path))
if not premigrate:
    raise SystemExit("migrate did not write a premigrate backup")
session = json.load(open(session_path))
report = {
    "plan": before["plan"],
    "plan_sql": before["plan_sql"],
    "counts_before": before["counts"],
    "counts_after": counts,
    "integrity_before": before["integrity_check"],
    "integrity_after": integrity,
    "foreign_key_check": before["foreign_key_check"],
    "foreign_key_check_after": fk,
    "journal_mode": before["journal_mode"],
    "alembic_version": before["alembic_version"],
    "triggers_and_views": before["triggers_and_views"],
    "total_rows_before": before["total_rows"],
    "site_alembic_version": revision,
    "premigrate_backups": premigrate,
    "session_username": session["username"],
}
json.dump(report, open(report_path, "w"), indent=2)
print("row counts unchanged except site_alembic_version=1")
PY

cookie="$("$py" -c 'import json,sys; print(json.load(open(sys.argv[1]))["cookie"])' "$session")"
csrf="$("$py" -c 'import json,sys; print(json.load(open(sys.argv[1]))["csrf_token"])' "$session")"
base="http://127.0.0.1:${site_port}"
smoke() {
  local path="$1"
  shift
  local code
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

"$py" - "$report" "$sha_before" "$sha_after" "$main_sha" <<'PY'
import json, sys
path, before, after, main = sys.argv[1:]
report = json.load(open(path))
report["sha256_before_plan"] = before
report["sha256_after_plan"] = after
report["sha256_identical"] = before == after
report["main_commit"] = main
report["smoke"] = "passed"
json.dump(report, open(path, "w"), indent=2)
print(json.dumps({
    "event": "seeded_adoption",
    "main": main,
    "plan_action": report["plan"]["action"],
    "plan_state": report["plan"]["state"],
    "head": report["plan"]["head"],
    "sha256_identical": True,
    "total_rows_before": report["total_rows_before"],
    "journal_mode": report["journal_mode"],
    "alembic_version": report["alembic_version"],
    "foreign_key_check": report["foreign_key_check"],
    "triggers_and_views": report["triggers_and_views"],
}, indent=2))
PY

if [[ "${BATCH_PROOF:-}" == "1" ]]; then
  echo "Proving batch recreate leaves child rows in place"
  BATCH_PROOF=1 "$py" - "$work/migrated.db" "$worktree" "$image" "$report" <<'PY'
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
    "counts": before,
}
report = json.load(open(report_path))
report["batch_proof"] = proof
json.dump(report, open(report_path, "w"), indent=2)
print(json.dumps({"event": "batch_proof", **proof, "counts": {k: before[k] for k in ("users", "trips", "user_entries", "experiences")}}, indent=2))
PY
fi

echo "Report: $report"
