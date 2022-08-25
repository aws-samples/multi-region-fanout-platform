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
import { ArnComponents, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

interface Props {
  keyProps: {
    alias: string,
    description: string,
  },
  queueProps: {
    queueName: string,
    description?: string,
    visibilityTimeout: Duration,
    retentionPeriod?: Duration,
    fifo?: boolean
  }
}

export class SqsQueueConstruct extends Construct {
  public readonly queue: sqs.Queue;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const queueName = props.queueProps.queueName;

    const cmk = new kms.Key(this, 'sqs-queue-cmk', {
      ...props.keyProps,
      enableKeyRotation: true,
      enabled: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const dlQueue = new sqs.Queue(this, 'dl-queue', {
      queueName: props.queueProps.fifo ? `${queueName}-dead-letter.fifo` : `${queueName}-dead-letter`,
      retentionPeriod: props.queueProps.retentionPeriod ?? Duration.days(14),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: cmk,
      fifo: props.queueProps.fifo,
    });
    dlQueue.addToResourcePolicy(new iam.PolicyStatement({
      resources: [dlQueue.queueArn],
      actions: ['sqs:*'],
      principals: [new iam.AnyPrincipal()],
      effect: iam.Effect.DENY,
      conditions:
        {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
    }));

    this.queue = new sqs.Queue(this, 'queue', {
      ...props.queueProps,
      queueName: props.queueProps.fifo ? `${queueName}.fifo` : queueName,
      retentionPeriod: props.queueProps.retentionPeriod ?? Duration.days(14),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: cmk,
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: dlQueue,
      },
      visibilityTimeout: props.queueProps.visibilityTimeout,
    });

    this.queue.addToResourcePolicy(new iam.PolicyStatement({
      resources: [this.queue.queueArn],
      actions: ['sqs:*'],
      principals: [new iam.AnyPrincipal()],
      effect: iam.Effect.DENY,
      conditions: 
        {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
    }));
  }

  public addProducer(producerArn: string) {
    this.queue.grantSendMessages(new iam.ArnPrincipal(producerArn));
  }

  public static getQueueUrlFromArn(arnComponents: ArnComponents): string {
    return `https://sqs.${arnComponents.region!}.amazonaws.com/${arnComponents.account!}/${arnComponents.resource!}`;
  }

  public static getQueueUrlFromName(name: string, region: string, accountId: string) {
    return `https://sqs.${region}.amazonaws.com/${accountId}/${name}`;
  }

  public static getQueueArnFromName(name: string, region: string, accountId: string) {
    return {
      region: region,
      account: accountId,
      partition: 'aws',
      service: 'sqs',
      resource: name,
    };
  }
}