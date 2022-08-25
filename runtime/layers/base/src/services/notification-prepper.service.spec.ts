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
import { random, system } from 'faker';
import { generateAlertNotification } from './../../test/data-gen';
import { MockType } from './../../test/mock-type';
import {
  ListTokenAllResponse,
  ListTokenSelectedResponse,
  LoggingServiceInterface,
  NotificationPrepperSinkAdapterInterface,
  NotificationPrepperTokenAllAdapterInterface,
  NotificationPrepperTokenSelectedAdapterInterface,
} from './../interfaces';
import { NotificationPrepperService } from './notification-prepper.service';

const S3_BUCKET = 'my-test-bucket';

describe('NotificationPrepperService', () => {
  let service: NotificationPrepperService;
  let mockAllTokenAdapter: MockType<NotificationPrepperTokenAllAdapterInterface>;
  let mockLogger: MockType<LoggingServiceInterface>;
  let mockSinkAdapter: MockType<NotificationPrepperSinkAdapterInterface>;
  let mockSelectedTokenAdapter: MockType<NotificationPrepperTokenSelectedAdapterInterface>;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    mockAllTokenAdapter = {
      getTokens: jest.fn(),
    };
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      setMetdadata: jest.fn(),
      verbose: jest.fn(),
      warn: jest.fn(),
    };
    mockSinkAdapter = {
      sinkBatch: jest.fn(),
    };
    mockSelectedTokenAdapter = {
      getTokens: jest.fn(),
    };
    service = new NotificationPrepperService({
      logger: mockLogger as any,
      allTokenAdapter: mockAllTokenAdapter as any,
      sinkAdapter: mockSinkAdapter as any,
      selectedTokenAdapter: mockSelectedTokenAdapter as any,
    });
  });

  describe('#ctor()', () => {
    it('should initialize the passed in services and default the variables', () => {
      expect(service.allTokenAdapter).toBeDefined();
      expect(service.logger).toBeDefined();
      expect(service.sinkAdapter).toBeDefined();
      expect(service.selectedTokenAdapter).toBeDefined();

      expect(service.selectedPipeSize).toEqual(100000);
      expect(service.selectedRetrievalSize).toEqual(50000);
      expect(service.selectedSinkConcurrency).toEqual(25);
      expect(service.selectedTokensPerMessage).toEqual(500);
    });
  });

  describe('#enqueueNotifications()', () => {
    it('should process flowControl all without continuation token', async () => {
      // Arrange
      const alertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);

      const tokenResponse: ListTokenAllResponse = {
        platform: alertNotification.platform,
        provider: alertNotification.provider,
        severity: alertNotification.severity,
        results: [],
      };

      for (let index = 0; index < 100; index++) {
        tokenResponse.results.push({
          bucket: S3_BUCKET,
          key: system.filePath(),
        });
      }

      mockAllTokenAdapter.getTokens.mockResolvedValueOnce(tokenResponse);

      // Act
      await service.enqueueNotifications(alertNotification, 'all');

      // Assert
      expect(mockSinkAdapter.sinkBatch).toHaveBeenCalledTimes(10);
    });

    it('should process flowControl all with a continuation token', async () => {
      // Arrange
      const alertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);

      const tokenResponse1: ListTokenAllResponse = {
        platform: alertNotification.platform,
        provider: alertNotification.provider,
        severity: alertNotification.severity,
        results: [],
        continuationToken: random.word(),
      };

      for (let index = 0; index < 100; index++) {
        tokenResponse1.results.push({
          bucket: S3_BUCKET,
          key: system.filePath(),
        });
      }

      const tokenResponse2: ListTokenAllResponse = {
        ...tokenResponse1,
      };

      delete tokenResponse2.continuationToken;

      mockAllTokenAdapter.getTokens.mockResolvedValueOnce(tokenResponse1);
      mockAllTokenAdapter.getTokens.mockResolvedValueOnce(tokenResponse2);

      // Act
      await service.enqueueNotifications(alertNotification, 'all');

      // Assert
      expect(mockSinkAdapter.sinkBatch).toHaveBeenCalledTimes(20);
    });

    it('should process flowControl selected without consecutive offests', async () => {
      // Arrange
      const alertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);

      const tokenResponse: ListTokenSelectedResponse = {
        platform: alertNotification.platform,
        provider: alertNotification.provider,
        severity: alertNotification.severity,
        results: [],
        regionKeys: ['055150000000'],
      };

      for (let index = 0; index < 5000; index++) 
        tokenResponse.results.push(random.alphaNumeric(163));
      

      mockSelectedTokenAdapter.getTokens.mockResolvedValueOnce(tokenResponse);

      // Act
      await service.enqueueNotifications(alertNotification, 'selected');

      // Assert
      expect(mockSinkAdapter.sinkBatch).toHaveBeenCalledTimes(10);
    });

    it('should process flowControl selected with consecutive offests', async () => {
      // Arrange
      const alertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);

      const tokenResponse: ListTokenSelectedResponse = {
        platform: alertNotification.platform,
        provider: alertNotification.provider,
        severity: alertNotification.severity,
        results: [],
        regionKeys: ['055150000000'],
      };

      for (let index = 0; index < 50000; index++) 
        tokenResponse.results.push(random.alphaNumeric(163));
      

      const tokenResponse2: ListTokenSelectedResponse = {
        platform: alertNotification.platform,
        provider: alertNotification.provider,
        severity: alertNotification.severity,
        results: [],
        regionKeys: ['055150000000'],
      };

      for (let index = 0; index < 5000; index++) 
        tokenResponse2.results.push(random.alphaNumeric(163));
      

      mockSelectedTokenAdapter.getTokens.mockResolvedValueOnce(tokenResponse);
      mockSelectedTokenAdapter.getTokens.mockResolvedValueOnce(tokenResponse2);
      mockSelectedTokenAdapter.getTokens.mockResolvedValue({
        platform: alertNotification.platform,
        provider: alertNotification.provider,
        severity: alertNotification.severity,
        results: [],
      });

      // Act
      await service.enqueueNotifications(alertNotification, 'selected');

      // Assert

      // Must be two times the amount of queries, as we went with the queue approach and therefore attempt it concurrently
      expect(mockSelectedTokenAdapter.getTokens).toHaveBeenCalledTimes(2);
      // Total amount divided by sink batch size
      expect(mockSinkAdapter.sinkBatch).toHaveBeenCalledTimes(110);
    });
  });
});
