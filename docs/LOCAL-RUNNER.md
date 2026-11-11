# Local GitHub Actions runner pool

Tracked configuration is `ops/actions-runner/compose.yml`. The commands are `ops/actions-runner/pool.sh` and `ops/actions-runner/register.sh`. Job routing is `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`. This page does not install a runner, and it does not describe the live machine.

Release promotion, the exact-SHA check, the seeded rehearsal, and rollback stay in [Operations](./OPERATIONS.md#release-and-rollback).

## Who runs where

`ci.yml` repeats one selector because `runs-on` cannot call shared shell and a called workflow would rename Unified Site Release. For a push, and for a pull request whose head repository full name equals this repository, the job uses its trusted labels. Any other pull request, including a missing head repository, uses `ubuntu-latest`.

| Role | Code | Labels the workflow requests |
| --- | --- | --- |
| Test workers | `register.sh worker` slots `01` through `03` | `self-hosted`, `linux`, `x64`, `monorepo-ci` |
| Release rehearsal | `register.sh release` | `self-hosted`, `linux`, `x64`, `monorepo-ci-release` |
| Production | not registered or started by this pool | `self-hosted`, `linux`, `monorepo-prod` |

Backend, Frontend, and Playwright request `monorepo-ci`. Unified Site Release requests `monorepo-ci-release`. Deploy requests `monorepo-prod` and its job condition is in the deploy workflow.

The selector is not repository access control. A pull request can replace the workflow and request another label. Fork-approval policy is not something this tree can turn on. Branch protection is not a file in this repository. Those stay owner settings until a fresh read-only check shows them.

Same-repository pull requests use the trusted labels, including a bot that opens the pull request from this repository. Only a different head repository is sent to `ubuntu-latest`.

## Commands

From the repository root:

```sh
docker compose -f ops/actions-runner/compose.yml build runner
./ops/actions-runner/pool.sh start
./ops/actions-runner/pool.sh status
./ops/actions-runner/pool.sh stop
```

`start` registers a runner only when `/opt/runner/.runner` is absent, then starts it. A new registration needs an administrator `gh` login for this repository. The short-lived token is read on stdin and is not written to a dotenv file. Do not print it or copy a runner volume into the repository.

`stop` stops the release runner and the three workers. It does not delete volumes, and it does not stop the nested daemon or the production runner. Avoid `down -v`.

One test worker: `./ops/actions-runner/register.sh worker 01`. The release runner: `./ops/actions-runner/register.sh release`.

Local logs, not for an issue or a public note:

```sh
docker compose -f ops/actions-runner/compose.yml logs --tail 60 runner
docker compose -f ops/actions-runner/compose.yml -p monorepo-ci-01 logs --tail 60 worker
```

## Capacity and isolation

CPU, memory, and log caps are the `cpus`, `mem_limit`, and `logging` fields in `ops/actions-runner/compose.yml`. Those fields are the code configuration. They are not a measurement of a host.

Each worker project has its own registration, workspace, home, tool cache, temporary directory, and network namespace. Workers do not mount a Docker socket. They share the external volume `monorepo-ci-dist` at `/opt/ci-dist` for the one frontend bundle.

The release service uses the nested daemon declared in the same Compose file. That daemon is `privileged` and shares the host kernel. The release runner uses `network_mode: service:docker` so rehearsals can reach loopback ports published by the nested daemon. It does not mount the host Docker socket or a production data volume. This is a trusted-code boundary, not a boundary against hostile code.

Refreshing the image does not replace a registered runner copy under `/opt/runner`. Recreate that volume only on purpose. Never copy one slot's volume to another slot.

Nested-daemon disk use, still local:

```sh
docker compose -f ops/actions-runner/compose.yml exec runner docker system df
```

Do not prune host Docker volumes or images as pool cleanup.
