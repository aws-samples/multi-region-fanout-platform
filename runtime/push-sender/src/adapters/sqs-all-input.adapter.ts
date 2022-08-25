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
import { SQSRecord } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import {
  AlertNotification,
  LoggingServiceInterface,
  PushsenderServiceInterface,
} from './../../../layers/base/src/interfaces';

export interface SqsAllInputAdapterConfig {
  s3Client: S3;
  logger: LoggingServiceInterface;
  useCaseService: PushsenderServiceInterface;
}

export class SqsAllInputAdapter {

  readonly s3Client: S3;
  readonly logger: LoggingServiceInterface;
  readonly useCaseService: PushsenderServiceInterface;

  constructor(config: SqsAllInputAdapterConfig) {
    this.s3Client = config.s3Client;
    this.logger = config.logger;
    this.useCaseService = config.useCaseService;
  }

  async handleSqsRecord(record: SQSRecord): Promise<boolean> {

    try {
      this.logger.debug({
        message: 'Handling SQS record...',
        data: record,
      });

      const msgPayload = JSON.parse(record.body) as {
        batchId: string;
        notification: AlertNotification;
        s3: {
          bucket: string;
          key: string;
        }
      };

      this.logger.debug({
        message: 'Parsed message payload.',
        data: msgPayload,
      });

      const s3GetParams: S3.GetObjectRequest = {
        Bucket: msgPayload.s3.bucket,
        Key: msgPayload.s3.key,
      };
      this.logger.debug({
        message: 'Retrieving object from S3...',
        data: s3GetParams,
      });

      const s3GetResponse = await this.s3Client.getObject(s3GetParams).promise();

      this.logger.debug({
        message: 'Retrieved object from S3.',
        data: {
          ContentLength: s3GetResponse.ContentLength,
          ContentType: s3GetResponse.ContentType,
        },
      });

      const tokens = JSON.parse(s3GetResponse.Body.toString()) as string[];

      this.logger.debug({
        message: 'Parsed tokens from S3 object.',
        data: {
          count: tokens.length,
        },
      });

      const success = await this.useCaseService.sendPushNotification({
        batchId: msgPayload.batchId,
        notification: msgPayload.notification,
        tokens,
      });

      return success;

    } catch (error) {
      this.logger.error({
        message: 'Failed to handle SQS record.',
        errorDetails: error,
      });

      return false;
    }
  }
}
