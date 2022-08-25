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
import { CheckNotFoundError, NoNextCheckError } from './Errors';
import {
  Check,
  CheckStep,
  CheckEventPayload,
  CheckResultStatus,
} from './CheckInterface';
import { LoggingServiceInterface } from './LoggingServiceInterface';
import { DummyLogger } from './DummyLogger';

export class CheckRunner {
  readonly checkers: Array<Check>;
  protected logger: LoggingServiceInterface;

  constructor(checkers: Array<Check>) {
    this.checkers = checkers;
    this.logger = new DummyLogger();
  }

  public getChecker(step: CheckStep): Check {
    var checker;

    for (let check of this.checkers) {
      if (step == check.getStepId()) {
        checker = check;
        break;
      }
    }

    if (checker == undefined) 
      throw new CheckNotFoundError('No check for CheckStep enum ' + step);
    

    return checker;
  }

  public getNextChecker(step: CheckStep): Check {
    var currentCheck = this.getChecker(step);
    var currentStepIndex = this.checkers.indexOf(currentCheck);
    if (currentStepIndex > -1 && currentStepIndex < this.checkers.length - 1)
      return this.checkers[currentStepIndex + 1];

    throw new NoNextCheckError('No next check for CheckStep enum ' + step);
  }

  public run = async (step: CheckEventPayload) => {
    this.logger.debug({
      message: 'CheckRunner: runs for alert ' + step.alertInformation.alertId,
      data: step,
    });

    var checker = this.getChecker(step.nextCheckStep);
    var nextStepEnum = CheckStep.NONE;
    var stepCounter = step.currentStepRetryCounter + 1;
    var nextFollowUp = 0;
    var checkResult = await checker.run(step);

    this.logger.debug({
      message:
        'CheckRunner: checker is done running for alert ' +
        step.alertInformation.alertId,
      data: { step: step, checkResult: checkResult },
    });

    var done = false;
    if (checkResult.result === CheckResultStatus.ACTION) {
      this.logger.debug({
        message:
          'CheckRunner: checker wants to take action for alert ' +
          step.alertInformation.alertId,
        data: { step: step, checkResult: checkResult },
      });
      done = true;
      //HERE a RETRY/PASS after the action logic could be inserted
      await checker.takeAction(step);
    } else if (checkResult.result === CheckResultStatus.RETRY) {
      this.logger.debug({
        message:
          'CheckRunner: checker wants to retry for alert ' +
          step.alertInformation.alertId,
        data: { step: step, checkResult: checkResult },
      });

      nextStepEnum = step.nextCheckStep;
      stepCounter = step.currentStepRetryCounter + 1;
      nextFollowUp = checker.getFollowUp();
    } else if (checkResult.result === CheckResultStatus.PASS) {
      try {
        this.logger.debug({
          message:
            'CheckRunner: checker wants passes for alert ' +
            step.alertInformation.alertId,
          data: { step: step, checkResult: checkResult },
        });

        checker = this.getNextChecker(step.nextCheckStep);
        nextStepEnum = checker.getStepId();
        stepCounter = 0;
        nextFollowUp = checker.getFollowUp();
      } catch (error) {
        if (error instanceof NoNextCheckError) {
          this.logger.debug({
            message:
              'CheckRunner: no next runner, we are done for alert ' +
              step.alertInformation.alertId,
            data: { step: step, checkResult: checkResult },
          });
          done = true;
        } else 
          throw error;
        
      }
    } else if (checkResult.result === CheckResultStatus.ABORT) {
      this.logger.debug({
        message:
          'CheckRunner: no next runner, alert not watched in this region ' +
          step.alertInformation.alertId,
        data: { step: step, checkResult: checkResult },
      });
      done = true;
    }

    var nextStep: CheckEventPayload = {
      lastCheckStep: step.nextCheckStep,
      lastCheckStatus: checkResult.result,
      currentStepRetryCounter: stepCounter,
      invocationCounter: step.invocationCounter + 1,
      nextCheckStep: nextStepEnum,
      followUpTime: nextFollowUp,
      alertInformation: checkResult.alertInformation,
      done: done,
    };

    this.logger.debug({
      message:
        'CheckRunner: next check for alert ' + step.alertInformation.alertId,
      data: { step: step, checkResult: checkResult, nextStep: nextStep },
    });

    return nextStep;
  };

  public setLogger(logger: LoggingServiceInterface): void {
    this.logger = logger;
  }
}
