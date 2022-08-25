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
import { S3Event } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { datatype, date, internet, lorem, random, system } from 'faker';
import { v4 } from 'uuid';
import { MockType } from '../../test/mock-type';
import { Alert, AlertMetadata, AlertServiceInterface, LoggingServiceInterface } from './../../../layers/base/src/interfaces';
import { S3EventAdapter } from './s3-event.adapter';

const NOTIFICATION_PLATFORM = 'apns';
const ALERT_PROVIDER = 'TestDummy';
const APP_S3TAG_HASH = 'Hash';
const APP_S3TAG_HASHJSON = 'JSON_Hash';
const APP_S3TAG_PROVIDER = 'Provider';
const S3_BUCKET_FAIL = 'rudisresterampe';
import * as crypto from 'crypto';

const generateAlert = (languages: string[], area: {
  areaDesc: string;
  geocode: {
    valueName: string;
    value: string;
  }[];
}[]): Alert => {
  const alert: Alert = {
    code: [random.word()],
    identifier: v4(),
    msgType: 'Alert',
    scope: 'Public',
    status: 'Exercise',
    sent: date.recent().toISOString(),
    sender: 'DE-NW-MS-SE043',
    source: random.words(2),
    info: languages.map(l => ({
      area,
      category: [
        random.word(),
      ],
      certainty: 'Observed',
      description: lorem.paragraph(1),
      event: random.word(),
      headline: random.words(4),
      instruction: lorem.paragraphs(2),
      language: l,
      severity: 'Extreme',
      urgency: 'Immediate',
    })),
  };

  return alert;
};

describe('S3EventAdapter', () => {
  let adapter: S3EventAdapter;
  let mockAlertService: MockType<AlertServiceInterface>;
  let mockLogger: MockType<LoggingServiceInterface>;
  let mockS3Client: MockType<S3>;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    mockAlertService = {
      createAlertNotification: jest.fn(),
      createWatchdogNotification: jest.fn(),
    };
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      setMetdadata: jest.fn(),
      verbose: jest.fn(),
      warn: jest.fn(),
    };
    mockS3Client = {
      getObject: jest.fn(),
      getObjectTagging: jest.fn(),
    };
    adapter = new S3EventAdapter({
      alertService: mockAlertService as any,
      logger: mockLogger as any,
      notificationPlatform: NOTIFICATION_PLATFORM,
      s3Client: mockS3Client as any,
      s3TagHash: APP_S3TAG_HASH,
      s3TagHashJson: APP_S3TAG_HASHJSON,
      s3TagProvider: APP_S3TAG_PROVIDER,
      hashBitToProcess: '0',
      s3Bucket3R: S3_BUCKET_FAIL,
    });
  });

  describe('#ctor()', () => {
    it('should initialize the passed in services and variables', () => {
      expect(adapter.alertService).toBeDefined();
      expect(adapter.logger).toBeDefined();
      expect(adapter.notificationPlatform).toEqual(NOTIFICATION_PLATFORM);
      expect(adapter.s3Client).toBeDefined();
    });
  });

  describe('#handleEvent()', () => {
    it('should not do anything if no records are present', async () => {
      // Arrange
      const event: S3Event = {
        Records: [],
      };

      // Act
      await adapter.handleEvent(event);

      // Assert
      expect(mockAlertService.createAlertNotification).toHaveBeenCalledTimes(0);
      expect(mockAlertService.createWatchdogNotification).toHaveBeenCalledTimes(0);
      expect(mockS3Client.getObject).toHaveBeenCalledTimes(0);
      expect(mockS3Client.getObjectTagging).toHaveBeenCalledTimes(0);
    });

    it('should download the object and tags from S3 and call the alertService', async () => {
      // Arrange
      const event: S3Event = {
        Records: [{
          awsRegion: 'eu-central-1',
          eventName: 'test',
          eventSource: 's3',
          eventTime: date.recent().toISOString(),
          eventVersion: '1',
          requestParameters: {
            sourceIPAddress: internet.ip(),
          },
          responseElements: {
            'x-amz-request-id': v4(),
            'x-amz-id-2': v4(),
          },
          s3: {
            bucket: {
              arn: random.word(),
              name: random.word().toLowerCase(),
              ownerIdentity: {
                principalId: random.word(),
              },
            },
            configurationId: v4(),
            object: {
              eTag: random.alphaNumeric(10),
              key: system.filePath(),
              sequencer: '1',
              size: datatype.number(7658986),
              versionId: '1',
            },
            s3SchemaVersion: '1',
          },
          userIdentity: {
            principalId: v4(),
          },
        }],
      };
      const alert = generateAlert(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '[100,10 50,250 80,650]',
          valueName: 'MKT',
        }],
      }]);

      const meta: AlertMetadata = {
        hash: crypto.createHash('sha256').update('foo').digest('hex'),
        hashJson: random.alphaNumeric(13),
        platform: NOTIFICATION_PLATFORM,
        provider: ALERT_PROVIDER,
        received: date.recent().toISOString(),
        s3Bucket: event.Records[0].s3.bucket.name,
        s3Key: event.Records[0].s3.object.key,
      };

      mockS3Client.getObject.mockReturnValueOnce({
        promise: jest.fn().mockResolvedValueOnce({
          ContentLength: datatype.number(75236786),
          Body: {
            toString: jest.fn().mockReturnValueOnce(JSON.stringify(alert)),
          },
        }),
      });

      mockS3Client.getObjectTagging.mockReturnValueOnce({
        promise: jest.fn().mockReturnValueOnce({
          TagSet: [{
            Key: APP_S3TAG_HASH,
            Value: meta.hash,
          }, {
            Key: APP_S3TAG_HASHJSON,
            Value: meta.hashJson,
          }, {
            Key: APP_S3TAG_PROVIDER,
            Value: meta.provider,
          }],
        }),
      });


      // Act
      await adapter.handleEvent(event);

      // Assert
      expect(mockAlertService.createAlertNotification).toHaveBeenCalledTimes(1);
      expect(mockAlertService.createWatchdogNotification).toHaveBeenCalledTimes(0);
      expect(mockS3Client.getObject).toHaveBeenCalledTimes(1);
      expect(mockS3Client.getObjectTagging).toHaveBeenCalledTimes(1);
      expect(mockS3Client.getObject.mock.calls[0]).toEqual([{
        Bucket: event.Records[0].s3.bucket.name,
        Key: event.Records[0].s3.object.key,
      }]);
      expect(mockS3Client.getObjectTagging.mock.calls[0]).toEqual([{
        Bucket: event.Records[0].s3.bucket.name,
        Key: event.Records[0].s3.object.key,
      }]);
      expect(mockAlertService.createAlertNotification.mock.calls[0]).toEqual([
        'high',
        alert,
        {
          ...meta,
          received: expect.any(String),
        },
      ]);
    });

    it('should download the object and tags from S3 and call the alertService watchdog notification', async () => {
      // Arrange
      const event: S3Event = {
        Records: [{
          awsRegion: 'eu-central-1',
          eventName: 'test',
          eventSource: 's3',
          eventTime: date.recent().toISOString(),
          eventVersion: '1',
          requestParameters: {
            sourceIPAddress: internet.ip(),
          },
          responseElements: {
            'x-amz-request-id': v4(),
            'x-amz-id-2': v4(),
          },
          s3: {
            bucket: {
              arn: random.word(),
              name: random.word().toLowerCase(),
              ownerIdentity: {
                principalId: random.word(),
              },
            },
            configurationId: v4(),
            object: {
              eTag: random.alphaNumeric(10),
              key: system.filePath(),
              sequencer: '1',
              size: datatype.number(7658986),
              versionId: '1',
            },
            s3SchemaVersion: '1',
          },
          userIdentity: {
            principalId: v4(),
          },
        }],
      };
      const alert = generateAlert(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '[100,10 50,250 80,650]',
          valueName: 'MKT',
        }],
      }]);

      const meta: AlertMetadata = {
        hash: crypto.createHash('sha256').update('bar').digest('hex'),
        hashJson: random.alphaNumeric(13),
        platform: NOTIFICATION_PLATFORM,
        provider: ALERT_PROVIDER,
        received: date.recent().toISOString(),
        s3Bucket: event.Records[0].s3.bucket.name,
        s3Key: event.Records[0].s3.object.key,
      };

      mockS3Client.getObject.mockReturnValueOnce({
        promise: jest.fn().mockResolvedValueOnce({
          ContentLength: datatype.number(75236786),
          Body: {
            toString: jest.fn().mockReturnValueOnce(JSON.stringify(alert)),
          },
        }),
      });

      mockS3Client.getObjectTagging.mockReturnValueOnce({
        promise: jest.fn().mockReturnValueOnce({
          TagSet: [{
            Key: APP_S3TAG_HASH,
            Value: meta.hash,
          }, {
            Key: APP_S3TAG_HASHJSON,
            Value: meta.hashJson,
          }, {
            Key: APP_S3TAG_PROVIDER,
            Value: meta.provider,
          }],
        }),
      });


      // Act
      await adapter.handleEvent(event);

      // Assert
      expect(mockAlertService.createAlertNotification).toHaveBeenCalledTimes(0);
      expect(mockAlertService.createWatchdogNotification).toHaveBeenCalledTimes(1);
      expect(mockS3Client.getObject).toHaveBeenCalledTimes(1);
      expect(mockS3Client.getObjectTagging).toHaveBeenCalledTimes(1);
      expect(mockS3Client.getObject.mock.calls[0]).toEqual([{
        Bucket: event.Records[0].s3.bucket.name,
        Key: event.Records[0].s3.object.key,
      }]);
      expect(mockS3Client.getObjectTagging.mock.calls[0]).toEqual([{
        Bucket: event.Records[0].s3.bucket.name,
        Key: event.Records[0].s3.object.key,
      }]);
      expect(mockAlertService.createWatchdogNotification.mock.calls[0]).toEqual(event.Records);
    });
  });
});
