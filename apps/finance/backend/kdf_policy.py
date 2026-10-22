"""Passphrase KDF policy for vault and signing-key wraps.

The browser wraps keys with PBKDF2-HMAC-SHA256 because WebCrypto has no Argon2id.
OWASP's floor for that algorithm is 600_000 iterations. Accounts enrolled at the
older 310_000 count still unwrap; the client re-wraps at this floor on the next
successful unlock. ``kdf_algorithm`` on the vault row is the hook for a later
algorithm change without rejecting stored PBKDF2 wraps.
"""

MIN_PBKDF2_ITERATIONS = 600_000
MAX_PBKDF2_ITERATIONS = 5_000_000
LEGACY_PBKDF2_ITERATIONS = 310_000
