"""Baseline unified site schema.

Revision ID: site_schema_v1
Revises:
Create Date: 2026-10-22

Frozen from metadata().create_all for the schema this revision introduced.
Later model changes belong in new revisions. Do not edit these statements
to follow the models, and do not drop the recovery-key columns here.
"""
from alembic import op

revision = "site_schema_v1"
down_revision = None
branch_labels = None
depends_on = None

STATEMENTS = (
    'CREATE TABLE market_research_cache (\n\tsymbol VARCHAR NOT NULL, \n\tperiod VARCHAR NOT NULL, \n\tpayload_json TEXT NOT NULL, \n\tsource VARCHAR NOT NULL, \n\tfetched_at DATETIME NOT NULL, \n\texpires_at DATETIME NOT NULL, \n\tPRIMARY KEY (symbol, period)\n)',
    'CREATE INDEX ix_market_research_cache_expires_at ON market_research_cache (expires_at)',
    'CREATE INDEX ix_market_research_cache_symbol ON market_research_cache (symbol)',
    'CREATE INDEX ix_market_research_cache_fetched_at ON market_research_cache (fetched_at)',
    'CREATE TABLE ticker_quotes (\n\tsymbol VARCHAR NOT NULL, \n\tclose_price FLOAT NOT NULL, \n\tquote_date DATE NOT NULL, \n\tfetched_at DATETIME NOT NULL, \n\tsource VARCHAR NOT NULL, \n\tPRIMARY KEY (symbol)\n)',
    'CREATE INDEX ix_ticker_quotes_symbol ON ticker_quotes (symbol)',
    'CREATE INDEX ix_ticker_quotes_fetched_at ON ticker_quotes (fetched_at)',
    'CREATE TABLE users (\n\tid INTEGER NOT NULL, \n\temail VARCHAR NOT NULL, \n\tdisplay_name VARCHAR NOT NULL, \n\trole VARCHAR(5) NOT NULL, \n\tpassword_hash VARCHAR, \n\tis_active BOOLEAN NOT NULL, \n\tmust_change_password BOOLEAN NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tlast_login_at DATETIME, \n\tusername VARCHAR, \n\tauth_public_key_b64 TEXT, \n\tauth_algorithm VARCHAR, \n\tauth_key_version INTEGER, \n\tauth_kdf_salt_b64 VARCHAR, \n\tauth_kdf_iterations INTEGER, \n\tauth_wrapped_private_key_b64 TEXT, \n\tauth_recovery_wrapped_private_key_b64 TEXT, \n\tpasswordless_enrolled_at DATETIME, \n\tPRIMARY KEY (id)\n)',
    'CREATE INDEX ix_users_is_active ON users (is_active)',
    'CREATE UNIQUE INDEX ix_users_email ON users (email)',
    'CREATE UNIQUE INDEX ix_users_username ON users (username)',
    'CREATE INDEX ix_users_id ON users (id)',
    'CREATE TABLE place_cache (\n\t"query" VARCHAR(500) NOT NULL, \n\tpayload TEXT NOT NULL, \n\tfetched_at DATETIME NOT NULL, \n\tPRIMARY KEY ("query")\n)',
    'CREATE TABLE settings (\n\t"key" VARCHAR(80) NOT NULL, \n\tvalue TEXT NOT NULL, \n\tPRIMARY KEY ("key")\n)',
    'CREATE TABLE catalog_items (\n\tid INTEGER NOT NULL, \n\tkind VARCHAR(20) NOT NULL, \n\ttitle VARCHAR(300) NOT NULL, \n\tcreator VARCHAR(300), \n\tyear INTEGER, \n\toverview TEXT, \n\tartwork_url TEXT, \n\tgenres TEXT, \n\tsource VARCHAR(40) NOT NULL, \n\tsource_id VARCHAR(120), \n\textra TEXT, \n\texternal_ratings TEXT, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_catalog_source UNIQUE (source, source_id)\n)',
    'CREATE INDEX ix_catalog_items_kind ON catalog_items (kind)',
    'CREATE TABLE provider_cache (\n\tcache_key VARCHAR(300) NOT NULL, \n\tpayload TEXT NOT NULL, \n\tfetched_at DATETIME NOT NULL, \n\tPRIMARY KEY (cache_key)\n)',
    'CREATE TABLE site_schema (\n\tid INTEGER NOT NULL, \n\tversion INTEGER NOT NULL, \n\tPRIMARY KEY (id)\n)',
    'CREATE TABLE alembic_version (\n\tversion_num VARCHAR(32) NOT NULL, \n\tPRIMARY KEY (version_num)\n)',
    'CREATE TABLE audit_events (\n\tid INTEGER NOT NULL, \n\tactor_user_id INTEGER, \n\ttarget_user_id INTEGER, \n\tevent_type VARCHAR NOT NULL, \n\tdetail TEXT, \n\tcreated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(target_user_id) REFERENCES users (id), \n\tFOREIGN KEY(actor_user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_audit_events_id ON audit_events (id)',
    'CREATE INDEX ix_audit_events_actor_user_id ON audit_events (actor_user_id)',
    'CREATE INDEX ix_audit_events_created_at ON audit_events (created_at)',
    'CREATE INDEX ix_audit_events_target_user_id ON audit_events (target_user_id)',
    'CREATE INDEX ix_audit_events_event_type ON audit_events (event_type)',
    'CREATE TABLE auth_challenges (\n\tid INTEGER NOT NULL, \n\tchallenge_id VARCHAR NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tchallenge_hash VARCHAR NOT NULL, \n\texpires_at DATETIME NOT NULL, \n\tconsumed_at DATETIME, \n\tcreated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_auth_challenges_consumed_at ON auth_challenges (consumed_at)',
    'CREATE INDEX ix_auth_challenges_user_id ON auth_challenges (user_id)',
    'CREATE UNIQUE INDEX ix_auth_challenges_challenge_hash ON auth_challenges (challenge_hash)',
    'CREATE INDEX ix_auth_challenges_id ON auth_challenges (id)',
    'CREATE UNIQUE INDEX ix_auth_challenges_challenge_id ON auth_challenges (challenge_id)',
    'CREATE INDEX ix_auth_challenges_expires_at ON auth_challenges (expires_at)',
    'CREATE TABLE auth_enrollments (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\ttoken_hash VARCHAR NOT NULL, \n\texpires_at DATETIME NOT NULL, \n\tconsumed_at DATETIME, \n\tcreated_by_user_id INTEGER, \n\tcreated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id), \n\tFOREIGN KEY(created_by_user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_auth_enrollments_id ON auth_enrollments (id)',
    'CREATE INDEX ix_auth_enrollments_consumed_at ON auth_enrollments (consumed_at)',
    'CREATE INDEX ix_auth_enrollments_user_id ON auth_enrollments (user_id)',
    'CREATE INDEX ix_auth_enrollments_created_by_user_id ON auth_enrollments (created_by_user_id)',
    'CREATE UNIQUE INDEX ix_auth_enrollments_token_hash ON auth_enrollments (token_hash)',
    'CREATE INDEX ix_auth_enrollments_expires_at ON auth_enrollments (expires_at)',
    'CREATE TABLE encrypted_record_indexes (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tcollection VARCHAR NOT NULL, \n\tclient_id VARCHAR NOT NULL, \n\tindex_name VARCHAR NOT NULL, \n\tindex_value_b64 VARCHAR NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_user_blind_index_value UNIQUE (user_id, collection, index_name, index_value_b64), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_encrypted_record_indexes_id ON encrypted_record_indexes (id)',
    'CREATE INDEX ix_encrypted_record_indexes_client_id ON encrypted_record_indexes (client_id)',
    'CREATE INDEX ix_encrypted_record_indexes_user_id ON encrypted_record_indexes (user_id)',
    'CREATE INDEX ix_encrypted_record_indexes_index_name ON encrypted_record_indexes (index_name)',
    'CREATE INDEX ix_encrypted_record_indexes_collection ON encrypted_record_indexes (collection)',
    'CREATE TABLE encrypted_records (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tcollection VARCHAR NOT NULL, \n\tclient_id VARCHAR NOT NULL, \n\tciphertext_b64 TEXT NOT NULL, \n\tschema_version INTEGER NOT NULL, \n\tkey_version INTEGER NOT NULL, \n\trevision INTEGER NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_user_collection_client_id UNIQUE (user_id, collection, client_id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_encrypted_records_client_id ON encrypted_records (client_id)',
    'CREATE INDEX ix_encrypted_records_id ON encrypted_records (id)',
    'CREATE INDEX ix_encrypted_records_user_id ON encrypted_records (user_id)',
    'CREATE INDEX ix_encrypted_records_collection ON encrypted_records (collection)',
    'CREATE INDEX ix_encrypted_records_updated_at ON encrypted_records (updated_at)',
    'CREATE TABLE user_sessions (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\ttoken_hash VARCHAR NOT NULL, \n\tcsrf_token_hash VARCHAR NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\texpires_at DATETIME NOT NULL, \n\tlast_seen_at DATETIME NOT NULL, \n\trevoked_at DATETIME, \n\tmigration_only BOOLEAN NOT NULL, \n\tuser_agent VARCHAR, \n\tip_address VARCHAR, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_user_sessions_id ON user_sessions (id)',
    'CREATE INDEX ix_user_sessions_expires_at ON user_sessions (expires_at)',
    'CREATE INDEX ix_user_sessions_user_id ON user_sessions (user_id)',
    'CREATE INDEX ix_user_sessions_revoked_at ON user_sessions (revoked_at)',
    'CREATE UNIQUE INDEX ix_user_sessions_token_hash ON user_sessions (token_hash)',
    'CREATE TABLE user_vaults (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tkdf_algorithm VARCHAR NOT NULL, \n\tkdf_salt_b64 VARCHAR NOT NULL, \n\tkdf_iterations INTEGER NOT NULL, \n\twrapped_dek_b64 TEXT NOT NULL, \n\trecovery_wrapped_dek_b64 TEXT NOT NULL, \n\tkey_version INTEGER NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE UNIQUE INDEX ix_user_vaults_user_id ON user_vaults (user_id)',
    'CREATE INDEX ix_user_vaults_id ON user_vaults (id)',
    'CREATE TABLE pto_policy (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tconfigured BOOLEAN NOT NULL, \n\taccrual_amount VARCHAR(32) NOT NULL, \n\taccrual_unit VARCHAR(10) NOT NULL, \n\taccrual_cadence VARCHAR(20) NOT NULL, \n\thours_per_day VARCHAR(32) NOT NULL, \n\tbalance_days VARCHAR(32) NOT NULL, \n\tbalance_as_of DATE NOT NULL, \n\tannual_cap_days VARCHAR(32), \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_pto_policy_user_id UNIQUE (user_id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_pto_policy_user_id ON pto_policy (user_id)',
    'CREATE TABLE trips (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\ttitle VARCHAR(200) NOT NULL, \n\tstart_date DATE NOT NULL, \n\tend_date DATE NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\torigin_label VARCHAR(200), \n\tnotes TEXT, \n\tcounts_as_pto BOOLEAN NOT NULL, \n\tpto_days VARCHAR(32), \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_trips_user_id ON trips (user_id)',
    'CREATE INDEX ix_trips_end_date ON trips (end_date)',
    'CREATE INDEX ix_trips_start_date ON trips (start_date)',
    'CREATE TABLE episodes (\n\tid INTEGER NOT NULL, \n\tcatalog_id INTEGER NOT NULL, \n\tseason_number INTEGER NOT NULL, \n\tepisode_number INTEGER NOT NULL, \n\ttitle VARCHAR(300), \n\tair_date DATE, \n\toverview TEXT, \n\tsource_id VARCHAR(120), \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_episode UNIQUE (catalog_id, season_number, episode_number), \n\tFOREIGN KEY(catalog_id) REFERENCES catalog_items (id) ON DELETE CASCADE\n)',
    'CREATE INDEX ix_episodes_catalog_id ON episodes (catalog_id)',
    'CREATE TABLE music_albums (\n\tid INTEGER NOT NULL, \n\tcatalog_id INTEGER NOT NULL, \n\ttitle VARCHAR(300) NOT NULL, \n\tyear INTEGER, \n\tsource_id VARCHAR(120), \n\tartwork_url TEXT, \n\tposition INTEGER NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(catalog_id) REFERENCES catalog_items (id) ON DELETE CASCADE, \n\tCONSTRAINT uq_music_album_source UNIQUE (catalog_id, source_id)\n)',
    'CREATE INDEX ix_music_albums_catalog_id ON music_albums (catalog_id)',
    'CREATE TABLE releases (\n\tid INTEGER NOT NULL, \n\tcatalog_id INTEGER NOT NULL, \n\tregion VARCHAR(40), \n\tplatform VARCHAR(80), \n\treleased_on DATE, \n\tprecision VARCHAR(20) NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\tnote VARCHAR(300), \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(catalog_id) REFERENCES catalog_items (id) ON DELETE CASCADE\n)',
    'CREATE INDEX ix_releases_catalog_id ON releases (catalog_id)',
    'CREATE TABLE user_entries (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tcatalog_id INTEGER NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\trating FLOAT, \n\treview TEXT, \n\treview_spoiler BOOLEAN NOT NULL, \n\treview_updated_at DATETIME, \n\tsummary VARCHAR(400), \n\ttags TEXT, \n\tprogress_value FLOAT, \n\tprogress_unit VARCHAR(20), \n\tfavorite BOOLEAN NOT NULL, \n\tanticipated BOOLEAN NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tupdated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(catalog_id) REFERENCES catalog_items (id), \n\tCONSTRAINT uq_user_catalog UNIQUE (user_id, catalog_id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_user_entries_catalog_id ON user_entries (catalog_id)',
    'CREATE INDEX ix_user_entries_user_id ON user_entries (user_id)',
    'CREATE TABLE budget_lines (\n\tid INTEGER NOT NULL, \n\ttrip_id INTEGER NOT NULL, \n\tcategory VARCHAR(40) NOT NULL, \n\tlabel VARCHAR(200) NOT NULL, \n\tamount_cents INTEGER NOT NULL, \n\tcurrency VARCHAR(3) NOT NULL, \n\tpaid BOOLEAN NOT NULL, \n\tnotes TEXT, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE CASCADE\n)',
    'CREATE INDEX ix_budget_lines_trip_id ON budget_lines (trip_id)',
    'CREATE TABLE notes (\n\tid INTEGER NOT NULL, \n\ttrip_id INTEGER NOT NULL, \n\ton_date DATE, \n\tbody TEXT NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE CASCADE\n)',
    'CREATE INDEX ix_notes_trip_id ON notes (trip_id)',
    'CREATE TABLE pto_entries (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\ttrip_id INTEGER, \n\tstart_date DATE NOT NULL, \n\tend_date DATE NOT NULL, \n\tdays VARCHAR(32) NOT NULL, \n\tlabel VARCHAR(200) NOT NULL, \n\tkind VARCHAR(20) NOT NULL, \n\tnotes TEXT, \n\tPRIMARY KEY (id), \n\tUNIQUE (trip_id), \n\tFOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_pto_entries_user_id ON pto_entries (user_id)',
    'CREATE INDEX ix_pto_entries_start_date ON pto_entries (start_date)',
    'CREATE TABLE reminders (\n\tid INTEGER NOT NULL, \n\ttrip_id INTEGER NOT NULL, \n\ttitle VARCHAR(200) NOT NULL, \n\tdue_at DATETIME, \n\tdone BOOLEAN NOT NULL, \n\tkind VARCHAR(20) NOT NULL, \n\tnotes TEXT, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE CASCADE\n)',
    'CREATE INDEX ix_reminders_trip_id ON reminders (trip_id)',
    'CREATE TABLE stays (\n\tid INTEGER NOT NULL, \n\ttrip_id INTEGER NOT NULL, \n\tsort_order INTEGER NOT NULL, \n\tcity VARCHAR(200) NOT NULL, \n\tregion VARCHAR(200), \n\tcountry VARCHAR(200), \n\tarrive_on DATE NOT NULL, \n\tleave_on DATE NOT NULL, \n\tlodging_name VARCHAR(200), \n\tlodging_address VARCHAR(500), \n\tlat FLOAT, \n\tlng FLOAT, \n\tnotes TEXT, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE CASCADE\n)',
    'CREATE INDEX ix_stays_trip_id ON stays (trip_id)',
    'CREATE TABLE transports (\n\tid INTEGER NOT NULL, \n\ttrip_id INTEGER NOT NULL, \n\tsort_order INTEGER NOT NULL, \n\trole VARCHAR(20) NOT NULL, \n\tmode VARCHAR(20) NOT NULL, \n\tcarrier VARCHAR(120), \n\tnumber VARCHAR(40), \n\tdepart_place VARCHAR(200), \n\tarrive_place VARCHAR(200), \n\tdepart_at DATETIME, \n\tarrive_at DATETIME, \n\tdepart_tz VARCHAR(80), \n\tarrive_tz VARCHAR(80), \n\tconfirmation VARCHAR(80), \n\tseat VARCHAR(40), \n\tcost_cents INTEGER, \n\tcurrency VARCHAR(3) NOT NULL, \n\tpaid BOOLEAN NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\tnotes TEXT, \n\tfa_ident VARCHAR(20), \n\tfa_status VARCHAR(80), \n\tfa_aircraft VARCHAR(40), \n\tfa_gate_origin VARCHAR(20), \n\tfa_gate_destination VARCHAR(20), \n\tfa_terminal_origin VARCHAR(20), \n\tfa_terminal_destination VARCHAR(20), \n\tfa_baggage_claim VARCHAR(20), \n\tfa_delay_departure_seconds INTEGER, \n\tfa_delay_arrival_seconds INTEGER, \n\tfa_scheduled_out VARCHAR(40), \n\tfa_estimated_out VARCHAR(40), \n\tfa_actual_out VARCHAR(40), \n\tfa_scheduled_in VARCHAR(40), \n\tfa_estimated_in VARCHAR(40), \n\tfa_actual_in VARCHAR(40), \n\tfa_fetched_at DATETIME, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE CASCADE\n)',
    'CREATE INDEX ix_transports_trip_id ON transports (trip_id)',
    'CREATE TABLE album_ratings (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tentry_id INTEGER NOT NULL, \n\talbum_id INTEGER NOT NULL, \n\trating FLOAT, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_album_rating UNIQUE (user_id, entry_id, album_id), \n\tFOREIGN KEY(album_id) REFERENCES music_albums (id) ON DELETE CASCADE, \n\tFOREIGN KEY(entry_id) REFERENCES user_entries (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_album_ratings_entry_id ON album_ratings (entry_id)',
    'CREATE INDEX ix_album_ratings_album_id ON album_ratings (album_id)',
    'CREATE INDEX ix_album_ratings_user_id ON album_ratings (user_id)',
    'CREATE TABLE episode_progress (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tepisode_id INTEGER NOT NULL, \n\twatched BOOLEAN NOT NULL, \n\twatched_on DATE, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_episode_progress UNIQUE (user_id, episode_id), \n\tFOREIGN KEY(episode_id) REFERENCES episodes (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_episode_progress_episode_id ON episode_progress (episode_id)',
    'CREATE INDEX ix_episode_progress_user_id ON episode_progress (user_id)',
    'CREATE TABLE experiences (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tentry_id INTEGER NOT NULL, \n\tkind VARCHAR(20) NOT NULL, \n\tstarted_on DATE, \n\tfinished_on DATE, \n\trating FLOAT, \n\tnotes TEXT, \n\tspoiler BOOLEAN NOT NULL, \n\tcreated_at DATETIME NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(entry_id) REFERENCES user_entries (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_experiences_user_id ON experiences (user_id)',
    'CREATE INDEX ix_experiences_entry_id ON experiences (entry_id)',
    'CREATE TABLE music_tracks (\n\tid INTEGER NOT NULL, \n\talbum_id INTEGER NOT NULL, \n\ttitle VARCHAR(300) NOT NULL, \n\tposition INTEGER NOT NULL, \n\tsource_id VARCHAR(120), \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(album_id) REFERENCES music_albums (id) ON DELETE CASCADE, \n\tCONSTRAINT uq_music_track_source UNIQUE (album_id, source_id)\n)',
    'CREATE INDEX ix_music_tracks_album_id ON music_tracks (album_id)',
    'CREATE TABLE season_progress (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tentry_id INTEGER NOT NULL, \n\tseason_number INTEGER NOT NULL, \n\twatched BOOLEAN NOT NULL, \n\trating FLOAT, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(entry_id) REFERENCES user_entries (id) ON DELETE CASCADE, \n\tCONSTRAINT uq_season_progress UNIQUE (user_id, entry_id, season_number), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_season_progress_entry_id ON season_progress (entry_id)',
    'CREATE INDEX ix_season_progress_user_id ON season_progress (user_id)',
    'CREATE TABLE parking (\n\tid INTEGER NOT NULL, \n\ttrip_id INTEGER NOT NULL, \n\ttransport_id INTEGER, \n\tnecessary VARCHAR(10) NOT NULL, \n\tbooked BOOLEAN NOT NULL, \n\tarrangement VARCHAR(20) NOT NULL, \n\tplace_name VARCHAR(200), \n\taddress VARCHAR(500), \n\tlat FLOAT, \n\tlng FLOAT, \n\tconfirmation VARCHAR(80), \n\tstart_at DATETIME, \n\tend_at DATETIME, \n\tcost_cents INTEGER, \n\tcurrency VARCHAR(3) NOT NULL, \n\tpaid BOOLEAN NOT NULL, \n\tnotes TEXT, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(transport_id) REFERENCES transports (id) ON DELETE SET NULL, \n\tFOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE CASCADE\n)',
    'CREATE INDEX ix_parking_trip_id ON parking (trip_id)',
    'CREATE TABLE plan_items (\n\tid INTEGER NOT NULL, \n\ttrip_id INTEGER NOT NULL, \n\tstay_id INTEGER, \n\ton_date DATE NOT NULL, \n\tstart_time VARCHAR(5), \n\tend_time VARCHAR(5), \n\tkind VARCHAR(20) NOT NULL, \n\ttitle VARCHAR(200) NOT NULL, \n\tplace_name VARCHAR(200), \n\taddress VARCHAR(500), \n\tlat FLOAT, \n\tlng FLOAT, \n\turl VARCHAR(500), \n\tcost_cents INTEGER, \n\tcurrency VARCHAR(3) NOT NULL, \n\tpaid BOOLEAN NOT NULL, \n\tnotes TEXT, \n\tsort_order INTEGER NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(stay_id) REFERENCES stays (id) ON DELETE SET NULL, \n\tFOREIGN KEY(trip_id) REFERENCES trips (id) ON DELETE CASCADE\n)',
    'CREATE INDEX ix_plan_items_trip_id ON plan_items (trip_id)',
    'CREATE INDEX ix_plan_items_on_date ON plan_items (on_date)',
    'CREATE TABLE track_ratings (\n\tid INTEGER NOT NULL, \n\tuser_id INTEGER NOT NULL, \n\tentry_id INTEGER NOT NULL, \n\ttrack_id INTEGER NOT NULL, \n\trating FLOAT, \n\tPRIMARY KEY (id), \n\tCONSTRAINT uq_track_rating UNIQUE (user_id, entry_id, track_id), \n\tFOREIGN KEY(track_id) REFERENCES music_tracks (id) ON DELETE CASCADE, \n\tFOREIGN KEY(entry_id) REFERENCES user_entries (id) ON DELETE CASCADE, \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)',
    'CREATE INDEX ix_track_ratings_track_id ON track_ratings (track_id)',
    'CREATE INDEX ix_track_ratings_user_id ON track_ratings (user_id)',
    'CREATE INDEX ix_track_ratings_entry_id ON track_ratings (entry_id)',
)


def upgrade() -> None:
    # op.execute renders in offline --sql mode. exec_driver_sql does not.
    for statement in STATEMENTS:
        op.execute(statement)
    op.execute("INSERT INTO site_schema (id, version) VALUES (1, 1)")
    op.execute("INSERT INTO alembic_version (version_num) VALUES ('e0f6a2b3c4d5')")


def downgrade() -> None:
    raise NotImplementedError("baseline is not reversible; restore from backup")
