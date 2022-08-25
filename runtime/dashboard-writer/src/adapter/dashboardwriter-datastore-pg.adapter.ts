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
import { v4 } from 'uuid';
import {
  AlertNotification,
  DashboardWriterDataStoreAdapter,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';

export interface DashboardWriterDataStorePgAdapterConfig {
  pool: Pool;
  logger: LoggingServiceInterface;
}

export class DashboardWriterDataStorePgAdapter implements DashboardWriterDataStoreAdapter {
  readonly pool: Pool;
  readonly logger: LoggingServiceInterface;

  constructor(config: DashboardWriterDataStorePgAdapterConfig) {
    this.pool = config.pool;
    this.logger = config.logger;
  }

  async writeData(notification: AlertNotification): Promise<boolean> {
    try {
      this.logger.debug({
        message: 'Writing data to PostgreSQL for map/reduce...',
        data: notification,
      });

      this.pool.query('BEGIN');
      // TODO: Change SQL query
      const queryAlertNotification = 'INSERT INTO mrfp_mapreduce.alert_notifications VALUES($1, $2, $3, $4);';

      const valuesAlertNotification = [
        notification.id,
        JSON.stringify(notification.payload),
        JSON.stringify(notification.i18nTitle),
        notification.sent,
      ];

      let regionValuesCounter = 1;
      // TODO: Change SQL query
      let queryAlertRegionMap = 'INSERT INTO mrfp_mapreduce.region_maps VALUES ';
      const valuesRegionMap: any[] = [];

      for (const regionKey of notification.regionKeys) {
        if (regionValuesCounter > 1) 
          queryAlertRegionMap += ', ';
        

        queryAlertRegionMap += `($${regionValuesCounter}, $${regionValuesCounter + 1}, $${regionValuesCounter + 2})`;
        valuesRegionMap.push(v4(), notification.id, regionKey);
        regionValuesCounter += 3;
      }

      queryAlertRegionMap += ';';

      console.log(`Query Notification: ${queryAlertNotification}`);
      console.log(`Query Mappings: ${queryAlertRegionMap}`);

      await this.pool.query(queryAlertNotification, valuesAlertNotification);
      await this.pool.query(queryAlertRegionMap, valuesRegionMap);

      await this.pool.query('COMMIT');


      return true;
    } catch (error) {
      await this.pool.query('ROLLBACK');
      this.logger.error({
        message: 'Failed to write data to PostgreSQL for map/reduce.',
        data: notification,
        errorDetails: error,
      });

      return false;
    }
  }

}
