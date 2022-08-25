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
import { ArnComponents, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { FanoutLambdaRoleNameConfig } from './types';
import { QueueType } from '../types';

export class FanoutRolesStack extends Stack {

  public readonly pushHandlerRoleAllAlerts: iam.Role;
  public readonly pushHandlerRoleSelectedAlerts: iam.Role;

  public static readonly fanoutLambdaRoleNameConfig: FanoutLambdaRoleNameConfig = {
    allAlerts: 'fanout-all-alerts',
    selectedAlerts: 'fanout-selected-alerts',
  };

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.pushHandlerRoleAllAlerts = new iam.Role(this, 'lambda-3a-role', {
      roleName: `${FanoutRolesStack.fanoutLambdaRoleNameConfig.allAlerts}-${this.region}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambda-3a-basic', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.pushHandlerRoleSelectedAlerts = new iam.Role(this, 'lambda-3b-role', {
      roleName: `${FanoutRolesStack.fanoutLambdaRoleNameConfig.selectedAlerts}-${this.region}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambda-3b-basic', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
  }

  public static getLambdaRoleArnComponents(region: string, account: string, queueType: QueueType) : ArnComponents {
    return {
      region: '',
      account,
      partition: 'aws',
      service: 'iam',
      resource: 'role',
      resourceName: `${FanoutRolesStack.fanoutLambdaRoleNameConfig[queueType]}-${region}`,
    };
  }
}