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

import { LoggingServiceInterface } from '../modules/LoggingServiceInterface';
import { createLogger, format, Logger, transports } from 'winston';

export class LoggingService implements LoggingServiceInterface {
  public logger: Logger;

  constructor() {
    this.logger = createLogger({
      level: (process.env.LOG_LEVEL as any) ?? 'warn',
      format: format.json(),
      transports: [new transports.Console()],
    });
  }

  public setMetdadata(meta: any): void {
    this.logger.defaultMeta = meta;
  }

  error(infoObject: object): void {
    this.logger.error(infoObject);
  }

  warn(infoObject: object): void {
    this.logger.warn(infoObject);
  }

  info(infoObject: object): void {
    this.logger.info(infoObject);
  }

  verbose(infoObject: object): void {
    this.logger.verbose(infoObject);
  }

  debug(infoObject: object): void {
    this.logger.debug(infoObject);
  }
}
