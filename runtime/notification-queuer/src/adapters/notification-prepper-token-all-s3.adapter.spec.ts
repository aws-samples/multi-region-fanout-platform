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
import { S3 } from 'aws-sdk';
import { random, system } from 'faker';
import { generateAlertNotification } from './../../test/data-gen';
import {
  ListTokenAllResponse,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';
import { MockType } from './../../test/mock-type';
import { NotificationPrepperTokenAllS3Adapter } from './notification-prepper-token-all-s3.adapter';

const S3_BUCKET_ALLCHUNKS = 'test-all-chunks';

describe('NotificationPrepperTokenAllS3Adapter', () => {
  let adapter: NotificationPrepperTokenAllS3Adapter;
  let mockLogger: MockType<LoggingServiceInterface>;
  let mockS3Client: MockType<S3>;

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
    mockS3Client = {
      listObjectsV2: jest.fn(),
    };
    adapter = new NotificationPrepperTokenAllS3Adapter({
      logger: mockLogger as any,
      s3BucketAllChunks: S3_BUCKET_ALLCHUNKS,
      s3Client: mockS3Client as any,
    });
  });

  describe('#ctor()', () => {
    it('should initialize the passed in services and variables', () => {
      //expect(adapter.ddbClient).toBeDefined();
      expect(adapter.logger).toBeDefined();
      expect(adapter.s3Client).toBeDefined();

      expect(adapter.s3BucketAllChunks).toEqual(S3_BUCKET_ALLCHUNKS);
    });
  });

  describe('#getTokens()', () => {
    it('should return token batches from S3 without continuation token (initial request)', async () => {
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

      const s3ListResponseMocked = {
        Contents: [],
      };

      for (let index = 0; index < 800; index++) {
        s3ListResponseMocked.Contents.push({
          Key: system.filePath(),
        });
      }

      mockS3Client.listObjectsV2.mockReturnValue({
        promise: jest.fn().mockResolvedValueOnce(s3ListResponseMocked),
      });

      // Act
      const result = await adapter.getTokens(
        alertNotification.provider,
        alertNotification.platform,
        alertNotification.severity,
      );

      // Assert
      const expectedResult: ListTokenAllResponse = {
        platform: alertNotification.platform,
        provider: alertNotification.provider,
        results: s3ListResponseMocked.Contents.map((c) => ({
          bucket: S3_BUCKET_ALLCHUNKS,
          key: c.Key,
        })),
        severity: alertNotification.severity,
      };
      expect(result).toEqual(expectedResult);
      expect(mockS3Client.listObjectsV2).toBeCalledTimes(1);
      expect(mockS3Client.listObjectsV2.mock.calls[0]).toEqual([
        {
          Bucket: S3_BUCKET_ALLCHUNKS,
          Prefix: `${alertNotification.provider}/${alertNotification.platform}/${alertNotification.severity}/`,
          StartAfter: `${alertNotification.provider}/${alertNotification.platform}/${alertNotification.severity}/`,
          ContinuationToken: undefined,
        },
      ]);
    });
  });
});
