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
import { DeviceUpdate, DeviceUpdateHandlerAdapter, LoggingServiceInterface } from '../interfaces';

export interface DeviceUpdaterServiceConfig {
  registeredAdapters: {
    [key: string]: DeviceUpdateHandlerAdapter
  };
  logger: LoggingServiceInterface;
}
export class DeviceUpdaterService {
  readonly registeredAdapters: {
    [key: string]: DeviceUpdateHandlerAdapter
  };
  readonly logger: LoggingServiceInterface;

  constructor(config: DeviceUpdaterServiceConfig) {
    this.registeredAdapters = config.registeredAdapters;
    this.logger = config.logger;
  }

  async handleUpdate(update: DeviceUpdate): Promise<boolean> {
    this.logger.debug({
      message: 'Processing device update...',
      data: update,
    });

    if (!Object.keys(this.registeredAdapters).includes(update.sqsElementType)) {
      this.logger.warn({
        message: 'No handler registered for device update type.',
        data: update,
      });
      return true;
    }

    const result = await this.registeredAdapters[update.sqsElementType].processUpdate(update);

    this.logger.debug({
      message: 'Processed device update.',
    });

    return result;
  }

}
