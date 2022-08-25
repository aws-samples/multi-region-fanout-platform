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

export class AlertTasksGisCheck extends BaseCheck {
  private ddb: any;
  private ddbRegular: any;
  private ddbHigh: any;
  private ddbTableRegular: string;
  private ddbTableHigh: string;
  private ddbTable: string;

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
    this.name = 'AlertTasksGisCheck';
    this.description = 'Put Description Here';
    this.stepId = CheckStep.ALERT_TASKS_GIS_CHECK;
    this.ddbTableRegular = ddbTableRegular;
    this.ddbTableHigh = ddbTableHigh;
    this.ddbTable = ddbTableRegular;
  }

  public run = async (event: CheckEventPayload): Promise<CheckResult> => {
    this.logger.debug({ message: 'AlertTasksGisCheck: Running check for alert ' + event.alertInformation.alertId, data:event });
    
    this.ddbTable = event.alertInformation.severity == 'Extreme' ? this.ddbTableHigh : this.ddbTableRegular;
    this.ddb = event.alertInformation.severity == 'Extreme' ? this.ddbHigh : this.ddbRegular;

    // DDB Query for PNP2
    const params_pnp2_all = {
      TableName: this.ddbTable,
      KeyConditionExpression: '#id = :id AND #p = :platform',
      ExpressionAttributeNames: {
        '#id': 'alertId',
        '#p': 'platform',
      },
      ExpressionAttributeValues: {
        ':id': event.alertInformation.alertId,
        ':platform': 'pnp2_all',
      },
    };

    // DDB Query for PNP2
    const params_pnp2_selected = {
      TableName: this.ddbTable,
      KeyConditionExpression: '#id = :id AND #p = :platform',
      ExpressionAttributeNames: {
        '#id': 'alertId',
        '#p': 'platform',
      },
      ExpressionAttributeValues: {
        ':id': event.alertInformation.alertId,
        ':platform': 'pnp2_selected',
      },
    };

    // Run querys (this could be done in parallel)
    const result_pnp2_all = await this.ddb.query(params_pnp2_all).promise();
    const result_pnp2_selected = await this.ddb.query(params_pnp2_selected).promise();
    
    this.logger.debug({ message: 'AlertTasksGisCheck: Run both DDB queries ' + event.alertInformation.alertId, data:{ result_pnp2_all_count: result_pnp2_all.Count, params_pnp2_all: params_pnp2_all, result_pnp2_selected_count: result_pnp2_selected.Count, params_pnp2_selected: params_pnp2_selected } });

    // Expect exactly one item per query
    if (result_pnp2_all.Count == 1 && result_pnp2_selected.Count == 1) {
      this.logger.debug({ message: 'AlertTasksGisCheck: both item present PASS ' + event.alertInformation.alertId });

      return new Promise((resolve, reject) => {
        resolve({
          result: CheckResultStatus.PASS,
          alertInformation: { ...event.alertInformation },
        });
      });
    } else {
      this.logger.debug({ message: 'AlertTasksGisCheck: not both item present FAIL ' + event.alertInformation.alertId });
      
      return new Promise((resolve, reject) => {
        resolve({
          result: this.evaluateRetryOrAction(event),
          alertInformation: { ...event.alertInformation },
        });
      });
    }
  };
}
