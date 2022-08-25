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
import { ProtocolOutputAdapter } from './protocol-output.adapter';
import {
  AlertNotification,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';
import { MockType } from './../../test/mock-type';
import { DynamoDB, SQS } from 'aws-sdk';
import { generateAlertNotification } from '../../test/data-gen';
import { random } from 'faker';

const DDB_TABLE_NAME = 'test-alert-protocol';
const APP_REGIONID = '1';
const SQS_QUEUEURL_DDBFAILURE = 'test-alert-protocol-fail';

const DDB_UPDATE_EXPR = `SET provider = :provider, r${APP_REGIONID}Hash = :hash, r${APP_REGIONID}HashJson = :hashJson, r${APP_REGIONID}Severity = :severity, r${APP_REGIONID}Platform = :platform, r${APP_REGIONID}Created = :created, r${APP_REGIONID}Bucket = :s3Bucket, r${APP_REGIONID}Key = :s3Key`;

const getUpdateParamsForDynamoDb = (flowChannel: 'all' | 'selected', notification: AlertNotification): DynamoDB.DocumentClient.UpdateItemInput => {
  const updateParams: DynamoDB.DocumentClient.UpdateItemInput = {
    Key: {
      alertId: notification.id,
      platform: `${notification.platform}_${flowChannel}`,
    },
    TableName: DDB_TABLE_NAME,
    ExpressionAttributeValues: {
      ':provider': notification.provider,
      ':hash': notification.hash,
      ':hashJson': notification.hashJson,
      ':severity': notification.severity,
      ':platform': notification.platform,
      ':created': notification.received,
      ':s3Bucket': notification.s3Bucket,
      ':s3Key': notification.s3Key,
    },
    UpdateExpression: DDB_UPDATE_EXPR,
  };
  return updateParams;
};


describe('ProtocolOutputAdapter', () => {
  let adapter: ProtocolOutputAdapter;
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
    };
    mockSqsClient = {
      sendMessage: jest.fn(),
    };
    adapter = new ProtocolOutputAdapter({
      ddbClientHigh: mockDdbClient as any,
      ddbClientRegular: mockDdbClient as any,
      ddbTableProtocolHigh: DDB_TABLE_NAME,
      ddbTableProtocolRegular: DDB_TABLE_NAME,
      logger: mockLogger as any,
      regionId: APP_REGIONID,
      sqsClientHigh: mockSqsClient as any,
      sqsClientRegular: mockSqsClient as any,
      sqsDdbFailureHigh: SQS_QUEUEURL_DDBFAILURE as any,
      sqsDdbFailureRegular: SQS_QUEUEURL_DDBFAILURE as any,
    });
  });

  describe('#ctor()', () => {
    it('should initialize the passed in services and variables', () => {
      expect(adapter.ddbClientHigh).toBeDefined();
      expect(adapter.ddbClientRegular).toBeDefined();
      expect(adapter.logger).toBeDefined();
      expect(adapter.sqsClientHigh).toBeDefined();
      expect(adapter.sqsClientRegular).toBeDefined();

      expect(adapter.ddbTableProtocolHigh).toEqual(DDB_TABLE_NAME);
      expect(adapter.ddbTableProtocolRegular).toEqual(DDB_TABLE_NAME);
      expect(adapter.regionId).toEqual(APP_REGIONID);
      expect(adapter.sqsDdbFailureHigh).toEqual(SQS_QUEUEURL_DDBFAILURE);
      expect(adapter.sqsDdbFailureRegular).toEqual(SQS_QUEUEURL_DDBFAILURE);
    });
  });

  describe('#handleNotification()', () => {
    it('should sink all success messages to DynamoDB directly', async () => {
      // Arrange
      const alertNotification: AlertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);

      mockDdbClient.update.mockReturnValue({
        promise: jest.fn(),
      });

      // Act
      const actualResult = await adapter.handleNotification('high', alertNotification, {
        results: [
          {
            flowChannel: 'all',
            platform: 'apns',
            success: true,
          },
          {
            flowChannel: 'selected',
            platform: 'apns',
            success: true,
          },
        ],
      });

      // Assert
      expect(actualResult).toEqual({
        results: [
          {
            flowChannel: 'all',
            platform: 'apns',
            success: true,
          },
          {
            flowChannel: 'selected',
            platform: 'apns',
            success: true,
          },
        ],
      });

      expect(mockDdbClient.update).toHaveBeenCalledTimes(2);
      expect(mockDdbClient.update.mock.calls[0]).toEqual([
        getUpdateParamsForDynamoDb('all', alertNotification),
      ]);
      expect(mockDdbClient.update.mock.calls[1]).toEqual([
        getUpdateParamsForDynamoDb('selected', alertNotification),
      ]);

      // No calls to SQS as this is the fallback
      expect(mockSqsClient.sendMessage).toHaveBeenCalledTimes(0);
    });

    it('should skip a "selected" error result from the previous step and only sink the successful messages to DynamoDB directly', async () => {
      // Arrange
      const alertNotification: AlertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);

      mockDdbClient.update.mockReturnValue({
        promise: jest.fn(),
      });

      // Act
      const actualResult = await adapter.handleNotification('high', alertNotification, {
        results: [
          {
            flowChannel: 'all',
            platform: 'apns',
            success: true,
          },
          {
            flowChannel: 'selected',
            platform: 'apns',
            success: false,
          },
        ],
      });

      // Assert
      expect(actualResult).toEqual({
        results: [
          {
            flowChannel: 'all',
            platform: 'apns',
            success: true,
          },
        ],
      });

      expect(mockDdbClient.update).toHaveBeenCalledTimes(1);
      expect(mockDdbClient.update.mock.calls[0]).toEqual([
        getUpdateParamsForDynamoDb('all', alertNotification),
      ]);

      // No calls to SQS as this is the fallback
      expect(mockSqsClient.sendMessage).toHaveBeenCalledTimes(0);
    });

    it('should enqueue a failed DynamoDB sink to SQS', async () => {
      // Arrange
      const alertNotification: AlertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);

      mockDdbClient.update.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Some arbitrary error')),
      });
      mockSqsClient.sendMessage.mockReturnValue({
        promise: jest.fn(),
      });

      // Act
      const actualResult = await adapter.handleNotification('high', alertNotification, {
        results: [
          {
            flowChannel: 'all',
            platform: 'apns',
            success: true,
          },
          {
            flowChannel: 'selected',
            platform: 'apns',
            success: true,
          },
        ],
      });

      // Assert
      expect(actualResult).toEqual({
        results: [
          {
            flowChannel: 'all',
            platform: 'apns',
            success: true,
          },
          {
            flowChannel: 'selected',
            platform: 'apns',
            success: true,
          },
        ],
      });

      expect(mockDdbClient.update).toHaveBeenCalledTimes(2);
      expect(mockDdbClient.update.mock.calls[0]).toEqual([
        getUpdateParamsForDynamoDb('all', alertNotification),
      ]);
      expect(mockDdbClient.update.mock.calls[1]).toEqual([
        getUpdateParamsForDynamoDb('selected', alertNotification),
      ]);

      // No calls to SQS as this is the fallback
      expect(mockSqsClient.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockSqsClient.sendMessage.mock.calls[0]).toEqual([
        {
          MessageBody: JSON.stringify({
            flowChannel: 'all',
            notification: alertNotification,
          }),
          QueueUrl: SQS_QUEUEURL_DDBFAILURE,
        },
      ]);
      expect(mockSqsClient.sendMessage.mock.calls[1]).toEqual([
        {
          MessageBody: JSON.stringify({
            flowChannel: 'selected',
            notification: alertNotification,
          }),
          QueueUrl: SQS_QUEUEURL_DDBFAILURE,
        },
      ]);
    });
  });
});
