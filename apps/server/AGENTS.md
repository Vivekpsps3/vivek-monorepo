# Site server

[main.py](main.py) composes domains; [database.py](database.py) owns the single
engine/session lifecycle; [identity](identity/) owns auth/session/credentials.
[Calendar feeds](calendar.py) compose saved Travel/Media projections; identity
owns hash-only capabilities and owner-scoped management. URL query tokens must be
redacted, including exceptions. Reauthorize conditional reads after revocation.
Town, Pixels and search are server projections. Day facts and keepsakes project existing
rows and leave scores unchanged. Stamp receipts start at zero and are game-only. A play receipt grants 5 Stamps for each minigame's first Town-day win, cap 10. Quests and discoveries are stored once. Welcome grants 2 once. Ranks do not decay. Domain rules
stay in app directories.

Shared transport must not import app business rules.

Preserve owner scoping, atomic challenge consumption, canonical origin/purpose,
commit-before-cookie/response and no sensitive SQL parameters in logs. Credential
rotation consumes its purpose proof, advances the shared wrap revision, updates both
wraps and revokes other sessions in one transaction. Independent wrap writes are
retired (410); legacy KDF wraps remain readable and upgrade through rotation. Runtime state
and a response cookie must describe the same committed winner. Provider I/O releases
database transaction ownership before waiting.

[alembic/versions](alembic/versions/) and helpers imported by applied revisions are
historical. Schema changes extend the single head;
read [MIGRATIONS](../../docs/MIGRATIONS.md) and prove upgrade/data preservation.
A domain reset must not delete another domain or unknown ciphertext.
Password-only migration endpoints are retired (404). Stored migration-only
sessions stay denied.

The maintenance monitor classifies readiness, TLS expiry, and backup age once.
Local `/metrics` probes and independent webhook/heartbeat delivery do not share
an execution path. `SITE_ALERT_MODE` defaults to off. Off and dry-run send
nothing. No recipient is hardcoded, and a synthetic transport is not activation.

Use root Python lint/type/coverage gates plus affected domain suites. Use
[SECURITY_MODEL](../../docs/SECURITY_MODEL.md) for auth/vault protocol changes and
[OPERATIONS](../../docs/OPERATIONS.md) for release/restore work. Test with disposable
synthetic databases; a merge alone does not activate runtime.
