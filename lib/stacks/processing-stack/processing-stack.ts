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
import { ArnComponents, Duration, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { SharedVpcConstruct } from '../../constructs/shared-vpc-construct';
import { FanoutQueueConfig, MrfpStackProps } from '../types';
import { NotificationQueuingLambdaConstruct } from './constructs/notification-queuing-lambda-construct';
import { FlowControl } from './constructs/types';
import { SqsQueueConstruct } from '../../constructs/sqs-queue-construct';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { ProcessingRolesStack } from './processing-roles-stack';
import { FanoutRolesStack } from '../fanout-stack/fanout-roles-stack';
import { ProcessingCrossAccountRolesStack } from './processing-cross-account-roles-stack';
import { LambdaLogLevel } from '../../../types/app-configuration';
import { LambdaLayersConstruct } from '../../constructs/lambda-layers-construct';
import { LambdaConstruct } from '../../constructs/lambda-construct';

export interface ProcessingStackProps extends MrfpStackProps {
  fanoutQueueConfig: FanoutQueueConfig,
  websiteAccountId: string,
  fanoutPnp1AccountId: string,
  fanoutPnp2AccountId: string,
  ddbAlertsTableName: string,
  ddbPushTableName: string,
  sharedVpcOwnerId: string,
  sharedServicesCrossAccountRole: ArnComponents,
  allAlertsDeviceCacheBucketName: string,
  appUserSecret: string,
  ddbFailoverQueueName: string,
  ddbFailoverQueueMessageProducerArn: ArnComponents,
  appDatabaseName: string;
}

export class ProcessingStack extends Stack {

  public static readonly queueNameBatchProtocol: string = 'batch-protocol';

  constructor(scope: Construct, id: string, props: ProcessingStackProps) {
    super(scope, id, props);

    // DynamoDB tables
    const ddbGlobalAlertTable = dynamodb.Table.fromTableName(this, 'alert-table', props.ddbAlertsTableName);

    const ddbLocalPushTable = new dynamodb.Table(this, 'push-table', {
      tableName: props.ddbPushTableName,
      partitionKey: { name: 'alertId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'batchId', type: dynamodb.AttributeType.STRING },
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: new kms.Key(this, 'push-table-cmk', {
        description: 'CMK for ddb push-table',
        enableKeyRotation: true,
        enabled: true,
      }),
    });

    // SQS queue for DDB connection failover
    const ddbFailoverQueue = new SqsQueueConstruct(this, 'ddb-failover-queue', {
      keyProps: {
        alias: `${props.ddbFailoverQueueName}-cmk`,
        description: `CMK for SQS queue for ${props.ddbFailoverQueueName}`,
      },
      queueProps: {
        queueName:  `${props.ddbFailoverQueueName}`,
        visibilityTimeout: Duration.minutes(1),
      },
    });
    ddbFailoverQueue.addProducer(this.formatArn(props.ddbFailoverQueueMessageProducerArn));

    // Shared VPC and Security Group
    const sharedVpcConstruct = new SharedVpcConstruct(this, 'shared-vpc-properties', {
      ownerAccountId: props.sharedVpcOwnerId,
    });

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'vpc', {
      vpcId: sharedVpcConstruct.vpcId,
      availabilityZones: this.availabilityZones,
      privateSubnetIds: sharedVpcConstruct.vpcSubnetIds,
    });

    const securityGroup = new ec2.SecurityGroup(this, 'sec-group-lambda', {
      description: 'Security group for queuing lambda function',
      allowAllOutbound: true,
      vpc,
    });

    // Lambda functions
    const lambdaLayersConstruct = new LambdaLayersConstruct(this, 'lambda-layers');

    const subscriptionHandlerRoleAllAlerts = iam.Role.fromRoleArn(this, 'subscription-handler-role-all-alerts-role',
      this.formatArn(ProcessingRolesStack.getLambdaRoleArnComponents(this.region, this.account, 'allAlerts')),
      {
        mutable: true,
      }) as iam.Role;
    const allAlertsLambdaConstruct = new NotificationQueuingLambdaConstruct(this, 'notification-queuing-lambda-all', {
      functionName: `${ProcessingRolesStack.processingLambdaNameConfig.allAlerts}`,
      lambdaRole: subscriptionHandlerRoleAllAlerts,
      flowControl: FlowControl.ALL,
      layers: [ lambdaLayersConstruct.baseLayer, lambdaLayersConstruct.pgLayer ],
      ddbAlertsTable: ddbGlobalAlertTable,
      ddbPushTable: ddbLocalPushTable,
      secretNameRdsCredentials: props.appUserSecret,
      sharedServicesCrossAccountRole: this.formatArn(props.sharedServicesCrossAccountRole),
      fanoutQueuePnp1AllArn: props.fanoutQueueConfig.allAlerts.pnp1,
      fanoutQueuePnp1SelectedArn: props.fanoutQueueConfig.selectedAlerts.pnp1,
      fanoutQueuePnp2AllArn: props.fanoutQueueConfig.allAlerts.pnp2,
      fanoutQueuePnp2SelectedArn: props.fanoutQueueConfig.selectedAlerts.pnp2,
      s3BucketNameAllAlertsCache: props.allAlertsDeviceCacheBucketName,
      fanoutPnp1AccountId: props.fanoutPnp1AccountId,
      fanoutPnp2AccountId: props.fanoutPnp2AccountId,
      sharedServiceAccountId: props.sharedServicesCrossAccountRole.account!,
      appDatabaseName: props.appDatabaseName,
    });

    const subscriptionHandlerRoleSelectedAlerts = iam.Role.fromRoleArn(this, 'subscription-handler-role-selected-alerts-role',
      this.formatArn(ProcessingRolesStack.getLambdaRoleArnComponents(this.region, this.account, 'selectedAlerts')),
      {
        mutable: true,
      }) as iam.Role;
    const selectedAlertsLambdaConstruct = new NotificationQueuingLambdaConstruct(this, 'notification-queuing-lambda-selected', {
      functionName: `${ProcessingRolesStack.processingLambdaNameConfig.selectedAlerts}`,
      lambdaRole: subscriptionHandlerRoleSelectedAlerts,
      flowControl: FlowControl.SELECTED,
      layers: [ lambdaLayersConstruct.baseLayer, lambdaLayersConstruct.pgLayer ],
      ddbAlertsTable: ddbGlobalAlertTable,
      ddbPushTable: ddbLocalPushTable,
      secretNameRdsCredentials: props.appUserSecret,
      sharedServicesCrossAccountRole: this.formatArn(props.sharedServicesCrossAccountRole),
      fanoutQueuePnp1AllArn: props.fanoutQueueConfig.allAlerts.pnp1,
      fanoutQueuePnp1SelectedArn: props.fanoutQueueConfig.selectedAlerts.pnp1,
      fanoutQueuePnp2AllArn: props.fanoutQueueConfig.allAlerts.pnp2,
      fanoutQueuePnp2SelectedArn: props.fanoutQueueConfig.selectedAlerts.pnp2,
      s3BucketNameAllAlertsCache: props.allAlertsDeviceCacheBucketName,
      fanoutPnp1AccountId: props.fanoutPnp1AccountId,
      fanoutPnp2AccountId: props.fanoutPnp2AccountId,
      sharedServiceAccountId: props.sharedServicesCrossAccountRole.account!,
      vpc: vpc,
      subnets: vpc.privateSubnets,
      securityGroups: [securityGroup],
      appDatabaseName: props.appDatabaseName,
    });

    // Cross account role to be assumed by the lambdas in the website account, to trigger the lambdas above
    const crossAccountRoleForWebsiteAccount = iam.Role.fromRoleArn(this, 'cross-account-role-for-website-account',
      this.formatArn(ProcessingCrossAccountRolesStack.getCrossAccountRoleArnComponents(this.region, this.account, 'website')),
      {
        mutable: true,
      }) as iam.Role;
    crossAccountRoleForWebsiteAccount.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction',
        'lambda:InvokeAsync',
      ],
      resources: [
        allAlertsLambdaConstruct.lambdaFunction.functionArn,
        selectedAlertsLambdaConstruct.lambdaFunction.functionArn,
      ],
    }));
    ddbLocalPushTable.grantReadWriteData(crossAccountRoleForWebsiteAccount);
    ddbGlobalAlertTable.grantReadWriteData(crossAccountRoleForWebsiteAccount);

    // cross account to be assumed by the watchdog check handler to access Dynamo
    const crossAccountRoleWatchdog = iam.Role.fromRoleArn(this, 'cross-account-role-for-watchdog',
      this.formatArn(ProcessingCrossAccountRolesStack.getCrossAccountRoleArnComponents(this.region, this.account, 'watchdog')),
      {
        mutable: true,
      }) as iam.Role;
    ddbLocalPushTable.grantReadData(crossAccountRoleWatchdog);
    ddbGlobalAlertTable.grantReadData(crossAccountRoleWatchdog);

    // batch protocol
    const queueBatchProtocol = new SqsQueueConstruct(this, 'queue-batch-protocol', {
      keyProps: {
        alias: 'cmk-queue-batch-protocol',
        description: 'CMK for SQS queue for batch protocol messages',
      },
      queueProps: {
        queueName: ProcessingStack.queueNameBatchProtocol,
        visibilityTimeout: Duration.minutes(2),
      },
    });
    queueBatchProtocol.addProducer(this.formatArn(FanoutRolesStack.getLambdaRoleArnComponents(
      this.region,
      props.fanoutPnp1AccountId,
      'allAlerts',
    )));
    queueBatchProtocol.addProducer(this.formatArn(FanoutRolesStack.getLambdaRoleArnComponents(
      this.region,
      props.fanoutPnp1AccountId,
      'selectedAlerts',
    )));
    queueBatchProtocol.addProducer(this.formatArn(FanoutRolesStack.getLambdaRoleArnComponents(
      this.region,
      props.fanoutPnp2AccountId,
      'allAlerts',
    )));
    queueBatchProtocol.addProducer(this.formatArn(FanoutRolesStack.getLambdaRoleArnComponents(
      this.region,
      props.fanoutPnp2AccountId,
      'selectedAlerts',
    )));

    const lambdaNameBatchProtocol = 'batch-protocol';
    const lambdaRoleBatchProtocol = new iam.Role(this, 'lambda-role-batch-protocol', {
      roleName: `${lambdaNameBatchProtocol}-${this.region}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'lambda-basic', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    const lambdaBatchProtocol = new LambdaConstruct(this, 'lambda-batch-protocol', {
      entry: 'batch-protocol',
      handler: 'handler.handler',
      description: 'Triggered async and protocols batch notifications to DynamoDB',
      functionName: lambdaNameBatchProtocol,
      role: lambdaRoleBatchProtocol,
      environment: {
        LOG_LEVEL: LambdaLogLevel,
        DDB_TABLE_ALERTBATCHES: ddbLocalPushTable.tableName,
      },
      layers: [ lambdaLayersConstruct.baseLayer ],
      memorySize: 512,
      timeout: Duration.minutes(2),
    });
    ddbLocalPushTable.grantReadWriteData(lambdaRoleBatchProtocol);
    lambdaBatchProtocol.lambdaFunction.addEventSource(new SqsEventSource(queueBatchProtocol.queue, {
      batchSize: 10,
      maxBatchingWindow: Duration.seconds(10),
      reportBatchItemFailures: true,
      enabled: true,
    }));
  }
}