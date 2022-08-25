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
import { WebsiteRolesStack } from '../website-stack/website-roles-stack';
import { ProcessingRolesStack } from '../processing-stack/processing-roles-stack';
import { CriticalityLevel } from '../../../types/app-configuration';

export interface SharedServicesRolesStackProps extends StackProps {
  websiteAccountId: string;
  processingAccountIds: { [level in CriticalityLevel]: string };
}

export class SharedServicesRolesStack extends Stack {

  private static readonly crossAccountRoleName: string = 'cross-account-role-shared-services-account';

  public readonly crossAccountRole: iam.Role;

  constructor(scope: Construct, id: string, props: SharedServicesRolesStackProps) {
    super(scope, id, props);

    this.crossAccountRole =  new iam.Role(this, 'cross-account-role-website-account-db-secret', {
      roleName: `${SharedServicesRolesStack.crossAccountRoleName}-${Stack.of(this).region}`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.ArnPrincipal(this.formatArn(WebsiteRolesStack.getLambdaRoleArnComponents(this.region, props.websiteAccountId, 'alertHandler'))),
        new iam.ArnPrincipal(this.formatArn(WebsiteRolesStack.getLambdaRoleArnComponents(this.region, props.websiteAccountId, 'dashboardWriter'))),
        new iam.ArnPrincipal(this.formatArn(WebsiteRolesStack.getLambdaRoleArnComponents(this.region, props.websiteAccountId, 'dashboardReducer'))),
        new iam.ArnPrincipal(this.formatArn(ProcessingRolesStack.getLambdaRoleArnComponents(this.region, props.processingAccountIds.high, 'allAlerts'))),
        new iam.ArnPrincipal(this.formatArn(ProcessingRolesStack.getLambdaRoleArnComponents(this.region, props.processingAccountIds.high, 'selectedAlerts'))),
        new iam.ArnPrincipal(this.formatArn(ProcessingRolesStack.getLambdaRoleArnComponents(this.region, props.processingAccountIds.regular, 'allAlerts'))),
        new iam.ArnPrincipal(this.formatArn(ProcessingRolesStack.getLambdaRoleArnComponents(this.region, props.processingAccountIds.regular, 'selectedAlerts'))),
      ),
    });
  }

  public static getCrossAccountRoleArnComponent(region: string, account: string): ArnComponents {
    return {
      region: '',
      account,
      partition: 'aws',
      service: 'iam',
      resource: 'role',
      resourceName: `${SharedServicesRolesStack.crossAccountRoleName}-${region}`,
    };
  }
}