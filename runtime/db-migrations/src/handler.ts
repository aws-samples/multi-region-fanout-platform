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
import { SecretsManager, S3, SSM } from 'aws-sdk';
import { Context } from 'aws-lambda';
import { LoggingService } from '/opt/nodejs/src/services';
import { loadConfig } from './utils';
import { handleRdsMigrations } from './handlers/rds';

const logger = new LoggingService();
const config = loadConfig();
const secMgr = new SecretsManager();
const s3Client = new S3();
const ssmClient = new SSM();

export const handler = async (event: any, context: Context): Promise<void> => {
  logger.info({
    message: 'Executing database initialization or migration...',
    data: event,
    requestId: context.awsRequestId,
  });

  if (!config.configBucketName) {
    logger.error({
      message: 'S3 bucket for configuration not specified. Check environment variable \'S3_CONFIG_BUCKET\'.',
      requestId: context.awsRequestId,
    });

    return;
  }

  await handleRdsMigrations({
    config,
    functionName: context.functionName,
    logger,
    requestId: context.awsRequestId,
    s3Client,
    secMgr,
    ssmClient,
  });

  logger.info({
    message: 'Successfully executed database initialization or migration.',
    requestId: context.awsRequestId,
  });
};
