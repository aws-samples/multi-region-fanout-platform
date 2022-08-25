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
import { RDS } from 'aws-sdk';
import { Pool, QueryConfig, QueryResult, QueryResultRow } from 'pg';

export interface DatabaseServiceConfig {
  applicationName?: string;
  connectionTimeoutMillis?: number;
  database: string;
  host: string;
  idleTimeoutMillis?: number;
  max?: number;
  min?: number;
  iamRegion: string;
  port: number;
  username: string;
}

export class DatabaseService {

  pool: Pool;

  constructor(config: DatabaseServiceConfig) {
    this.pool = new Pool({
      application_name: config.applicationName,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      database: config.database,
      host: config.host,
      idleTimeoutMillis: config.idleTimeoutMillis,
      max: config.max,
      min: config.min,
      password: () => new RDS.Signer().getAuthToken({
        hostname: config.host,
        port: config.port,
        region: config.iamRegion,
        username: config.username,
      }),
      port: config.port,
      ssl: {
        rejectUnauthorized: false,
      },
      user: config.username,
    });
  }

  async query<R extends QueryResultRow = any, I extends any[] = any[]>(queryTextOrConfig: string | QueryConfig<I>, values?: I): Promise<QueryResult<R>> {
    const result = await this.pool.query(queryTextOrConfig, values);
    return result;
  }
}
