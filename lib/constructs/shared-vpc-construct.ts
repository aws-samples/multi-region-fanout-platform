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
import { CustomResource } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { LambdaConstruct } from './lambda-construct';

interface Props {
  ownerAccountId: string,
}

export class SharedVpcConstruct extends Construct {
  public readonly vpcId: string;
  public readonly vpcSubnetIds: string[];

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const onEventLambda = new LambdaConstruct(this, 'on-event-lambda', {
      entry: 'cfncr-get-vpc',
      handler: 'handler.onEvent',
      functionName: 'get-vpc-custom-resource',
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:DescribeSubnets',
            'ec2:DescribeVpc',
          ],
          resources: ['*'],
        }),
      ],
    });
  
    const provider = new cr.Provider(this, 'provider', {
      onEventHandler: onEventLambda.lambdaFunction,
    });
  
    const vpcCr = new CustomResource(this, 'custom-resource', {
      serviceToken: provider.serviceToken,
      resourceType: 'Custom::GetVpc',
      properties: {
        ownerId: props.ownerAccountId,
      },
    });

    this.vpcId = vpcCr.getAttString('vpcId');
    this.vpcSubnetIds = [
      vpcCr.getAttString('subnetIdA'),
      vpcCr.getAttString('subnetIdB'),
      vpcCr.getAttString('subnetIdC'),
    ];
  }
}