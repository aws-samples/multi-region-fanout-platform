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
import { mapSeverityToLevel } from './../utils';
import {
  ListTokenSelectedResponse,
  LoggingServiceInterface,
  NotificationPrepperTokenSelectedAdapterInterface,
} from './../../../layers/base/src/interfaces';

export interface NotificationPrepperTokenSelectedRdsAdapterConfig {
  pool: Pool;
  logger: LoggingServiceInterface;
}

export class NotificationPrepperTokenSelectedRdsAdapter
implements NotificationPrepperTokenSelectedAdapterInterface {
  readonly pool: Pool;
  readonly queryLookup: {
    provider: string;
    platform: string;
    query: string;
  }[];
  readonly logger: LoggingServiceInterface;

  constructor(config: NotificationPrepperTokenSelectedRdsAdapterConfig) {
    this.pool = config.pool;
    this.queryLookup = this.populateQueryLookup();
    this.logger = config.logger;
  }

  async getTokens(
    provider: string,
    platform: string,
    severity: string,
    offset: number,
    limit: number,
    regionKeys: string[],
  ): Promise<ListTokenSelectedResponse> {
    const queryFound = this.queryLookup.find(
      (l) => l.platform === platform.toUpperCase() && l.provider === provider.toUpperCase(),
    );

    this.logger.debug({
      message: `Querying push tokens for platform '${platform}' and provider '${provider}'`,
    });

    if (!queryFound) {
      this.logger.warn({
        message: `No query configured for platform '${platform}' and provider '${provider}'`,
        data: this.queryLookup,
      });
      return {
        platform,
        provider,
        regionKeys,
        results: [],
        severity,
      };
    }

    /**
     * Values passed down to the query
     * 1 - Level
     * 2 - Region Keys
     * 3 - LIMIT
     * 4 - OFFSET
     * */
    const queryValues = [
      mapSeverityToLevel(severity),
      regionKeys,
      limit,
      offset,
    ];

    try {

      const queryResult = await this.pool.query(queryFound.query, queryValues);
      this.logger.debug({
        message: `Queried push tokens for platform '${platform}' and provider '${provider}'`,
        data: queryResult,
      });

      const pushtokens = queryResult.rows.map((row) => row.pushtoken);

      return {
        platform,
        provider,
        regionKeys,
        results: pushtokens,
        severity,
      };
    } catch (error) {
      this.logger.error({
        message: 'Failed to query database',
        errorDetails: error,
      });
      return {
        platform,
        provider,
        regionKeys,
        results: [],
        severity,
      };
    }
  }

  private populateQueryLookup(): {
    provider: string;
    platform: string;
    query: string;
  }[] {
    const result: {
      provider: string;
      platform: string;
      query: string;
    }[] = [];

    // COMPLETED: Change SQL query
    result.push({
      provider: 'AP2',
      platform: 'PNP1',
      query:
        "SELECT d.pushtoken FROM mrfp_ops.devices d WHERE d.platform = 'PNP1' AND d.ap2_level >= $1 AND d.mylocation = false AND d.regions && array(SELECT geo.region_key FROM mrfp_ops.geos geo WHERE geo.zcurve_gem = ANY ($2)) ORDER BY d.device_id LIMIT $3 OFFSET $4;",
    });

    // COMPLETED: Change SQL query
    result.push({
      provider: 'AP2',
      platform: 'PNP2',
      query:
      "SELECT d.pushtoken FROM mrfp_ops.devices d WHERE d.platform = 'PNP2' AND d.ap2_level >= $1 AND d.mylocation = false AND d.regions && array(SELECT geo.region_key FROM mrfp_ops.geos geo WHERE geo.zcurve_gem = ANY ($2)) ORDER BY d.device_id LIMIT $3 OFFSET $4;",
    });

    return result;
  }
}
