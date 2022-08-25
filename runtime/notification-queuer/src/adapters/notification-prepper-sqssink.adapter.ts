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
import { DynamoDB, SQS } from 'aws-sdk';
import { DateTime } from 'luxon';
import { v4 } from 'uuid';
import {
  AlertNotification,
  LoggingServiceInterface,
  NotificationPrepperSinkAdapterInterface,
} from '../../../layers/base/src/interfaces';

export interface NotificationPrepperSQSSinkAdapterConfig {
  sqsAllFcm: string;
  sqsAllApns: string;
  sqsSelectedFcm: string;
  sqsSelectedApns: string;
  sqsClient: SQS;
  logger: LoggingServiceInterface;
  ddbClient: DynamoDB.DocumentClient;
  ddbTableAlertBatch: string;
}

export class NotificationPrepperSQSSinkAdapter
implements NotificationPrepperSinkAdapterInterface {
  readonly sqsAllFcm: string;
  readonly sqsAllApns: string;
  readonly sqsSelectedFcm: string;
  readonly sqsSelectedApns: string;
  readonly sqsClient: SQS;
  readonly logger: LoggingServiceInterface;
  readonly ddbClient: DynamoDB.DocumentClient;
  readonly ddbTableAlertBatch: string;

  constructor(config: NotificationPrepperSQSSinkAdapterConfig) {
    this.sqsAllApns = config.sqsAllApns;
    this.sqsAllFcm = config.sqsAllFcm;
    this.sqsSelectedApns = config.sqsSelectedApns;
    this.sqsSelectedFcm = config.sqsSelectedFcm;
    this.logger = config.logger;
    this.sqsClient = config.sqsClient;
    this.ddbClient = config.ddbClient;
    this.ddbTableAlertBatch = config.ddbTableAlertBatch;
  }

  async sinkBatch(
    alertNotification: AlertNotification,
    items: any[],
    flowControl: 'all' | 'selected',
  ): Promise<void> {
    if (flowControl === 'all') 
      await this.sinkAll(alertNotification, items);
    else 
      await this.sinkSelected(alertNotification, items);
    
  }

  private async sinkAll(
    alertNotification: AlertNotification,
    items: {
      bucket: string;
      key: string;
    }[],
  ): Promise<void> {
    this.logger.debug({
      message: 'Composing SQS messages...',
      data: {
        alertNotification,
        items,
      },
    });
    // Compose the batch of SQS messages
    const params: SQS.SendMessageBatchRequest = {
      Entries: [],
      QueueUrl:
        alertNotification.platform === 'apns'
          ? this.sqsAllApns
          : this.sqsAllFcm,
    };

    const batchIds: string[] = [];

    for (const item of items) {
      const batchId = v4();
      params.Entries.push({
        Id: batchId,
        MessageBody: JSON.stringify({
          batchId,
          notification: alertNotification,
          s3: {
            bucket: item.bucket,
            key: item.key,
          },
        }),
      });
      batchIds.push(batchId);
    }

    this.logger.debug({
      message: 'Sending messages to SQS',
      data: params,
    });

    const batchResult = await this.sqsClient.sendMessageBatch(params).promise();

    if (batchResult.Failed.length > 0) {
      this.logger.error({
        message: 'Failed to sink SQS messages',
        data: batchResult,
      });
    } else {
      this.logger.debug({
        message: 'Sinking messages to SQS succeeded.',
        data: batchResult,
      });

      await this.logBatches(alertNotification, batchIds);
    }
  }

  private async sinkSelected(
    alertNotification: AlertNotification,
    items: string[],
  ): Promise<void> {
    // Compose the batch of SQS messages
    const batchId = v4();
    const params: SQS.SendMessageRequest = {
      MessageBody: JSON.stringify({
        batchId,
        notification: alertNotification,
        tokens: items,
      }),
      QueueUrl:
        alertNotification.platform === 'apns'
          ? this.sqsSelectedApns
          : this.sqsSelectedFcm,
    };
    const sendResult = await this.sqsClient.sendMessage(params).promise();
    await this.logBatch(alertNotification, batchId);
    this.logger.debug({
      message: 'Sinking messages to SQS succeeded.',
      data: sendResult,
    });
  }

  private async logBatch(
    alertNotification: AlertNotification,
    batchId: string,
  ): Promise<void> {
    try {
      this.logger.debug({
        message: 'Writing protocol for enqueued batch...',
        data: {
          batchId,
          alertNotification,
        },
      });

      await this.ddbClient
        .update({
          TableName: this.ddbTableAlertBatch,
          Key: {
            alertId: `${alertNotification.id}:${alertNotification.platform}`,
            batchId,
          },
          ExpressionAttributeValues: {
            ':queued': DateTime.utc().toISO(),
          },
          UpdateExpression: 'SET queued = :queued',
        })
        .promise();

      this.logger.debug({
        message: 'Successfully written log protocol for enqueued batch.',
        data: {
          batchId,
          alertNotification,
        },
      });
    } catch (error) {
      this.logger.error({
        message: 'Failed to write log protocol for enqueued batch.',
        data: {
          batchId,
          alertNotification,
        },
        errorDetails: {
          ...error,
        },
      });
    }
  }

  private async logBatches(
    alertNotification: AlertNotification,
    batchIds: string[],
  ): Promise<void> {
    try {
      this.logger.debug({
        message: 'Writing protocol for enqueued batches...',
        data: {
          batchIds,
          alertNotification,
        },
      });
      const ddbBatchEntries: DynamoDB.DocumentClient.BatchWriteItemRequestMap =
        {
          [this.ddbTableAlertBatch]: [],
        };

      for (const batchId of batchIds) {
        ddbBatchEntries[this.ddbTableAlertBatch].push({
          PutRequest: {
            Item: {
              alertId: `${alertNotification.id}:${alertNotification.platform}`,
              batchId,
              queued: DateTime.utc().toISO(),
            },
          },
        });
      }

      await this.ddbClient
        .batchWrite({
          RequestItems: ddbBatchEntries,
        })
        .promise();

      this.logger.debug({
        message: 'Successfully written log protocol for enqueued batches.',
        data: {
          batchIds,
          alertNotification,
        },
      });
    } catch (error) {
      this.logger.error({
        message: 'Failed to write log protocol for enqueued batches.',
        data: {
          batchIds,
          alertNotification,
        },
        errorDetails: {
          ...error,
        },
      });
    }
  }
}
