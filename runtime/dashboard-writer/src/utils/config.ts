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

  // Role ARNs
  stsRoleArnSecretsManager: string;

  queueUrlReducer: string;
}

export const loadConfig = (): LambdaConfiguration => {
  return {
    secretIdRdsCredentials: process.env.SECMGR_SECRETID_RDSCREDENTIALS,
    rdsHostWrite: process.env.RDS_HOST_PRIMARY,
    rdsHostReadOnly: process.env.RDS_HOST_READONLY,
    rdsPort: process.env.RDS_PORT ? parseInt(process.env.RDS_PORT, 10) : 5432,
    stsRoleArnSecretsManager: process.env.STS_ROLEARN_SECRETSMANAGER,
    queueUrlReducer: process.env.SQS_QUEUEURL_REDUCER,
    rdsDatabase: process.env.RDS_DATABASE,
  };
};
