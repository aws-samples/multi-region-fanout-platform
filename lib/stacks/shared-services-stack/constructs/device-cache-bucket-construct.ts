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
import { Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { S3BucketConstruct } from '../../../constructs/s3-bucket-construct';

export class DeviceCacheBucketConstruct extends Construct {
  private static readonly bucketNameBase: string = 'all-alerts-bucket';
  public readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const bucketName = `${Stack.of(this).account}-${DeviceCacheBucketConstruct.bucketNameBase}-${Stack.of(this).region}`;
    const deviceCacheBucket = new S3BucketConstruct(this, 'device-cache-bucket', {
      bucketName: bucketName,
      isCmkEncrypted: true,
    });

    this.bucket = deviceCacheBucket.bucket;
  }

  public static getBucketName(account: string, region: string) {
    return `${account}-${this.bucketNameBase}-${region}`;
  }
}