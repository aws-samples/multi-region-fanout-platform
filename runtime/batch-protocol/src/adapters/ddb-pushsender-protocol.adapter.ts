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
import { DynamoDB } from 'aws-sdk';
import { DateTime } from 'luxon';
import { AlertNotification, LoggingServiceInterface, PushsenderProtocolAdapter } from './../../../layers/base/src/interfaces';

export interface DynamoDBPushSenderProtocolAdapterConfig {
  ddbClient: DynamoDB.DocumentClient;
  ddbTableBatches: string;
  logger: LoggingServiceInterface;
}

export class DynamoDBPushSenderProtocolAdapter implements PushsenderProtocolAdapter {

  readonly ddbClient: DynamoDB.DocumentClient;
  readonly ddbTableBatches: string;
  readonly logger: LoggingServiceInterface;

  constructor(config: DynamoDBPushSenderProtocolAdapterConfig) {
    this.ddbClient = config.ddbClient;
    this.ddbTableBatches = config.ddbTableBatches;
    this.logger = config.logger;
  }

  async logBatchCompleted(batchId: string, notification: AlertNotification): Promise<boolean> {
    try {
      this.logger.debug({
        message: 'Logging batch completion to DynamoDB...',
        data: {
          batchId,
          notification,
        },
      });
      const stopTime = DateTime.utc();
      const alertElapsed = DateTime.fromISO(notification.received).diffNow('seconds');
      const ddbUpdateResponse = await this.ddbClient.update({
        Key: {
          alertId: `${notification.id}:${notification.platform}`,
          batchId: batchId,
        },
        ExpressionAttributeValues: {
          ':a': notification.received,
          ':b': stopTime.toISO(),
          ':c': Math.abs(alertElapsed.seconds),
        },
        TableName: this.ddbTableBatches,
        UpdateExpression: 'set alertCreated = :a, completed = :b, elapsedTime = :c',
      }).promise();

      this.logger.debug({
        message: 'Logged batch completion to DynamoDB.',
        data: ddbUpdateResponse,
      });

      return true;
    } catch (error) {
      this.logger.debug({
        message: 'Failed to log batch completion to DynamoDB.',
        errorDetails: error,
      });
      return false;
    }

  }

}
