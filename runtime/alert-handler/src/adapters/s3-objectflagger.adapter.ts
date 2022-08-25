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
import { S3 } from 'aws-sdk';
import { AlertNotification, AlertObjectFlaggerAdapter, LoggingServiceInterface } from './../../../layers/base/src/interfaces';

export interface S3ObjectFlaggerAdapterConfig {
  s3Client: S3;
  s3TagProcessed: string;
  logger: LoggingServiceInterface;
}

export class S3ObjectFlaggerAdapter implements AlertObjectFlaggerAdapter {

  readonly s3Client: S3;
  readonly s3TagProcessed: string;
  readonly logger: LoggingServiceInterface;

  constructor(config: S3ObjectFlaggerAdapterConfig) {
    this.s3Client = config.s3Client;
    this.s3TagProcessed = config.s3TagProcessed;
    this.logger = config.logger;
  }

  async flagObject(alertNotification: AlertNotification): Promise<void> {

    this.logger.debug({
      message: 'Flagging object in S3...',
    });

    const getTaggingResponse = await this.s3Client.getObjectTagging({
      Bucket: alertNotification.s3Bucket,
      Key: alertNotification.s3Key,
    }).promise();

    this.logger.debug({
      message: 'Received object tags from S3...',
      data: getTaggingResponse,
    });

    const tagsetUpdated = getTaggingResponse.TagSet.map(t => {
      if (t.Key === this.s3TagProcessed) {
        return {
          Key: t.Key,
          Value: 'true',
        };
      }

      return t;
    });

    this.logger.debug({
      message: 'Updated tag set.',
      data: getTaggingResponse,
    });

    const putTaggingResponse = await this.s3Client.putObjectTagging({
      Bucket: alertNotification.s3Bucket,
      Key: alertNotification.s3Key,
      Tagging: {
        TagSet: tagsetUpdated,
      },
    }).promise();

    this.logger.debug({
      message: 'Updated tags of S3 object.',
      data: putTaggingResponse,
    });
  }

}
