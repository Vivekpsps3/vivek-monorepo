#!/usr/bin/env python3
"""Minute cron task: hourly verified backup and bounded unhealthy recovery."""
import importlib.util
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import subprocess
import sys
import time

CONFIG = Path(__file__).resolve().parent
STATE = Path('/home/vivek/Deployments/personal-site-state')
logger = logging.getLogger('site-scheduler')
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(STATE/'logs/scheduler.log', maxBytes=2_000_000, backupCount=3)
handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
logger.addHandler(handler)
try:
    status = STATE/'metrics/backup.prom'
    if not status.exists() or time.time()-status.stat().st_mtime > 3600:
        result=subprocess.run([sys.executable,str(CONFIG/'release-site.py'),'backup'],capture_output=True,text=True,timeout=240)
        if result.returncode:
            raise RuntimeError('Backup command failed: '+result.stderr[-1000:])
        logger.info('Verified backup and restore check complete')
    result=subprocess.run([sys.executable,str(CONFIG/'release-site.py'),'recover'],capture_output=True,text=True,timeout=100)
    if result.returncode:
        raise RuntimeError('Recovery check failed: '+result.stderr[-1000:])
except Exception:
    logger.exception('Site scheduled maintenance failed')
    raise SystemExit(1)
