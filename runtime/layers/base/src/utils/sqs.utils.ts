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
import { LoggingServiceInterface } from '../interfaces';

const parseSqsQueueUrl = (eventSourceArn: string): string => {
  // "eventSourceARN": "arn:aws:sqs:<REGION>:<ACCOUNT>:my-queue"
  const arnParts = eventSourceArn.split(':');
  const queueUrl = `https://sqs.${arnParts[3]}.amazonaws.com/${arnParts[4]}/${arnParts[5]}`;
  return queueUrl;
};

export const removeMessageFromQueue = async (
  record: SQSRecord,
  context: {
    sqsClient: SQS;
    logger: LoggingServiceInterface,
    functionName: string,
    awsRequestId: string,
  },
): Promise<void> => {
  try {
    await context.sqsClient
      .deleteMessage({
        QueueUrl: parseSqsQueueUrl(record.eventSourceARN),
        ReceiptHandle: record.receiptHandle,
      })
      .promise();
  } catch (error) {
    context.logger.warn({
      message: `Failed to remove SQS message from queue: ${error.message}. No action needed, SQS will automatically retry and clean up.`,
      functionName: context.functionName,
      requestId: context.awsRequestId,
    });
  }
};
