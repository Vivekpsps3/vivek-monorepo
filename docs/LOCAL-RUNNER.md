# Local GitHub Actions runner pool

Trusted main/master pushes and same-repository pull requests can execute all four
CI jobs on amd7600-server:

- Three CI runners, `amd7600-ci-01` through `amd7600-ci-03`, have labels
  `self-hosted`, `linux`, `x64`, and `monorepo-ci`. Backend, Frontend, and
  Playwright each take one of these runners.
- One release runner, `amd7600-ci`, has labels `self-hosted`, `linux`, `x64`,
  and `monorepo-ci-release`. Only Unified Site Release targets this runner.
- Fork pull requests continue to use GitHub-hosted runners. The separate
  `amd7600-prod` runner has the `monorepo-prod` label and handles production
  deployment only.

Each registered runner executes one job at a time. The Backend, Frontend, and
Playwright jobs use the test workers; Playwright waits for the Frontend bundle.
Unified Site Release uses the release runner. Additional workflow runs queue
until slots are available. On this 12-thread, 64 GiB host, parallel jobs share
CPU capacity. All containers restart after host reboots. Their project-specific
volumes preserve registration and caches.

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
(the accepted slots are `01` through `03`). The release runner uses
`./ops/actions-runner/register.sh release`.

New registrations require an administrator GitHub CLI login with repository
access. A short-lived token is piped to configuration, never saved in a dotenv
file. Credentials live in each private runner volume; do not publish or copy
these volumes into a repository. Avoid `down -v`, which deletes state and caches.

## Resource and isolation boundaries

Every worker has its own Compose project, registration, workspace, home, tool
cache, temporary directory, and network namespace. Parallel browser tests can
use the same localhost ports without collisions. Test workers have no Docker
socket, host mount, or privileged sidecar. They share the Docker volume
`monorepo-ci-dist`, mounted at `/opt/ci-dist`, which carries the one production
bundle from Frontend to Playwright.

Each CI runner, the release runner, and the release runner's nested Docker daemon
are capped at 2 CPUs and 6 GiB RAM. Backend and Playwright run on those CI
runners, so each gets 2 cores and a 6 GiB cap. Across the three CI runners, the
release runner, and its daemon this caps CI at 10 logical CPUs and 30 GiB RAM,
leaving capacity for host services. All CI containers have reduced CPU scheduling
weight. Angular uses
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

Self-hosted execution avoids hosted compute usage. CI builds and checks the
production image but does not upload release archives or Playwright traces to
GitHub Actions. Deploy requires successful trusted main CI, checks out the exact
tested SHA, and rebuilds its Docker image on the production runner each time.
Image verification, backup, migration, readiness probes, and image rollback
remain in place. See [Release and rollback](./OPERATIONS.md#release-and-rollback).

npm/pip and Playwright dependency caches remain enabled; GitHub accounts for
cache storage separately from artifact storage. Test output and job logs remain
available, but downloadable Playwright traces are no longer uploaded. Existing
artifacts must be deleted separately; GitHub storage accounting can take 6–12
hours to reflect deletion. No tests or deployment verification gates are disabled
by this setup.
