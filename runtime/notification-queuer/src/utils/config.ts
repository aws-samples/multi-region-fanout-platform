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
   * to protocol alert operations for watchdog.
   */
  ddbTableAlerts: string;

  /**
   * Gets or sets the name of the DynamoDB table
   * to protocol alert operations for watchdog.
   */
  ddbTableAlertBatches: string;

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

  rdsDatabase: string | undefined;

  sqsAllFcm: string;
  sqsAllApns: string;
  sqsSelectedFcm: string;
  sqsSelectedApns: string;
  s3BucketAllChunks: string;

  flowControl: string;

  // Role ARNs
  stsRoleArnSecretsManager: string;
  stsRoleArnDynamoDb: string;
}

export const loadConfig = (): LambdaConfiguration => {
  return {
    ddbTableAlerts: process.env.DDB_TABLE_ALERTS,
    ddbTableAlertBatches: process.env.DDB_TABLE_ALERTBATCHES,
    secretIdRdsCredentials: process.env.SECMGR_SECRETID_RDSCREDENTIALS,
    rdsHostWrite: process.env.RDS_HOST_PRIMARY,
    rdsHostReadOnly: process.env.RDS_HOST_READONLY,
    rdsPort: process.env.RDS_PORT ? parseInt(process.env.RDS_PORT, 10) : 5432,
    sqsAllFcm: process.env.SQS_QUEUEURL_ALLFCM,
    sqsAllApns: process.env.SQS_QUEUEURL_ALLAPNS,
    sqsSelectedFcm: process.env.SQS_QUEUEURL_SELECTEDFCM,
    sqsSelectedApns: process.env.SQS_QUEUEURL_SELECTEDAPNS,
    s3BucketAllChunks: process.env.S3_BUCKET_ALLCHUNKS,
    flowControl: process.env.APP_FLOWCONTROL,
    stsRoleArnSecretsManager: process.env.STS_ROLEARN_SECRETSMANAGER,
    stsRoleArnDynamoDb: process.env.STS_ROLEARN_DYNAMODB,
    rdsDatabase: process.env.RDS_DATABASE,
  };
};
