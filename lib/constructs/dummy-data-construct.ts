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
import { CustomResource, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';


export interface DummyDataProps {
  bucket: s3.IBucket,
  chunks: number,
  chunkSize: number,
  tokenLength: number,
  provider: string,
  platform: string,
  severity: string
}

export class DummyData extends Construct {
  constructor(scope: Construct, id: string, props: DummyDataProps) {
    super(scope, id);

    const fn = new lambda.Function(this, 'DummyDataFunction', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      memorySize: 3008,
      timeout: Duration.seconds(800),
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'runtime', 'cfncr-dummy-data')),
    });

    props.bucket.grantReadWrite(fn);

    new CustomResource(this, 'DummyDataCustomResource', {
      serviceToken: fn.functionArn,
      properties: {
        bucketName: props.bucket.bucketName,
        chunks: props.chunks,
        chunkSize: props.chunkSize,
        tokenLength: props.tokenLength,
        provider: props.provider,
        platform: props.platform,
        severity: props.severity,
      },
    });
  }
}