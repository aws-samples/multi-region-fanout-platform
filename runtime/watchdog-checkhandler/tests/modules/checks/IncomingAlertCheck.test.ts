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
import { IncomingAlertCheck } from '../../../src/modules/checks/IncomingAlertCheck';
import { DummyLogger } from '../../../src/modules/DummyLogger';
import {
  CheckEventPayload,
  CheckStep,
  CheckResultStatus,
} from '../../../src/modules/CheckInterface';

const requiredTags = ['Alert_ID', 'Hash'];
const alertIDTag = 'Alert_ID';

// Mock S3

function GetInput(): CheckEventPayload {
  return {
    lastCheckStep: CheckStep.NONE,
    currentStepRetryCounter: 0,
    invocationCounter: 0,
    nextCheckStep: CheckStep.INCOMING_ALERT_CHECK,
    followUpTime: 0,
    alertInformation: {
      alertS3BucketName: 'someBucket',
      alertS3Key: 'someKey',
      severity: 'Moderate',
      provider: 'DWD',
    },
    done: false,
  };
}

describe('IncomingAlertCheck tests', () => {
  it('when all the tags are returned by the s3 SDK PASS', async () => {
    //Create
    const s3 = {
      getObjectTagging: (Bucket: string, Key: string) => {
        return {
          promise: async () => {
            return {
              TagSet: [
                { Key: 'Alert_ID', Value: 'alert_id_value' },
                { Key: 'Hash', Value: 'hash_value0' },
                { Key: 'Severity', Value: '2' },
                { Key: 'Provider', Value: 'DWD' },
              ],
            };
          },
        };
      },
    };

    let check = new IncomingAlertCheck(
      s3,
      ['Alert_ID', 'Hash'],
      'Alert_ID',
      'Hash',
      'Severity',
      'Provider',
      {},
      'SomeARN',
      'SomeBucketinMyRegion',
      '0',
    );
    let result = await check.run(GetInput());
    expect(result).to.deep.equal({
      result: CheckResultStatus.PASS,
      alertInformation: {
        alertS3BucketName: 'someBucket',
        alertS3Key: 'someKey',
        alertId: 'alert_id_value',
        severity: 'Moderate',
        provider: 'DWD',
      },
    });
  });

  it('when alert is not supposed to be handled by current region ABORT', async () => {
    //Create
    const s3 = {
      getObjectTagging: (Bucket: string, Key: string) => {
        return {
          promise: async () => {
            return {
              TagSet: [
                { Key: 'Alert_ID', Value: 'alert_id_value' },
                { Key: 'Hash', Value: 'hash_value1' },
                { Key: 'Severity', Value: 'Moderate' },
              ],
            };
          },
        };
      },
    };

    let check = new IncomingAlertCheck(
      s3,
      ['Alert_ID', 'Hash'],
      'Alert_ID',
      'Hash',
      'Severity',
      'DWD',
      {},
      'SomeARN',
      'SomeBucketinMyRegion',
      '0',
    );
    let result = await check.run(GetInput());
    expect(result).to.deep.equal({
      result: CheckResultStatus.ABORT,
      alertInformation: {
        alertS3BucketName: 'someBucket',
        alertS3Key: 'someKey',
        alertId: 'alert_id_value',
        severity: 'Moderate',
        provider: 'DWD',
      },
    });
  });

  it('when one tag is missing by the s3 SDK RETRY (no alert_id)', async () => {
    //Create

    const s3 = {
      getObjectTagging: (params: any) => {
        expect(params.Bucket).to.equal('SomeBucketinMyRegion');
        expect(params.Key).to.equal('someKey');
        return {
          promise: async () => {
            return {
              TagSet: [{ Key: 'Hash', Value: 'hash0' }, { Key: 'Severity', Value: 'Moderate' }],
            };
          },
        };
      },
    };

    let check = new IncomingAlertCheck(
      s3,
      ['Alert_ID', 'Hash'],
      'Alert_ID',
      'Hash',
      'Severity',
      'DWD',
      {},
      'SomeARN',
      'SomeBucketinMyRegion',
      '0',
    );
    let result = await check.run(GetInput());
    expect(result).to.deep.equal({
      result: CheckResultStatus.RETRY,
      alertInformation: {
        alertS3BucketName: 'someBucket',
        alertS3Key: 'someKey',
        severity: 'Moderate',
        provider: 'DWD',
      },
    });
  });

  it('when all tags are missing by the s3 SDK RETRY (no alert_id)', async () => {
    //Create
    const s3 = {
      getObjectTagging: (params: any) => {
        return {
          promise: async () => {
            return { TagSet: [] };
          },
        };
      },
    };

    let check = new IncomingAlertCheck(
      s3,
      ['Alert_ID', 'Hash'],
      'Alert_ID',
      'Hash',
      'Severity',
      'DWD',
      {},
      'SomeARN',
      'SomeBucketinMyRegion',
      '0',
    );
    let result = await check.run(GetInput());
    expect(result).to.deep.equal({
      result: CheckResultStatus.RETRY,
      alertInformation: {
        alertS3BucketName: 'someBucket',
        alertS3Key: 'someKey',
        severity: 'Moderate',
        provider: 'DWD',
      },
    });
  });

  it('when one tag is missing by the s3 SDK and over the retry limit ACTION', async () => {
    const s3 = {
      getObjectTagging: (params: any) => {
        return {
          promise: async () => {
            return { TagSet: [] };
          },
        };
      },
    };

    let check = new IncomingAlertCheck(
      s3,
      ['Alert_ID', 'Hash'],
      'Alert_ID',
      'Hash',
      'Severity',
      'DWD',
      {},
      'SomeARN',
      'SomeBucketinMyRegion',
      '0',
    );
    let input = GetInput();
    input.currentStepRetryCounter = 3;
    check.retries = 3;
    let result = await check.run(input);
    expect(result).to.deep.include({ result: CheckResultStatus.ACTION });
  });

  it('when s3 SDK throws an error and under the retry limit RETRY and over the limit ACTION', async () => {
    let s3Counter = 0;
    const s3 = {
      getObjectTagging: (params: any) => {
        s3Counter++;
        throw Error('S3');
      },
    };

    let loggerWarnCounter = 0;
    const logger = new (class extends DummyLogger {
      public warn(infoObject: any): void {
        expect(infoObject).has.property('errorDetails');
        loggerWarnCounter++;
      }
    })();

    let check = new IncomingAlertCheck(
      s3,
      ['Alert_ID', 'Hash'],
      'Alert_ID',
      'Hash',
      'Severity',
      'DWD',
      {},
      'SomeARN',
      'SomeBucketinMyRegion',
      '0',
    );
    check.setLogger(logger);

    let input = GetInput();
    input.currentStepRetryCounter = 1;
    check.retries = 3;
    let result = await check.run(input);
    expect(result).to.deep.include({ result: CheckResultStatus.RETRY });
    expect(loggerWarnCounter).to.equal(0);
    expect(s3Counter).to.equal(1);

    input = GetInput();
    input.currentStepRetryCounter = 3;
    check.retries = 3;
    result = await check.run(input);
    expect(result).to.deep.include({ result: CheckResultStatus.ACTION });
    expect(loggerWarnCounter).to.equal(1);
    expect(s3Counter).to.equal(2);
  });
});
