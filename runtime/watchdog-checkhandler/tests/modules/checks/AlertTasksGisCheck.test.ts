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
import { AlertTasksGisCheck } from '../../../src/modules/checks/AlertTasksGisCheck';
import {
  CheckStep,
  CheckResultStatus,
} from '../../../src/modules/CheckInterface';

function GetInput() {
  return {
    lastCheckStep: CheckStep.NONE,
    currentStepRetryCounter: 0,
    invocationCounter: 0,
    nextCheckStep: CheckStep.INCOMING_ALERT_CHECK,
    followUpTime: 0,
    alertInformation: {
      alertS3BucketName: 'someBucket',
      alertS3Key: 'someKey',
      alertId: 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3',
      severity: 'Moderate',
    },
    done: false,
  };
}

function GetDDBResult(count: number = 1) { 
  return {
    Items: [
      {
        r1Bucket: 'mrfp-dev-eu-central-1-input',
        r1Severity: null,
        platform: 'PNP1',
        r1Platform: 'PNP1',
        provider: 'invoice',
        r1Created: '2022-01-25T08:22:08.335Z',
        alertId: 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3',
        r1HashJson: 'dummy',
        r1Hash: 'dummy',
        r1Key: '/warnings/e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3.json',
      },
    ],
    Count: count,
    ScannedCount: count,
  };
}

describe('AlterTaskGisCheck tests', () => {
  
  it('When DDB PNP1 count is 1 and PNP2 is 1 then PASS', async () => {
    
    let ddbQueryCounter:String[] = [];
    //DDB Mock
    let ddb = {
      query: (params: any) => {
        expect(params).to.deep.oneOf([
          {
            TableName: 'SomeTableRegular',
            KeyConditionExpression: '#id = :id AND #p = :platform',
            ExpressionAttributeNames: { '#id': 'alertId', '#p': 'platform' },
            ExpressionAttributeValues: { ':id': 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3', ':platform': 'PNP1' },
          },
          {
            TableName: 'SomeTableRegular',
            KeyConditionExpression: '#id = :id AND #p = :platform',
            ExpressionAttributeNames: { '#id': 'alertId', '#p': 'platform' },
            ExpressionAttributeValues: { ':id': 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3', ':platform': 'PNP2' },
          },
        ]);
        
        ddbQueryCounter.push(params.ExpressionAttributeValues[':platform']);
        
        const result = {
          promise: async () => {
            return GetDDBResult();
          },
        };
        return result;
      },
    };
    
    let check = new AlertTasksGisCheck(ddb, ddb, 'SomeTableRegular', 'SomeTableHigh', {}, 'SomeARN');
    let result = await check.run(GetInput());

    expect(ddbQueryCounter, 'DDB called once for each platform').to.have.lengthOf(2);
    expect(ddbQueryCounter, 'DDB called for PNP1').to.contain('PNP1');
    expect(ddbQueryCounter, 'DDB called for PNP2').to.contain('PNP2');
    expect(result).to.deep.equal({
      result: CheckResultStatus.PASS,
      alertInformation: {
        alertS3BucketName: 'someBucket',
        alertS3Key: 'someKey',
        alertId: 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3',
        severity: 'Moderate',
      },
    });
  });
  
  it('When DDB PNP1 count is 0 and PNP2 is 1 then RETRY', async () => {
    
    let ddbQueryCounter:String[] = [];
    //DDB Mock
    let ddb = {
      query: (params: any) => {
        
        const result = {
          promise: async () => {
            if (params.ExpressionAttributeValues[':platform'] == 'PNP1')
              return GetDDBResult(0);
            if (params.ExpressionAttributeValues[':platform'] == 'PNP2')
              return GetDDBResult(1);
            expect(true, 'Either PNP1 or PNP2').not.equal(false);
          },
        };
        return result;
      },
    };
    
    let check = new AlertTasksGisCheck(ddb, ddb, 'SomeTableRegular', 'SomeTableHigh', {}, 'SomeARN');
    let result = await check.run(GetInput());

    expect(result).to.deep.equal({
      result: CheckResultStatus.RETRY,
      alertInformation: {
        alertS3BucketName: 'someBucket',
        alertS3Key: 'someKey',
        alertId: 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3',
        severity: 'Moderate',
      },
    });
  });
  
  it('When DDB PNP1 count is 1 and PNP2 is 0 then RETRY', async () => {
    
    let ddbQueryCounter:String[] = [];
    //DDB Mock
    let ddb = {
      query: (params: any) => {
        
        const result = {
          promise: async () => {
            if (params.ExpressionAttributeValues[':platform'] == 'PNP1')
              return GetDDBResult(1);
            if (params.ExpressionAttributeValues[':platform'] == 'PNP2')
              return GetDDBResult(0);
            expect(true, 'Either PNP1 or PNP2').not.equal(false);
          },
        };
        return result;
      },
    };
    
    let check = new AlertTasksGisCheck(ddb, ddb, 'SomeTableRegular', 'SomeTableHigh', {}, 'SomeARN');
    let result = await check.run(GetInput());

    expect(result).to.deep.equal({
      result: CheckResultStatus.RETRY,
      alertInformation: {
        alertS3BucketName: 'someBucket',
        alertS3Key: 'someKey',
        alertId: 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3',
        severity: 'Moderate',
      },
    });
  });
  
  it('When DDB PNP1 count is 5 and PNP2 is 5 then RETRY (needs to be exactly one)', async () => {
    
    let ddbQueryCounter:String[] = [];
    //DDB Mock
    let ddb = {
      query: (params: any) => {
        
        const result = {
          promise: async () => {
            if (params.ExpressionAttributeValues[':platform'] == 'PNP1')
              return GetDDBResult(5);
            if (params.ExpressionAttributeValues[':platform'] == 'PNP2')
              return GetDDBResult(5);
            expect(true, 'Either PNP1 or PNP2').not.equal(false);
          },
        };
        return result;
      },
    };
    
    let check = new AlertTasksGisCheck(ddb, ddb, 'SomeTableRegular', 'SomeTableHigh', {}, 'SomeARN');
    let result = await check.run(GetInput());

    expect(result).to.deep.equal({
      result: CheckResultStatus.RETRY,
      alertInformation: {
        alertS3BucketName: 'someBucket',
        alertS3Key: 'someKey',
        alertId: 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3',
        severity: 'Moderate',
      },
    });
  });
  
});
