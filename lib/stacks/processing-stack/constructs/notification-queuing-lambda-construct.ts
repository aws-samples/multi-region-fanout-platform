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
import { Construct } from 'constructs';
import { FlowControl } from './types';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { ILayerVersion } from 'aws-cdk-lib/aws-lambda';
import { ISecurityGroup, ISubnet, IVpc } from 'aws-cdk-lib/aws-ec2';
import { ArnComponents, Duration, Stack } from 'aws-cdk-lib';
import { SqsQueueConstruct } from '../../../constructs/sqs-queue-construct';
import { LambdaLogLevel } from '../../../../types/app-configuration';
import { LambdaConstruct } from '../../../constructs/lambda-construct';

export interface NotificationQueuingLambdaConstructProps {
  functionName: string;
  lambdaRole: iam.Role;
  flowControl: FlowControl;
  layers: ILayerVersion[];
  ddbAlertsTable: dynamodb.ITable;
  ddbPushTable: dynamodb.ITable;
  secretNameRdsCredentials: string;
  sharedServicesCrossAccountRole: string;
  fanoutQueuePnp2AllArn: ArnComponents;
  fanoutQueuePnp1AllArn: ArnComponents;
  fanoutQueuePnp2SelectedArn: ArnComponents;
  fanoutQueuePnp1SelectedArn: ArnComponents;
  s3BucketNameAllAlertsCache: string;
  fanoutPnp1AccountId: string;
  fanoutPnp2AccountId: string;
  sharedServiceAccountId: string;
  vpc?: IVpc;
  subnets?: ISubnet[],
  securityGroups?: ISecurityGroup[],
  appDatabaseName: string;
}

export class NotificationQueuingLambdaConstruct extends Construct {

  public readonly lambdaFunction: lambda.Function;
  public readonly lambdaRole: iam.Role;

  constructor(scope: Construct, id: string, props: NotificationQueuingLambdaConstructProps) {
    super(scope, id);

    const sqsQueueArns: string[] = [];
    if (props.flowControl === FlowControl.ALL) {
      sqsQueueArns.push(Stack.of(this).formatArn(props.fanoutQueuePnp1AllArn));
      sqsQueueArns.push(Stack.of(this).formatArn(props.fanoutQueuePnp2AllArn));
    } else if (props.flowControl === FlowControl.SELECTED) {
      sqsQueueArns.push(Stack.of(this).formatArn(props.fanoutQueuePnp1SelectedArn));
      sqsQueueArns.push(Stack.of(this).formatArn(props.fanoutQueuePnp2SelectedArn));
    }


    props.lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sqs:getQueueUrl',
        'sqs:sendMessage',
      ],
      resources: sqsQueueArns,
    }));
    props.lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sts:AssumeRole',
      ],
      resources: [props.sharedServicesCrossAccountRole],
    }));
    props.lambdaRole.addToPolicy(new iam.PolicyStatement({
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
    props.lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
        'kms:GenerateDataKey',
      ],
      resources: [
        `arn:aws:kms:${Stack.of(this).region}:${props.fanoutPnp1AccountId}:key/*`,
        `arn:aws:kms:${Stack.of(this).region}:${props.fanoutPnp2AccountId}:key/*`,
        `arn:aws:kms:${Stack.of(this).region}:${props.sharedServiceAccountId}:key/*`,
      ],
    }));
    props.ddbAlertsTable.grantReadWriteData(props.lambdaRole);
    props.ddbPushTable.grantReadWriteData(props.lambdaRole);

    const lambdaConstruct = new LambdaConstruct(this, 'lambda-notification-queuer-selected', {
      entry: 'notification-queuer',
      handler: 'handler.handler',
      description: 'Triggered async and sinks notifications to SQS',
      functionName: props.functionName,
      role: props.lambdaRole,
      environment: {
        LOG_LEVEL: LambdaLogLevel,
        DDB_TABLE_ALERTS: props.ddbAlertsTable.tableName,
        DDB_TABLE_ALERTBATCHES: props.ddbPushTable.tableName,
        SECMGR_SECRETID_RDSCREDENTIALS: props.secretNameRdsCredentials,
        STS_ROLEARN_SECRETSMANAGER: props.sharedServicesCrossAccountRole,
        SQS_QUEUEURL_ALLFCM: SqsQueueConstruct.getQueueUrlFromArn(props.fanoutQueuePnp2AllArn),
        SQS_QUEUEURL_ALLAPNS: SqsQueueConstruct.getQueueUrlFromArn(props.fanoutQueuePnp1AllArn),
        SQS_QUEUEURL_SELECTEDFCM: SqsQueueConstruct.getQueueUrlFromArn(props.fanoutQueuePnp2SelectedArn),
        SQS_QUEUEURL_SELECTEDAPNS: SqsQueueConstruct.getQueueUrlFromArn(props.fanoutQueuePnp1SelectedArn),
        S3_BUCKET_ALLCHUNKS: props.s3BucketNameAllAlertsCache,
        APP_FLOWCONTROL: props.flowControl,
        RDS_DATABASE: props.appDatabaseName,
      },
      layers: props.layers,
      memorySize: 2048,
      timeout: Duration.minutes(15),
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.subnets,
      },
      securityGroups: props.securityGroups,
    });

    this.lambdaFunction = lambdaConstruct.lambdaFunction;
  }
}