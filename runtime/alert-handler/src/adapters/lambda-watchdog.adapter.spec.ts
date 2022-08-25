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
import { LambdaWatchdogOutputAdapter } from './lambda-watchdog.adapter';
import { MockType } from '../../test/mock-type';
import { LoggingServiceInterface } from '../../../layers/base/src/interfaces';
import { Lambda } from 'aws-sdk';
import { S3EventRecord } from 'aws-lambda';

const FUNCTION_NAME = 'name-of-watchdog-lambda';

describe('LambdaWatchdogAdapter', () => {
  let adapter: LambdaWatchdogOutputAdapter;
  let mockLogger: MockType<LoggingServiceInterface>;
  let mockLambdaClient: MockType<Lambda>;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      setMetdadata: jest.fn(),
      verbose: jest.fn(),
      warn: jest.fn(),
    };
    mockLambdaClient = {
      invoke: jest.fn(),
    };
    adapter = new LambdaWatchdogOutputAdapter({
      functionName: FUNCTION_NAME,
      lambdaClient: mockLambdaClient as any,
      logger: mockLogger as any,
    });
  });

  describe('#ctor()', () => {
    it('should initialize the passed in services and variables', () => {
      expect(adapter.lambdaClient).toBeDefined();
      expect(adapter.logger).toBeDefined();
      expect(adapter.functionName).toEqual(FUNCTION_NAME);
    });
  });

  describe('#invokeWatchdog()', () => {
    it('should invoke the downstream Lambda function and pass on the S3 event record', async () => {

      const eventRecord = {} as S3EventRecord;

      mockLambdaClient.invoke.mockReturnValue({
        promise: jest.fn(),
      });

      await adapter.invokeWatchdog(eventRecord);

      const expectedEvent = {
        Records: [
          eventRecord,
        ],
      };

      expect(mockLambdaClient.invoke).toHaveBeenCalledTimes(1);
      expect(mockLambdaClient.invoke.mock.calls[0]).toEqual([{
        FunctionName: FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: JSON.stringify(expectedEvent),
      }]);
    });
  });
});