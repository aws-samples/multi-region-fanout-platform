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
import { ArnComponents, Duration, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { ILayerVersion } from 'aws-cdk-lib/aws-lambda';
import { SqsQueueConstruct } from '../../../constructs/sqs-queue-construct';
import { FlowControl } from '../../processing-stack/constructs/types';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { FanoutRolesStack } from '../fanout-roles-stack';
import { LambdaLogLevel } from '../../../../types/app-configuration';
import { LambdaConstruct } from '../../../constructs/lambda-construct';

interface Props {
  queueProps: {
    queueName: string,
    messageProducerArn: string,
  },
  lambdaFunctionProps: {
    reservedConcurrentExecutions: number,
    timeout: Duration,
    layers: ILayerVersion[],
  },
  eventSourceMappingProps: {
    batchSize: number,
    maxBatchingWindow: Duration
  },
  ddbPushTableName: string,
  flowControl: FlowControl,
  lambdaRoleName: string,
  s3BucketNameAllAlertsCache: string,
  sharedServiceAccountId: string,
  processingAccountId: string,
  queueArnBatchProtocol: ArnComponents,
}

export class MessageFanoutConstruct extends Construct {

  public readonly fanoutLambda: lambda.Function;
  public readonly lambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const lambdaTimeout = Duration.minutes(2);
    const lambdaMemory = 512;

    const fanoutQueue = new SqsQueueConstruct(this, 'all-alerts', {
      keyProps: {
        alias: `${props.queueProps.queueName}-cmk`,
        description: `CMK for SQS queue for ${props.queueProps.queueName}`,
      },
      queueProps: {
        queueName:  `${props.queueProps.queueName}`,
        visibilityTimeout: Duration.minutes(6 * lambdaTimeout.toMinutes()),
        retentionPeriod: Duration.days(7),
      },
    });
    fanoutQueue.addProducer(props.queueProps.messageProducerArn);

    const queueType = props.flowControl === FlowControl.ALL ? 'allAlerts' : 'selectedAlerts';

    this.lambdaRole = iam.Role.fromRoleArn(this, 'lambda-role',
      Stack.of(this).formatArn(FanoutRolesStack.getLambdaRoleArnComponents(Stack.of(this).region, Stack.of(this).account, queueType)),
      { mutable: true },
    ) as iam.Role;
    this.lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:List*',
        's3:GetBucket*',
      ],
      resources: [
        `arn:aws:s3:::${props.s3BucketNameAllAlertsCache}`,
        `arn:aws:s3:::${props.s3BucketNameAllAlertsCache}/*`,
      ],
    }));
    this.lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
        'kms:GenerateDataKey',
      ],
      resources: [
        `arn:aws:kms:${Stack.of(this).region}:${props.sharedServiceAccountId}:key/*`,
        `arn:aws:kms:${Stack.of(this).region}:${props.processingAccountId}:key/*`,
      ],
    }));
    this.lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sqs:getQueueUrl',
        'sqs:sendMessage',
      ],
      resources: [ Stack.of(this).formatArn(props.queueArnBatchProtocol) ],
    }));

    const lambdaConstruct = new LambdaConstruct(this, 'lambda-fanout', {
      entry: 'push-sender',
      handler: 'handler.handler',
      description: 'Pushes notifications to service provider',
      functionName: `push-notifications-${props.flowControl}`,
      environment: {
        LOG_LEVEL: LambdaLogLevel,
        APP_FLOWCONTROL: props.flowControl,
        SQS_QUEUEURL_BATCHPROTOCOL: SqsQueueConstruct.getQueueUrlFromArn(props.queueArnBatchProtocol),
      },
      layers: props.lambdaFunctionProps.layers,
      memorySize: lambdaMemory,
      timeout: lambdaTimeout,
      reservedConcurrentExecutions: props.lambdaFunctionProps.reservedConcurrentExecutions,
      role: this.lambdaRole,
    });

    this.fanoutLambda = lambdaConstruct.lambdaFunction;

    this.fanoutLambda.addEventSource(new SqsEventSource(fanoutQueue.queue, {
      batchSize: 5,
      maxBatchingWindow: Duration.seconds(10),
      reportBatchItemFailures: true,
      enabled: true,
    }));
  }
}