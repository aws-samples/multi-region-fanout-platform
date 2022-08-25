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
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { ISubnet } from 'aws-cdk-lib/aws-ec2';

interface Props {
  vpcName: string,
}

export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly securityGroupDb: ec2.SecurityGroup;
  public readonly securityGroupApp: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'vpc', {
      vpcName: props.vpcName,
      flowLogs: {
        'flow-logs-all': {
          trafficType: ec2.FlowLogTrafficType.ALL,
          destination: ec2.FlowLogDestination.toCloudWatchLogs(new logs.LogGroup(this, 'vpcFlowLogsGroup', {
            retention: logs.RetentionDays.ONE_MONTH,
          })),
        },
      },
      subnetConfiguration: [{
        name: 'ingress',
        subnetType: ec2.SubnetType.PUBLIC,
      }, 
      {
        name: 'app',
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
      }, 
      {
        name: 'data',
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      ],
    });

    this.securityGroupApp = new ec2.SecurityGroup(this, 'sec-group-app', {
      securityGroupName: 'Security group for app subnets',
      vpc: this.vpc,
    });

    this.securityGroupDb = new ec2.SecurityGroup(this, 'sec-group-db', {
      securityGroupName: 'Security group for db subnets',
      vpc: this.vpc,
    });

    this.securityGroupDb.addIngressRule(
      this.securityGroupApp,
      ec2.Port.tcp(5432),
      'Allow TCP port for PostgreSQL',
    );
    this.vpc.privateSubnets.forEach((subnet: ISubnet) => {
      this.securityGroupDb.addIngressRule(
        ec2.Peer.ipv4(subnet.ipv4CidrBlock),
        ec2.Port.tcp(5432),
        'Allow TCP port for PostgreSQL from private subnets',
      );
    });

    // for testing purposes
    this.securityGroupApp.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS ingress',
    );
  }
}