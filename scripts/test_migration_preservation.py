import sqlite3
import unittest

from scripts.migration_preservation import snapshot, verify


class PreservationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(
            "CREATE TABLE catalog_items (id INTEGER PRIMARY KEY, title TEXT, artwork BLOB); INSERT INTO catalog_items VALUES (1, 'Keep me', X'0123'); CREATE TABLE provider_cache(cache_key TEXT PRIMARY KEY, payload TEXT); INSERT INTO provider_cache VALUES ('tmdb:movie:query', 'transient'), ('tvmaze:episodes:1', 'durable');"
        )
        self.before = snapshot(self.db, prune_cache_keys=["tmdb:movie:query"])
        self.db.execute("DELETE FROM provider_cache WHERE cache_key='tmdb:movie:query'")

    def tearDown(self):
        self.db.close()

    def test_preserves_original_values_with_declared_expansion(self):
        self.db.executescript(
            "ALTER TABLE catalog_items ADD COLUMN migration_provenance TEXT; INSERT INTO catalog_items VALUES (2, 'Saved legacy album', NULL, 'legacy-album');"
        )
        report = verify(self.before, self.db)
        self.assertEqual(report["preserved_rows"], 2)
        self.assertEqual(report["new_catalog_rows"], 1)
        self.assertEqual(report["pruned_cache_rows"], 1)

    def test_changed_original_fails_even_when_the_count_matches(self):
        self.db.execute("UPDATE catalog_items SET title='Changed' WHERE id=1")
        with self.assertRaisesRegex(AssertionError, "Original values"):
            verify(self.before, self.db)

    def test_deleted_original_fails(self):
        self.db.execute("DELETE FROM catalog_items")
        with self.assertRaisesRegex(AssertionError, "Original values"):
            verify(self.before, self.db)

    def test_unexplained_new_catalog_row_fails(self):
        self.db.execute("INSERT INTO catalog_items VALUES (2, 'Accidental', NULL)")
        with self.assertRaisesRegex(AssertionError, "Unexplained added"):
            verify(self.before, self.db)

    def test_durable_cache_loss_fails(self):
        self.db.execute("DELETE FROM provider_cache")
        with self.assertRaisesRegex(AssertionError, "Original values"):
            verify(self.before, self.db)

    def test_search_cache_must_actually_be_pruned(self):
        self.db.execute("INSERT INTO provider_cache VALUES ('tmdb:movie:query', 'transient')")
        with self.assertRaisesRegex(AssertionError, "Unexplained added"):
            verify(self.before, self.db)
