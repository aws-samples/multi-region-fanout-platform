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
import { DynamoDB } from 'aws-sdk';
import { DynamoDBPushSenderProtocolAdapter } from './adapters';
import { loadConfig } from './utils';
import {
  LoggingService,
} from '/opt/nodejs/src/services';
import { AlertNotification } from './../../layers/base/src/interfaces';

const config = loadConfig();
const logger = new LoggingService();
let ddbClient = new DynamoDB.DocumentClient();

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
    message: 'Received new batch notification to write protocol.',
    data: event,
  });
  
  const batchResponse: SQSBatchResponse = {
    batchItemFailures: [],
  };
  
  try {
  
  
    const protocolAdapter = new DynamoDBPushSenderProtocolAdapter({
      ddbClient,
      ddbTableBatches: config.ddbTableAlertBatches,
      logger,
    });
  
    
  
    for await (const record of event.Records) {

      const parsed = JSON.parse(record.body) as {
        batchId: string;
        notification: AlertNotification;
      };
    
      const success = await protocolAdapter.logBatchCompleted(parsed.batchId, parsed.notification);
      if (!success) {
        batchResponse.batchItemFailures.push({
          itemIdentifier: record.messageId,
        });
      }
    }
      
  
  } catch (error) {
    logger.error({
      message: 'Failed to write protocol entry for batch.',
    });
  }
  
  return batchResponse;
};
  