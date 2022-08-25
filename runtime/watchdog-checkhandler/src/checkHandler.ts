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
import { IncomingAlertCheck } from './modules/checks/IncomingAlertCheck';
import { AlertTasksGisCheck } from './modules/checks/AlertTasksGisCheck';
import { FanoutTasksCheck } from './modules/checks/FanoutTasksCheck';
import { BaseCheck } from './modules/checks/BaseCheck';
import { Check } from './modules/CheckInterface';
import { CheckEventParser } from './modules/EventParser';
import { FollowUp } from './modules/FollowUp';
import { CheckRunner } from './modules/CheckRunner';
import { LoggingService } from './utils/logger';
import * as aws from 'aws-sdk';

const logger = new LoggingService();
const sts = new aws.STS();
const sqs = new aws.SQS();
const s3 = new aws.S3();

export const handler = async (event: any, context: any) => {
  // DynamoDB with fresh credentails
  const ddbRegular = new aws.DynamoDB.DocumentClient({
    ...await assumeRole(process.env.DYNAMODB_READ_ROLE_REGULAR),
    region: process.env.DYNAMODB_REGION,
  });
  const ddbHigh = new aws.DynamoDB.DocumentClient({
    ...await assumeRole(process.env.DYNAMODB_READ_ROLE_HIGH),
    region: process.env.DYNAMODB_REGION,
  });
  const lambda = new aws.Lambda();

  logger.debug({
    message: 'Watchdog:handler: Entering check',
    data: { event: event },
  });

  // Parse Event, determine check to run
  const parser = new CheckEventParser.Parser(logger);
  const checkEventPayload = parser.parseEvent(event);
  let alertID = 'unknown';

  if (checkEventPayload == null) {
    logger.error({ message: 'Watchdog:handler: Error parsing event' });
    return;
  } else {
    alertID =
      checkEventPayload.alertInformation.alertId != undefined
        ? checkEventPayload.alertInformation.alertId
        : 'unknown';
    logger.debug({
      message: 'Watchdog:handler: Parsed event for alert ' + alertID,
      data: { payload: checkEventPayload },
    });
  }

  //Set up checkers
  const checks: Array<Check> = [
    new IncomingAlertCheck(
      s3, // S3 SDK
      process.env.INCOMING_ALERT_REQUIRED_TAGS.split(','), // List of required tags for S3 Object,
      process.env.INCOMING_ALERT_ID_TAG, // Tag that contains the Alert ID
      process.env.INCOMING_ALERT_HASH_TAG,
      process.env.INCOMING_ALERT_SEVERITY_TAG,
      process.env.INCOMING_ALERT_PROVIDER_TAG,
      lambda, // Lambda SDK
      process.env.FAILOVER_LAMBDA_NAME,
      process.env.PROCESSING_ALERT_BUCKET_NAME,
      process.env.HASH_LAST_BIT,
    ),
    new AlertTasksGisCheck(
      ddbRegular,
      ddbHigh,
      process.env.DYNAMODB_TABLE_ALERTTASKS_REGULAR,
      process.env.DYNAMODB_TABLE_ALERTTASKS_HIGH,
      lambda, // Lambda SDK
      process.env.FAILOVER_LAMBDA_NAME,
    ),
    new FanoutTasksCheck(
      ddbRegular,
      ddbHigh,
      process.env.DYNAMODB_TABLE_FANOUTTASKS_REGULAR,
      process.env.DYNAMODB_TABLE_FANOUTTASKS_HIGH,
      lambda, // Lambda SDK
      process.env.FAILOVER_LAMBDA_NAME,
    ),
  ];

  //Set the logger in the checks
  for (let check of checks) {
    if (check instanceof BaseCheck) 
      check.setLogger(logger);
  }
  

  // Run Check
  const checkRunner = new CheckRunner(checks);
  const checkRunnerResult = await checkRunner.run(checkEventPayload);

  logger.debug({
    message: 'Watchdog:handler: check runner is done for alert ' + alertID,
    data: { result: checkRunnerResult },
  });

  // Follow up needed?
  if (checkRunnerResult.followUpTime > 0) {
    logger.debug({
      message: 'Watchdog:handler: Requeuing is necessary for alert ' + alertID,
    });
    // Create Follow up
    const followUp: FollowUp = new FollowUp(sqs);
    await followUp.create(checkRunnerResult, checkRunnerResult!.followUpTime);
    logger.debug({
      message: 'Watchdog:handler: Requeuing reqeuing done for alert ' + alertID,
    });
  } else {
    logger.debug({
      message:
        'Watchdog:handler: Requeuing is not necessary, we are done for alert ' +
        alertID,
    });
  }
};

const assumeRole = async (arn: string) => {
  const sts_params = {
    RoleArn: arn,
    RoleSessionName: 'Watchdog',
    DurationSeconds: 900,
  };
  const assumedDDBReadRole = await sts.assumeRole(sts_params).promise();
  logger.debug({ message: 'Watchdog:handler: Assumed necessary role' });

  return {
    accessKeyId: assumedDDBReadRole.Credentials.AccessKeyId,
    secretAccessKey: assumedDDBReadRole.Credentials.SecretAccessKey,
    sessionToken: assumedDDBReadRole.Credentials.SessionToken,
  };
};
