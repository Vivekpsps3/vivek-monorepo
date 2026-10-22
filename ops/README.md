# Optional privileged controls — review only

The user chose to keep the existing production runner. Nothing in install-host.py,
systemd/, or a new sudoers/account setup is installed automatically.

The active deployment uses scripts/release-site.py and private user-owned config.
release.py is shared controller logic, with root-owned paths as the future stronger
mode. install-host.py is an incomplete optional bootstrap: it copies reviewed root
configuration and unit files only; it does not create accounts, grant sudo, migrate
data, enable timers, or register a runner.

Before adopting that mode, review the exact privilege scope, create a dedicated
runner without Docker-group access, allow only the root-owned deployment command,
validate artifact paths and image provenance, migrate configuration/state ownership,
and prove backup/rollback under that identity. Register the runner with a short-lived
GitHub registration token and restrict it to this repository. Do not copy credentials
from an existing runner. This requires fresh user approval.

Normal application deployments never auto-update these optional host controls.
