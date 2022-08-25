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
import { S3, SQS } from 'aws-sdk';
import { SqsPushSenderProtocolAdapter, SqsAllInputAdapter, SqsSelectedInputAdapter } from './adapters';
import { loadConfig } from './utils';
import {
  LoggingService, PushsenderService,

} from '/opt/nodejs/src/services';

const config = loadConfig();
const logger = new LoggingService();
const s3Client = new S3();
const sqsClient = new SQS();

logger.debug({
  message: 'Loaded function configuration.',
  data: config,
});
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
    message: 'Received new push notification to process.',
    data: event,
  });

  const batchResponse: SQSBatchResponse = {
    batchItemFailures: [],
  };

  try {


    const protocolAdapter = new SqsPushSenderProtocolAdapter({
      sqsClient,
      queueUrl: config.sqsQueueUrl,
      logger,
    });

    const useCaseService = new PushsenderService({
      protocolAdapter,
    });

    // FLOW CONTROL SPLIT
    if (config.flowControl === 'all') {
      const inputAdapter = new SqsAllInputAdapter({
        logger,
        s3Client,
        useCaseService,
      });

      for await (const record of event.Records) {
        const success = await inputAdapter.handleSqsRecord(record);
        if (!success) {
          batchResponse.batchItemFailures.push({
            itemIdentifier: record.messageId,
          });
        }
      }
    } else {
      const inputAdapter = new SqsSelectedInputAdapter({
        logger,
        useCaseService,
      });
      for await (const record of event.Records) {
        const success = await inputAdapter.handleSqsRecord(record);
        if (!success) {
          batchResponse.batchItemFailures.push({
            itemIdentifier: record.messageId,
          });
        }
      }
    }

  } catch (error) {
    logger.error({
      message: 'Failed to send push notifications',
    });
  }

  return batchResponse;
};
