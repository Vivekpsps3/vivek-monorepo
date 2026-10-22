#!/usr/bin/env python3
"""Existing-runner deployment mode; privileged installer remains optional review work.

Installed beside release_core.py in the private site config directory.
This deliberately retains the operator account's existing Docker permission.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
if (ROOT / 'release_core.py').is_file():
    import release_core as controller
else:
    sys.path.insert(0, str(ROOT.parent))
    from ops import release as controller

controller.CONFIG = Path('/home/vivek/Deployments/personal-site-config')
controller.STATE = Path('/home/vivek/Deployments/personal-site-state')
controller.BACKUPS = controller.STATE / 'backups'
controller.CURRENT = controller.STATE / 'current.json'
controller.LOCK = controller.STATE / 'release.lock'
controller.DOCKER = ['sudo', '-n', 'docker']

if __name__ == '__main__':
    controller.main(require_root=False)
