#!/usr/bin/env python3
"""Root-owned release controller. CI may deploy an image, never edit host config.

Install this file as /usr/local/sbin/personal-site-release, root:root mode 755.
Only `deploy` is granted to the dedicated runner through sudoers.
"""
import argparse
from contextlib import contextmanager
import fcntl
import gzip
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

CONFIG = Path("/etc/personal-site")
STATE = Path("/var/lib/personal-site")
CURRENT = STATE / "current.json"
BACKUPS = Path("/var/backups/personal-site")
DOCKER = ["docker"]
LOCK = Path("/run/lock/personal-site-release.lock")


def run(args, **kwargs):
    if args and args[0] == "docker":
        args = DOCKER + args[1:]
    return subprocess.run(args, check=True, text=True, **kwargs)


def image_id(image):
    return run(["docker", "image", "inspect", image, "--format", "{{.Id}}"], capture_output=True).stdout.strip()


def compose(image, *arguments):
    environment = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "SITE_IMAGE": image}
    return run(["docker", "compose", "--project-directory", str(CONFIG), "--env-file", str(CONFIG / "site.env"),
                "-f", str(CONFIG / "compose.yml"), *arguments], env=environment)


def atomic_json(path, value):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
        temporary = handle.name
    os.replace(temporary, path)


def backup():
    run(["python3", str(CONFIG / "backup-site.py"), "--source", str(STATE / "data/site.db"), "--directory", str(BACKUPS)])
    metrics = STATE / "metrics"
    metrics.mkdir(exist_ok=True, mode=0o755)
    target = metrics / "backup.prom"
    target.write_text(f"site_backup_last_success_timestamp_seconds {time.time()}\n")
    target.chmod(0o644)


def probe(release, public=True):
    for _ in range(30):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8085/health/ready", timeout=3) as response:
                payload = json.load(response)
                if payload.get("release") == release and payload.get("status") == "ok":
                    break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise RuntimeError("Readiness did not report the intended release")
    if public:
        # DNS plus TLS and actual edge routing. No bypass of certificate verification.
        for path in ("/", "/finance/", "/hub", "/auth/login", "/travel/", "/media/", "/api/health"):
            run(["curl", "--fail", "--silent", "--show-error", "--max-time", "10", "--resolve",
                 "vivekpanchagnula.com:443:127.0.0.1", "https://vivekpanchagnula.com" + path], stdout=subprocess.DEVNULL)


def diagnostics():
    subprocess.run(DOCKER + ["ps", "--filter", "label=com.docker.compose.project=personal-site"])
    subprocess.run(DOCKER + ["logs", "--tail", "80", "personal-site-site-1"])


def deploy(archive, release):
    if not re.fullmatch(r"[0-9a-f]{40}", release):
        raise RuntimeError("Release must be a full Git SHA")
    archive = archive.resolve(strict=True)
    runner_root = Path("/var/lib/personal-site-runner")
    if os.environ.get("SUDO_USER") and not archive.is_relative_to(runner_root):
        raise RuntimeError("Runner artifacts must be inside its own work directory")
    previous = json.loads(CURRENT.read_text()) if CURRENT.exists() else None
    with tempfile.TemporaryDirectory(prefix="site-release-") as temporary:
        # Snapshot input before validation/loading; do not execute artifact scripts on host.
        snapshot = Path(temporary) / "image.tar.gz"
        shutil.copyfile(archive, snapshot)
        with gzip.open(snapshot, "rb") as image_stream:
            process = subprocess.Popen(DOCKER + ["load"], stdin=subprocess.PIPE)
            try:
                shutil.copyfileobj(image_stream, process.stdin)
            finally:
                process.stdin.close()
            if process.wait() != 0:
                raise RuntimeError("Image load failed")
    image = f"personal-site:{release}"
    label = run(["docker", "image", "inspect", image, "--format", '{{index .Config.Labels "org.opencontainers.image.revision"}}'], capture_output=True).stdout.strip()
    if label != release:
        raise RuntimeError("Image revision does not match requested release")
    digest = image_id(image)
    run(["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
         "--memory", "1g", "--pids-limit", "128", "--tmpfs", "/tmp:rw,size=128m,mode=1777", digest, "python", "-m", "apps.server.checks"])
    backup()
    try:
        compose(digest, "up", "-d", "--no-build", "--wait", "--wait-timeout", "90")
        probe(release)
    except Exception:
        diagnostics()
        if previous:
            compose(previous["image_id"], "up", "-d", "--no-build", "--wait", "--wait-timeout", "90")
            probe(previous["release"])
        raise
    record = {"release": release, "image_id": digest, "deployed_at": time.time(), "previous": {k: previous[k] for k in ("release", "image_id")} if previous else None}
    # Persist exact image for reboot/manual Compose use only after successful probes.
    atomic_json(CURRENT, record)
    with (STATE / "history.jsonl").open("a") as handle:
        handle.write(json.dumps({k: v for k, v in record.items() if k != "previous"}) + "\n")
    print(json.dumps({"release": release, "image_id": digest, "status": "deployed"}))


def recover():
    if not CURRENT.exists():
        return
    record = json.loads(CURRENT.read_text())
    status = run(["docker", "inspect", "personal-site-site-1", "--format", '{{.State.Health.Status}}'], capture_output=True).stdout.strip()
    if status != "unhealthy":
        return
    marker = STATE / "last-recovery"
    if marker.exists() and time.time() - marker.stat().st_mtime < 900:
        return
    marker.touch()
    run(["docker", "restart", "--time", "30", "personal-site-site-1"])
    probe(record["release"], public=False)


def main(*, require_root=True):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    deploy_parser = sub.add_parser("deploy")
    deploy_parser.add_argument("archive", type=Path)
    deploy_parser.add_argument("release")
    sub.add_parser("backup")
    sub.add_parser("recover")
    sub.add_parser("status")
    args = parser.parse_args()
    if require_root and os.geteuid() != 0:
        raise RuntimeError("Controller must run as root")
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.umask(0o077)
    with LOCK.open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.command == "deploy":
            deploy(args.archive, args.release)
        elif args.command == "backup":
            backup()
        elif args.command == "recover":
            recover()
        else:
            print(CURRENT.read_text() if CURRENT.exists() else "No release recorded")


if __name__ == "__main__":
    main()
