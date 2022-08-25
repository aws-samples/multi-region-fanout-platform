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
import { AlertNotification, LoggingServiceInterface, PushsenderQueueProtocolAdapter } from '../../../layers/base/src/interfaces';

export interface SqsPushSenderProtocolAdapterConfig {
  sqsClient: SQS;
  queueUrl: string;
  logger: LoggingServiceInterface;
}

export class SqsPushSenderProtocolAdapter implements PushsenderQueueProtocolAdapter {

  readonly sqsClient: SQS;
  readonly queueUrl: string;
  readonly logger: LoggingServiceInterface;

  constructor(config: SqsPushSenderProtocolAdapterConfig) {
    this.sqsClient = config.sqsClient;
    this.queueUrl = config.queueUrl;
    this.logger = config.logger;
  }

  async logBatchCompleted(batchId: string, notification: AlertNotification): Promise<void> {
    try {
      this.logger.debug({
        message: 'Logging batch completion to SQS...',
        data: {
          batchId,
          notification,
        },
      });

      const sqsSendResponse = await this.sqsClient.sendMessage({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({
          batchId,
          notification,
        }),
      }).promise();
     

      this.logger.debug({
        message: 'Logged batch completion to SQS.',
        data: sqsSendResponse,
      });
    } catch (error) {
      this.logger.debug({
        message: 'Failed to log batch completion to SQS.',
        errorDetails: error,
      });
    }

  }

}
