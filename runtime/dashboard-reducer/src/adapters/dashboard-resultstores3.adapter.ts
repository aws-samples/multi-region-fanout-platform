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
  DashboardReducerResult,
  DashboardReducerResultStoreAdapter,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';

export interface DashboardReducerResultStoreS3AdapterConfig {
  s3Client: S3;
  logger: LoggingServiceInterface;
  s3Bucket: string;
  s3Prefix: string;
}

export class DashboardReducerResultStoreS3Adapter implements DashboardReducerResultStoreAdapter {

  readonly s3Client: S3;
  readonly logger: LoggingServiceInterface;
  readonly s3Bucket: string;
  readonly s3Prefix: string;

  constructor(config: DashboardReducerResultStoreS3AdapterConfig) {
    this.s3Client = config.s3Client;
    this.logger = config.logger;
    this.s3Bucket = config.s3Bucket;
    this.s3Prefix = config.s3Prefix;
  }

  async storeReducedResults(regionKey: string, results: DashboardReducerResult[]): Promise<boolean> {
    try {
      this.logger.debug({
        message: 'Writing file to S3.',
        data: results,
      });

      const s3PutResult = await this.s3Client.putObject({
        Bucket: this.s3Bucket,
        Key: `${this.s3Prefix}${regionKey}.json`,
        Body: JSON.stringify(results),
        ContentType: 'application/json',
      }).promise();

      this.logger.debug({
        message: 'Written file to S3.',
        data: s3PutResult,
      });

      return true;
    } catch (error) {
      this.logger.error({
        message: 'Failed to write file to S3.',
        errorDetails: error,
      });

      return false;
    }
  }

}
