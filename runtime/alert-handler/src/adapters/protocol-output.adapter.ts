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
import {
  AlertNotification,
  AlertNotificationAdapter,
  AlertNotificationAdapterResult,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';

export interface ProtocolOutputAdapterConfig {
  ddbTableProtocolHigh: string;
  ddbTableProtocolRegular: string;
  sqsDdbFailureHigh: string;
  sqsDdbFailureRegular: string;
  ddbClientHigh: DynamoDB.DocumentClient;
  ddbClientRegular: DynamoDB.DocumentClient;
  sqsClientHigh: SQS;
  sqsClientRegular: SQS;
  logger: LoggingServiceInterface;
  regionId: string;
}

export class ProtocolOutputAdapter implements AlertNotificationAdapter {

  readonly ddbTableProtocolHigh: string;
  readonly ddbTableProtocolRegular: string;
  readonly sqsDdbFailureHigh: string;
  readonly sqsDdbFailureRegular: string;
  readonly ddbClientHigh: DynamoDB.DocumentClient;
  readonly ddbClientRegular: DynamoDB.DocumentClient;
  readonly sqsClientHigh: SQS;
  readonly sqsClientRegular: SQS;
  readonly logger: LoggingServiceInterface;
  readonly regionId: string;

  constructor(config: ProtocolOutputAdapterConfig) {
    this.ddbClientHigh = config.ddbClientHigh;
    this.ddbClientRegular = config.ddbClientRegular;
    this.ddbTableProtocolHigh = config.ddbTableProtocolHigh;
    this.ddbTableProtocolRegular = config.ddbTableProtocolRegular;
    this.logger = config.logger;
    this.regionId = config.regionId;
    this.sqsClientHigh = config.sqsClientHigh;
    this.sqsClientRegular = config.sqsClientRegular;
    this.sqsDdbFailureHigh = config.sqsDdbFailureHigh;
    this.sqsDdbFailureRegular = config.sqsDdbFailureRegular;
  }

  async handleNotification(priority: 'high' | 'regular', notification: AlertNotification, previousResult?: AlertNotificationAdapterResult): Promise<AlertNotificationAdapterResult> {
    const nextResult: AlertNotificationAdapterResult = {
      results: [],
    };

    for await (const result of previousResult.results) {
      if (result.success) {
        await this.sinkProtocolEntrySuccess(priority, result.flowChannel, notification);
        nextResult.results.push({
          flowChannel: result.flowChannel,
          platform: result.platform,
          success: result.success,
        });
      }
    }

    return nextResult;
  }

  private async sinkProtocolEntrySuccess(priority: 'high' | 'regular', flowChannel: 'all' | 'selected', notification: AlertNotification): Promise<void> {
    const updateParams: DynamoDB.DocumentClient.UpdateItemInput = {
      Key: {
        alertId: notification.id,
        platform: `${notification.platform}_${flowChannel}`,
      },
      TableName: priority === 'high' ? this.ddbTableProtocolHigh : this.ddbTableProtocolRegular,
      ExpressionAttributeValues: {
        ':provider': notification.provider,
        ':hash': notification.hash,
        ':hashJson': notification.hashJson,
        ':severity': notification.severity,
        ':platform': notification.platform,
        ':created': notification.received,
        ':s3Bucket': notification.s3Bucket,
        ':s3Key': notification.s3Key,
      },
      UpdateExpression: `SET provider = :provider, r${this.regionId}Hash = :hash, r${this.regionId}HashJson = :hashJson, r${this.regionId}Severity = :severity, r${this.regionId}Platform = :platform, r${this.regionId}Created = :created, r${this.regionId}Bucket = :s3Bucket, r${this.regionId}Key = :s3Key`,
    };

    try {
      if (priority === 'high') 
        await this.ddbClientHigh.update(updateParams).promise();
      else 
        await this.ddbClientRegular.update(updateParams).promise();
      
    } catch (error) {
      this.logger.error({
        message: 'Sinking protocol entry to DynamoDB failed, falling back to SQS.',
        errorDetails: {
          ...error,
        },
      });

      if (priority === 'high') {
        await this.sqsClientHigh.sendMessage({
          MessageBody: this.createMessagePayloadDdbFailure(flowChannel, notification),
          QueueUrl: this.sqsDdbFailureHigh,
        }).promise();
      } else {
        await this.sqsClientRegular.sendMessage({
          MessageBody: this.createMessagePayloadDdbFailure(flowChannel, notification),
          QueueUrl: this.sqsDdbFailureRegular,
        }).promise();
      }
    }
  }

  private createMessagePayloadDdbFailure(flowChannel: 'all' | 'selected', notification: AlertNotification) {
    return JSON.stringify({
      flowChannel,
      notification,
    });
  }

}
