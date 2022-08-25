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
import {Construct} from 'constructs';
import {BlockPublicAccess, Bucket, BucketEncryption, BucketProps, ObjectOwnership} from 'aws-cdk-lib/aws-s3';
import {Key} from 'aws-cdk-lib/aws-kms';
import {Duration, RemovalPolicy} from 'aws-cdk-lib';

interface Props extends BucketProps {
  isCmkEncrypted?: boolean,
}

export class S3BucketConstruct extends Construct {
  public readonly bucket: Bucket;
  public readonly serverAccessLogsBucket: Bucket;
  public readonly key?: Key;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    if (props.isCmkEncrypted) {
      this.key = new Key(this, 'bucket-cmk', {
        description: `CMK for ${props.bucketName}`,
        enableKeyRotation: true,
        enabled: true,
        removalPolicy: RemovalPolicy.RETAIN,
      });
      props = {
        ...props,
        encryption: BucketEncryption.KMS,
        encryptionKey: this.key,
      };
    }

    props = {
      ...props,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    };

    this.serverAccessLogsBucket = new Bucket(this, 'server-access-log-bucket', {
      ...props,
      bucketName: `${props.bucketName}-logs`,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(1),
          enabled: true,
          expiration: Duration.days(90),
          id: 'sal-auto-cleanup',
        },
      ],
      versioned: true,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
    });

    this.bucket = new Bucket(this, 'bucket', {
      ...props,
      serverAccessLogsBucket: this.serverAccessLogsBucket,
    });
  }
}
