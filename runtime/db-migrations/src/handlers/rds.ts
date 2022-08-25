/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { RDS, S3, SecretsManager, SSM } from 'aws-sdk';
import { Pool } from 'pg';
import * as semver from 'semver';
import {
  extractSemVerFromObjectname,
  getCurrentConfiguration,
  getTargetConfiguration,
  LambdaConfiguration,
} from './../utils';
import { LoggingService } from '/opt/nodejs/src/services';

export interface RdsHandlerOptions {
  s3Client: S3;
  config: LambdaConfiguration;
  functionName: string;
  requestId: string;
  secMgr: SecretsManager;
  ssmClient: SSM;
  logger: LoggingService;
}

const applicationDatabaseExists = async (
  dbName: string,
  pool: Pool,
  logger: LoggingService,
  requestId: string,
): Promise<boolean> => {
  logger.debug({
    message: 'Checking if application database exists...',
    requestId,
  });

  const queryResult = await pool.query(
    'SELECT datname FROM pg_database WHERE datistemplate = false;',
  );

  logger.debug({
    message: `Found ${queryResult.rowCount} databases in RDS.`,
    requestId,
  });

  const appDatabase = queryResult.rows.find((r) => r.datname === dbName);

  const result = appDatabase !== null && appDatabase !== undefined;
  logger.debug({
    message: `Application database exists: ${result}`,
    requestId,
  });
  return result;
};

async function getCredentialsFromSecretsManager(secretsManager: SecretsManager, secretArn: string) {
  const adminSecret = await secretsManager.getSecretValue({
    SecretId: secretArn,
  }).promise();
  const credentials: {
    username: string;
    password: string;
  } = JSON.parse(adminSecret.SecretString);

  return credentials;
}

const initRdsWithRoot = async (opts: RdsHandlerOptions, pool: Pool): Promise<boolean> => {
  try {
    opts.logger.info({
      message: 'Initializing RDS with root user...',
      requestId: opts.requestId,
    });
    // Run the init_root.sql script as the master RDS user
    const s3InitRootScript = await opts.s3Client.getObject({
      Bucket: opts.config.configBucketName,
      Key: 'config/pg/ini_root.sql',
    }).promise();

    const appAdminPassword = (await getCredentialsFromSecretsManager(opts.secMgr, opts.config.secretsManagerAdminCredArn)).password;

    let sqlCmdRoot = s3InitRootScript.Body.toString('utf-8');
    sqlCmdRoot = sqlCmdRoot
      .replace(/\$2/g, `"${opts.config.dbUserAdmin}"`)
      .replace(/\$3/g, appAdminPassword);
    console.log(sqlCmdRoot);
    await pool.query('BEGIN;');
    await pool.query(sqlCmdRoot);
    await pool.query('COMMIT;');

    opts.logger.info({
      message: 'Successfully initialized RDS with root user.',
      requestId: opts.requestId,
    });
    return true;
  } catch (error) {
    opts.logger.info({
      message: `Failed to initialize RDS with root user: ${error.message}`,
      errorDetails: error,
      requestId: opts.requestId,
    });
    return false;
  }
};

const createAppDatabase = async (
  opts: RdsHandlerOptions,
  host: string,
): Promise<boolean> => {
  opts.logger.info({
    message: 'Creating application database...',
    requestId: opts.requestId,
  });

  const adminCreds = await getCredentialsFromSecretsManager(opts.secMgr, opts.config.secretsManagerAdminCredArn);
  opts.logger.debug({
    message: 'Retrieved admin credentials for RDS from SecretsManager',
    data: adminCreds.username,
    requestId: opts.requestId,
  });

  const poolAppAdmin = new Pool({
    application_name: opts.functionName,
    user: adminCreds.username,
    password: adminCreds.password,
    host: host,
    port: opts.config.dbPort,
    database: opts.config.dbNameRoot,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  const sqlCmd = `CREATE DATABASE "${opts.config.dbName}";`;

  try {
    await poolAppAdmin.query(sqlCmd);
    opts.logger.info({
      message: `Successfully created application database '${opts.config.dbName}'.`,
      requestId: opts.requestId,
    });
    return true;
  } catch (error) {
    opts.logger.error({
      message: `Failed to create application database '${opts.config.dbName}'.`,
      errorDetails: error,
      requestId: opts.requestId,
    });
    return false;
  }
};

const bootstrapAppDatabase = async (
  opts: RdsHandlerOptions,
  host: string,
): Promise<boolean> => {
  opts.logger.info({
    message: 'Bootstrapping application database...',
    requestId: opts.requestId,
  });

  const adminCreds = await getCredentialsFromSecretsManager(opts.secMgr, opts.config.secretsManagerAdminCredArn);
  opts.logger.debug({
    message: 'Retrieved admin credentials for RDS from SecretsManager',
    data: adminCreds.username,
    requestId: opts.requestId,
  });

  const poolAppAdmin = new Pool({
    application_name: opts.functionName,
    user: adminCreds.username,
    password: adminCreds.password,
    host: host,
    port: opts.config.dbPort,
    database: opts.config.dbName,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  const s3InitScript = await opts.s3Client
    .getObject({
      Bucket: opts.config.configBucketName,
      Key: 'config/pg/ini_admin.sql',
    })
    .promise();

  const appUserPassword = (await getCredentialsFromSecretsManager(opts.secMgr, opts.config.secretsManagerUserCredArn)).password;

  let sqlCmd = s3InitScript.Body.toString('utf-8');
  sqlCmd = sqlCmd.replace(/\$2/g, `"${opts.config.dbName}"`);
  sqlCmd = sqlCmd.replace(/\$3/g, `"${opts.config.dbUserApp}"`);
  sqlCmd = sqlCmd.replace(/\$4/g, appUserPassword);

  try {
    await poolAppAdmin.query('BEGIN;');
    await poolAppAdmin.query(sqlCmd);
    await poolAppAdmin.query('COMMIT;');
    opts.logger.info({
      message: `Successfully bootstrapped application database '${opts.config.dbName}'.`,
      requestId: opts.requestId,
    });
    return true;
  } catch (error) {
    opts.logger.error({
      errorDetails: error,
      message: `Failed to bootstrap application database '${opts.config.dbName}'.`,
      requestId: opts.requestId,
    });
    await poolAppAdmin.query('ROLLBACK;');
    return false;
  }
};

export const handleRdsMigrations = async (
  opts: RdsHandlerOptions,
): Promise<void> => {
  try {
    const rootCreds = await getCredentialsFromSecretsManager(opts.secMgr, opts.config.secretsManagerRootCredArn);
    opts.logger.debug({
      message: 'Retrieved root credentials for RDS from SecretsManager',
      data: rootCreds.username,
      requestId: opts.requestId,
    });

    // RETRIEVE THE HOSTNAME FOR THE PRIMARY NODE (NEEDS TO BE DYNAMIC IN CASE OF FAILOVER)
    const ssmParamHostPrimaryResponse = await opts.ssmClient
      .getParameter({
        Name: opts.config.ssmHostPrimary,
      })
      .promise();

    const hostPrimary = ssmParamHostPrimaryResponse.Parameter.Value;

    opts.logger.debug({
      message: 'Retrieved hostname for primary RDS node',
      data: {
        host: hostPrimary,
      },
      requestId: opts.requestId,
    });

    // PG POOL FOR ROOT USER
    const poolRoot = new Pool({
      application_name: opts.functionName,
      database: opts.config.dbNameRoot,
      host: hostPrimary,
      password: rootCreds.password,
      port: opts.config.dbPort,
      ssl: {
        rejectUnauthorized: false,
      },
      user: rootCreds.username,
    });

    // DATABASE INITIALIZATION (IF REQUIRED)
    const appDbExists = await applicationDatabaseExists(
      opts.config.dbName,
      poolRoot,
      opts.logger,
      opts.requestId,
    );

    let appDbPresent = appDbExists;

    if (!appDbExists) {
      // Initialize RDS with the root user
      const iniRootSucceeded = await initRdsWithRoot(opts, poolRoot);
      if (!iniRootSucceeded) {
        throw new Error(
          'Failed to initialize RDS with root user. Check the `ini_root.sql` script.',
        );
      }
      // Create the app database with the admin user
      appDbPresent = await createAppDatabase(opts, hostPrimary);
      if (!appDbPresent) {
        throw new Error(
          'Failed to create application database with admin user.',
        );
      }
    }

    // CURRENT VS TARGET CONFIGURATION
    const currentConfig = await getCurrentConfiguration({
      bucketName: opts.config.configBucketName,
      logger: opts.logger,
      s3Client: opts.s3Client,
      requestId: opts.requestId,
    });

    const targetConfig = await getTargetConfiguration({
      bucketName: opts.config.configBucketName,
      logger: opts.logger,
      s3Client: opts.s3Client,
      requestId: opts.requestId,
    });

    const currentVersion = semver.parse(currentConfig.version);
    const targetVersion = semver.parse(targetConfig.version);

    const opsFlag = targetVersion.compare(currentVersion);

    opts.logger.info({
      message: 'Retrieved current and target version',
      data: {
        current: currentConfig.version,
        target: targetConfig.version,
      },
      requestId: opts.requestId,
    });

    if (opsFlag === 0) {
      // No operations to perform
      opts.logger.info({
        message: `Database already running the latest version: ${targetConfig.version}`,
        requestId: opts.requestId,
      });
      return;
    }

    if (currentConfig.version === '0.0.0') {
      // Bootstrap the database as application admin user
      await bootstrapAppDatabase(opts, hostPrimary);
    }

    const params: S3.ListObjectsV2Request = {
      Bucket: opts.config.configBucketName,
      Prefix: `config/pg/${opsFlag === 1 ? 'upgrade_' : 'downgrade_'}`,
    };
    const s3DbOperations = await opts.s3Client.listObjectsV2(params).promise();
    opts.logger.debug({
      message: `Total database operations from S3: ${s3DbOperations.KeyCount}`,
      requestId: opts.requestId,
    });

    if (s3DbOperations.Contents.length > 0) {
      const dbOperationsList = s3DbOperations.Contents.map((c) => {
        return {
          key: c.Key,
          version: extractSemVerFromObjectname(c.Key.replace('config/pg/', '')),
        };
      });

      opts.logger.debug({
        message: 'Filtered database operations.',
        variable: 'dbOperationsList',
        value: dbOperationsList,
      });

      const dbOperationsApplicable = dbOperationsList.filter((o) => {
        if (opsFlag === 1) {
          return (
            semver.parse(o.version).compare(targetVersion) <= 0 &&
              semver.parse(o.version).compare(currentVersion) === 1
          );
        }

        return semver.parse(o.version).compare(targetVersion) === 1;
      });

      opts.logger.info({
        message: `${dbOperationsApplicable.length} operation/s to be performed...`,
        requestId: opts.requestId,
      });

      if (dbOperationsApplicable.length > 0) {
        const adminCreds = await getCredentialsFromSecretsManager(opts.secMgr, opts.config.secretsManagerAdminCredArn);
        opts.logger.debug({
          message: 'Retrieved admin credentials for RDS from SecretsManager',
          data: adminCreds.username,
          requestId: opts.requestId,
        });

        const poolAppAdmin = new Pool({
          application_name: opts.functionName,
          user: adminCreds.username,
          password: adminCreds.password,
          host: hostPrimary,
          port: opts.config.dbPort,
          database: opts.config.dbName,
          ssl: {
            rejectUnauthorized: false,
          },
        });

        for await (const dbOperation of dbOperationsApplicable) {
          try {
            opts.logger.info({
              message: `Processing version upgrade to ${dbOperation.version}...`,
              requestId: opts.requestId,
            });
            const s3DbOperationCmd = await opts.s3Client
              .getObject({
                Bucket: opts.config.configBucketName,
                Key: dbOperation.key,
              })
              .promise();

            const sqlCmdOp = s3DbOperationCmd.Body.toString('utf-8');

            await poolAppAdmin.query('BEGIN;');
            await poolAppAdmin.query(sqlCmdOp);
            await poolAppAdmin.query('COMMIT;');
            const newCurrentVersionContent = JSON.stringify({
              version: dbOperation.version,
            });
            await opts.s3Client
              .putObject({
                Bucket: opts.config.configBucketName,
                Key: 'applied_config/pg/current.json',
                Body: newCurrentVersionContent,
              })
              .promise();
            opts.logger.info({
              message: `Successfully processed version upgrade to ${dbOperation.version}.`,
              requestId: opts.requestId,
            });
          } catch (error) {
            opts.logger.error({
              errorDetails: error,
              errorMessage: 'Failed to process version upgrade.',
            });
            await poolAppAdmin.query('ROLLBACK;');
          }
        }
      }
    }

    opts.logger.info({
      message: 'Database initialization or migration succeeded.',
      requestId: opts.requestId,
    });
  } catch (error) {
    opts.logger.error({
      message: 'Database initialization or migration failed.',
      errorDetails: error,
      requestId: opts.requestId,
    });
  }
};
