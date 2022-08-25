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
import { DynamoDB, SQS } from 'aws-sdk';
import { random, system } from 'faker';
import { v4 } from 'uuid';
import { LoggingServiceInterface } from '../../../layers/base/src/interfaces';
import { generateAlertNotification } from '../../test/data-gen';
import { MockType } from './../../test/mock-type';
import { NotificationPrepperSQSSinkAdapter } from './notification-prepper-sqssink.adapter';

const SQS_QUEUEURL_ALLAPNS = 'test-apns-all';
const SQS_QUEUEURL_ALLFCM = 'test-fcm-all';
const SQS_QUEUEURL_SELECTEDAPNS = 'test-apns-selected';
const SQS_QUEUEURL_SELECTEDFCM = 'test-fcm-selected';
const DDB_TABLE_ALERTBATCHES = 'test-alert-batches';

describe('NotificationPrepperSQSSinkAdapter', () => {
  let adapter: NotificationPrepperSQSSinkAdapter;
  let mockLogger: MockType<LoggingServiceInterface>;
  let mockDdbClient: MockType<DynamoDB.DocumentClient>;
  let mockSqsClient: MockType<SQS>;

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
    mockDdbClient = {
      update: jest.fn(),
      batchWrite: jest.fn(),
    };
    mockSqsClient = {
      sendMessage: jest.fn(),
      sendMessageBatch: jest.fn(),
    };
    adapter = new NotificationPrepperSQSSinkAdapter({
      logger: mockLogger as any,
      sqsClient: mockSqsClient as any,
      sqsAllApns: SQS_QUEUEURL_ALLAPNS,
      sqsAllFcm: SQS_QUEUEURL_ALLFCM,
      sqsSelectedApns: SQS_QUEUEURL_SELECTEDAPNS,
      sqsSelectedFcm: SQS_QUEUEURL_SELECTEDFCM,
      ddbClient: mockDdbClient as any,
      ddbTableAlertBatch: DDB_TABLE_ALERTBATCHES,
    });
  });

  describe('#ctor()', () => {
    it('should initialize the passed in services and variables', () => {
      expect(adapter.ddbClient).toBeDefined();
      expect(adapter.logger).toBeDefined();
      expect(adapter.sqsClient).toBeDefined();

      expect(adapter.sqsAllApns).toEqual(SQS_QUEUEURL_ALLAPNS);
      expect(adapter.sqsAllFcm).toEqual(SQS_QUEUEURL_ALLFCM);
      expect(adapter.sqsSelectedApns).toEqual(SQS_QUEUEURL_SELECTEDAPNS);
      expect(adapter.sqsSelectedFcm).toEqual(SQS_QUEUEURL_SELECTEDFCM);
      expect(adapter.ddbTableAlertBatch).toEqual(DDB_TABLE_ALERTBATCHES);
    });
  });

  describe('#sinkBatch()', () => {
    it("should sink messages for flow 'all' in a batch call to SQS", async () => {
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

      // We get a maximum of 10 items for flowControl=all
      const items: {
        bucket: string;
        key: string;
      }[] = [];
      for (let index = 0; index < 10; index++) {
        items.push({
          bucket: random.alphaNumeric(60),
          key: system.filePath(),
        });
      }

      mockSqsClient.sendMessageBatch.mockReturnValueOnce({
        promise: jest.fn().mockResolvedValue({
          Failed: [],
          Successful: [],
        }),
      });

      // Act
      await adapter.sinkBatch(alertNotification, items, 'all');

      // Assert
      expect(mockSqsClient.sendMessageBatch).toHaveBeenCalledTimes(1);
    });

    it("should sink messages for flow 'all' in a batch call to SQS and not throw if sinking fails", async () => {
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

      // We get a maximum of 10 items for flowControl=all
      const items: {
        bucket: string;
        key: string;
      }[] = [];
      for (let index = 0; index < 10; index++) {
        items.push({
          bucket: random.alphaNumeric(60),
          key: system.filePath(),
        });
      }

      mockSqsClient.sendMessageBatch.mockReturnValueOnce({
        promise: jest.fn().mockResolvedValue({
          Failed: [
            {
              Id: v4(),
            },
          ],
          Successful: [],
        }),
      });

      // Act
      await adapter.sinkBatch(alertNotification, items, 'all');

      // Assert
      expect(mockSqsClient.sendMessageBatch).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it("should sink messages for flow 'all' and platform 'fcm' in a batch call to SQS", async () => {
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
      alertNotification.platform = 'fcm';

      // We get a maximum of 10 items for flowControl=all
      const items: {
        bucket: string;
        key: string;
      }[] = [];
      for (let index = 0; index < 10; index++) {
        items.push({
          bucket: random.alphaNumeric(60),
          key: system.filePath(),
        });
      }

      mockSqsClient.sendMessageBatch.mockReturnValueOnce({
        promise: jest.fn().mockResolvedValue({
          Failed: [],
          Successful: [],
        }),
      });

      // Act
      await adapter.sinkBatch(alertNotification, items, 'all');

      // Assert
      expect(mockSqsClient.sendMessageBatch).toHaveBeenCalledTimes(1);
    });

    it("should sink messages for flow 'selected' in a batch call to SQS", async () => {
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

      // We get a maximum of 500 items (aka push tokens) for flowControl=selected
      const items: string[] = [];
      for (let index = 0; index < 500; index++) 
        items.push(random.alphaNumeric(153));
      

      mockSqsClient.sendMessage.mockReturnValueOnce({
        promise: jest.fn(),
      });

      // Act
      await adapter.sinkBatch(alertNotification, items, 'selected');

      // Assert
      expect(mockSqsClient.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("should sink messages for flow 'selected' and platform 'fcm' in a batch call to SQS", async () => {
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
      alertNotification.platform = 'fcm';

      // We get a maximum of 500 items (aka push tokens) for flowControl=selected
      const items: string[] = [];
      for (let index = 0; index < 500; index++) 
        items.push(random.alphaNumeric(153));
      

      mockSqsClient.sendMessage.mockReturnValueOnce({
        promise: jest.fn(),
      });

      // Act
      await adapter.sinkBatch(alertNotification, items, 'selected');

      // Assert
      expect(mockSqsClient.sendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
