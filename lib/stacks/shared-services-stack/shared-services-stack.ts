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
import { ArnComponents, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ram from 'aws-cdk-lib/aws-ram';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ArnPrincipal } from 'aws-cdk-lib/aws-iam';
import { VpcConstruct } from './constructs/vpc-construct';
import { RdsClusterConstruct } from './constructs/rds-cluster-construct';
import { DbMigrationsConstruct } from './constructs/db-migrations-construct';
import { MrfpStackProps } from '../types';
import { LambdaLayersConstruct } from '../../constructs/lambda-layers-construct';
import { UpdateDeviceConstruct } from './constructs/update-device-construct';
import { DeviceCacheBucketConstruct } from './constructs/device-cache-bucket-construct';
import { SharedServicesRolesStack } from './shared-services-roles-stack';
import { DummyData } from '../../constructs/dummy-data-construct';

export interface SharedServicesStackProps extends MrfpStackProps {
  ramPrincipals: string[],
  websiteAccountId: string,
  processingAccountIds: string[],
  lambdaRoleArnsProcessingSelectedAlerts: ArnComponents[],
  lambdaRoleArnsProcessingAllAlerts: ArnComponents[],
  lambdaRoleArnsFanoutAllAlerts: ArnComponents[],
  appDatabaseName: string;
}

export class SharedServicesStack extends Stack {

  public static readonly vpcName: string = 'rds-shared-vpc';

  constructor(scope: Construct, id: string, props: SharedServicesStackProps) {
    super(scope, id, props);

    const vpcConstruct = new VpcConstruct(this, 'vpc-construct', {
      vpcName: SharedServicesStack.vpcName,
    });

    const clusterConstruct = new RdsClusterConstruct(this, 'rds-cluster-construct', {
      region: this.region,
      accountId: this.account,
      vpc: vpcConstruct.vpc,
      securityGroupDb: vpcConstruct.securityGroupDb,
      websiteAccountId: props.websiteAccountId,
      processingAccountIds: props.processingAccountIds,
    });

    const lambdaLayersConstruct = new LambdaLayersConstruct(this, 'lambda-layers');


    new UpdateDeviceConstruct(this, 'update-device', {
      region: this.region,
      databaseName: props.appDatabaseName,
      databasePort: clusterConstruct.databasePort,
      databaseSecret: clusterConstruct.credentialsDbAppUser,
      databasePrimaryHost: clusterConstruct.primaryHostParameterStore,
      databaseAppUser: clusterConstruct.usernameDbAppUser,
      vpc: vpcConstruct.vpc,
      securityGroups: [vpcConstruct.securityGroupApp],
      cmkRds: clusterConstruct.cmkRds,
      layerBase: lambdaLayersConstruct.baseLayer,
      layerPg: lambdaLayersConstruct.pgLayer,
    });

    new DbMigrationsConstruct(this, 'db-migration-construct', {
      region: this.region,
      databaseName: props.appDatabaseName,
      databaseRootName: clusterConstruct.defaultDatabaseName,
      databasePort: clusterConstruct.databasePort,
      databaseUserAdminName: clusterConstruct.usernameDbAppAdmin,
      databaseAppUser: clusterConstruct.usernameDbAppUser,
      credentialsDbMaster: clusterConstruct.credentialsRdsCluster,
      credentialsDbAppAdmin: clusterConstruct.credentialsDbAppAdmin,
      credentialsDbAppUser: clusterConstruct.credentialsDbAppUser,
      databasePrimaryHost: clusterConstruct.primaryHostParameterStore,
      vpc: vpcConstruct.vpc,
      securityGroups: [vpcConstruct.securityGroupApp],
      cmkRds: clusterConstruct.cmkRds,
      layerBase: lambdaLayersConstruct.baseLayer,
      layerPg: lambdaLayersConstruct.pgLayer,
    });

    new ram.CfnResourceShare(this, 'ram', {
      name: 'rds-vpc-resource-share',
      allowExternalPrincipals: false,
      principals: props.ramPrincipals,
      resourceArns: vpcConstruct.vpc.privateSubnets.map((privateSubnet: ec2.ISubnet) => (
        `arn:aws:ec2:${this.region}:${this.account}:subnet/${privateSubnet.subnetId}`
      )),
    });

    const deviceCacheBucketConstruct = new DeviceCacheBucketConstruct(this, 'device-cache-bucket');
    props.lambdaRoleArnsProcessingAllAlerts.forEach((arnComponents: ArnComponents) =>
      deviceCacheBucketConstruct.bucket.grantRead(new ArnPrincipal(this.formatArn(arnComponents))),
    );
    props.lambdaRoleArnsFanoutAllAlerts.forEach((arnComponents: ArnComponents) =>
      deviceCacheBucketConstruct.bucket.grantRead(new ArnPrincipal(this.formatArn(arnComponents))),
    );
    // Fill Device Cache Bucket with dummy data
    // If you increase the number of chunks and/or size here, you might need to increase the Lambda memory and timeout in the Dummy Data construct.
    new DummyData(this, 'DeviceCacheDummyData', {
      bucket: deviceCacheBucketConstruct.bucket,
      chunks: 10,
      chunkSize: 10000,
      tokenLength: 64,
      provider: 'AP2',
      platform: 'pnp1',
      severity: 'Extreme',
    });

    // cross-account role to allow AWS Lambda in other accounts to retrieve database secret and read from all alerts cache bucket
    const crossAccountRole = iam.Role.fromRoleArn(this, 'cross-account-role-for-db-secret',
      this.formatArn(SharedServicesRolesStack.getCrossAccountRoleArnComponent(this.region, this.account)),
      {
        mutable: true,
      },
    ) as iam.Role;
    clusterConstruct.credentialsDbAppUser.grantRead(crossAccountRole);
    clusterConstruct.cmkRds.grantDecrypt(crossAccountRole);
    deviceCacheBucketConstruct.bucket.grantRead(crossAccountRole);
  }
}