#!/usr/bin/env python3
"""REVIEW ONLY: optional root-owned installation, not used by current deployment.

The user chose to retain the current runner. Do not invoke this installer without
new approval. Provision a dedicated runner and narrow sudoers separately after review.
"""
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
if os.geteuid() != 0:
    raise SystemExit('Root required; review ops/README.md before installation')
config = Path('/etc/personal-site')
config.mkdir(mode=0o700, exist_ok=True)
for source, destination, mode in (
    ('ops/release.py','/usr/local/sbin/personal-site-release',0o755),
    ('scripts/backup-site.py',str(config/'backup-site.py'),0o644),
    ('compose.yml',str(config/'compose.yml'),0o644),
    ('ops/nginx/site.conf',str(config/'edge.conf'),0o644),
    ('ops/systemd/personal-site.logrotate','/etc/logrotate.d/personal-site',0o644),
):
    shutil.copyfile(ROOT/source,destination)
    os.chmod(destination,mode)
for pattern in ('*.service','*.timer'):
    for source in (ROOT/'ops/systemd').glob(pattern):
        destination=Path('/etc/systemd/system')/source.name
        shutil.copyfile(source,destination)
        destination.chmod(0o644)
subprocess.run(['systemctl','daemon-reload'],check=True)
print('Installed files only. No timers enabled, no account/sudoers created, no production cutover performed.')
