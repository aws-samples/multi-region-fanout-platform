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
import { IParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Duration } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IKey, Key } from 'aws-cdk-lib/aws-kms';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

export interface RdsClusterConstructProps {
  region: string;
  accountId: string;
  vpc: ec2.IVpc;
  securityGroupDb: ec2.ISecurityGroup;
  websiteAccountId: string;
  processingAccountIds: string[],
}

export class RdsClusterConstruct extends Construct {
  public readonly credentialsRdsCluster: rds.DatabaseSecret;
  public readonly credentialsDbAppAdmin: rds.DatabaseSecret;
  public readonly credentialsDbAppUser: rds.DatabaseSecret;
  public readonly usernameRdsCluster: string;
  public readonly usernameDbAppAdmin: string;
  public readonly usernameDbAppUser: string;
  public readonly primaryHostParameterStore: IParameter;
  public readonly databasePort: number;
  public readonly defaultDatabaseName: string;
  public readonly cmkRds: IKey;
  public static readonly appAdminSecretNamePrefix: string = 'appadmin';
  public static readonly appUserSecretNamePrefix: string = 'appuser';

  constructor(scope: Construct, id: string, props: RdsClusterConstructProps) {
    super(scope, id);

    this.cmkRds = new Key(this, 'cmk-rds', {
      alias: `rds-key-${props.region}`,
      description: 'CMK for RDS encryption',
      enableKeyRotation: true,
      enabled: true,
    });
    this.cmkRds.addToResourcePolicy(new PolicyStatement({
      actions: [
        'kms:Encrypt',
        'kms:Decrypt',
        'kms:ReEncrypt',
        'kms:GenerateDataKey',
        'kms:CreateGrant',
        'kms:DescribeKey',
      ],
      sid: 'Allow access to principals authorized to use AWS Secrets Manager.',
      resources: ['*'],
      principals: [
        new ServicePrincipal('secretsmanager.amazonaws.com'),
        new ServicePrincipal(`secretsmanager.${props.region}.amazonaws.com`),
      ],
      effect: Effect.ALLOW,
    }));

    this.usernameRdsCluster = 'rds_admin';
    this.usernameDbAppAdmin = 'appadmin';
    this.usernameDbAppUser = 'appuser';

    this.credentialsRdsCluster = new rds.DatabaseSecret(this, 'credentials-db-rds-cluster', {
      username: this.usernameRdsCluster,
      excludeCharacters: ' @"/\\\'',
      encryptionKey: this.cmkRds,
      secretName: `rdsadmin-${props.region}`,
    });
    this.credentialsDbAppAdmin = new rds.DatabaseSecret(this, 'credentials-db-app-admin', {
      username: this.usernameDbAppAdmin,
      excludeCharacters: ' @"/\\\'',
      encryptionKey: this.cmkRds,
      secretName: `${RdsClusterConstruct.appAdminSecretNamePrefix}-${props.region}`,
      masterSecret: this.credentialsRdsCluster,
    });
    this.credentialsDbAppUser = new rds.DatabaseSecret(this, 'credentials-db-app-user', {
      username: this.usernameDbAppUser,
      excludeCharacters: ' @"/\\\'',
      encryptionKey: this.cmkRds,
      secretName: `appuser-${props.region}`,
      masterSecret: this.credentialsRdsCluster,
    });

    this.databasePort = 5432;
    this.defaultDatabaseName = 'postgis';
    const regionalRdsCluster = new rds.DatabaseCluster(this, 'rds-cluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_13_4,
      }),
      defaultDatabaseName: this.defaultDatabaseName,
      clusterIdentifier: `postgis-${props.region}`,
      credentials: rds.Credentials.fromSecret(this.credentialsRdsCluster),
      port: this.databasePort,
      instanceProps: {
        vpc: props.vpc,
        vpcSubnets: {
          onePerAz: true,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [
          props.securityGroupDb,
        ],
        allowMajorVersionUpgrade: false,
        autoMinorVersionUpgrade: true,
        performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
        enablePerformanceInsights: true,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.MEMORY6_GRAVITON, ec2.InstanceSize.LARGE),
      },
      backup: {
        retention: Duration.days(7),
      },
      cloudwatchLogsExports: [
        'postgresql',
      ],
      cloudwatchLogsRetention: RetentionDays.ONE_MONTH,
      monitoringInterval: Duration.seconds(60),
      instanceIdentifierBase: `postgis-${props.region}-i`,
      instances: 3, // one instance per AZ
      deletionProtection: true,
      iamAuthentication: true,
      storageEncryptionKey: this.cmkRds,
      storageEncrypted: true,
    });

    this.credentialsDbAppAdmin.attach(regionalRdsCluster);
    this.credentialsDbAppUser.attach(regionalRdsCluster);

    regionalRdsCluster.addRotationSingleUser({
      automaticallyAfter: Duration.days(1),
      excludeCharacters: ' @"/\\\'',
      vpcSubnets: {
        subnets: props.vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        }).subnets,
      },
    });
    regionalRdsCluster.addRotationMultiUser('app-admin-rotation', {
      secret: this.credentialsDbAppAdmin,
      automaticallyAfter: Duration.days(1),
      excludeCharacters: ' @"/\\\'',
      vpcSubnets: {
        subnets: props.vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        }).subnets,
      },
    });
    regionalRdsCluster.addRotationMultiUser('app-user-rotation', {
      secret: this.credentialsDbAppUser,
      automaticallyAfter: Duration.days(1),
      excludeCharacters: ' @"/\\\'',
      vpcSubnets: {
        subnets: props.vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        }).subnets,
      },
    });

    this.primaryHostParameterStore = new StringParameter(this, 'ssm-rds-cluster-primary-host', {
      stringValue: regionalRdsCluster.clusterEndpoint.hostname,
      description: 'Hostname of the primary endpoint of RDS for read/write operations',
      parameterName: `/rds/${props.region}/primaryEndpointHost`,
    });

    new StringParameter(this, 'ssm-rds-cluster-replica-host', {
      stringValue: regionalRdsCluster.clusterReadEndpoint.hostname,
      description: 'Hostname of the read replicas endpoint of RDS',
      parameterName: `/rds/${props.region}/replicaEndpointHost`,
    });
  }

  public static getAppUserSecretName(region: string): string {
    return `${this.appUserSecretNamePrefix}-${region}`;
  }
}