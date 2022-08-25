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
import {
  AlertNotification,
  DashboardWriterDataStoreAdapter,
  DashboardWriterReducerSinkAdapter,
  LoggingServiceInterface,
} from '../interfaces';

export interface DashboardWriterServiceConfig {
  dataStoreAdapter: DashboardWriterDataStoreAdapter;
  logger: LoggingServiceInterface;
  reducerSinkAdapter: DashboardWriterReducerSinkAdapter;
}

export class DashboardWriterService {
  readonly dataStoreAdapter: DashboardWriterDataStoreAdapter;
  readonly logger: LoggingServiceInterface;
  readonly reducerSinkAdapter: DashboardWriterReducerSinkAdapter;

  constructor(config: DashboardWriterServiceConfig) {
    this.dataStoreAdapter = config.dataStoreAdapter;
    this.logger = config.logger;
    this.reducerSinkAdapter = config.reducerSinkAdapter;
  }

  async writeMapReduceData(notification: AlertNotification): Promise<void> {
    try {
      // Write to database
      const successWrite = await this.dataStoreAdapter.writeData(notification);

      if (!successWrite) {
        this.logger.warn({
          message: 'Failed to write alert notification data to data store.',
        });

        return;
      }

      // Sink to reducer
      const successReducer = await this.reducerSinkAdapter.passToReducer(notification);

      if (!successReducer) {
        this.logger.warn({
          message: 'Failed to pass alert notification data to reducer.',
        });
      }

    } catch (error) {
      this.logger.error({
        message: 'Failed to write map/reduce data for alert notificaiton',
        errorDetails: error,
      });
    }

  }
}
