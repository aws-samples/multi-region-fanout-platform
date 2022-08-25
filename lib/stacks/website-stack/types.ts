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
export class AlertLambdaEnvironmentVariables {
  DDB_TABLE_NAME_HIGH: string;
  DDB_TABLE_NAME_REGULAR: string;
  DOWNSTREAM_FUNCTION_NAME_REGULAR_ALL: string;
  DOWNSTREAM_FUNCTION_NAME_REGULAR_SELECTED: string;
  DOWNSTREAM_FUNCTION_NAME_HIGH_ALL: string;
  DOWNSTREAM_FUNCTION_NAME_HIGH_SELECTED: string;
  DOWNSTREAM_FUNCTION_NAME_DASHBOARD: string;
  RDS_DATABASE_SECRET_NAME: string;
  SHARED_RESOURCES_CROSS_ACCOUNT_ROLE: string;
  HIGH_PROCESSING_ACCOUNT_ROLE: string;
  REGULAR_PROCESSING_ACCOUNT_ROLE: string;
  FAILOVER_BUCKET_NAME: string;
  FAILOVER_QUEUE_URL_REGULAR: string;
  FAILOVER_QUEUE_URL_HIGH: string;
  IS_PRIMARY_REGION: boolean;
  WATCHDOG_FUNCTION_NAME: string;
  RDS_DATABASE: string;
}

export type WebsiteLambdaNameConfig = {
  [lambdaType in LambdaType]: string
};

export type LambdaType = 'alertHandler' | 'dashboardWriter' | 'dashboardReducer';