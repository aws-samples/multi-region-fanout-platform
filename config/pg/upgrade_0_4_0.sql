-- SQL Script to create tables for aggregated dashboard files

CREATE SCHEMA IF NOT EXISTS mrfp_mapreduce;
GRANT USAGE ON SCHEMA mrfp_mapreduce TO mrfpuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mrfp_mapreduce TO mrfpuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA mrfp_mapreduce GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mrfpuser;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA mrfp_mapreduce TO mrfpuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA mrfp_mapreduce GRANT USAGE ON SEQUENCES TO mrfpuser;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA mrfp_mapreduce TO mrfpuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA mrfp_mapreduce GRANT EXECUTE ON ROUTINES TO mrfpuser;

CREATE TABLE IF NOT EXISTS mrfp_mapreduce.alert_notifications (
    alert_id VARCHAR(500) PRIMARY KEY,
    payload  JSONB,
    i18n     JSONB,
    sent     timestamptz
);


CREATE TABLE IF NOT EXISTS mrfp_mapreduce.region_maps (
    id         VARCHAR(50) PRIMARY KEY,
    alert_id   VARCHAR(500),
    region_key VARCHAR(50),
    FOREIGN KEY (alert_id)
    REFERENCES mrfp_mapreduce.alert_notifications (alert_id)
);

CREATE INDEX IF NOT EXISTS ix_region_maps_key
ON mrfp_mapreduce.region_maps (region_key);