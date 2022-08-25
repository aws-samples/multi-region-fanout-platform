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
import * as cfDistribution from 'aws-cdk-lib/aws-cloudfront';
import { SecurityPolicyProtocol, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import * as cfOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import { S3OriginProps } from '../../types';
import { Tags } from 'aws-cdk-lib';
import { S3BucketConstruct } from '../../../constructs/s3-bucket-construct';

export class CloudfrontConstructProps {
  s3Origins: S3OriginProps;
  bucketNameCloudfrontAccessLogs: string;
}

export class CloudfrontConstruct extends Construct {
  public readonly cloudfrontDistribution: cfDistribution.IDistribution;
  public readonly oai: cfDistribution.OriginAccessIdentity;

  constructor(scope: Construct, id: string, props: CloudfrontConstructProps) {
    super(scope, id);

    const bucketFromPrimaryRegion = s3.Bucket.fromBucketAttributes(this, 'failover-bucket-primary-region', {
      bucketName: props.s3Origins.primary.bucketName,
      bucketRegionalDomainName: `${props.s3Origins.primary.bucketName}.s3.${props.s3Origins.primary.bucketRegion}.amazonaws.com`,
    });

    const bucketFromSecondaryRegion = s3.Bucket.fromBucketAttributes(this, 'failover-bucket-secondary-region', {
      bucketName: props.s3Origins.secondary.bucketName,
      bucketRegionalDomainName: `${props.s3Origins.secondary.bucketName}.s3.${props.s3Origins.secondary.bucketRegion}.amazonaws.com`,
    });

    this.oai = new cfDistribution.OriginAccessIdentity(this, 'oai');

    const cloudFrontLogs = new S3BucketConstruct(this, 'cloudfront-log-bucket', {
      bucketName: props.bucketNameCloudfrontAccessLogs,
      isCmkEncrypted: true,
    });

    this.cloudfrontDistribution = new cfDistribution.Distribution(this, 'cloudfront-distribution', {
      comment: `cloudfront-distribution-${props.s3Origins.primary.bucketName}`,
      defaultBehavior: {
        allowedMethods: cfDistribution.AllowedMethods.ALLOW_GET_HEAD,
        origin: new cfOrigins.OriginGroup({
          fallbackStatusCodes: [404, 500, 502, 503, 504],
          primaryOrigin: new cfOrigins.S3Origin(bucketFromPrimaryRegion, {
            originAccessIdentity: this.oai,
          }),
          fallbackOrigin: new cfOrigins.S3Origin(bucketFromSecondaryRegion, {
            originAccessIdentity: this.oai,
          }),
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      enableLogging: true,
      logBucket: cloudFrontLogs.bucket,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    Tags.of(this.cloudfrontDistribution).add('Region', props.s3Origins.primary.bucketRegion);
  }
}