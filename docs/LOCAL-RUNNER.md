# Local GitHub Actions runner pool

Trusted main/master pushes and same-repository pull requests can execute all ten
CI jobs concurrently on amd7600-server:

- Nine test workers, `amd7600-ci-01` through `amd7600-ci-09`, have labels
  `self-hosted`, `linux`, `x64`, and `monorepo-ci`.
- One release runner, `amd7600-ci`, has labels `self-hosted`, `linux`, `x64`,
  and `monorepo-ci-release`. Only Unified Site Release targets this runner.
- Fork pull requests continue to use GitHub-hosted runners. The separate
  `finance-prod` runner handles production deployment only.

Each registered runner executes one job at a time. The nine test jobs and one
release job can all start together. Additional workflow runs queue until slots
are available. On this 12-thread, 64 GiB host, parallel jobs share CPU capacity;
ten concurrent jobs do not imply a tenfold speedup. All containers restart after
host reboots. Their project-specific volumes preserve registration and caches.

The Ubuntu 24.04 runner image includes Chrome, Python, build tools, and Docker CLI.
Existing setup-python and setup-node actions select each job's language versions.

From the repository root:

```sh
docker compose -f ops/actions-runner/compose.yml build runner
./ops/actions-runner/pool.sh start
./ops/actions-runner/pool.sh status
docker compose -f ops/actions-runner/compose.yml logs --tail 60 runner
docker compose -f ops/actions-runner/compose.yml -p monorepo-ci-01 logs --tail 60 worker
```

Starting the pool is idempotent: existing registrations are reused. To add or
restart a single test worker, run `./ops/actions-runner/register.sh worker 01`
(the accepted slots are `01` through `09`). The release runner uses
`./ops/actions-runner/register.sh release`.

New registrations require an administrator GitHub CLI login with repository
access. A short-lived token is piped to configuration, never saved in a dotenv
file. Credentials live in each private runner volume; do not publish or copy
these volumes into a repository. Avoid `down -v`, which deletes state and caches.

## Resource and isolation boundaries

Every worker has its own Compose project, registration, workspace, home, tool
cache, temporary directory, and network namespace. Parallel browser tests can
use the same localhost ports without collisions. Test workers have no Docker
socket, host mounts, or privileged sidecar.

Each test worker is capped at 0.75 CPU and 4 GiB RAM. The release runner and its
nested Docker daemon are each capped at 1.5 CPUs and 6 GiB RAM. Across all ten
slots this caps CI at 9.75 logical CPUs and 48 GiB RAM, leaving capacity for host
services. All CI containers have reduced CPU scheduling weight. Angular uses
at most two build workers, Node's heap is capped at 2560 MiB, and each runner
has 2 GiB of shared memory for Chromium. Logs rotate at 10 MiB with three files.

The release runner uses a dedicated Docker-in-Docker daemon, storage, socket,
and network namespace. No host home, production data volume, or host Docker
socket is mounted. This matters because release rehearsals use production's
Compose project and volume names, and cleanup deletes those disposable volumes.
The release runner shares its nested daemon's network namespace so tests can
reach loopback-published ports. Its work and temporary paths are shared with the
daemon so schema rehearsal bind mounts resolve correctly.

Docker-in-Docker requires a privileged container and shares the host kernel;
it is not a security boundary for hostile code. Use trusted contributors only,
and a separate VM for untrusted code. Workflow routing keeps normal fork CI off
this machine but is not repository-wide access control: someone able to modify
workflows could request any repository runner label. The existing production
runner retains its established host Docker privileges.

When refreshing the base image, drain jobs first. Persistent `/opt/runner`
volumes retain the installed runner application, including automatic updates;
recreating a registration volume deliberately is necessary to replace that copy.
Image rebuilds refresh system packages. Never copy one runner's registered volume
to another slot: each slot needs a unique identity.

After jobs finish, stop accepting jobs without deleting state:

```sh
./ops/actions-runner/pool.sh stop
```

Do not prune host Docker volumes or images as part of CI cleanup. Inspect CI image
usage **inside** the release daemon before targeted cleanup:

```sh
docker compose -f ops/actions-runner/compose.yml exec runner docker system df
```

## GitHub storage remains separate

Self-hosted execution avoids hosted compute usage. GitHub artifact uploads still
use GitHub storage. The first local release job passed its build, seeded schema
rehearsals, and browser checks, then GitHub rejected the release artifact because
its storage quota was full. That quota must be resolved separately before the
existing artifact-based deployment can succeed; runner parallelism does not
remove it. No tests or deployment verification gates are disabled by this setup.
