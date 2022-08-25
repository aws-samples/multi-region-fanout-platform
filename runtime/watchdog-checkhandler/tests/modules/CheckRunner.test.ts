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
import { stubInterface } from 'ts-sinon';
import { CheckRunner } from  '../../src/modules/CheckRunner';
import { Check, CheckStep, CheckEventPayload, CheckResultStatus, AlertInformation, CheckResult } from '../../src/modules/CheckInterface';
import { CheckNotFoundError, NoNextCheckError } from '../../src/modules/Errors';

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

function GetChecker(checks:Array<Check>): CheckRunner {
  
  return new CheckRunner(checks);
}

function GetMockCheckArray(checkResult: CheckResultStatus = CheckResultStatus.PASS): Array<Check> {
  
  const testCheckA = stubInterface<Check>();
  const testCheckB = stubInterface<Check>();
  
  const alertInformation: AlertInformation =  {
    alertId: 'AlterID12345',
    alertS3BucketName: 'Bucket12345',
    alertS3Key: 'Key12345',
  };
  
  const checkResultObject: CheckResult =  {
    result: checkResult,
    alertInformation: alertInformation,
  };
  
  testCheckA.getStepId.returns(CheckStep.INCOMING_ALERT_CHECK);
  testCheckA.getFollowUp.returns(15);
  testCheckA.run.resolves(checkResultObject);
  testCheckB.getStepId.returns(CheckStep.ALERT_TASKS_GIS_CHECK);
  testCheckB.getFollowUp.returns(30);
  testCheckB.run.resolves(checkResultObject);
  return [testCheckA, testCheckB];
}

describe('CheckRunner tests', () => {
  
  it('GetChecker returns existing check for the right enum', () => {
    
    const checks = GetMockCheckArray();
    const checkRunner = GetChecker(checks);
    expect(checkRunner.getChecker(CheckStep.INCOMING_ALERT_CHECK)).to.equal(checks[0]);
    expect(checkRunner.getChecker(CheckStep.ALERT_TASKS_GIS_CHECK)).to.equal(checks[1]);
    
  });
  
  it('GetChecker throws errors when check does not exists', () => {
  
    const checkRunner = GetChecker(GetMockCheckArray());
    expect(() => checkRunner.getChecker(CheckStep.NONE)).to.throw(CheckNotFoundError);
  });
  
  
  it('GetNextChecker returns the next Check', () => {
    
    const checks = GetMockCheckArray();
    const checkRunner = GetChecker(checks);
    expect(checkRunner.getNextChecker(CheckStep.INCOMING_ALERT_CHECK)).to.equal(checks[1]);
    expect(checkRunner.getNextChecker(CheckStep.INCOMING_ALERT_CHECK).getStepId()).to.equal(checks[1].getStepId());
  });
  
  it('GetNextChecker throws error when check does not exists', () => {
     
    const checks = GetMockCheckArray();
    const checkRunner = GetChecker(checks);
    expect(() => checkRunner.getNextChecker(CheckStep.NONE)).to.throw(CheckNotFoundError);
  });
  
  it('GetNextChecker throws error when no next check', () => {
     
    const checks = GetMockCheckArray();
    const checkRunner = GetChecker(checks);
    expect(() => checkRunner.getNextChecker(CheckStep.ALERT_TASKS_GIS_CHECK)).to.throw(NoNextCheckError);
  });
  
  
  it('Run with passing check increases counter and follows-up from next step', async () => {
    
    const checks = GetMockCheckArray();
    const checkRunner = GetChecker(checks);
    
    var payload = await checkRunner.run(GetPayload());
    expect(payload.currentStepRetryCounter, 'Step counter is at 0').to.equal(0);
    expect(payload.invocationCounter, 'Increase counter').to.equal(1);
    expect(payload.lastCheckStatus, 'Last check status should be PASS').to.equal(CheckResultStatus.PASS);
    expect(payload.lastCheckStep, 'Last check enum same check').to.equal(CheckStep.INCOMING_ALERT_CHECK);
    expect(payload.nextCheckStep, 'Next step').to.equal(CheckStep.ALERT_TASKS_GIS_CHECK);
    expect(payload.followUpTime, 'Follow up time from next step').to.equal(30);
    expect(payload.alertInformation.alertId, 'Pass along the alter ID').to.equal('AlterID12345');
    
  });
  
  it('Run with check result RETRY increases step counter and follows-up from same step', async () => {
    
    const checks = GetMockCheckArray(CheckResultStatus.RETRY);
    const checkRunner = GetChecker(checks);
    
    var payload = await checkRunner.run(GetPayload());
    expect(payload.currentStepRetryCounter, 'Step counter increases').to.equal(1);
    expect(payload.invocationCounter, 'Increase counter').to.equal(1);
    expect(payload.nextCheckStep, 'Next step to be the same').to.equal(CheckStep.INCOMING_ALERT_CHECK);
    expect(payload.lastCheckStatus, 'Last check status should be RETRY').to.equal(CheckResultStatus.RETRY);
    expect(payload.lastCheckStep, 'Last check enum same check').to.equal(CheckStep.INCOMING_ALERT_CHECK);
    expect(payload.followUpTime, 'Follow up time from same step').to.equal(15);
    expect(payload.alertInformation.alertId, 'Pass along the alter ID').to.equal('AlterID12345');
    
  });
  
  it('Run with check result ACTION trigger the check action', async () => {
    
    const checks = GetMockCheckArray(CheckResultStatus.ACTION);
    const checkRunner = GetChecker(checks);
    
    var payload = await checkRunner.run(GetPayload());
    expect(payload.currentStepRetryCounter, 'Step counter increases').to.equal(1);
    expect(payload.invocationCounter, 'Increase counter').to.equal(1);
    expect(payload.nextCheckStep, 'Next step to be the same').to.equal(CheckStep.NONE);
    expect(payload.lastCheckStatus, 'Last check status should be RETRY').to.equal(CheckResultStatus.ACTION);
    expect(payload.lastCheckStep, 'Last check enum same check').to.equal(CheckStep.INCOMING_ALERT_CHECK);
    expect(payload.followUpTime, 'Follow up time from same step').to.equal(0);
    expect(payload.done, 'Should be done').to.equal(true);
    expect(payload.alertInformation.alertId, 'Pass along the alter ID').to.equal('AlterID12345');
    
  });
  
  it('Run with check result PASS with no more checks return done', async () => {
    
    const checks = GetMockCheckArray(CheckResultStatus.ACTION);
    const checkRunner = GetChecker(checks);
    
    var payload = await checkRunner.run(GetPayload(CheckStep.ALERT_TASKS_GIS_CHECK));
    expect(payload.currentStepRetryCounter, 'Step counter increases').to.equal(1);
    expect(payload.invocationCounter, 'Increase counter').to.equal(1);
    expect(payload.nextCheckStep, 'Next step to be the same').to.equal(CheckStep.NONE);
    expect(payload.lastCheckStatus, 'Last check status should be RETRY').to.equal(CheckResultStatus.ACTION);
    expect(payload.lastCheckStep, 'Last check enum same check').to.equal(CheckStep.ALERT_TASKS_GIS_CHECK);
    expect(payload.followUpTime, 'Follow up time from same step').to.equal(0);
    expect(payload.done, 'Should be done').to.equal(true);
    expect(payload.alertInformation.alertId, 'Pass along the alter ID').to.equal('AlterID12345');
  });
  
});