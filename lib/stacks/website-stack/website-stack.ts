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
import { ArnComponents, CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import { S3BucketConstruct } from '../../constructs/s3-bucket-construct';
import { S3OriginProps } from '../types';
import { CloudfrontConstruct } from './constructs/cloudfront-construct';
import { AlertLambdaConstruct } from './constructs/alert-lambda-construct';
import {
  DynamodbArns, LambdaLogLevel,
  ProcessingAccountRoleArns,
  ProcessingLambdaNameComponents,
} from '../../../types/app-configuration';
import { SharedVpcConstruct } from '../../constructs/shared-vpc-construct';
import { Key } from 'aws-cdk-lib/aws-kms';
import { SqsQueueConstruct } from '../../constructs/sqs-queue-construct';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { WebsiteRolesStack } from './website-roles-stack';
import { ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { WatchdogRolesStack } from '../watchdog-stack/watchdog-roles-stack';
import { LambdaLayersConstruct } from '../../constructs/lambda-layers-construct';
import { LambdaConstruct } from '../../constructs/lambda-construct';

export interface WebsiteStackProps extends StackProps {
  notificationEmailAddress?: string,
  sharedVpcOwnerId: string,
  primaryRegion: string,
  secondaryRegion: string,
  processingAccountsRoleNames: ProcessingAccountRoleArns,
  processingAccountsFunctionNamesAllAlerts: ProcessingLambdaNameComponents,
  processingAccountsFunctionNamesSelectedAlerts: ProcessingLambdaNameComponents,
  rdsDatabaseSecretName: string,
  sharedServicesCrossAccountRole: ArnComponents,
  ddbTableArns?: DynamodbArns,
  ddbFailoverQueueUrlHigh: string,
  ddbFailoverQueueUrlRegular: string,
  websiteBucketName: string,
  appDatabaseName: string;
}

export class WebsiteStack extends Stack {

  public readonly cloudfrontDistributionDomainName: string;

  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const S3Origins: S3OriginProps = {
      primary: {
        bucketName: `${this.account}-website-bucket-${this.region}`,
        bucketRegion: this.region,
      },
      secondary: props.primaryRegion === this.region ? {
        bucketName: `${this.account}-website-bucket-${props.secondaryRegion}`,
        bucketRegion: props.secondaryRegion,
      } :
        {
          bucketName: `${this.account}-website-bucket-${props.primaryRegion}`,
          bucketRegion: props.primaryRegion,
        },
    };

    const sharedServicesCrossAccountRoleArn = this.formatArn(props.sharedServicesCrossAccountRole);
    const processingCrossAccountRoleArn = Object.values(props.processingAccountsRoleNames).map(arnComponent => this.formatArn(arnComponent));

    // website bucket
    const websiteBucket = new S3BucketConstruct(this, 'website', {
      bucketName: props.websiteBucketName,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    // only add index file to the bucket in the primary region, e.g. frankfurt
    if (this.region === props.primaryRegion) {
      new s3Deployment.BucketDeployment(this, 'failover-file-deployment', {
        sources: [
          s3Deployment.Source.asset(`${__dirname}/health-check-static`),
        ],
        destinationBucket: websiteBucket.bucket,
      });
    }

    // failover bucket
    const failoverBucket = new S3BucketConstruct(this, 'failover', {
      bucketName: `${this.account}-failover-bucket-${this.region}`,
      isCmkEncrypted: true,
    });

    // cloudfront distribution
    const distribution = new CloudfrontConstruct(this, 'cloudfront-construct', {
      s3Origins: S3Origins,
      bucketNameCloudfrontAccessLogs: `${this.account}-cloudfront-access-logs-${this.region}`,
    });
    this.cloudfrontDistributionDomainName = distribution.cloudfrontDistribution.distributionDomainName;

    // add resource policy to website bucket
    websiteBucket.bucket.grantRead(distribution.oai);

    // alert handler role
    const alertHandlerRole = iam.Role.fromRoleArn(this, 'alert-handler-role',
      this.formatArn(WebsiteRolesStack.getLambdaRoleArnComponents(this.region, this.account, 'alertHandler')),
      {
        mutable: true,
      }) as iam.Role;
    alertHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sts:AssumeRole',
      ],
      resources: [sharedServicesCrossAccountRoleArn, ...processingCrossAccountRoleArn],
    }));
    alertHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObjectTagging',
        's3:DeleteObject',
      ],
      resources: [
        `${websiteBucket.bucket.bucketArn}/*`,
        `${failoverBucket.bucket.bucketArn}/*`,
      ],
    }));
    failoverBucket.bucket.grantPut(alertHandlerRole);

    // VPC and security group for Lambda
    const sharedVpcConstruct = new SharedVpcConstruct(this, 'shared-vpc-properties', {
      ownerAccountId: props.sharedVpcOwnerId,
    });

    new CfnOutput(this, 'VPC_ID', { value: sharedVpcConstruct.vpcId });
    new CfnOutput(this, 'SUBNET_IDS', { value: sharedVpcConstruct.vpcSubnetIds.join(',') });

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'shared-vpc', {
      vpcId: sharedVpcConstruct.vpcId,
      availabilityZones: this.availabilityZones,
      privateSubnetIds: sharedVpcConstruct.vpcSubnetIds,
    });

    const securityGroup = new ec2.SecurityGroup(this, 'sec-group-lambda', {
      description: 'Security group for alert lambda function',
      allowAllOutbound: true,
      vpc,
    });

    // lambda functions
    const lambdaLayersConstruct = new LambdaLayersConstruct(this, 'lambda-layers');

    // alert handler lambda
    const lambdaAlertHandler = new AlertLambdaConstruct(this, 'alert-lambda-construct', {
      role: alertHandlerRole,
      functionName: WebsiteRolesStack.websiteLambdaNameConfig.alertHandler,
      vpc,
      subnets: vpc.privateSubnets,
      securityGroups: [ securityGroup ],
      layers: [ lambdaLayersConstruct.baseLayer, lambdaLayersConstruct.pgLayer ],
      environmentVariables: {
        DDB_TABLE_NAME_HIGH: props.ddbTableArns!.high.resourceName!,
        DDB_TABLE_NAME_REGULAR: props.ddbTableArns!.regular.resourceName!,
        DOWNSTREAM_FUNCTION_NAME_REGULAR_ALL: props.processingAccountsFunctionNamesAllAlerts.regular,
        DOWNSTREAM_FUNCTION_NAME_REGULAR_SELECTED: props.processingAccountsFunctionNamesSelectedAlerts.regular,
        DOWNSTREAM_FUNCTION_NAME_HIGH_ALL: props.processingAccountsFunctionNamesAllAlerts.high,
        DOWNSTREAM_FUNCTION_NAME_HIGH_SELECTED: props.processingAccountsFunctionNamesSelectedAlerts.high,
        DOWNSTREAM_FUNCTION_NAME_DASHBOARD: WebsiteRolesStack.websiteLambdaNameConfig.dashboardWriter,
        RDS_DATABASE_SECRET_NAME: props.rdsDatabaseSecretName,
        SHARED_RESOURCES_CROSS_ACCOUNT_ROLE: this.formatArn(props.sharedServicesCrossAccountRole),
        HIGH_PROCESSING_ACCOUNT_ROLE: this.formatArn(props.processingAccountsRoleNames.high),
        REGULAR_PROCESSING_ACCOUNT_ROLE: this.formatArn(props.processingAccountsRoleNames.regular),
        FAILOVER_BUCKET_NAME: failoverBucket.bucket.bucketName,
        FAILOVER_QUEUE_URL_REGULAR: props.ddbFailoverQueueUrlRegular,
        FAILOVER_QUEUE_URL_HIGH: props.ddbFailoverQueueUrlHigh,
        IS_PRIMARY_REGION: props.primaryRegion === this.region,
        WATCHDOG_FUNCTION_NAME: WatchdogRolesStack.getLambdaFunctionName(),
        RDS_DATABASE: props.appDatabaseName,
      },
    });
    const lambdaDestination = new s3n.LambdaDestination(lambdaAlertHandler.lambdaFunction);
    lambdaDestination.bind(this, websiteBucket.bucket);
    websiteBucket.bucket.addObjectCreatedNotification(lambdaDestination, {
      prefix: 'api/warnings/',
    });
    websiteBucket.bucket.grantRead(alertHandlerRole);
    failoverBucket.bucket.grantWrite(alertHandlerRole);

    // SQS FIFO queue
    const fifoDashboardMapReduceQueueConstruct = new SqsQueueConstruct(this, 'fifo-dashboards-map-reduce', {
      queueProps: {
        queueName: 'dashboard-mr',
        description: 'Dashboard map/reduce queue',
        visibilityTimeout: Duration.minutes(5),
        retentionPeriod: Duration.days(7),
        fifo: true,
      },
      keyProps: {
        alias: 'dashboard-mr-cmk',
        description: 'CMK for dashboard map/reduce queue',
      },
    });

    // dashboard writer lambda
    const dashboardWriterRole = iam.Role.fromRoleArn(this, 'dashboard-writer-role',
      this.formatArn(WebsiteRolesStack.getLambdaRoleArnComponents(this.region, this.account, 'dashboardWriter')),
      {
        mutable: true,
      }) as iam.Role;
    dashboardWriterRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sts:AssumeRole',
      ],
      resources: [sharedServicesCrossAccountRoleArn],
    }));
    const lambdaDashboardWriter = new LambdaConstruct(this, 'lambda-5a', {
      entry: 'dashboard-writer',
      handler: 'handler.handler',
      description: 'Invoked asynchronously from Lambda 1.',
      functionName: WebsiteRolesStack.websiteLambdaNameConfig.dashboardWriter,
      environment: {
        LOG_LEVEL: LambdaLogLevel,
        SECMGR_SECRETID_RDSCREDENTIALS: props.rdsDatabaseSecretName,
        STS_ROLEARN_SECRETSMANAGER: this.formatArn(props.sharedServicesCrossAccountRole),
        SQS_QUEUEURL_REDUCER: fifoDashboardMapReduceQueueConstruct.queue.queueUrl,
        RDS_DATABASE: props.appDatabaseName,
      },
      layers: [ lambdaLayersConstruct.baseLayer, lambdaLayersConstruct.pgLayer ],
      memorySize: 2048,
      timeout: Duration.minutes(5),
      vpc,
      vpcSubnets: {
        subnets: vpc.privateSubnets,
      },
      securityGroups: [ securityGroup ],
      role: dashboardWriterRole,
    });

    lambdaDashboardWriter.lambdaFunction.grantInvoke(lambdaAlertHandler.lambdaFunction);
    fifoDashboardMapReduceQueueConstruct.queue.grantSendMessages(dashboardWriterRole);

    // dashboard reducer lambda
    const dashboardReducerRole = iam.Role.fromRoleArn(this, 'dashboard-reducer-role',
      this.formatArn(WebsiteRolesStack.getLambdaRoleArnComponents(this.region, this.account, 'dashboardReducer')),
      {
        mutable: true,
      }) as iam.Role;
    dashboardReducerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sts:AssumeRole',
      ],
      resources: [sharedServicesCrossAccountRoleArn],
    }));
    const lambdaDashboardReducer = new LambdaConstruct(this, 'lambda-5b', {
      entry: 'dashboard-reducer',
      handler: 'handler.handler',
      description: 'Process FIFO queue to reduce dashboard files.',
      functionName: WebsiteRolesStack.websiteLambdaNameConfig.dashboardReducer,
      environment: {
        LOG_LEVEL: LambdaLogLevel,
        SECMGR_SECRETID_RDSCREDENTIALS: props.rdsDatabaseSecretName,
        STS_ROLEARN_SECRETSMANAGER: this.formatArn(props.sharedServicesCrossAccountRole),
        S3_BUCKET_DASHBOARD: websiteBucket.bucket.bucketName,
        S3_PREFIX_DASHBOARD: 'api31/dashboard/',
        RDS_DATABASE: props.appDatabaseName,
      },
      layers: [ lambdaLayersConstruct.baseLayer, lambdaLayersConstruct.pgLayer ],
      memorySize: 2048,
      timeout: Duration.minutes(5),
      vpc,
      vpcSubnets: {
        subnets: vpc.privateSubnets,
      },
      securityGroups: [ securityGroup ],
      role: dashboardReducerRole,
    });
    websiteBucket.bucket.grantReadWrite(dashboardReducerRole);
    lambdaDashboardReducer.lambdaFunction.addEventSource(new SqsEventSource(fifoDashboardMapReduceQueueConstruct.queue, {
      batchSize: 5,
      reportBatchItemFailures: true,
      enabled: true,
    }));

    // cmk for SNS server side encryption
    const topicCmk = new Key(this, 'sns-topic-sse', {
      alias: `sns-failover-${this.region}`,
      description: 'CMK for SNS topic encryption',
      enableKeyRotation: true,
      enabled: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // sns topic for failover bucket email alerts
    const topic = new sns.Topic(this, 'sns-topic', {
      topicName: 'NewFileInFailoverBucket',
      masterKey: topicCmk,
    });
    topic.grantPublish(new iam.ServicePrincipal('events.amazonaws.com'));
    if (props.notificationEmailAddress) {
      new sns.Subscription(this, 'email-subscription', {
        topic: topic,
        endpoint: props.notificationEmailAddress,
        protocol: sns.SubscriptionProtocol.EMAIL,
      });
    }
    const snsDestination = new s3n.SnsDestination(topic);
    snsDestination.bind(this, failoverBucket.bucket);
    failoverBucket.bucket.addObjectCreatedNotification(snsDestination);
  }
}