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
import { Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { LambdaLogLevel, NotificationServiceProvider, RequiredObjectTags } from '../../../../types/app-configuration';
import { AlertLambdaEnvironmentVariables } from '../types';
import { LambdaConstruct } from '../../../constructs/lambda-construct';

export class AlertLambdaConstructProps {
  role: iam.IRole;
  vpc: ec2.IVpc;
  subnets: ec2.ISubnet[];
  securityGroups: ec2.ISecurityGroup[];
  layers: lambda.ILayerVersion[];
  functionName: string;
  memorySize?: number;
  timeout?: Duration;
  environmentVariables: AlertLambdaEnvironmentVariables;
}

export class AlertLambdaConstruct extends Construct {

  public readonly lambdaFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: AlertLambdaConstructProps) {
    super(scope, id);
    const appQueryMkt = '/* TODO: Implement query for MKT */';
    const appQueryShn = '/* TODO: Implement query for SHN */';
    // eslint-disable-next-line max-len
    const appQueryWarnCells = 'select zcurve_gem from mrfp_ops.geos geo where st_intersects(geo.wkb_geometry,  (SELECT ST_Union(wkb_geometry) FROM mrfp_ops.warncells w WHERE warncell_id = ANY($1::int[])))';

    const lambdaConstruct = new LambdaConstruct(this, 'lambda1', {
      entry: 'alert-handler',
      handler: 'handler.handler',
      description: 'Step 1: triggers on S3 events and triggers determination of push tokens.',
      functionName: props.functionName,
      role: props.role,
      layers: props.layers,
      memorySize: props.memorySize ?? 512,
      timeout: props.timeout ?? Duration.minutes(5),
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.subnets,
      },
      securityGroups: props.securityGroups,
      environment: {
        LOG_LEVEL: LambdaLogLevel,
        DDB_TABLE_NAME_HIGH: props.environmentVariables.DDB_TABLE_NAME_HIGH,
        DDB_TABLE_NAME_REGULAR: props.environmentVariables.DDB_TABLE_NAME_REGULAR,
        LAMBDA_STEP2_ALL_REGULAR: props.environmentVariables.DOWNSTREAM_FUNCTION_NAME_REGULAR_ALL,
        LAMBDA_STEP2_SELECTED_REGULAR: props.environmentVariables.DOWNSTREAM_FUNCTION_NAME_REGULAR_SELECTED,
        LAMBDA_STEP2_ALL_HIGH: props.environmentVariables.DOWNSTREAM_FUNCTION_NAME_HIGH_ALL,
        LAMBDA_STEP2_SELECTED_HIGH: props.environmentVariables.DOWNSTREAM_FUNCTION_NAME_HIGH_SELECTED,
        LAMBDA_STEP5: props.environmentVariables.DOWNSTREAM_FUNCTION_NAME_DASHBOARD,
        SECMGR_SECRETID_RDSCREDENTIALS: props.environmentVariables.RDS_DATABASE_SECRET_NAME,
        STS_ROLEARN_SECRETSMANAGER: props.environmentVariables.SHARED_RESOURCES_CROSS_ACCOUNT_ROLE,
        STS_ROLEARN_STEP2_HIGH: props.environmentVariables.HIGH_PROCESSING_ACCOUNT_ROLE,
        STS_ROLEARN_STEP2_REGULAR: props.environmentVariables.REGULAR_PROCESSING_ACCOUNT_ROLE,
        S3_BUCKET_FAIL: props.environmentVariables.FAILOVER_BUCKET_NAME,
        SQS_QUEUEURL_DDBFAILURE_REGULAR: props.environmentVariables.FAILOVER_QUEUE_URL_REGULAR,
        SQS_QUEUEURL_DDBFAILURE_HIGH: props.environmentVariables.FAILOVER_QUEUE_URL_HIGH,
        APP_REGIONID: props.environmentVariables.IS_PRIMARY_REGION ? '1' : '2',
        APP_PLATFORM_NOTIFICATIONS: NotificationServiceProvider.PNP1,
        APP_PLATFORMSOTHER_NOTIFICATIONS: NotificationServiceProvider.PNP2,
        APP_QUERY_MKT: appQueryMkt,
        APP_QUERY_SHN: appQueryShn,
        APP_QUERY_WARNCELLS: appQueryWarnCells,
        APP_S3TAG_HASH: RequiredObjectTags.HASH,
        APP_S3TAG_HASHJSON: RequiredObjectTags.JSON_HASH,
        APP_S3TAG_PROVIDER: RequiredObjectTags.PROVIDER,
        APP_S3TAG_PROCESSED: RequiredObjectTags.AWS_PROCESSED,
        WATCHDOG_FUNCTION_NAME: props.environmentVariables.WATCHDOG_FUNCTION_NAME,
        RDS_DATABASE: props.environmentVariables.RDS_DATABASE,
      },
    });

    this.lambdaFunction = lambdaConstruct.lambdaFunction;
  }
}