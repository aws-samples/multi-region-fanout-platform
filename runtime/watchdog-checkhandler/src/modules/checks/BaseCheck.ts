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
  Check,
  CheckEventPayload,
  CheckResult,
  CheckResultStatus,
  CheckStep,
} from '../CheckInterface';
import { LoggingServiceInterface } from '../LoggingServiceInterface';
import { DummyLogger } from '../DummyLogger';

export abstract class BaseCheck implements Check {
  protected logger: LoggingServiceInterface;

  /**
   * Override to give the Check a name
   */
  public name: String = '';

  /**
   * Override to give the Check a description
   */
  public description: String = '';

  /**
   * Override to give change the number of retires expected by evaluateRetryOrAction()
   */
  public retries: number = 3;

  /**
   * Override to give change the number returned by getFollowUp() which in turn is used to decided how long to wait in seconds between retries
   */
  public followUp: number = 30;

  /**
   * Override to give to give a unique ID to the Check (important for the state machine!)
   */
  public stepId: number = CheckStep.NONE;

  private FailoverLambdaName: string;
  private lambda: any;

  /**
   * @inheritdoc
   */
  abstract run(event: CheckEventPayload): Promise<CheckResult>;

  /**
   * @param lambda: The initialized lambda client to be used in case of the default failover action
   * @param FailoverLambdaName: The lambda arn to be called in case of the default failover action
   */
  constructor(lambda: any, FailoverLambdaName: string) {
    this.FailoverLambdaName = FailoverLambdaName;
    this.lambda = lambda;
    this.logger = new DummyLogger();
  }

  /**
   * Basic action that can taken by all checks: this will trigger the lambda with the s3 Bucket and Object information to allow for regional failover.
   * @param event:  CheckEventPayload event details
   */
  public takeAction = async (event: CheckEventPayload): Promise<boolean> => {
    this.logger.warn({
      message:
        'Triggering regional failover for alert ' +
        event.alertInformation.alertId,
      data: event,
    });

    const invokeArgs = {
      Records: [
        {
          eventSource: 'watchdog',
          s3: {
            bucket: {
              name: event.alertInformation.alertS3BucketName,
            },
            object: {
              key: event.alertInformation.alertS3Key,
            },
          },
        },
      ],
    };

    let lambdaParams = {
      FunctionName: this.FailoverLambdaName,
      InvokeArgs: JSON.stringify(invokeArgs),
    };
    return this.lambda
      .invokeAsync(lambdaParams)
      .promise()
      .then(
        (data: Object) => {
          this.logger.info({
            message:
              'Regional failover successfuly triggered for alert ' +
              event.alertInformation.alertId,
            data: event,
          });
          return true;
        },
        (error: Error) => {
          this.logger.error({
            message:
              'Regional failover failed to trigger for alert ' +
              event.alertInformation.alertId,
            data: {
              CheckEventPayload: event,
              lambdaInvokeParameters: lambdaParams,
            },
            errorDetails: error,
          });
          return false;
        },
      );
  };

  /**
   * Internal helper function that can used in the run to decide to return RETRY or ACTION based on the event payload amd the max retries
   */
  public evaluateRetryOrAction(event: CheckEventPayload): CheckResultStatus {
    return event.currentStepRetryCounter < this.retries
      ? CheckResultStatus.RETRY
      : CheckResultStatus.ACTION;
  }

  public getFollowUp(): number {
    return this.followUp;
  }

  public getStepId(): CheckStep {
    return this.stepId;
  }

  public setLogger(logger: LoggingServiceInterface): void {
    this.logger = logger;
  }
}
