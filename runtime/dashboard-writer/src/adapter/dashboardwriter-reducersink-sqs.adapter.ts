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
import { SQS } from 'aws-sdk';
import { DateTime } from 'luxon';
import { v4 } from 'uuid';
import {
  AlertNotification,
  DashboardWriterReducerSinkAdapter,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';

function sliceIntoChunks<T>(arr: T[], chunkSize: number) {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    res.push(chunk);
  }
  return res;
}

export interface DashboardWriterReducerSinkSqsAdapterConfig {
  sqsClient: SQS;
  logger: LoggingServiceInterface;
  queueUrl: string;
}


export class DashboardWriterReducerSinkSqsAdapter implements DashboardWriterReducerSinkAdapter {
  readonly sqsClient: SQS;
  readonly logger: LoggingServiceInterface;
  readonly queueUrl: string;

  constructor(config: DashboardWriterReducerSinkSqsAdapterConfig) {
    this.sqsClient = config.sqsClient;
    this.logger = config.logger;
    this.queueUrl = config.queueUrl;
  }

  async passToReducer(notification: AlertNotification): Promise<boolean> {
    try {
      this.logger.debug({
        message: 'Passing map/reduce through SQS...',
        data: notification,
      });

      const batchChunks = sliceIntoChunks(notification.regionKeys, 10);

      for await (const batchChunk of batchChunks) {
        const params: SQS.SendMessageBatchRequest = {
          Entries: batchChunk.map(c => ({
            Id: v4(),
            MessageBody: JSON.stringify({
              regionKey: c,
            }),
            MessageGroupId: c,
            MessageDeduplicationId: `${c}:${DateTime.utc().toISO()}`,
          })),
          QueueUrl: this.queueUrl,
        };
        const sqsBatchResponse = await this.sqsClient.sendMessageBatch(params).promise();

        if (sqsBatchResponse.Failed.length > 0) {
          this.logger.error({
            message: 'Failed to send one or more SQS messages',
            data: sqsBatchResponse,
          });
          throw new Error('Failed to send one or more SQS messages');
        }

        this.logger.debug({
          message: 'Successfully sent SQS messages.',
          data: sqsBatchResponse,
        });
      }


      this.logger.debug({
        message: 'Passed map/reduce through SQS.',
        data: notification,
      });
      return true;
    } catch (error) {
      this.logger.error({
        message: 'Failed to pass map/reduce through SQS.',
        data: notification,
        errorDetails: error,
      });

      return false;
    }

  }

}
