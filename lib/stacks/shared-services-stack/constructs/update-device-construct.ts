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
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { IParameter } from 'aws-cdk-lib/aws-ssm';
import { SqsQueueConstruct } from '../../../constructs/sqs-queue-construct';
import { DatabaseSecret } from 'aws-cdk-lib/aws-rds';
import { LambdaLogLevel } from '../../../../types/app-configuration';
import { LambdaConstruct } from '../../../constructs/lambda-construct';

export interface UpdateDeviceConstructProps {
  region: string,
  databaseName: string,
  databasePort: number,
  databaseSecret: DatabaseSecret,
  databasePrimaryHost: IParameter,
  databaseAppUser: string,
  vpc: ec2.IVpc,
  securityGroups: ec2.ISecurityGroup[],
  cmkRds: kms.IKey,
  layerPg: lambda.LayerVersion,
  layerBase: lambda.LayerVersion
}

export class UpdateDeviceConstruct extends Construct {
  constructor(scope: Construct, id: string, props: UpdateDeviceConstructProps) {
    super(scope, id);

    const lambdaFunctionTimeout = Duration.minutes(10);

    // update device queue
    const updateDeviceQueue = new SqsQueueConstruct(this, 'update-device-queue', {
      keyProps: {
        alias: `update-device-queue-cmk-${props.region}`,
        description: 'CMK for SQS queue used to update device in postgres db',
      },
      queueProps: {
        queueName: `update-device-queue-${props.region}`,
        visibilityTimeout: Duration.seconds(6 * lambdaFunctionTimeout.toSeconds()),
      },
    });

    // update device lambda function
    const updateDeviceFunction = new LambdaConstruct(this, 'lambdaDeviceUpdates', {
      entry: 'device-updates',
      handler: 'handler.handler',
      description: 'Process device updates from the queue.',
      functionName: 'device-updates',
      environment: {
        LOG_LEVEL: LambdaLogLevel,
        SECMGR_SECRETID_RDSCREDENTIALS: props.databaseSecret.secretName,
        APP_QUERY_DELETE: 'DELETE FROM mrfp_ops.devices WHERE deviceid = $1;',
        APP_QUERY_REGISTER: 'INSERT INTO mrfp_ops.devices VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);',
      },
      layers: [ props.layerBase, props.layerPg ],
      memorySize: 2048,
      timeout: Duration.minutes(5),
      vpc: props.vpc,
      securityGroups: props.securityGroups,
      vpcSubnets: {
        subnets: props.vpc.privateSubnets,
      },
    });
    props.databaseSecret.grantRead(updateDeviceFunction.lambdaFunction);

    // allow lambda function to decrypt database cmk key
    props.cmkRds.grantDecrypt(updateDeviceFunction.lambdaFunction);

    // allow lambda function to decrypt messages from the queue using queue cmk
    updateDeviceQueue.queue.encryptionMasterKey!.grantDecrypt(updateDeviceFunction.lambdaFunction);

    // add the sqs queue as event source for the lambda function
    updateDeviceFunction.lambdaFunction.addEventSource(new lambdaEventSources.SqsEventSource(updateDeviceQueue.queue, {
      batchSize: 10,
      maxBatchingWindow: Duration.seconds(3),
      reportBatchItemFailures: true,
      enabled: true,
    }));

    // allow lambda function to read from queue
    updateDeviceQueue.queue.grantConsumeMessages(updateDeviceFunction.lambdaFunction);
  }
}