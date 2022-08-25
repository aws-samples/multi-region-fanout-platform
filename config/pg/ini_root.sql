-- NOTE: This script initializes the database and is only executed once
--       with the initial RDS cluster user.
-- REPLACEMENTS:
--       $2 is replaced with the username of the application admin.
--       $3 is replaced with the password of the application admin.

-- Revoke privileges from 'public' role
-- REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Admin user creation
Do
$$
BEGIN
  IF NOT EXISTS (SELECT * FROM pg_user WHERE usename = '$2') THEN
      CREATE USER $2 WITH LOGIN;
END IF;
end
$$;
ALTER USER $2 WITH PASSWORD '$3';

-- Grant admin user DB and ROLE creation rights
ALTER USER $2 CREATEDB;
ALTER USER $2 CREATEROLE;

-- Grant the admin user rds_superuser
GRANT rds_superuser TO $2;


