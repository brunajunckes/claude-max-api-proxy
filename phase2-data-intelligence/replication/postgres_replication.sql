-- PostgreSQL Replication Configuration for Real-time Sync
-- Phase 2: Data Synchronization Strategy

-- Enable logical replication on source
ALTER SYSTEM SET wal_level = logical;
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET max_replication_slots = 10;

-- Create replication slots
SELECT pg_create_logical_replication_slot('duckdb_sync', 'test_decoding');

-- Create publication for all tables
CREATE PUBLICATION IF NOT EXISTS duckdb_pub FOR ALL TABLES;

-- Cache invalidation strategy table
CREATE TABLE IF NOT EXISTS cache_invalidation (
    cache_key VARCHAR PRIMARY KEY,
    last_updated TIMESTAMP,
    ttl_seconds INTEGER,
    dependencies JSONB,
    invalidation_triggers VARCHAR[]
);

-- Track changed rows for incremental sync
CREATE TABLE IF NOT EXISTS cdc_tracking (
    change_id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR,
    operation VARCHAR (1), -- I, U, D
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    row_data JSONB
);

-- Create triggers for CDC
CREATE OR REPLACE FUNCTION track_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO cdc_tracking (table_name, operation, row_data)
    VALUES (TG_TABLE_NAME, TG_OP, row_to_json(NEW));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
