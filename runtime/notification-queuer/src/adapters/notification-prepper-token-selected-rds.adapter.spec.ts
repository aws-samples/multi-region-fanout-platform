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
import { MockType } from './../../test/mock-type';
import {
  ListTokenSelectedResponse,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';
import { NotificationPrepperTokenSelectedRdsAdapter } from './notification-prepper-token-selected-rds.adapter';
import { Pool } from 'pg';
import { generateAlertNotification } from './../../test/data-gen';
import { random } from 'faker';

describe('NotificationPrepperTokenSelectedRdsAdapter', () => {
  let adapter: NotificationPrepperTokenSelectedRdsAdapter;
  let mockLogger: MockType<LoggingServiceInterface>;
  let mockPool: MockType<Pool>;

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
    mockPool = {
      query: jest.fn(),
    };
    adapter = new NotificationPrepperTokenSelectedRdsAdapter({
      logger: mockLogger as any,
      pool: mockPool as any,
    });
  });

  describe('#ctor()', () => {
    it('should initialize the passed in services and variables', () => {
      expect(adapter.logger).toBeDefined();
      expect(adapter.pool).toBeDefined();

      expect(adapter.queryLookup).toHaveLength(2); // NOTE: Change to make sure all queries are initialized
    });
  });

  describe('#getTokens()', () => {
    it('should return a proper response if a query is configured', async () => {
      // Arrange
      const alertNotification = generateAlertNotification(
        ['DE'],
        [
          {
            areaDesc: random.words(2),
            geocode: [
              {
                value: '055150000000',
                valueName: 'SHN',
              },
            ],
          },
        ],
      );
      alertNotification.provider = 'AP1';
      alertNotification.platform = 'apns';
      alertNotification.severity = 'Extreme';

      const queryResponseMock = {
        rows: [],
      };

      for (let index = 0; index < 50000; index++) 
        queryResponseMock.rows.push(random.alphaNumeric(153));
      

      mockPool.query.mockResolvedValueOnce(queryResponseMock);
      const regionKeys = ['055150000000'];

      // Act
      const result = await adapter.getTokens(
        alertNotification.provider,
        alertNotification.platform,
        alertNotification.severity,
        0,
        50000,
        regionKeys,
      );

      // Assert
      const expectedQuery = adapter.queryLookup.find(
        (l) =>
          l.platform === alertNotification.platform &&
          l.provider === alertNotification.provider,
      ).query;
      const expectedResult: ListTokenSelectedResponse = {
        platform: alertNotification.platform,
        provider: alertNotification.provider,
        results: queryResponseMock.rows,
        severity: alertNotification.severity,
        regionKeys,
      };

      expect(result).toEqual(expectedResult);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query.mock.calls[0]).toEqual([
        expectedQuery,
        [0, regionKeys, 50000, 0],
      ]);
    });

    it('should return an empty response if no query is configured', async () => {
      // Arrange
      const alertNotification = generateAlertNotification(
        ['DE'],
        [
          {
            areaDesc: random.words(2),
            geocode: [
              {
                value: '055150000000',
                valueName: 'SHN',
              },
            ],
          },
        ],
      );
      alertNotification.provider = 'FOO';
      alertNotification.platform = 'bar' as any;
      alertNotification.severity = 'Extreme';

      const regionKeys = ['055150000000'];

      // Act
      const result = await adapter.getTokens(
        alertNotification.provider,
        alertNotification.platform,
        alertNotification.severity,
        0,
        50000,
        regionKeys,
      );

      // Assert
      const expectedResult: ListTokenSelectedResponse = {
        platform: alertNotification.platform,
        provider: alertNotification.provider,
        results: [],
        severity: alertNotification.severity,
        regionKeys,
      };

      expect(result).toEqual(expectedResult);
      expect(mockPool.query).toHaveBeenCalledTimes(0);
    });
  });
});
