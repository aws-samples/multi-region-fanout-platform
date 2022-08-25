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
import { Pool } from 'pg';
import {
  DashboardReducerDatastoreAdapter,
  DashboardReducerResult,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';

export interface DashboardReducerDatastorePgAdapterConfig {
  pool: Pool;
  logger: LoggingServiceInterface;
}

export class DashboardReducerDatastorePgAdapter implements DashboardReducerDatastoreAdapter {
  readonly pool: Pool;
  readonly logger: LoggingServiceInterface;

  constructor(config: DashboardReducerDatastorePgAdapterConfig) {
    this.pool = config.pool;
    this.logger = config.logger;    
  }

  async listAlertsForRegionKey(regionKey: string): Promise<DashboardReducerResult[]> {
    try {
      this.logger.debug({
        message: 'Retrieving reduced results from database.',
        data: regionKey,
      });

      // TODO: Change SQL query
      const queryReducedResults = 'SELECT * FROM mrfp_mapreduce.alert_notifications no JOIN mrfp_mapreduce.region_maps reg ON no.alert_id = reg.alert_id WHERE reg.region_key = $1;';

      const queryResult = await this.pool.query(
        queryReducedResults,
        [regionKey],
      );

      this.logger.debug({
        message: 'Query result from SQL retrieved.',
        data: queryResult,
      });

      const mappedResult: DashboardReducerResult[] = queryResult.rows.map(r => ({
        i18nTitle: r.i18n,
        id: r.alert_id,
        payload: r.payload,
        sent: r.sent,
      }));

      this.logger.debug({
        message: 'Mapped result from raw SQL.',
        data: mappedResult,
      });

      return mappedResult;
    } catch (error) {
      this.logger.error({
        message: 'Failed to retrieve reduced results from database.',
        errorDetials: error,
      });
      throw error;
    }
  }
}
