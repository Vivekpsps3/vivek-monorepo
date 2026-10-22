#!/usr/bin/env python3
"""Prepare private site config/state using the existing operator account.

Does not change the live vhost, containers, systemd, sudoers, or runner identity.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
CONFIG = Path('/home/vivek/Deployments/personal-site-config')
STATE = Path('/home/vivek/Deployments/personal-site-state')
for directory in (CONFIG, STATE, STATE/'data', STATE/'backups', STATE/'logs', STATE/'legacy'):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory.chmod(0o700)
(STATE/'metrics').mkdir(mode=0o755, exist_ok=True)
(STATE/'metrics').chmod(0o755)
files = {
    'ops/release.py':'release_core.py', 'scripts/release-site.py':'release-site.py',
    'scripts/backup-site.py':'backup-site.py', 'compose.yml':'compose.yml',
    'ops/nginx/site.conf':'edge.conf', 'scripts/schedule-site.py':'schedule-site.py',
}
for source, target in files.items():
    shutil.copyfile(ROOT/source, CONFIG/target)
    (CONFIG/target).chmod(0o600)
envfile = CONFIG/'site.env'
if not envfile.exists():
    old = dotenv_values('/home/vivek/Deployments/vivek-monorepo/.env')
    values = {
        'SITE_DATA_DIR':str(STATE/'data'), 'SITE_METRICS_DIR':str(STATE/'metrics'),
        'SITE_BACKUP_DIR':str(STATE/'backups'), 'SITE_UID':str(os.getuid()), 'SITE_GID':str(os.getgid()),
        'SESSION_COOKIE_SECURE':'1', 'CORS_ORIGINS':'https://vivekpanchagnula.com',
        'RATE_LIMIT_PER_MIN':old.get('RATE_LIMIT_PER_MIN') or '60',
    }
    for key in ('FLIGHTAWARE_API_KEY','TMDB_API_KEY','RAWG_API_KEY'):
        values[key]=old.get(key) or ''
    def literal(value):
        if '\n' in value or '\r' in value:
            raise ValueError('Multiline env values unsupported')
        return "'"+value.replace('\\','\\\\').replace("'","\\'")+"'"
    envfile.write_text(''.join(f'{key}={literal(value)}\n' for key,value in values.items()))
    envfile.chmod(0o600)
manifest={source:hashlib.sha256((ROOT/source).read_bytes()).hexdigest() for source in files}
(CONFIG/'installed.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Prepared private configuration and state. Existing production still running.')
