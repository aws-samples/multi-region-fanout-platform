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
import { ConfigBucketConstruct } from './config-bucket-construct';
import { IParameter } from 'aws-cdk-lib/aws-ssm';
import { DatabaseSecret } from 'aws-cdk-lib/aws-rds';
import { LambdaLogLevel } from '../../../../types/app-configuration';
import { LambdaConstruct } from '../../../constructs/lambda-construct';

export interface DbMigrationsConstructProps {
  region: string,
  databaseName: string,
  databaseRootName: string,
  databasePort: number,
  databaseUserAdminName: string,
  credentialsDbMaster: DatabaseSecret,
  credentialsDbAppAdmin: DatabaseSecret,
  credentialsDbAppUser: DatabaseSecret,
  databasePrimaryHost: IParameter,
  databaseAppUser: string,
  vpc: ec2.IVpc,
  securityGroups: ec2.ISecurityGroup[],
  cmkRds: kms.IKey,
  layerPg: lambda.LayerVersion,
  layerBase: lambda.LayerVersion
}

export class DbMigrationsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DbMigrationsConstructProps) {
    super(scope, id);

    const regionalConfig = new ConfigBucketConstruct(this, 'regionalConfig');

    const dbMigrationsLambda = new LambdaConstruct(this, 'lambda-db-migrations', {
      entry: 'db-migrations',
      handler: 'handler.handler',
      description: 'Initializes and performs migrations for the application database.',
      functionName: 'db-migrations',
      timeout: Duration.minutes(10),
      memorySize: 512,
      environment: {
        LOG_LEVEL: LambdaLogLevel,
        RDS_AWSREGION: props.region, // done
        RDS_DATABASE: props.databaseName,
        RDS_DATABASE_ROOT: props.databaseRootName, // done
        RDS_PORT: props.databasePort.toString(), // done
        RDS_USER_ADMIN: props.databaseUserAdminName,
        S3_CONFIG_BUCKET: regionalConfig.regionalConfigBucket.bucketName,
        SECMGR_DBCREDROOT_ARN: props.credentialsDbMaster.secretArn,
        SECMGR_DBCREDADMIN_ARN: props.credentialsDbAppAdmin.secretArn,
        SECMGR_DBCREDUSER_ARN: props.credentialsDbAppUser.secretArn,
        SSM_RDSPRIMARY_HOST: props.databasePrimaryHost.parameterName,
        RDS_USER_APP: props.databaseAppUser,
      },
      layers: [ props.layerBase, props.layerPg ],
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
      },
      securityGroups: props.securityGroups,
    });

    regionalConfig.regionalConfigBucket.grantReadWrite(dbMigrationsLambda.lambdaFunction);
    regionalConfig.regionalConfigBucketCMK.grantEncryptDecrypt(dbMigrationsLambda.lambdaFunction);

    props.credentialsDbMaster.grantRead(dbMigrationsLambda.lambdaFunction);
    props.credentialsDbAppAdmin.grantRead(dbMigrationsLambda.lambdaFunction);
    props.credentialsDbAppUser.grantRead(dbMigrationsLambda.lambdaFunction);

    props.databasePrimaryHost.grantRead(dbMigrationsLambda.lambdaFunction);
    props.cmkRds.grantDecrypt(dbMigrationsLambda.lambdaFunction);
  }
}