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
import { Context } from 'aws-lambda';
import { DynamoDB, S3, SecretsManager, SQS, STS } from 'aws-sdk';
import { Pool } from 'pg';
import { AlertNotification } from './../../layers/base/src/interfaces';
import {
  NotificationPrepperSQSSinkAdapter,
  NotificationPrepperTokenAllS3Adapter,
  NotificationPrepperTokenSelectedRdsAdapter,
} from './adapters/';
import { loadConfig } from './utils';
import {
  DatabaseConfigurationService,
  LoggingService,
  NotificationPrepperService,
} from '/opt/nodejs/src/services';
import { NotificationPrepperInAdapter } from '/opt/nodejs/src/adapters';

let secretsManagerClient = new SecretsManager();
const stsClient = new STS();
const sqsClient = new SQS();
const s3Client = new S3();
const config = loadConfig();
const logger = new LoggingService();
let ddbClient = config.stsRoleArnDynamoDb ? undefined : new DynamoDB.DocumentClient();

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
  event: AlertNotification,
  context: Context,
): Promise<void> => {
  logger.setMetdadata({
    awsRequestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    functionMemoryMB: context.memoryLimitInMB,
  });

  logger.debug({
    message: 'Received new alert notification. Determining receivers...',
    data: event,
  });

  try {
    let rdsConfig = config.stsRoleArnSecretsManager ? undefined : await rdsConfigPromise;

    if (!pool && config.flowControl === 'selected') {
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
        host: config.rdsHostReadOnly ?? rdsConfig.host.replace('cluster-', 'cluster-ro-'),
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

    if (config.stsRoleArnDynamoDb) {
      const assumeDdbResponse = await stsClient.assumeRole({
        RoleArn: config.stsRoleArnDynamoDb,
        RoleSessionName: context.functionName,
      }).promise();
      ddbClient = new DynamoDB.DocumentClient({
        credentials: assumeDdbResponse.Credentials as any,
      });
    }

    // Out adapter
    const sqsSinkAdapter = new NotificationPrepperSQSSinkAdapter({
      logger,
      sqsAllApns: config.sqsAllApns,
      sqsAllFcm: config.sqsAllFcm,
      sqsClient,
      sqsSelectedApns: config.sqsSelectedApns,
      sqsSelectedFcm: config.sqsSelectedFcm,
      ddbClient,
      ddbTableAlertBatch: config.ddbTableAlertBatches,
    });

    // Use case / service
    const service = new NotificationPrepperService({
      allTokenAdapter: new NotificationPrepperTokenAllS3Adapter({
        logger,
        s3BucketAllChunks: config.s3BucketAllChunks,
        s3Client,
      }),
      logger,
      selectedTokenAdapter: new NotificationPrepperTokenSelectedRdsAdapter({
        pool,
        logger,
      }),
      sinkAdapter: sqsSinkAdapter,
    });

    // In adapter
    const inAdapter = new NotificationPrepperInAdapter({
      flowControl: config.flowControl as any,
      notificationPrepperService: service,
    });

    await inAdapter.handleIncomingNotification(event);

    logger.debug({
      message: 'Processed alert notification and determined receivers.',
      data: event,
      remainingTimeMs: context.getRemainingTimeInMillis(),
    });
  } catch (error) {
    logger.error({
      message: 'Failed to process alert notification and determining receivers.',
      data: event,
      remainingTimeMs: context.getRemainingTimeInMillis(),
      errorDetails: {
        ...error,
      },
    });
  }
};
