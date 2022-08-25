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
import { SQSRecord } from 'aws-lambda';
import { SQS } from 'aws-sdk';
import { LoggingService } from './../services/logging.service';
import { v4 } from 'uuid';
import { removeMessageFromQueue } from '.';
import { MockType } from './../../test/mock-type';

const sqsClientMockFactory: () => MockType<SQS> = jest.fn(() => ({
  deleteMessage: jest.fn(),
}));

const mockLoggingServiceFactory: () => MockType<LoggingService> = jest.fn(
  () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    logger: jest.fn(),
    setMetdadata: jest.fn(),
    verbose: jest.fn(),
    warn: jest.fn(),
  }),
);

describe('removeMessageFromQueue', () => {
  let sqsClientMock: MockType<SQS>;
  let loggingServiceMock: MockType<LoggingService>;

  beforeEach(() => {
    sqsClientMock = sqsClientMockFactory();
    loggingServiceMock = mockLoggingServiceFactory();
  });

  it('should call the SQS client to remove the message', async () => {
    const sourceArn = 'arn:aws:sqs:eu-central-1:123456789:test-queue-1';
    const queueUrl = 'https://sqs.eu-central-1.amazonaws.com/123456789/test-queue-1';
    const sqsRecord: SQSRecord = {
      attributes: {
        ApproximateFirstReceiveTimestamp: '2021-12-05T06:13:17.000Z',
        ApproximateReceiveCount: '1',
        SenderId: '',
        SentTimestamp: '2021-12-05T06:13:16.000Z',
      },
      body: 'foo',
      awsRegion: 'eu-central-1',
      eventSource: 'test-queue-1',
      eventSourceARN: sourceArn,
      md5OfBody: '',
      messageAttributes: {},
      messageId: v4(),
      receiptHandle: v4(),
    };

    sqsClientMock.deleteMessage.mockReturnValue({
      promise: jest.fn(),
    });

    await removeMessageFromQueue(sqsRecord, {
      logger: loggingServiceMock as any,
      sqsClient: sqsClientMock as any,
      awsRequestId: v4(),
      functionName: 'test',
    });

    expect(sqsClientMock.deleteMessage).toHaveBeenCalledTimes(1);
    expect(sqsClientMock.deleteMessage.mock.calls[0]).toEqual([
      {
        QueueUrl: queueUrl,
        ReceiptHandle: sqsRecord.receiptHandle,
      },
    ]);
    expect(loggingServiceMock.warn).toHaveBeenCalledTimes(0);
  });

  it('should not fail if the call to SQS fails', async () => {
    const sourceArn = 'arn:aws:sqs:eu-central-1:123456789:test-queue-1';
    const queueUrl = 'https://sqs.eu-central-1.amazonaws.com/123456789/test-queue-1';
    const sqsRecord: SQSRecord = {
      attributes: {
        ApproximateFirstReceiveTimestamp: '2021-12-05T06:13:17.000Z',
        ApproximateReceiveCount: '1',
        SenderId: '',
        SentTimestamp: '2021-12-05T06:13:16.000Z',
      },
      body: 'foo',
      awsRegion: 'eu-central-1',
      eventSource: 'test-queue-1',
      eventSourceARN: sourceArn,
      md5OfBody: '',
      messageAttributes: {},
      messageId: v4(),
      receiptHandle: v4(),
    };

    sqsClientMock.deleteMessage.mockResolvedValue({
      promise: jest.fn().mockRejectedValue(new Error('some arbitrary error')),
    });

    await removeMessageFromQueue(sqsRecord, {
      logger: loggingServiceMock as any,
      sqsClient: sqsClientMock as any,
      awsRequestId: v4(),
      functionName: 'test',
    });

    expect(sqsClientMock.deleteMessage).toHaveBeenCalledTimes(1);
    expect(sqsClientMock.deleteMessage.mock.calls[0]).toEqual([
      {
        QueueUrl: queueUrl,
        ReceiptHandle: sqsRecord.receiptHandle,
      },
    ]);
    expect(loggingServiceMock.warn).toHaveBeenCalledTimes(1);
  });
});
