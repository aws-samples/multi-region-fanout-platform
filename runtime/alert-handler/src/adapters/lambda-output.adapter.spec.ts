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
import { Lambda } from 'aws-sdk';
import { random } from 'faker';
import { generateAlertNotification } from './../../test/data-gen';
import {
  AlertNotification,
  AlertNotificationAdapterResult,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';
import { MockType } from './../../test/mock-type';
import { LambdaOutputAdapter } from './lambda-output.adapter';

const FNNAME_ALL = 'lambda-all-alerts';
const FNNAME_SELECTED = 'lambda-selected-alerts';

describe('LambdaOutputAdapter', () => {
  let adapter: LambdaOutputAdapter;
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
    adapter = new LambdaOutputAdapter({
      lambdaClientRegular: mockLambdaClient as any,
      lambdaClientHigh: mockLambdaClient as any,
      logger: mockLogger as any,
      functionNameAllAlertsHigh: FNNAME_ALL,
      functionNameAllAlertsRegular: FNNAME_ALL,
      functionNameSelectedAlertsHigh: FNNAME_SELECTED,
      functionNameSelectedAlertsRegular: FNNAME_SELECTED,
      notificationOtherPlatforms: ['fcm'],
    });
  });

  describe('#ctor()', () => {
    it('should initialize the passed in services and variables', () => {
      expect(adapter.lambdaClientRegular).toBeDefined();
      expect(adapter.lambdaClientHigh).toBeDefined();
      expect(adapter.logger).toBeDefined();
      expect(adapter.functionNameAllAlertsHigh).toEqual(FNNAME_ALL);
      expect(adapter.functionNameSelectedAlertsHigh).toEqual(FNNAME_SELECTED);
      expect(adapter.functionNameAllAlertsRegular).toEqual(FNNAME_ALL);
      expect(adapter.functionNameSelectedAlertsRegular).toEqual(FNNAME_SELECTED);
    });
  });

  describe('#handleNotification()', () => {
    it('should invoke all functions and return success results', async () => {
      // Arrange
      const alertNotification: AlertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);

      mockLambdaClient.invoke.mockReturnValue({
        promise: jest.fn(),
      });


      // Act
      const result = await adapter.handleNotification('high', alertNotification);

      // Assert
      const expectedResult: AlertNotificationAdapterResult = {
        results: [
          {
            flowChannel: 'all',
            platform: alertNotification.platform,
            success: true,
          },
          {
            flowChannel: 'selected',
            platform: alertNotification.platform,
            success: true,
          },
          {
            flowChannel: 'all',
            platform: 'fcm',
            success: true,
          },
          {
            flowChannel: 'selected',
            platform: 'fcm',
            success: true,
          },
        ],
      };
      expect(mockLambdaClient.invoke).toHaveBeenCalledTimes(4);
      expect(result).toEqual(expectedResult);
    });

    it('should not attempt to invoke the second function if the first one failed already', async () => {
      // Arrange
      const alertNotification: AlertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);
      const errorSimulated = new Error('Some arbitrary error message.');
      mockLambdaClient.invoke.mockReturnValue({
        promise: jest.fn()
          .mockRejectedValueOnce(errorSimulated)
          .mockResolvedValueOnce({
            dummy: 'foo',
          })
          .mockResolvedValueOnce({
            dummy: 'foo',
          })
          .mockResolvedValueOnce({
            dummy: 'foo',
          }),
      });

      // Act
      const result = await adapter.handleNotification('regular', alertNotification);

      // Assert
      const expectedResult: AlertNotificationAdapterResult = {
        results: [
          {
            flowChannel: 'all',
            platform: alertNotification.platform,
            success: false,
            error: errorSimulated,
          },
        ],
      };
      expect(mockLambdaClient.invoke).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });

    it('should only flag the last function as invoke error if the previous ones passed', async () => {
      // Arrange
      const alertNotification: AlertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);
      const errorSimulated = new Error('Some arbitrary error message.');
      mockLambdaClient.invoke.mockReturnValue({
        promise: jest.fn()
          .mockResolvedValueOnce({
            dummy: 'foo',
          })
          .mockResolvedValueOnce({
            dummy: 'foo',
          })
          .mockResolvedValueOnce({
            dummy: 'foo',
          })
          .mockRejectedValueOnce(errorSimulated),
      });


      // Act
      const result = await adapter.handleNotification('high', alertNotification);

      // Assert
      const expectedResult: AlertNotificationAdapterResult = {
        results: [
          {
            flowChannel: 'all',
            platform: alertNotification.platform,
            success: true,
          },
          {
            flowChannel: 'selected',
            platform: alertNotification.platform,
            success: true,
          },
          {
            flowChannel: 'all',
            platform: 'fcm',
            success: true,
          },
          {
            flowChannel: 'selected',
            platform: 'fcm',
            success: false,
            error: errorSimulated,
          },
        ],
      };
      expect(mockLambdaClient.invoke).toHaveBeenCalledTimes(4);
      expect(result).toEqual(expectedResult);
    });
  });
});
