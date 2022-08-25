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
import {
  ListTokenAllResponse,
  LoggingServiceInterface,
  NotificationPrepperTokenAllAdapterInterface,
} from './../../../layers/base/src/interfaces';

export interface NotificationPrepperTokenAllS3AdapterConfig {
  s3Client: S3;
  s3BucketAllChunks: string;
  logger: LoggingServiceInterface;
}

export class NotificationPrepperTokenAllS3Adapter
implements NotificationPrepperTokenAllAdapterInterface {
  readonly s3Client: S3;
  readonly s3BucketAllChunks: string;
  readonly logger: LoggingServiceInterface;

  constructor(config: NotificationPrepperTokenAllS3AdapterConfig) {
    this.s3Client = config.s3Client;
    this.s3BucketAllChunks = config.s3BucketAllChunks;
    this.logger = config.logger;
  }

  async getTokens(
    provider: string,
    platform: string,
    severity: string,
    continuationToken?: string,
  ): Promise<ListTokenAllResponse> {
    const params: S3.ListObjectsV2Request = continuationToken ? {
      Bucket: this.s3BucketAllChunks,
      Prefix: `${provider}/${platform}/${severity}/`,
      StartAfter: `${provider}/${platform}/${severity}/`,
      ContinuationToken: continuationToken,
    } : {
      Bucket: this.s3BucketAllChunks,
      Prefix: `${provider}/${platform}/${severity}/`,
      StartAfter: `${provider}/${platform}/${severity}/`,
    };

    this.logger.debug({
      message: 'Retrieving cached tokens from S3...',
      data: params,
    });

    try {
      console.log(params);
      const listResponse = await this.s3Client.listObjectsV2(params).promise();

      console.log(listResponse);

      this.logger.debug({
        message: 'Retrieved cached tokens from S3.',
        data: listResponse.KeyCount,
      });

      return {
        platform,
        provider,
        severity,
        continuationToken: listResponse.NextContinuationToken,
        results: listResponse.Contents.map((c) => ({
          bucket: this.s3BucketAllChunks,
          key: c.Key,
        })),
      };
    } catch (error) {
      console.error(error);
      this.logger.error({
        message: 'Failed to retrieve cached tokens from S3.',
        errorDetails: error,
      });

      return {
        platform,
        provider,
        severity,
        continuationToken: undefined,
        results: [],
      };
    }


  }
}
