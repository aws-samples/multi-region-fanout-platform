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
import { Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as path from 'path';

interface Props {
  entry: string,
  handler: string,
  functionName: string,
  description?: string,
  role?: iam.IRole,
  initialPolicy?: iam.PolicyStatement[],
  memorySize?: number,
  timeout?: Duration,
  environment?: { [key: string]: string },
  reservedConcurrentExecutions?: number,
  layers?: lambda.ILayerVersion[],
  vpc?: ec2.IVpc,
  vpcSubnets?: ec2.SubnetSelection,
  securityGroups?: ec2.ISecurityGroup[]
}

export class LambdaConstruct extends Construct {
  public readonly lambdaFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    this.lambdaFunction = new lambda.Function(this, 'lambda-function', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '..', '..', 'runtime', props.entry, 'dist', props.entry, 'src'),
      ),
      handler: props.handler,
      functionName: props.functionName,
      timeout: props.timeout ?? Duration.seconds(3),
      memorySize: props.memorySize ?? 256,
      reservedConcurrentExecutions: props.reservedConcurrentExecutions,
      runtime: lambda.Runtime.NODEJS_14_X,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      role: props.role,
      environment: props.environment,
      initialPolicy: props.initialPolicy,
      description: props.description,
      layers: props.layers,
      vpc: props.vpc,
      securityGroups: props.securityGroups,
      vpcSubnets: props.vpcSubnets,
    });
  }
}