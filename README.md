# Personal site

One public site with a portfolio, shared sign-in, and private Finance, Travel,
and Media tools. One FastAPI service and one SQLite database run behind the
existing nginx-edge TLS proxy. One Angular web build ships in the same image.
Finance data remains encrypted in the browser; combining databases does not
decrypt or transform financial records.

- `/` — public portfolio, with a Workspace link
- `/hub` — shared private home
- `/finance/`, `/travel/`, `/media/` — tools
- `/auth/login` — shared sign-in

```sh
make install
make build-frontends
make dev
```

Open http://127.0.0.1:8000. Development state is under `.local/`, separate from
production. `make test` runs the regression suites; `make docker-build` builds
the production image; `make test-suite-routes` checks the assembled release.

[Operations and recovery](docs/OPERATIONS.md) is the current deployment reference.
[Schema migrations](docs/MIGRATIONS.md) covers creating and applying revisions.
[Remaining SRE work](docs/SRE-FOLLOWUPS.md) records accepted constraints and TODOs.
[Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), and
[security model](docs/SECURITY_MODEL.md) describe domain behavior.

The root `compose.yml` and Dockerfile are the supported deployment. Deploy
rebuilds from the candidate SHA; it does not promote the byte-identical image
CI already ran. A manual run uses the latest same-repository push CI run for
that SHA, so a newer failure overrides an older success. The SHA must still be
current `main`, and the Seeded schema rehearsals step must have succeeded.
Fork pull requests and unsuccessful CI do not deploy. That guard is on main in
[#323](https://github.com/Vivekpsps3/vivek-monorepo/pull/323). It is not a
deployment by itself, and it does not prove an off-host backup destination or
an alert recipient. A temporary deployment checkout supplies the versioned
Compose definition and is removed after the job. Application code runs from
the image; no permanent source checkout is needed on the host.
