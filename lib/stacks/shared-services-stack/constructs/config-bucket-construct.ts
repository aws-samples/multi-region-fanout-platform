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
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { Stack } from 'aws-cdk-lib';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import { S3BucketConstruct } from '../../../constructs/s3-bucket-construct';

export class ConfigBucketConstruct extends Construct {
  public readonly regionalConfigBucket: s3.IBucket;
  public readonly regionalConfigBucketCMK: kms.IKey;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stackRegion = Stack.of(this).region;
    const stackAccount = Stack.of(this).account;

    const regionConfigConstruct = new S3BucketConstruct(this, 'region-config', {
      bucketName: `${stackAccount}-dbconfig-${stackRegion}`,
      isCmkEncrypted: true,
      versioned: true,
    });

    // Deploy the content to S3
    new s3Deployment.BucketDeployment(this, 'config-bucket-deployment', {
      sources: [
        s3Deployment.Source.asset(`${__dirname}/../../../../config`),
      ],
      destinationBucket: regionConfigConstruct.bucket,
      destinationKeyPrefix: 'config',
    });

    this.regionalConfigBucket = regionConfigConstruct.bucket;
    this.regionalConfigBucketCMK = regionConfigConstruct.key!;
  }
}