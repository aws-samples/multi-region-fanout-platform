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
import { LoggingService } from './logging.service';

describe('LoggingService', () => {
  const OLD_ENV = process.env;
  let service: LoggingService;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
    service = new LoggingService();
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  describe('#ctor', () => {
    it('should instantiate a new winston logger', () => {
      expect(service.logger).toBeDefined();
      expect(service.logger.level).toEqual('warning');
    });

    it('should instantiate a new winston logger with the log level from the environment variable LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'error';
      service = new LoggingService();
      expect(service.logger).toBeDefined();
      expect(service.logger.level).toEqual('error');
    });
  });

  describe('#setMetadata()', () => {
    it('should set the defaultMeta of the winston logger', () => {
      const meta = {
        application: 'foo',
      };
      service.setMetdadata(meta);
      expect(service.logger).toBeDefined();
      expect(service.logger.defaultMeta).toEqual(meta);
    });
  });

  describe('#error()', () => {
    it('should invoke the error method of the winston logger', () => {
      const errorSpy = jest.spyOn(service.logger, 'error');
      const infoObject = {
        message: 'Something went wrong.',
      };
      service.error(infoObject);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(infoObject);

      errorSpy.mockRestore();
    });
  });

  describe('#warn()', () => {
    it('should invoke the warn method of the winston logger', () => {
      const warnSpy = jest.spyOn(service.logger, 'warn');
      const infoObject = {
        message: 'Something went partially wrong.',
      };
      service.warn(infoObject);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(infoObject);

      warnSpy.mockRestore();
    });
  });

  describe('#info()', () => {
    it('should invoke the info method of the winston logger', () => {
      const infoSpy = jest.spyOn(service.logger, 'info');
      const infoObject = {
        message: 'Some info.',
      };
      service.info(infoObject);

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith(infoObject);

      infoSpy.mockRestore();
    });
  });

  describe('#verbose()', () => {
    it('should invoke the verbose method of the winston logger', () => {
      const verboseSpy = jest.spyOn(service.logger, 'verbose');
      const verboseObject = {
        message: 'Some verbose stuff.',
      };
      service.verbose(verboseObject);

      expect(verboseSpy).toHaveBeenCalledTimes(1);
      expect(verboseSpy).toHaveBeenCalledWith(verboseObject);

      verboseSpy.mockRestore();
    });
  });

  describe('#debug()', () => {
    it('should invoke the debug method of the winston logger', () => {
      const debugSpy = jest.spyOn(service.logger, 'debug');
      const debugObject = {
        message: 'Some debug stuff.',
      };
      service.debug(debugObject);

      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenCalledWith(debugObject);

      debugSpy.mockRestore();
    });
  });
});
