# Configuration

This folder contains all static configuration.

## PosgreSQL

The folder `./pg` contains all updates/downgrades (aka migrations) of the relational database as well as the initialization script.
The target version of the database can be configured within `./pg/target.json`.

The Lambda which applies database migrations requires that the files follow a certain naming convention:

`<upgrade/downgrade>_<SEMVER_MAJOR>_<SEMVER_MINOR>_<SEMVER_PATCH>.sql`

All upgrades must start with `upgrade` and all downgrades must start with `downgrade`. The semantic versioning number has to be delimited with underscores, not dots.
The Lambda function which performs database upgrades will apply upgrades in ascending order of the semantic version and downgrades in descending order.
Please note that all migrations must be written in an incremental way.

The initialization script is split into two parts, `ini_root.sql` which creates an admin user for the application and enables IAM authentication and `ini_admin.sql`.
This application admin user creates the application database, so the initial cluster user who's credentials are stored in IAM cannot access the actual data.
The application admin user creates the schema, the application role for regular users and a regular user with IAM authentication.
