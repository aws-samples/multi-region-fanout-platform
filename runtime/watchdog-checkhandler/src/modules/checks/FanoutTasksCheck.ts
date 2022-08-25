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
import {
  CheckEventPayload,
  CheckResult,
  CheckResultStatus,
  CheckStep,
} from '../CheckInterface';
import { BaseCheck } from '../checks/BaseCheck';

/**
 * Checks that at least one batch has been written in the DDB
 */
export class FanoutTasksCheck extends BaseCheck {
  private ddb: any;
  private ddbRegular: any;
  private ddbHigh: any;
  private ddbTable: string;
  private ddbTableRegular: string;
  private ddbTableHigh: string;

  constructor(
    ddbRegular: any,
    ddbHigh: any,
    ddbTableRegular: string,
    ddbTableHigh: string,
    lambda: any,
    FailoverLambdaArn: string,
  ) {
    super(lambda, FailoverLambdaArn);
    this.ddb = ddbRegular;
    this.ddbRegular = ddbRegular;
    this.ddbHigh = ddbHigh;
    this.name = 'AlertBatchesCheck';
    this.description = 'Put Description Here';
    this.stepId = CheckStep.ALERT_BATCHES_CHECK;
    this.ddbTableRegular = ddbTableRegular;
    this.ddbTableHigh = ddbTableHigh;
    this.ddbTable = ddbTableRegular;
  }
  /**
   * Runs 2 DDB query to fetch a count for PNP1 and PNP2 batches
   **/
  public run = async (event: CheckEventPayload): Promise<CheckResult> => {
    this.logger.debug({
      message:
        'FanoutTasksCheck: Running check for FanoutTasksCheck alert ' +
        event.alertInformation.alertId,
      data: event,
    });

    this.ddbTable = event.alertInformation.severity == 'Extreme' ? this.ddbTableHigh : this.ddbTableRegular;
    this.ddb = event.alertInformation.severity == 'Extreme' ? this.ddbHigh : this.ddbRegular;

    // DDB Query for PNP1
    const params_pnp1 = {
      TableName: this.ddbTable,
      KeyConditionExpression: '#id = :id',
      ExpressionAttributeNames: {
        '#id': 'alertId',
      },
      ExpressionAttributeValues: {
        ':id': event.alertInformation.alertId + ':PNP1',
      },
      Limit: 10,
    };

    // DDB Query for PNP2
    const params_pnp2 = {
      TableName: this.ddbTable,
      KeyConditionExpression: '#id = :id',
      ExpressionAttributeNames: {
        '#id': 'alertId',
      },
      ExpressionAttributeValues: {
        ':id': event.alertInformation.alertId + ':PNP2',
      },
      Limit: 10,
    };

    // Run querys
    const result_pnp1 = await this.ddb.query(params_pnp1).promise();
    const result_pnp2 = await this.ddb.query(params_pnp2).promise();

    this.logger.debug({
      message:
        'FanoutTasksCheck: Run both DDB queries ' +
        event.alertInformation.alertId,
      data: {
        result_pnp1_count: result_pnp1.Count,
        params_pnp1: params_pnp1,
        result_pnp2_count: result_pnp2.Count,
        params_pnp2: params_pnp2,
      },
    });

    // Expect exactly one item per query
    if (result_pnp1.Count > 0 && result_pnp2.Count > 0) {
      this.logger.debug({
        message:
          'FanoutTasksCheck: both item present PASS ' +
          event.alertInformation.alertId,
      });
      return new Promise((resolve, reject) => {
        resolve({
          result: CheckResultStatus.PASS,
          alertInformation: { ...event.alertInformation },
        });
      });
    } else {
      this.logger.debug({
        message:
          'FanoutTasksCheck: not both item present FAIL ' +
          event.alertInformation.alertId,
      });
      return new Promise((resolve, reject) => {
        resolve({
          result: this.evaluateRetryOrAction(event),
          alertInformation: { ...event.alertInformation },
        });
      });
    }
  };
}
