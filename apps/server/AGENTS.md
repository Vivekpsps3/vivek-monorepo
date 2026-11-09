# Site server

[main.py](main.py) composes domains; [database.py](database.py) owns the single
engine/session lifecycle; [identity](identity/) owns auth/session/credentials.
Town, Pixels and search are server projections. Finance, Travel and Media rules
remain in their own app directories.

Keep dependency direction explicit: shared transport/persistence machinery must not
import app business rules. Prefer existing request/session helpers over a new generic
repository or unit-of-work hierarchy.

Preserve owner scoping, atomic challenge consumption, canonical origin/purpose,
commit-before-cookie/response and no sensitive SQL parameters in logs. Runtime state
and a response cookie must describe the same committed winner. Provider I/O releases
database transaction ownership before waiting.

[alembic/versions](alembic/versions/) and helpers imported by applied revisions are
historical behavior, not dead code. Schema changes extend the actual single head;
read [MIGRATIONS](../../docs/MIGRATIONS.md) and prove upgrade/data preservation.
A domain reset must not delete another domain or unknown supported ciphertext.

Use root Python lint/type/coverage gates plus affected domain suites. Use
[SECURITY_MODEL](../../docs/SECURITY_MODEL.md) for auth/vault protocol changes and
[OPERATIONS](../../docs/OPERATIONS.md) for release/restore work. Test with disposable
synthetic databases; a code merge alone does not establish runtime activation.
