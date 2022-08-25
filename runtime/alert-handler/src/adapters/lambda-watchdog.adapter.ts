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
import { S3EventRecord } from 'aws-lambda';
import {
  AlertWatchdogAdapter,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';

export interface LambdaWatchdogOutputAdapterConfig {
  functionName: string;
  lambdaClient: Lambda;
  logger: LoggingServiceInterface;
}

export class LambdaWatchdogOutputAdapter implements AlertWatchdogAdapter {
  readonly functionName: string;
  readonly lambdaClient: Lambda;
  readonly logger: LoggingServiceInterface;

  constructor(config: LambdaWatchdogOutputAdapterConfig) {
    this.functionName = config.functionName;
    this.lambdaClient = config.lambdaClient;
    this.logger = config.logger;
  }

  async invokeWatchdog(record: S3EventRecord): Promise<void> {
    this.logger.debug({
      message: 'Sending S3 event record to watchdog check handler function...',
      data: record,
    });

    // Re-Build S3 Event
    const event = {
      Records: [
        record,
      ],
    };

    const invokeResult = await this.lambdaClient.invoke({
      FunctionName: this.functionName,
      InvocationType: 'Event',
      Payload: JSON.stringify(event),
    }).promise();

    this.logger.debug({
      message: 'Sent S3 event record to watchdog check handler function.',
      data: invokeResult,
    });
  }

}
