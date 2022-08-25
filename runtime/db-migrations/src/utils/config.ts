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
  dbPort: number;
  dbName: string;
  dbNameRoot: string;
  configBucketName: string;
  secretsManagerRootCredArn: string;
  secretsManagerAdminCredArn: string;
  secretsManagerUserCredArn: string;
  dbUserAdmin: string;
  dbRegion: string;
  ssmHostPrimary: string;
  dbUserApp: string;
}

export const loadConfig = (): LambdaConfiguration => {
  return {
    dbPort: parseInt(process.env.RDS_PORT, 10),
    dbName: process.env.RDS_DATABASE,
    dbNameRoot: process.env.RDS_DATABASE_ROOT,
    configBucketName: process.env.S3_CONFIG_BUCKET,
    secretsManagerRootCredArn: process.env.SECMGR_DBCREDROOT_ARN,
    secretsManagerAdminCredArn: process.env.SECMGR_DBCREDADMIN_ARN,
    secretsManagerUserCredArn: process.env.SECMGR_DBCREDUSER_ARN,
    dbUserAdmin: process.env.RDS_USER_ADMIN,
    dbRegion: process.env.RDS_AWSREGION,
    ssmHostPrimary: process.env.SSM_RDSPRIMARY_HOST,
    dbUserApp: process.env.RDS_USER_APP,
  };
};
