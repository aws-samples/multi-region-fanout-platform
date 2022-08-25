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
import { LambdaType, WebsiteLambdaNameConfig } from './types';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class WebsiteRolesStack extends Stack {

  public readonly alertHandlerRole: iam.Role;
  public readonly dashboardWriterRole: iam.Role;
  public readonly dashboardReducerRole: iam.Role;

  public static websiteLambdaNameConfig: WebsiteLambdaNameConfig = {
    alertHandler: 'website-lambda',
    dashboardWriter: 'dashboard-writer',
    dashboardReducer: 'dashboard-reducer',
  };

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.alertHandlerRole = new iam.Role(this, 'lambda-1-role', {
      roleName: `${WebsiteRolesStack.websiteLambdaNameConfig.alertHandler}-${this.region}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambda-basic', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambda-vpc', 'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    this.dashboardWriterRole = new iam.Role(this, 'lambda-5a-role', {
      roleName: `${WebsiteRolesStack.websiteLambdaNameConfig.dashboardWriter}-${this.region}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambda-5a-basic', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambda-5a-vpc', 'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    this.dashboardReducerRole = new iam.Role(this, 'lambda-5b-role', {
      roleName: `${WebsiteRolesStack.websiteLambdaNameConfig.dashboardReducer}-${this.region}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambda-5b-basic', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambda-5b-vpc', 'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });
  }

  public static getLambdaRoleArnComponents(region: string, account: string, forFunction: LambdaType): ArnComponents {
    const arnComponents: ArnComponents = {
      region: '',
      account,
      partition: 'aws',
      service: 'iam',
      resource: 'role',
    };
    return {
      ...arnComponents,
      resourceName: `${WebsiteRolesStack.websiteLambdaNameConfig[forFunction]}-${region}`,
    };
  }
}