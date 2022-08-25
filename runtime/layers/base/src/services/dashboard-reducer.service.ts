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
import { DashboardReducerDatastoreAdapter, DashboardReducerResultStoreAdapter, LoggingServiceInterface } from '../interfaces';

export interface DashboardReducerServiceConfig {
  dataStoreAdapter: DashboardReducerDatastoreAdapter;
  resultStoreAdapter: DashboardReducerResultStoreAdapter;
  logger: LoggingServiceInterface;
}

export class DashboardReducerService {
  readonly dataStoreAdapter: DashboardReducerDatastoreAdapter;
  readonly resultStoreAdapter: DashboardReducerResultStoreAdapter;
  readonly logger: LoggingServiceInterface;

  constructor(config: DashboardReducerServiceConfig) {
    this.dataStoreAdapter = config.dataStoreAdapter;
    this.resultStoreAdapter = config.resultStoreAdapter;
    this.logger = config.logger;
  }

  async reduceRegionKey(regionKey: string): Promise<boolean> {
    try {
      this.logger.debug({
        message: 'Received new region key reduction task',
        data: regionKey,
      });

      const listResults = await this.dataStoreAdapter.listAlertsForRegionKey(regionKey);

      this.logger.debug({
        message: 'Retrieved relevant alerts for region key.',
        data: listResults,
      });

      const success = await this.resultStoreAdapter.storeReducedResults(regionKey, listResults);

      this.logger.debug({
        message: 'Successfully reduced region key.',
        data: regionKey,
      });
      return success;
    } catch (error) {
      this.logger.error({
        message: 'Failed to reduce region key.',
        errorDetails: error,
      });
      return false;
    }
  }
}
