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
import { CrossAccountRoleNameConfig, CrossAccountRoleType } from './types';
import { WebsiteRolesStack } from '../website-stack/website-roles-stack';
import { WatchdogRolesStack } from '../watchdog-stack/watchdog-roles-stack';

export interface ProcessingCrossAccountRolesStackProps extends StackProps {
  websiteAccountId: string;
  watchdogAccountId: string;
  crossRegion: string;
}

export class ProcessingCrossAccountRolesStack extends Stack {

  private static readonly crossAccountRoleName: CrossAccountRoleNameConfig = {
    website: 'cross-account-role-for-alert-handler',
    watchdog: 'cross-account-role-for-watchdog',
  };

  constructor(scope: Construct, id: string, props: ProcessingCrossAccountRolesStackProps) {
    super(scope, id, props);

    new iam.Role(this, 'cross-account-role-for-alert-handler', {
      roleName: `${ProcessingCrossAccountRolesStack.crossAccountRoleName.website}-${this.region}`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.ArnPrincipal(this.formatArn(WebsiteRolesStack.getLambdaRoleArnComponents(this.region, props.websiteAccountId, 'alertHandler'))),
      ),
    });

    new iam.Role(this, 'cross-account-role-for-watchdog', {
      roleName: `${ProcessingCrossAccountRolesStack.crossAccountRoleName.watchdog}-${this.region}`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.ArnPrincipal(this.formatArn(WatchdogRolesStack.getLambdaRoleArnComponents(props.crossRegion, props.watchdogAccountId))),
      ),
    });
  }

  public static getCrossAccountRoleArnComponents(region: string, account: string, forRoleType: CrossAccountRoleType): ArnComponents {
    return {
      region: '',
      account,
      partition: 'aws',
      service: 'iam',
      resource: 'role',
      resourceName: `${ProcessingCrossAccountRolesStack.crossAccountRoleName[forRoleType]}-${region}`,
    };
  }
}