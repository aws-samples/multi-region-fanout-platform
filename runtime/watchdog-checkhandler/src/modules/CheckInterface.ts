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
export interface Check {
  name: String; //property
  description: String;
  getFollowUp(): number;
  run(event: CheckEventPayload): Promise<CheckResult>; //method
  takeAction(event: CheckEventPayload): Promise<boolean>; //method
  getStepId(): CheckStep;
}

export interface CheckEventPayload {
  lastCheckStep: CheckStep;
  lastCheckStatus?: CheckResultStatus;
  currentStepRetryCounter: number;
  invocationCounter: number;
  nextCheckStep: CheckStep;
  followUpTime: number;
  alertInformation: AlertInformation;
  done: boolean;
}

export interface AlertInformation {
  alertId?: string;
  alertS3BucketName: string;
  alertS3Key: string;
  severity?: string;
  provider?: string;
}

export interface CheckResult {
  result: CheckResultStatus;
  alertInformation: AlertInformation;
}

export enum CheckStep {
  NONE,
  INCOMING_ALERT_CHECK,
  ALERT_TASKS_GIS_CHECK,
  ALERT_BATCHES_CHECK,
}

export enum CheckResultStatus {
  PASS = 'PASS',
  ACTION = 'ACTION',
  RETRY = 'RETRY',
  ABORT = 'ABORT',
}
