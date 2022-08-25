-- NOTE: This script is executed with the application admin user
--       which has only RDS IAM Auth, so this user owns the new database.
-- REPLACEMENTS:
--       $2 is replaced with the name of the application database.
--       $3 is replaced with the name of the regular application user.
--       $4 is replaced with the password of the regular application user.

-- Revoke privileges from 'public' role
REVOKE ALL ON DATABASE $2 FROM PUBLIC;

-- PostGIS extension: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

ALTER SCHEMA tiger OWNER TO rds_superuser;
ALTER SCHEMA tiger_data OWNER TO rds_superuser; 
ALTER SCHEMA topology OWNER TO rds_superuser;
ALTER SCHEMA public OWNER TO rds_superuser;

CREATE OR REPLACE FUNCTION exec(text) returns text language plpgsql volatile AS $f$ BEGIN EXECUTE $1; RETURN $1; END; $f$;
SELECT exec('ALTER TABLE ' || quote_ident(s.nspname) || '.' || quote_ident(s.relname) || ' OWNER TO rds_superuser;')
  FROM (
    SELECT nspname, relname
    FROM pg_class c JOIN pg_namespace n ON (c.relnamespace = n.oid) 
    WHERE nspname in ('tiger','topology') AND
    relkind IN ('r','S','v') ORDER BY relkind = 'S')
s;

-- Read/write role for regular application users
CREATE ROLE mrfpuser;
GRANT CONNECT ON DATABASE $2 TO mrfpuser;

-- Regular application user
Do
$$
    BEGIN
        IF NOT EXISTS (SELECT * FROM pg_user WHERE usename = '$3') THEN
            CREATE USER $3 WITH LOGIN;
        END IF;
    end
$$;
ALTER USER $3 WITH PASSWORD '$4';

-- Assign the read/write role to the application user
GRANT mrfpuser TO $3;