-- SQL Script to create tables for alerts, devices, etc.

CREATE SCHEMA IF NOT EXISTS mrfp_ops;
GRANT USAGE ON SCHEMA mrfp_ops TO mrfpuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mrfp_ops TO mrfpuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA mrfp_ops GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mrfpuser;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA mrfp_ops TO mrfpuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA mrfp_ops GRANT USAGE ON SEQUENCES TO mrfpuser;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA mrfp_ops TO mrfpuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA mrfp_ops GRANT EXECUTE ON ROUTINES TO mrfpuser;

CREATE TABLE mrfp_ops.devices (
    device_id VARCHAR(500) PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,
    pushtoken VARCHAR(500) NOT NULL,
    created timestamptz,
    modified timestamptz,
    os_versioncode VARCHAR(30) NOT NULL,
    ap1_level integer,
    ap2_level integer,
    ap3_level integer,
    ap4_level integer,
    mylocation boolean,
    regions numeric[]
);

CREATE TABLE mrfp_ops.geos (
    aid SERIAL PRIMARY KEY,
    region_key VARCHAR(100),
    zcurve_gem numeric(10,0),
    wkb_geometry public.geometry(MultiPolygon,4326)
);

-- Warncells are for AP2

CREATE TABLE mrfp_ops.warncells (
    aid SERIAL PRIMARY KEY,
    warncell_id numeric(10,0),
    wkb_geometry public.geometry(MultiPolygon,4326)
);

CREATE INDEX ix_warncells_warncell_id ON mrfp_ops.warncells USING btree (warncell_id);
CREATE INDEX ix_warncells_wkb_geometry ON mrfp_ops.warncells USING gist (wkb_geometry);

ALTER TABLE mrfp_ops.devices ALTER COLUMN regions TYPE VARCHAR(100)[];

