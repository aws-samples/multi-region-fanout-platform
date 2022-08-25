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
import { FanoutTasksCheck } from '../../../src/modules/checks/FanoutTasksCheck';
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
        alertId: 'alertID_HERE',
        batchId: '00001b95-f336-4cba-b7fe-321adaf306f1',
      },
    ],
    Count: count,
    ScannedCount: count,
  };
}

describe('FanoutTasksCheck tests', () => {
  it('When DDB PNP1 count is 1 and PNP2 is 1 then PASS', async () => {
    let ddbQueryCounter: String[] = [];
    //DDB Mock
    let ddb = {
      query: (params: any) => {
        expect(params).to.deep.oneOf([
          {
            TableName: 'SomeTableRegular',
            KeyConditionExpression: '#id = :id',
            ExpressionAttributeNames: { '#id': 'alertId' },
            ExpressionAttributeValues: {
              ':id': 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3:PNP1',
            },
            Limit: 10,
          },
          {
            TableName: 'SomeTableRegular',
            KeyConditionExpression: '#id = :id',
            ExpressionAttributeNames: { '#id': 'alertId' },
            ExpressionAttributeValues: {
              ':id': 'e1745dd0-6cb8-40f5-adc7-33e78a9b8cd3:PNP2',
            },
            Limit: 10,
          },
        ]);

        ddbQueryCounter.push(
          params.ExpressionAttributeValues[':id'].split(':')[1],
        );

        const result = {
          promise: async () => {
            return GetDDBResult();
          },
        };
        return result;
      },
    };

    let check = new FanoutTasksCheck(
      ddb,
      ddb,
      'SomeTableRegular',
      'SomeTableHigh',
      {},
      'SomeARN',
    );
    let result = await check.run(GetInput());

    expect(
      ddbQueryCounter,
      'DDB called once for each platform',
    ).to.have.lengthOf(2);
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
    let ddbQueryCounter: String[] = [];
    //DDB Mock
    let ddb = {
      query: (params: any) => {
        const result = {
          promise: async () => {
            if (params.ExpressionAttributeValues[':id'].split(':')[1] == 'PNP1')
              return GetDDBResult(0);
            if (params.ExpressionAttributeValues[':id'].split(':')[1] == 'PNP2')
              return GetDDBResult(1);
            expect(true, 'Either PNP1 or PNP2').not.equal(false);
          },
        };
        return result;
      },
    };

    let check = new FanoutTasksCheck(
      ddb,
      ddb,
      'SomeTableRegular',
      'SomeTableHigh',
      {},
      'SomeARN',
    );
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
    let ddbQueryCounter: String[] = [];
    //DDB Mock
    let ddb = {
      query: (params: any) => {
        const result = {
          promise: async () => {
            if (params.ExpressionAttributeValues[':id'].split(':')[1] == 'PNP1')
              return GetDDBResult(1);
            if (params.ExpressionAttributeValues[':id'].split(':')[1] == 'PNP2')
              return GetDDBResult(0);
            expect(true, 'Either PNP1 or PNP2').not.equal(false);
          },
        };
        return result;
      },
    };

    let check = new FanoutTasksCheck(
      ddb,
      ddb,
      'SomeTableRegular',
      'SomeTableHigh',
      {},
      'SomeARN',
    );
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

  it('When DDB PNP1 count is 5 and PNP2 is 5 then PASS (more then 1 is okay))', async () => {
    let ddbQueryCounter: String[] = [];
    //DDB Mock
    let ddb = {
      query: (params: any) => {
        const result = {
          promise: async () => {
            if (params.ExpressionAttributeValues[':id'].split(':')[1] == 'PNP1')
              return GetDDBResult(5);
            if (params.ExpressionAttributeValues[':id'].split(':')[1] == 'PNP2')
              return GetDDBResult(5);
            expect(true, 'Either PNP1 or PNP2').not.equal(false);
          },
        };
        return result;
      },
    };

    let check = new FanoutTasksCheck(
      ddb,
      ddb,
      'SomeTableRegular',
      'SomeTableHigh',
      {},
      'SomeARN',
    );
    let result = await check.run(GetInput());

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
});
