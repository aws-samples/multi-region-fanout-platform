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
import { expect } from 'chai';
import { CheckStep, CheckEventPayload, CheckResultStatus } from '../../../src/modules/CheckInterface';
import { DummyLogger } from '../../../src/modules/DummyLogger';
import { DummyBaseCheck } from './DummyBaseCheck';

function GetPayload(nextCheckStep: CheckStep = CheckStep.INCOMING_ALERT_CHECK): CheckEventPayload {
  return {
    lastCheckStep: CheckStep.NONE,
    currentStepRetryCounter: 0,
    invocationCounter: 0,
    nextCheckStep: nextCheckStep,
    followUpTime: 0,
    alertInformation: {
      alertId: 'AlterID12345',
      alertS3BucketName: 'Bucket12345',
      alertS3Key: 'Key12345',
    },
    done: true,
  };
}

describe('BasicTask tests', () => {
    
  it('Evaluates to action when the max retries are reached', async () => {
    const baseTask = new DummyBaseCheck({}, 'SomeARN');
    let payload = GetPayload();
    baseTask.retries = 3;
        
    expect(baseTask.evaluateRetryOrAction(payload), 'First run returns RETRY because under retries 3').to.equal(CheckResultStatus.RETRY);
    payload.invocationCounter++;
    payload.currentStepRetryCounter++;
    expect(baseTask.evaluateRetryOrAction(payload), 'Second run returns RETRY because under retries 3').to.equal(CheckResultStatus.RETRY);
    payload.invocationCounter++;
    payload.currentStepRetryCounter++;
    expect(baseTask.evaluateRetryOrAction(payload), 'Third run returns RETRY because equal to retries 3').to.equal(CheckResultStatus.RETRY);
    payload.invocationCounter++;
    payload.currentStepRetryCounter++;
    expect(baseTask.evaluateRetryOrAction(payload), 'Forth run returns ACTION because 1 over retries 3').to.equal(CheckResultStatus.ACTION);
    payload.invocationCounter++;
    payload.currentStepRetryCounter++;
    expect(baseTask.evaluateRetryOrAction(payload), 'Fifth run returns ACTION because 2 over retries 3').to.equal(CheckResultStatus.ACTION);
  });
    
  it('Evaluates to action when the retries is 5 are reached', async () => {
    const baseTask = new DummyBaseCheck({}, 'SomeARN');
    let payload = GetPayload();
    baseTask.retries = 5;
        
    payload.currentStepRetryCounter = 4;
    expect(baseTask.evaluateRetryOrAction(payload), 'When counter is 4 returns RETRY because max is 5').to.equal(CheckResultStatus.RETRY);
        
    payload.currentStepRetryCounter = 5;
    expect(baseTask.evaluateRetryOrAction(payload), 'When counter is 5 returns ACTION because max is 5').to.equal(CheckResultStatus.ACTION);
        
    payload.currentStepRetryCounter = 6;
    expect(baseTask.evaluateRetryOrAction(payload), 'When counter is 6 returns ACTION because max is 6').to.equal(CheckResultStatus.ACTION);
        
    payload.currentStepRetryCounter = 7;
    expect(baseTask.evaluateRetryOrAction(payload), 'When counter is 7 returns ACTION because max is 6').to.equal(CheckResultStatus.ACTION);
  });
    
  it('Evalutes to ACTION immediatly if retries is 0', async () => {
    const baseTask = new DummyBaseCheck({}, 'SomeARN');
    let payload = GetPayload();
    baseTask.retries = 0;
        
    payload.currentStepRetryCounter = 0;
    expect(baseTask.evaluateRetryOrAction(payload), 'Return ACTION immediatly').to.equal(CheckResultStatus.ACTION);
  });
    
  it('getStepId return the right ID when it is set over public member', async () => {
    const baseTask = new DummyBaseCheck({}, 'SomeARN');
    baseTask.stepId = CheckStep.ALERT_BATCHES_CHECK;
        
    expect(baseTask.getStepId()).to.equal(CheckStep.ALERT_BATCHES_CHECK);
  });
    
  it('getFollowUp return the number set over public member', async () => {
    const baseTask = new DummyBaseCheck({}, 'SomeARN');
    baseTask.followUp = 450;
        
    expect(baseTask.getFollowUp()).to.equal(450);
  });
    
  it('takeAction calls sucessfully calls lambda exactly once and returns true', async () => {
        
    let invokeCounter = 0;
    let loggerInfoCounter = 0;
    let loggerWarnCounter = 0;
    const logger = new class extends DummyLogger {
          
      public warn(infoObject: any): void {
        expect(infoObject.message, 'Create an warn log that lambda should be triggered').to.equal('Triggering regional failover for alert AlterID12345');
        expect(infoObject.data, 'Pass the payload as info').to.deep.equal(GetPayload()); 
        loggerWarnCounter++;
      }
          
      public info(infoObject: any): void {
          
        expect(infoObject.message, 'Create an info log once the lambda has been triggered').to.equal('Regional failover successfuly triggered for alert AlterID12345');
        expect(infoObject.data, 'Pass the payload as info').to.deep.equal(GetPayload()); 
        loggerInfoCounter++;
      }
    }();
        
    const lambda = {
      invokeAsync: (params: any) => {
              
        expect(params.FunctionName).to.equal('SomeLambdaARN');
        expect(params.InvokeArgs).to.equal('{"Records":[{"eventSource":"watchdog","s3":{"bucket":{"name":"Bucket12345"},"object":{"key":"Key12345"}}}]}');
            
        return {
          promise: async () => {
            invokeCounter++;
            return { };
          },
        };
      },
    };
        
    const baseTask = new DummyBaseCheck(lambda, 'SomeLambdaARN');
    baseTask.setLogger(logger);
        
    const result = await baseTask.takeAction(GetPayload());
    expect(invokeCounter, 'Lambda function should get invoked exactly once').to.equal(1);
    expect(loggerInfoCounter, '1 info log entry').to.equal(1);
    expect(loggerWarnCounter, '1 warn log entry').to.equal(1);
    expect(result).to.equal(true);
  });
    
  it('takeAction calls lambda with error it returns false', async () => {
        
    let counterInvoke = 0;
    let loggerWarnCounter = 0;
    let loggerErrorCounter = 0;
    const logger = new class extends DummyLogger {
          
      public warn(infoObject: any): void {
            
        expect(infoObject.message, 'Create an info log that lambda should be triggered').to.equal('Triggering regional failover for alert AlterID12345');
        expect(infoObject.data, 'Pass the payload as info').to.deep.equal(GetPayload()); 
            
        loggerWarnCounter++;
      }
      public error(infoObject: any): void {
            
        expect(infoObject.message, 'Create an error log that lambda could not be triggered').to.equal('Regional failover failed to trigger for alert AlterID12345');
        expect(infoObject.data, 'Pass the payload and parameter as info').to.deep.contains({ CheckEventPayload: GetPayload() }); 
        expect(infoObject.data, 'Pass the payload and parameter as info').has.property('lambdaInvokeParameters'); 
          
        loggerErrorCounter++;
      }
    }();
    const lambda = {
      invokeAsync: (params: any) => {
              
        expect(params.FunctionName).to.equal('SomeLambdaARN');
        expect(params.InvokeArgs).to.equal('{"Records":[{"eventSource":"watchdog","s3":{"bucket":{"name":"Bucket12345"},"object":{"key":"Key12345"}}}]}');
            
        return {
          promise: async () => {
            counterInvoke++;
            throw Error('Failed');
          },
        };
      },
    };
        
    const baseTask = new DummyBaseCheck(lambda, 'SomeLambdaARN');
    baseTask.setLogger(logger);
        
    const result = await baseTask.takeAction(GetPayload());
    expect(counterInvoke, 'Lambda function should get invoked exactly once').to.equal(1);
    expect(loggerWarnCounter, '1 warn log entries').to.equal(1);
    expect(loggerErrorCounter, '1 error log entries').to.equal(1);
    expect(result).to.equal(false);
  });
});