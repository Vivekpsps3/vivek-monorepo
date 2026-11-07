# Local GitHub Actions CI runner

Trusted main/master pushes and same-repository pull requests use `amd7600-ci`,
with labels `self-hosted`, `linux`, `x64`, and `monorepo-ci`. Fork pull requests
continue to use GitHub-hosted runners. The separate `finance-prod` runner still
handles deployment only. A GitHub account billing lock was rejecting hosted CI
jobs before they started; self-hosted execution avoids hosted compute usage.

The runner runs Ubuntu 24.04 with Chrome, Python, build tools, and Docker CLI.
The existing setup-python and setup-node actions select each job's versions.
One runner processes jobs sequentially; its containers restart after host reboots.

From the repository root:

```sh
docker compose -f ops/actions-runner/compose.yml build
./ops/actions-runner/register.sh
docker compose -f ops/actions-runner/compose.yml ps
docker compose -f ops/actions-runner/compose.yml logs --tail 60 runner
```

Registration requires an administrator GitHub CLI login with repository access.
The short-lived registration token is piped to configuration and is not saved in
a dotenv file. Registration credentials live in the private Docker runner volume;
do not publish that volume or copy it into a repository. Register only once. To
restart an already registered runner use `docker compose ... up -d`, not the
registration script. Avoid `down -v`, which deletes registration and caches.

## Docker and trust boundaries

CI uses a dedicated Docker-in-Docker daemon, storage, socket, and network namespace.
No host home directory, production data volume, or host Docker socket is mounted.
This matters because release rehearsals use the same Compose project and volume
names as production, and their cleanup deliberately deletes test volumes.
The runner shares the nested daemon's network namespace so browser tests can
reach loopback-published ports. Work and temporary directories are shared at the
same paths so bind mounts used by the schema rehearsals resolve correctly.
Each container is limited to four CPUs and 12 GiB memory; Chromium has 2 GiB of
shared memory. Docker logs rotate at 10 MiB with three retained files.

Docker-in-Docker requires a privileged container. It shares the host kernel and
is not a security boundary for hostile code. Use this runner only for trusted
contributors; use a separate VM for untrusted code. Workflow routing keeps normal
fork CI off this machine but is not repository-wide access control: someone able
to change workflows could request any repository runner label. The existing
production runner retains its established host Docker privileges.

Runner configuration and tool/browser caches persist across jobs. When refreshing
the base image, stop the runner after its current job and recreate its registration
volume deliberately; a persistent `/opt/runner` volume retains the installed runner
application (including its automatic updates). Rebuilds update system packages.

To stop accepting jobs without deleting state:

```sh
docker compose -f ops/actions-runner/compose.yml stop runner
```

Do not prune the host's Docker volumes or images as part of CI cleanup. To reclaim
CI images, run `docker system df` and targeted cleanup **inside** the nested daemon:

```sh
docker compose -f ops/actions-runner/compose.yml exec runner docker system df
```
