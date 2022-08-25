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
import { ArnComponents } from 'aws-cdk-lib';

export type CriticalityLevel = 'high' | 'regular';

export enum RequiredObjectTags {
  ALERT_ID = 'Alert_ID',
  HASH = 'Hash',
  PROVIDER = 'Provider',
  SEVERITY = 'Severity',
  JSON_HASH = 'JSON_Hash',
  AWS_PROCESSED = 'AWS_Processed',
}

export enum NotificationServiceProvider {
  PNP1 = 'pnp1',
  PNP2 = 'pnp2',
}

export interface CriticalityClassContext {
  class: CriticalityLevel,
  accountIdProcessing: string,
  accountIdFanoutPnp1: string,
  accountIdFanoutPnp2: string
}

export interface EnvironmentContext {
  stage: string,
  regions: string[],
  accountIdWebsite: string,
  accountIdSharedServices: string,
  criticalityClasses: CriticalityClassContext[],
  primaryRegion: string,
}

export interface ProcessEnv {
  [key: string]: string | undefined
}

export type NotificationService = 'pnp1' | 'pnp2';

export type ProcessingLambdaNameComponents = {
  [service in CriticalityLevel]: string
};

export type ProcessingAccountRoleArns = {
  [service in CriticalityLevel]: ArnComponents
};

export type DynamodbArns = {
  [service in CriticalityLevel]: ArnComponents
};

export const LambdaLogLevel = 'debug';