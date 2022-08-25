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
import { Context, S3Event } from 'aws-lambda';
import { DynamoDB, Lambda, S3, SecretsManager, SQS, STS } from 'aws-sdk';
import { Pool } from 'pg';
import { LambdaAlertDashboardMapReduceAdapter, LambdaOutputAdapter, S3EventAdapter, S3ObjectFlaggerAdapter } from './adapters';
import { ProtocolOutputAdapter } from './adapters/protocol-output.adapter';
import { LambdaWatchdogOutputAdapter } from './adapters/lambda-watchdog.adapter';
import { loadConfig } from './utils';
import { AlertService, DatabaseConfigurationService, LoggingService } from '/opt/nodejs/src/services';

const config = loadConfig();
const logger = new LoggingService();
logger.debug({
  message: 'Loaded function configuration.',
  data: config,
});

let secretsManagerClient = config.stsRoleArnSecretsManager ? undefined : new SecretsManager();
const s3Client = new S3();
const lambdaClient = new Lambda();
const ddbClient = (config.stsRoleArnStep2High && config.stsRoleArnStep2Regular) ? undefined : new DynamoDB.DocumentClient();
const sqsClient = (config.stsRoleArnStep2High && config.stsRoleArnStep2Regular) ? undefined : new SQS();
const stsClient = new STS();
let lambdaClientHigh: Lambda;
let lambdaClientRegular: Lambda;
let sqsClientHigh: SQS;
let sqsClientRegular: SQS;
let ddbClientHigh: DynamoDB.DocumentClient;
let ddbClientRegular: DynamoDB.DocumentClient;


let dbConfigService = config.stsRoleArnSecretsManager ? undefined : new DatabaseConfigurationService({
  logger,
  secretsManagerClient,
});
const rdsConfigPromise = config.stsRoleArnSecretsManager ? undefined : dbConfigService.getCredentialsFromSecretsManager(config.secretIdRdsCredentials);
let pool: Pool;

function assumeRoleMapFromSTS(assumedDDBReadRole: any) {
  return {
    accessKeyId: assumedDDBReadRole.Credentials.AccessKeyId,
    secretAccessKey: assumedDDBReadRole.Credentials.SecretAccessKey,
    sessionToken: assumedDDBReadRole.Credentials.SessionToken,
  };
}

export const handler = async (
  event: S3Event,
  context: Context,
): Promise<void> => {
  logger.setMetdadata({
    awsRequestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    functionMemoryMB: context.memoryLimitInMB,
  });

  logger.debug({
    message: 'Received new S3 event.',
    data: event,
  });

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
          credentials: assumeRoleMapFromSTS(tempCredentialsSecMgr),
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
        port: config.rdsPort ?? rdsConfig.port,
        ssl: {
          rejectUnauthorized: false,
        },
        log: console.log,
      });
      logger.debug({
        message: 'Created cached database pool.',
      });
    }


    if (config.stsRoleArnStep2High && config.stsRoleArnStep2Regular) {
      // Initialize the clients if not cached
      if (!lambdaClientHigh && !lambdaClientRegular) {
        const assumeRoleHigh = await stsClient.assumeRole({
          RoleArn: config.stsRoleArnStep2High,
          RoleSessionName: context.functionName,
        }).promise();

        const assumeRoleRegular = await stsClient.assumeRole({
          RoleArn: config.stsRoleArnStep2Regular,
          RoleSessionName: context.functionName,
        }).promise();
        
        lambdaClientHigh = new Lambda({
          credentials: assumeRoleMapFromSTS(assumeRoleHigh),
        });
        sqsClientHigh = new SQS({
          credentials: assumeRoleMapFromSTS(assumeRoleHigh),
        });
        ddbClientHigh = new DynamoDB.DocumentClient({
          credentials: assumeRoleMapFromSTS(assumeRoleHigh),
        });


        lambdaClientRegular = new Lambda({
          credentials: assumeRoleMapFromSTS(assumeRoleRegular),
        });
        sqsClientRegular = new SQS({
          credentials: assumeRoleMapFromSTS(assumeRoleRegular),
        });
        ddbClientRegular = new DynamoDB.DocumentClient({
          credentials: assumeRoleMapFromSTS(assumeRoleRegular),
        });
      }

      // Configure any output adapters
      const lambdaOutputAdapter = new LambdaOutputAdapter({
        functionNameAllAlertsRegular: config.step2FunctionNameAllAlertsRegular,
        functionNameAllAlertsHigh: config.step2FunctionNameAllAlertsHigh,
        functionNameSelectedAlertsRegular: config.step2FunctionNameSelectedAlertsRegular,
        functionNameSelectedAlertsHigh: config.step2FunctionNameSelectedAlertsHigh,
        lambdaClientHigh,
        lambdaClientRegular,
        logger,
        notificationOtherPlatforms: config.notificationOtherPlatforms,
      });

      const protocolOutputAdapter = new ProtocolOutputAdapter({
        ddbClientHigh,
        ddbClientRegular,
        ddbTableProtocolHigh: config.ddbTableNameHigh,
        ddbTableProtocolRegular: config.ddbTableNameRegular,
        logger,
        regionId: config.regionId,
        sqsClientHigh,
        sqsClientRegular,
        sqsDdbFailureHigh: config.queueDdbFailureHigh,
        sqsDdbFailureRegular: config.queueDdbFailureRegular,
      });

      // Configure the object flagger
      const flaggerAdapter = new S3ObjectFlaggerAdapter({
        logger,
        s3Client,
        s3TagProcessed: config.s3TagProcessed,
      });

      const dashboardMapReduceAdapter = new LambdaAlertDashboardMapReduceAdapter({
        functionName: config.step5FunctionName,
        lambdaClient,
        logger,
      });

      const watchdogAdapter = new LambdaWatchdogOutputAdapter({
        functionName: config.watchdogFunctionName,
        lambdaClient,
        logger,
      });

      // Configure the use case service
      const alertService = new AlertService({
        logger,
        pool,
        queryWkt: config.queryWkt,
        querySHN: config.querySHN,
        queryWarnCell: config.queryWarnCells,
        outputAdapters: [
          lambdaOutputAdapter,
          protocolOutputAdapter,
        ],
        objectFlaggerAdapter: flaggerAdapter,
        dashboardMapReduceAdapter,
        watchdogAdapter,
      });

      // Configure the input adapter
      const numericRegionId = parseInt(config.regionId, 10);
      const inputAdapter = new S3EventAdapter({
        alertService,
        logger,
        notificationPlatform: config.notificationPlatform,
        s3Client,
        s3TagHash: config.s3TagHash,
        s3TagHashJson: config.s3TagHashJson,
        s3TagProvider: config.s3TagProvider,
        hashBitToProcess: `${numericRegionId - 1}`,
        s3Bucket3R: config.s3Bucket3R,
      });

      // Process the event
      await inputAdapter.handleEvent(event);

    } else {
      // Configure any output adapters
      const lambdaOutputAdapter = new LambdaOutputAdapter({
        functionNameAllAlertsRegular: config.step2FunctionNameAllAlertsRegular,
        functionNameAllAlertsHigh: config.step2FunctionNameAllAlertsHigh,
        functionNameSelectedAlertsRegular: config.step2FunctionNameSelectedAlertsRegular,
        functionNameSelectedAlertsHigh: config.step2FunctionNameSelectedAlertsHigh,
        lambdaClientHigh: lambdaClient,
        lambdaClientRegular: lambdaClient,
        logger,
        notificationOtherPlatforms: config.notificationOtherPlatforms,
      });

      const protocolOutputAdapter = new ProtocolOutputAdapter({
        ddbClientHigh: ddbClient,
        ddbClientRegular: ddbClient,
        ddbTableProtocolHigh: config.ddbTableNameHigh,
        ddbTableProtocolRegular: config.ddbTableNameRegular,
        logger,
        regionId: config.regionId,
        sqsClientHigh: sqsClient,
        sqsClientRegular: sqsClient,
        sqsDdbFailureHigh: config.queueDdbFailureHigh,
        sqsDdbFailureRegular: config.queueDdbFailureRegular,
      });

      const watchdogAdapter = new LambdaWatchdogOutputAdapter({
        functionName: config.watchdogFunctionName,
        lambdaClient,
        logger,
      });

      // Configure the object flagger
      const flaggerAdapter = new S3ObjectFlaggerAdapter({
        logger,
        s3Client,
        s3TagProcessed: config.s3TagProcessed,
      });

      const dashboardMapReduceAdapter = new LambdaAlertDashboardMapReduceAdapter({
        functionName: config.step5FunctionName,
        lambdaClient,
        logger,
      });

      // Configure the use case service
      const alertService = new AlertService({
        logger,
        pool,
        queryWkt: config.queryWkt,
        querySHN: config.querySHN,
        queryWarnCell: config.queryWarnCells,
        outputAdapters: [
          lambdaOutputAdapter,
          protocolOutputAdapter,
        ],
        objectFlaggerAdapter: flaggerAdapter,
        dashboardMapReduceAdapter,
        watchdogAdapter,
      });

      // Configure the input adapter
      const numericRegionId = parseInt(config.regionId, 10);
      const inputAdapter = new S3EventAdapter({
        alertService,
        logger,
        notificationPlatform: config.notificationPlatform,
        s3Client,
        s3TagHash: config.s3TagHash,
        s3TagHashJson: config.s3TagHashJson,
        s3TagProvider: config.s3TagProvider,
        hashBitToProcess: `${numericRegionId - 1}`,
        s3Bucket3R: config.s3Bucket3R,
      });

      // Process the event
      await inputAdapter.handleEvent(event);
    }

    logger.debug({
      message: 'Processed S3 event.',
      data: event,
      remainingTimeMs: context.getRemainingTimeInMillis(),
    });
  } catch (error) {
    logger.error({
      message: 'Failed to process S3 event.',
      data: event,
      remainingTimeMs: context.getRemainingTimeInMillis(),
      errorDetails: {
        ...error,
      },
    });
  }
};
