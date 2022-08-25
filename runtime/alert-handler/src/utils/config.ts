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
export interface LambdaConfiguration {
  /**
   * Gets or sets the name of the DynamoDB table
   * to protocol operations.
   */
  ddbTableNameHigh: string;
  /**
   * Gets or sets the name of the DynamoDB table
   * to protocol operations.
   */
  ddbTableNameRegular: string;

  /**
   * Gets or sets the Lambda function name for step 2 which
   * handles mylocation=true.
   */
  step2FunctionNameAllAlertsRegular: string;
  /**
   * Gets or sets the Lambda function name for step 2 which
   * handles mylocation=false.
   */
  step2FunctionNameSelectedAlertsRegular: string;

  /**
   * Gets or sets the Lambda function name for step 2 which
   * handles mylocation=true and prio HIGH.
   */
  step2FunctionNameAllAlertsHigh: string;
  /**
    * Gets or sets the Lambda function name for step 2 which
    * handles mylocation=false and prio HIGH.
    */
  step2FunctionNameSelectedAlertsHigh: string;

  /**
   * Gets or sets the notification platform to handle.
   */
  notificationPlatform: string;

  /**
   * Gets or sets the secretId for RDS credentials.
   */
  secretIdRdsCredentials: string;

  /**
   * Gets or sets the RDS primary endpoint.
   */
  rdsHostWrite: string;

  /**
   * Gets or sets the RDS read-only endpoint.
   */
  rdsHostReadOnly: string;

  /**
   * Gets or sets the RDS port
   */
  rdsPort: number;

  /**
   * Gets or sets the RDS database name
   */
  rdsDatabase: string;

  queryWkt: string;
  querySHN: string;
  queryWarnCells: string;
  queueDdbFailureRegular: string;
  queueDdbFailureHigh: string;
  regionId: string;
  notificationOtherPlatforms: string[];

  s3TagHash: string;
  s3TagHashJson: string;
  s3TagProvider: string;
  s3TagProcessed: string;

  // Role Arns
  stsRoleArnSecretsManager: string;
  stsRoleArnStep2High: string;
  stsRoleArnStep2Regular: string;

  hashBitToProcess: string;

  step5FunctionName: string;

  s3Bucket3R: string;

  watchdogFunctionName: string;
}

export const loadConfig = (): LambdaConfiguration => {
  return {
    ddbTableNameHigh: process.env.DDB_TABLE_NAME_HIGH,
    ddbTableNameRegular: process.env.DDB_TABLE_NAME_REGULAR,
    step2FunctionNameAllAlertsRegular: process.env.LAMBDA_STEP2_ALL_REGULAR,
    step2FunctionNameSelectedAlertsRegular: process.env.LAMBDA_STEP2_SELECTED_REGULAR,
    step2FunctionNameAllAlertsHigh: process.env.LAMBDA_STEP2_ALL_HIGH,
    step2FunctionNameSelectedAlertsHigh: process.env.LAMBDA_STEP2_SELECTED_HIGH,
    notificationPlatform: process.env.APP_PLATFORM_NOTIFICATIONS,
    notificationOtherPlatforms: (process.env.APP_PLATFORMSOTHER_NOTIFICATIONS ?? '').split(';'),
    secretIdRdsCredentials: process.env.SECMGR_SECRETID_RDSCREDENTIALS,
    rdsHostWrite: process.env.RDS_HOST_PRIMARY,
    rdsHostReadOnly: process.env.RDS_HOST_READONLY,
    rdsPort: process.env.RDS_PORT ? parseInt(process.env.RDS_PORT, 10) : undefined,
    rdsDatabase: process.env.RDS_DATABASE,
    queryWkt: process.env.APP_QUERY_WKT,
    querySHN: process.env.APP_QUERY_SHN,
    queryWarnCells: process.env.APP_QUERY_WARNCELLS,
    queueDdbFailureRegular: process.env.SQS_QUEUEURL_DDBFAILURE_REGULAR,
    queueDdbFailureHigh: process.env.SQS_QUEUEURL_DDBFAILURE_HIGH,
    regionId: process.env.APP_REGIONID,
    s3TagHash: process.env.APP_S3TAG_HASH,
    s3TagHashJson: process.env.APP_S3TAG_HASHJSON,
    s3TagProvider: process.env.APP_S3TAG_PROVIDER,
    s3TagProcessed: process.env.APP_S3TAG_PROCESSED,
    stsRoleArnSecretsManager: process.env.STS_ROLEARN_SECRETSMANAGER,
    stsRoleArnStep2High: process.env.STS_ROLEARN_STEP2_HIGH,
    stsRoleArnStep2Regular: process.env.STS_ROLEARN_STEP2_REGULAR,
    hashBitToProcess: process.env.APP_HASHBIT,
    step5FunctionName: process.env.LAMBDA_STEP5,
    s3Bucket3R: process.env.S3_BUCKET_FAIL,
    watchdogFunctionName: process.env.WATCHDOG_FUNCTION_NAME,
  };
};
