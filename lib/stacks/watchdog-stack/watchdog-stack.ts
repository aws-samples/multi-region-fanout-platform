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
import { ArnComponents, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { SqsQueueConstruct } from '../../constructs/sqs-queue-construct';
import { WatchdogRolesStack } from './watchdog-roles-stack';
import { LambdaLogLevel, RequiredObjectTags } from '../../../types/app-configuration';
import { WebsiteRolesStack } from '../website-stack/website-roles-stack';
import { LambdaLayersConstruct } from '../../constructs/lambda-layers-construct';
import { LambdaConstruct } from '../../constructs/lambda-construct';

interface WatchdogStackProps extends StackProps {
  websiteAccountId: string;
  alertTableName: string;
  alertBatchesTableName: string;
  ddbCrossAccountRoleHigh: ArnComponents;
  ddbCrossAccountRoleRegular: ArnComponents;
  websiteBucketNameCrossRegion: string;
  websiteBucketNameSameRegion: string;
  alertHandlerFunctionNameSameRegion: string;
  isPrimaryRegion: boolean;
  crossRegion: string;
}

export class WatchdogStack extends Stack {

  constructor(scope: Construct, id: string, props: WatchdogStackProps) {
    super(scope, id, props);

    // SQS
    const followUpQueueName = 'follow-up';
    const followUpQueue = new SqsQueueConstruct(this, 'follow-up-queue', {
      queueProps: {
        queueName: followUpQueueName,
        visibilityTimeout: Duration.minutes(2),
      },
      keyProps: {
        alias: 'cmk-follow-up-queue',
        description: `CMK for SQS queue for ${followUpQueueName}`,
      },
    });

    // Lambda
    const requiredTag = [
      RequiredObjectTags.ALERT_ID,
      RequiredObjectTags.PROVIDER,
      RequiredObjectTags.SEVERITY,
      RequiredObjectTags.HASH,
      RequiredObjectTags.JSON_HASH,
      RequiredObjectTags.AWS_PROCESSED,
    ];
    const checkHandlerRole = iam.Role.fromRoleArn(this, 'check-handler-role',
      this.formatArn(WatchdogRolesStack.getLambdaRoleArnComponents(this.region, this.account)),
      { mutable: true },
    ) as iam.Role;
    checkHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [ 'sts:AssumeRole' ],
      resources: [ this.formatArn(props.ddbCrossAccountRoleHigh) ],
    }));
    checkHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [ 'sts:AssumeRole' ],
      resources: [ this.formatArn(props.ddbCrossAccountRoleRegular) ],
    }));
    checkHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:List*',
        's3:GetObject',
        's3:GetObjectTagging',
        's3:GetBucket*',
      ],
      resources: [
        `arn:aws:s3:::${props.websiteBucketNameCrossRegion}`,
        `arn:aws:s3:::${props.websiteBucketNameCrossRegion}/*`,
      ],
    }));
    checkHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction',
        'lambda:InvokeAsync',
      ],
      resources: [ `arn:aws:lambda:${this.region}:${this.account}:function:${WebsiteRolesStack.websiteLambdaNameConfig.alertHandler}` ],
    }));

    const lambdaLayersConstruct = new LambdaLayersConstruct(this, 'lambda-layers');

    const checkHandler = new LambdaConstruct(this, 'check-handler', {
      entry: 'watchdog-checkhandler',
      functionName: WatchdogRolesStack.getLambdaFunctionName(),
      handler: 'checkHandler.handler',
      role: checkHandlerRole,
      environment: {
        SQS_FOLLOW_UP_QUEUE: followUpQueue.queue.queueUrl,
        INCOMING_ALERT_REQUIRED_TAGS: requiredTag.join(','),
        INCOMING_ALERT_ID_TAG: RequiredObjectTags.ALERT_ID,
        INCOMING_ALERT_HASH_TAG: RequiredObjectTags.HASH,
        INCOMING_ALERT_SEVERITY_TAG: RequiredObjectTags.SEVERITY,
        INCOMING_ALERT_PROVIDER_TAG: RequiredObjectTags.PROVIDER,
        DYNAMODB_TABLE_ALERTTASKS_HIGH: props.alertTableName,
        DYNAMODB_TABLE_FANOUTTASKS_HIGH: props.alertBatchesTableName,
        DYNAMODB_READ_ROLE_HIGH: this.formatArn(props.ddbCrossAccountRoleHigh),
        DYNAMODB_TABLE_ALERTTASKS_REGULAR: props.alertTableName,
        DYNAMODB_TABLE_FANOUTTASKS_REGULAR: props.alertBatchesTableName,
        DYNAMODB_READ_ROLE_REGULAR: this.formatArn(props.ddbCrossAccountRoleRegular),
        DYNAMODB_REGION: props.crossRegion,
        PROCESSING_ALERT_BUCKET_NAME: props.websiteBucketNameCrossRegion,
        FAILOVER_ALERT_BUCKET_NAME: props.websiteBucketNameSameRegion,
        FAILOVER_LAMBDA_NAME: props.alertHandlerFunctionNameSameRegion,
        HASH_LAST_BIT: props.isPrimaryRegion ? '1' : '0',
        LOG_LEVEL: LambdaLogLevel,
      },
      layers: [ lambdaLayersConstruct.baseLayer ],
    });

    checkHandler.lambdaFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(followUpQueue.queue, {
        batchSize: 1,
        maxBatchingWindow: Duration.seconds(1),
        reportBatchItemFailures: true,
        enabled: true,
      }),
    );

    followUpQueue.queue.grantSendMessages(checkHandler.lambdaFunction);

    // alert handler execution role
    const alertHandlerRole = iam.Role.fromRoleArn(this, 'alert-handler-execution-role',
      this.formatArn(WebsiteRolesStack.getLambdaRoleArnComponents(this.region, this.account, 'alertHandler')),
      {
        mutable: true,
      }) as iam.Role;
    alertHandlerRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction',
        'lambda:InvokeAsync',
      ],
      resources: [
        checkHandler.lambdaFunction.functionArn,
      ],
    }));
  }
}