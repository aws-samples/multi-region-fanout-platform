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
import { generateAlertNotification } from '../../test/data-gen';
import { MockType } from '../../test/mock-type';
import { Alert, AlertMetadata, AlertServiceInterface, LoggingServiceInterface } from './../../../layers/base/src/interfaces';
import { S3EventAdapter } from './s3-event.adapter';
import { S3ObjectFlaggerAdapter } from './s3-objectflagger.adapter';

const APP_S3TAG_PROCESSED = 'AWS_Processed';


describe('S3ObjectFlaggerAdapter', () => {
  let adapter: S3ObjectFlaggerAdapter;
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
      getObjectTagging: jest.fn(),
      putObjectTagging: jest.fn(),
    };
    adapter = new S3ObjectFlaggerAdapter({
      logger: mockLogger as any,
      s3Client: mockS3Client as any,
      s3TagProcessed: APP_S3TAG_PROCESSED,
    });
  });

  describe('#ctor()', () => {
    it('should initialize the passed in services and variables', () => {
      expect(adapter.logger).toBeDefined();
      expect(adapter.s3TagProcessed).toEqual(APP_S3TAG_PROCESSED);
      expect(adapter.s3Client).toBeDefined();
    });
  });

  describe('#flagObject()', () => {

    it('should update the tag', async () => {
      // Arrange
      const alertNotification = generateAlertNotification(['DE'], [{
        areaDesc: random.words(2),
        geocode: [{
          value: '055150000000',
          valueName: 'SHN',
        }],
      }]);

      mockS3Client.getObjectTagging.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          TagSet: [
            {
              Key: APP_S3TAG_PROCESSED,
              Value: 'false',
            },
            {
              Key: 'foo',
              Value: 'bar',
            },
          ],
        }),
      });

      mockS3Client.putObjectTagging.mockReturnValue({
        promise: jest.fn(),
      });

      // Act
      await adapter.flagObject(alertNotification);

      // Assert
      expect(mockS3Client.getObjectTagging).toHaveBeenCalledTimes(1);
      expect(mockS3Client.getObjectTagging.mock.calls[0]).toEqual([
        {
          Bucket: alertNotification.s3Bucket,
          Key: alertNotification.s3Key,
        },
      ]);
      expect(mockS3Client.putObjectTagging).toHaveBeenCalledTimes(1);
      expect(mockS3Client.putObjectTagging.mock.calls[0]).toEqual([
        {
          Bucket: alertNotification.s3Bucket,
          Key: alertNotification.s3Key,
          Tagging: {
            TagSet:
            [{
              Key: APP_S3TAG_PROCESSED,
              Value: 'true',
            },
            {
              Key: 'foo',
              Value: 'bar',
            },
            ],
          },
        },
      ]);
    });
  });
});
