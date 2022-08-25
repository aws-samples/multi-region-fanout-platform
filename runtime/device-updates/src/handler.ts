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
import { SecretsManager } from 'aws-sdk';
import { Pool } from 'pg';
import { DeleteDeviceHandlerAdapter, RegisterDeviceHandlerAdapter, SqsEventAdapter } from './adapters';
import { loadConfig } from './utils';
import {
  DatabaseConfigurationService,
  DeviceUpdaterService,
  LoggingService,
} from '/opt/nodejs/src/services';

const secretsManagerClient = new SecretsManager();
const config = loadConfig();
const logger = new LoggingService();

logger.debug({
  message: 'Loaded function configuration.',
  data: config,
});
const dbConfigService = new DatabaseConfigurationService({
  logger,
  secretsManagerClient,
});
const rdsConfigPromise = dbConfigService.getCredentialsFromSecretsManager(
  config.secretIdRdsCredentials,
);
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
    message: 'Received new device update notification.',
    data: event,
  });

  const batchResponse: SQSBatchResponse = {
    batchItemFailures: [],
  };

  try {
    const rdsConfig = await rdsConfigPromise;

    if (!pool) {
      logger.debug({
        message: 'No cached database pool.',
      });
      pool = new Pool({
        application_name: context.functionName,
        database: rdsConfig.dbname,
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

      // Out Adapters
      const deleteAdapter = new DeleteDeviceHandlerAdapter({
        logger,
        pool,
        query: config.queryDelete,
      });
      const registerAdapter = new RegisterDeviceHandlerAdapter({
        logger,
        pool,
        query: config.queryRegister,
      });

      // Use Case / Service
      const useCase = new DeviceUpdaterService({
        logger,
        registeredAdapters: {
          DELETE_DEVICE: deleteAdapter,
          REGISTER_DEVICE: registerAdapter,
        },
      });

      // In Adapters
      const sqsAdapter = new SqsEventAdapter({
        logger,
        useCaseService: useCase,
      });

      for await (const record of event.Records) {
        const success = await sqsAdapter.handleEventRecord(record);
        if (!success) {
          batchResponse.batchItemFailures.push({
            itemIdentifier: record.messageId,
          });
        }
      }
    }
  } catch (error) {
    logger.error({
      message: 'Failed to handle device updates.',
      data: event,
      errorDetails: error,
    });
  }

  return batchResponse;
};
