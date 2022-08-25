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
  DeviceUpdate,
  DeviceUpdateHandlerAdapter,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';

export interface RegisterDeviceHandlerAdapterConfig {
  query: string;
  pool: Pool;
  logger: LoggingServiceInterface;
}

export class RegisterDeviceHandlerAdapter implements DeviceUpdateHandlerAdapter {
  readonly query: string;
  readonly pool: Pool;
  readonly logger: LoggingServiceInterface;

  constructor(config: RegisterDeviceHandlerAdapterConfig) {
    this.query = config.query;
    this.pool = config.pool;
    this.logger = config.logger;
  }

  async processUpdate(update: DeviceUpdate): Promise<boolean> {
    try {
      this.logger.debug({
        message: 'Handling device registration...',
        data: update,
      });
      const created = new Date().toISOString();
      // deviceid
      // , platform
      // , pushtoken
      // , created
      // , modified
      // , preferences_osversioncode
      // , preferences_ap1 
      // , preferences_ap2 
      // , preferences_ap3 
      // , preferences_ap4 
      // , preferences_mylocation
      // , regions
      const queryResult = await this.pool.query(this.query, [
        update.deviceId,
        update.platform,
        update.token.token,
        created,
        created,
        update.version,
        0,
        0,
        0,
        0,
        false,
        null
      ]);

      this.logger.debug({
        message: 'Handled device registration.',
        data: update,
        queryResult,
      });

      return true;

    } catch (error) {
      this.logger.error({
        message: 'Failed to handle device registration.',
        data: update,
        errorDetails: error,
      });

      return false;
    }

  }

}
