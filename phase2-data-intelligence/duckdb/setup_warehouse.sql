-- Data Warehouse Schema for Claude Max API Analytics
-- Phase 2: Real-time Analytics Infrastructure

CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ml_features;
CREATE SCHEMA IF NOT EXISTS staging;

-- Core Hunters Table
CREATE TABLE IF NOT EXISTS analytics.hunters (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    repository VARCHAR,
    owner VARCHAR,
    stars INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    language VARCHAR,
    description VARCHAR,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    health_score FLOAT,
    activity_score FLOAT
);

-- API Request Events (fact table)
CREATE TABLE IF NOT EXISTS analytics.api_events (
    event_id VARCHAR PRIMARY KEY,
    hunter_id VARCHAR,
    request_timestamp TIMESTAMP,
    response_time_ms INTEGER,
    model_used VARCHAR,
    tokens_used INTEGER,
    status_code INTEGER,
    error_message VARCHAR,
    user_id VARCHAR,
    conversation_id VARCHAR,
    FOREIGN KEY (hunter_id) REFERENCES analytics.hunters(id)
);

-- Aggregated Metrics (dimensional tables)
CREATE TABLE IF NOT EXISTS analytics.hourly_metrics (
    metric_id VARCHAR PRIMARY KEY,
    hour_timestamp TIMESTAMP,
    hunter_id VARCHAR,
    total_requests INTEGER,
    avg_response_time FLOAT,
    error_rate FLOAT,
    tokens_consumed BIGINT,
    unique_users INTEGER,
    FOREIGN KEY (hunter_id) REFERENCES analytics.hunters(id)
);

-- ML Feature Store
CREATE TABLE IF NOT EXISTS ml_features.hunter_features (
    feature_id VARCHAR PRIMARY KEY,
    hunter_id VARCHAR,
    feature_date DATE,
    -- Engagement metrics
    usage_frequency FLOAT,
    avg_response_time FLOAT,
    error_rate FLOAT,
    -- Popularity metrics
    stars_growth FLOAT,
    fork_growth FLOAT,
    -- Health metrics
    code_quality_score FLOAT,
    maintenance_activity FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hunter_id) REFERENCES analytics.hunters(id)
);

-- Training Dataset for ML Models
CREATE TABLE IF NOT EXISTS ml_features.training_data (
    training_id VARCHAR PRIMARY KEY,
    hunter_id VARCHAR,
    -- Features
    feature_vector DOUBLE[],
    -- Labels
    performance_label VARCHAR,
    adoption_label VARCHAR,
    quality_label VARCHAR,
    -- Metadata
    label_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hunter_id) REFERENCES analytics.hunters(id)
);

-- Staging Tables for ETL
CREATE TABLE IF NOT EXISTS staging.raw_hunters (
    raw_id VARCHAR,
    raw_data JSON,
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staging.raw_api_events (
    raw_event_id VARCHAR,
    raw_event_data JSON,
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_events_timestamp ON analytics.api_events(request_timestamp);
CREATE INDEX IF NOT EXISTS idx_api_events_hunter ON analytics.api_events(hunter_id);
CREATE INDEX IF NOT EXISTS idx_hunters_updated ON analytics.hunters(updated_at);
CREATE INDEX IF NOT EXISTS idx_hourly_metrics_time ON analytics.hourly_metrics(hour_timestamp);
