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
import { Context, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { SecretsManager, S3, STS } from 'aws-sdk';
import { Pool } from 'pg';
import { DashboardReducerDatastorePgAdapter, DashboardReducerResultStoreS3Adapter } from './adapters';
import { loadConfig } from './utils';
import {
  DashboardReducerService,
  DatabaseConfigurationService,
  LoggingService,

} from '/opt/nodejs/src/services';

let secretsManagerClient = new SecretsManager();
const stsClient = new STS();
const config = loadConfig();
const logger = new LoggingService();
let s3Client = config.stsRoleArnS3 ? undefined : new S3();
logger.debug({
  message: 'Loaded function configuration.',
  data: config,
});

let dbConfigService = config.stsRoleArnSecretsManager ? undefined : new DatabaseConfigurationService({
  logger,
  secretsManagerClient,
});
const rdsConfigPromise = config.stsRoleArnSecretsManager ? undefined : dbConfigService.getCredentialsFromSecretsManager(config.secretIdRdsCredentials);
let pool: Pool;

export const handler = async (
  event: SQSEvent,
  context: Context,
): Promise<SQSBatchResponse> => {
  logger.setMetdadata({
    awsRequestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    functionMemoryMB: context.memoryLimitInMB,
  });

  logger.debug({
    message: 'Received new map/reduce task.',
    data: event,
  });

  const batchResponse: SQSBatchResponse = {
    batchItemFailures: [],
  };

  try {
    let rdsConfig = config.stsRoleArnSecretsManager ? undefined : await rdsConfigPromise;

    if (!pool) {
      if (config.stsRoleArnSecretsManager) {
        logger.debug({
          message: 'Assuming role for SecretsManager access',
          data: config.stsRoleArnSecretsManager,
        });
        const tempCredentialsSecMgr = await stsClient.assumeRole({
          RoleArn: config.stsRoleArnSecretsManager,
          RoleSessionName: context.functionName,
        }).promise();

        secretsManagerClient = new SecretsManager({
          credentials: {
            accessKeyId: tempCredentialsSecMgr.Credentials.AccessKeyId,
            secretAccessKey: tempCredentialsSecMgr.Credentials.SecretAccessKey,
            sessionToken: tempCredentialsSecMgr.Credentials.SessionToken,
          },
        });
        dbConfigService = new DatabaseConfigurationService({
          logger,
          secretsManagerClient,
        });
        rdsConfig = await dbConfigService.getCredentialsFromSecretsManager(config.secretIdRdsCredentials);
      }

      logger.debug({
        message: 'No cached database pool.',
      });
      pool = new Pool({
        application_name: context.functionName,
        database: config.rdsDatabase ?? rdsConfig.dbname,
        host: rdsConfig.host,
        password: rdsConfig.password,
        user: rdsConfig.username,
        port: rdsConfig.port,
        ssl: {
          rejectUnauthorized: false,
        },
      });

      logger.debug({
        message: 'Created cached database pool.',
      });
    }

    // Adapters
    const dataStoreAdapter = new DashboardReducerDatastorePgAdapter({
      pool,
      logger,
    });

    const resultStoreAdapter = new DashboardReducerResultStoreS3Adapter({
      logger,
      s3Bucket: config.s3BucketDashboard,
      s3Client,
      s3Prefix: config.s3PrefixDashboard,
    });

    // Use Case / Service
    const useCaseService = new DashboardReducerService({
      dataStoreAdapter,
      logger,
      resultStoreAdapter,
    });

    for await (const record of event.Records) {
      const msgBodyParsed: {
        regionKey: string;
      } = JSON.parse(record.body);
      const success = await useCaseService.reduceRegionKey(msgBodyParsed.regionKey);

      if (!success) {
        batchResponse.batchItemFailures.push({
          itemIdentifier: record.messageId,
        });
      }
    }

  } catch (error) {
    logger.error({
      message: 'Failed to process map/reduce task.',
    });
  }

  return batchResponse;
};
