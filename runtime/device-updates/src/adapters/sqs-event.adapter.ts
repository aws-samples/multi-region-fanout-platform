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
import {
  DeviceUpdate,
  LoggingServiceInterface,
} from '../../../layers/base/src/interfaces';
import { DeviceUpdaterService } from '/opt/nodejs/src/services';

export interface SqsEventAdapterConfig {
  useCaseService: DeviceUpdaterService;
  logger: LoggingServiceInterface;
}

export class SqsEventAdapter {
  readonly useCaseService: DeviceUpdaterService;
  readonly logger: LoggingServiceInterface;

  constructor(config: SqsEventAdapterConfig) {
    this.useCaseService = config.useCaseService;
    this.logger = config.logger;
  }

  async handleEventRecord(record: SQSRecord): Promise<boolean> {
    this.logger.debug({
      message: 'Handling SQS event record...',
      data: record,
    });

    const deviceUpdate: DeviceUpdate = JSON.parse(record.body);

    this.logger.debug({
      message: 'Parsed SQS body.',
      data: deviceUpdate,
    });

    const updateSuccess = await this.useCaseService.handleUpdate(deviceUpdate);

    this.logger.debug({
      message: 'Handled SQS event record.',
      data: record,
    });

    return updateSuccess;
  }
}
