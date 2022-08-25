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
import { date, lorem, random, system } from 'faker';
import { v4 } from 'uuid';
import { Pool } from 'pg';
import {
  Alert,
  AlertMetadata,
  AlertNotification,
  AlertNotificationAdapter,
  AlertNotificationAdapterResult,
  AlertObjectFlaggerAdapter,
  AlertWatchdogAdapter,
  LoggingServiceInterface,
} from './../interfaces';
import { MockType } from './../../test/mock-type';
import { AlertService } from './alert.service';
import { S3EventRecord } from 'aws-lambda';


const generateAlert = (languages: string[], area: {
  areaDesc: string;
  geocode: {
    valueName: string;
    value: string;
  }[];
}[]): Alert => {
  const alert: Alert = {
    code: [random.word()],
    identifier: v4(),
    msgType: 'Alert',
    scope: 'Public',
    status: 'Exercise',
    sent: date.recent().toISOString(),
    sender: 'DE-NW-MS-SE043',
    source: random.words(2),
    info: languages.map(l => ({
      area,
      category: [
        random.word(),
      ],
      certainty: 'Observed',
      description: lorem.paragraph(1),
      event: random.word(),
      headline: random.words(4),
      instruction: lorem.paragraphs(2),
      language: l,
      severity: 'Extreme',
      urgency: 'Immediate',
    })),
  };

  return alert;
};

const QUERY_MKT = '/* TODO: Implement query for MKT */';
const QUERY_SHN = '/* TODO: Implement query for SHN */';
const QUERY_WARNCELLS = 'select zcurve_gem from mrfp_ops.geos geo where st_intersects(geo.wkb_geometry,  (SELECT ST_Union(wkb_geometry) FROM mrfp_ops.warncells w WHERE warncell_id = ANY($1::int[])))';

describe('AlertService', () => {
  let service: AlertService;
  let mockPool: MockType<Pool>;
  let mockLogger: MockType<LoggingServiceInterface>;
  let mockFlagger: MockType<AlertObjectFlaggerAdapter>;
  let mockWatchdogAdapter: MockType<AlertWatchdogAdapter>;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    mockPool = {
      query: jest.fn(),
    };
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      setMetdadata: jest.fn(),
      verbose: jest.fn(),
      warn: jest.fn(),
    };
    mockFlagger = {
      flagObject: jest.fn(),
    };
    mockWatchdogAdapter = {
      invokeWatchdog: jest.fn(),
    };
    service = new AlertService({
      logger: mockLogger as any,
      pool: mockPool as any,
      queryWkt: QUERY_MKT,
      querySHN: QUERY_SHN,
      queryWarnCell: QUERY_WARNCELLS,
      objectFlaggerAdapter: mockFlagger as any,
    });
  });


  it('should retrieve z-curves for an alert with German and SHN geocodes', async () => {
    // Arrange
    const alert = generateAlert(['DE'], [{
      areaDesc: random.words(2),
      geocode: [{
        value: '055150000000',
        valueName: 'SHN',
      }],
    }]);
    const meta: AlertMetadata = {
      hash: random.word(),
      hashJson: random.word(),
      platform: 'apns',
      provider: 'AP1',
      received: date.recent().toISOString(),
      s3Bucket: random.word(),
      s3Key: system.fileName(),
    };
    const zGems = [3530, 100001];
    mockPool.query.mockResolvedValueOnce({
      rowCount: 2,
      rows: zGems,
    });

    // Act
    const actual = await service.createAlertNotification('high', alert, meta);

    // Assert
    const expectedResult: AlertNotification = {
      hash: meta.hash,
      hashJson: meta.hashJson,
      i18nTitle: {
        'DE': alert.info[0].headline,
      },
      id: alert.identifier,
      payload: {
        hash: meta.hash,
        id: alert.identifier,
        type: 'ALERT',
        version: 1,
        data: {
          area: {
            type: 'ZGEM',
            data: zGems.join(','),
          },
          headline: alert.info[0].headline,
          msgType: alert.msgType,
          provider: meta.provider,
          severity: alert.info[0].severity,
          transKeys: {
            event: alert.identifier,
          },
        },
      },
      platform: meta.platform,
      provider: meta.provider,
      received: meta.received,
      s3Bucket: meta.s3Bucket,
      s3Key: meta.s3Key,
      sent: alert.sent,
      severity: alert.info[0].severity,
      regionKeys: ['055150000000'],
    };

    expect(actual).toEqual(expectedResult);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockPool.query.mock.calls[0]).toEqual([
      QUERY_SHN,
      [alert.info[0].area.map(a => a.geocode).flat(1).filter(c => c.valueName === 'SHN').map(c => c.value)],
    ]);
  });

  it('should retrieve z-curves for an alert with German and WARNCELL geocodes', async () => {
    // Arrange
    const alert = generateAlert(['DE'], [{
      areaDesc: random.words(2),
      geocode: [{
        value: '809177144',
        valueName: 'WARNCELL',
      }],
    }]);
    const meta: AlertMetadata = {
      hash: random.word(),
      hashJson: random.word(),
      platform: 'apns',
      provider: 'AP1',
      received: date.recent().toISOString(),
      s3Bucket: random.word(),
      s3Key: system.fileName(),
    };
    const zGems = [3530, 100001];
    mockPool.query.mockResolvedValueOnce({
      rowCount: 2,
      rows: zGems,
    });

    // Act
    const actual = await service.createAlertNotification('high', alert, meta);

    // Assert
    const expectedResult: AlertNotification = {
      hash: meta.hash,
      hashJson: meta.hashJson,
      i18nTitle: {
        'DE': alert.info[0].headline,
      },
      id: alert.identifier,
      payload: {
        hash: meta.hash,
        id: alert.identifier,
        type: 'ALERT',
        version: 1,
        data: {
          area: {
            type: 'ZGEM',
            data: zGems.join(','),
          },
          headline: alert.info[0].headline,
          msgType: alert.msgType,
          provider: meta.provider,
          severity: alert.info[0].severity,
          transKeys: {
            event: alert.identifier,
          },
        },
      },
      platform: meta.platform,
      provider: meta.provider,
      received: meta.received,
      s3Bucket: meta.s3Bucket,
      s3Key: meta.s3Key,
      sent: alert.sent,
      severity: alert.info[0].severity,
      regionKeys: [],
    };

    expect(actual).toEqual(expectedResult);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockPool.query.mock.calls[0]).toEqual([
      QUERY_WARNCELLS,
      [alert.info[0].area.map(a => a.geocode).flat(1).filter(c => c.valueName === 'WARNCELL').map(c => parseInt(c.value, 10))],
    ]);
  });

  it('should retrieve z-curves for an alert with German and WKT geocodes', async () => {
    // Arrange
    const alert = generateAlert(['DE'], [{
      areaDesc: random.words(2),
      geocode: [{
        value: '[100,10 50,250 80,650]',
        valueName: 'WKT',
      }],
    }]);
    const meta: AlertMetadata = {
      hash: random.word(),
      hashJson: random.word(),
      platform: 'apns',
      provider: 'AP1',
      received: date.recent().toISOString(),
      s3Bucket: random.word(),
      s3Key: system.fileName(),
    };
    const zGems = [3530, 100001];
    mockPool.query.mockResolvedValueOnce({
      rowCount: 2,
      rows: zGems,
    });

    // Act
    const actual = await service.createAlertNotification('high', alert, meta);

    // Assert
    const expectedResult: AlertNotification = {
      hash: meta.hash,
      hashJson: meta.hashJson,
      i18nTitle: {
        'DE': alert.info[0].headline,
      },
      id: alert.identifier,
      payload: {
        hash: meta.hash,
        id: alert.identifier,
        type: 'ALERT',
        version: 1,
        data: {
          area: {
            type: 'ZGEM',
            data: zGems.join(','),
          },
          headline: alert.info[0].headline,
          msgType: alert.msgType,
          provider: meta.provider,
          severity: alert.info[0].severity,
          transKeys: {
            event: alert.identifier,
          },
        },
      },
      platform: meta.platform,
      provider: meta.provider,
      received: meta.received,
      s3Bucket: meta.s3Bucket,
      s3Key: meta.s3Key,
      sent: alert.sent,
      severity: alert.info[0].severity,
      regionKeys: [],
    };

    expect(actual).toEqual(expectedResult);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockPool.query.mock.calls[0]).toEqual([
      QUERY_MKT,
      [alert.info[0].area[0].geocode[0].value],
    ]);
  });

  it('should call the configured outgoing adapters', async () => {
    // Arrange
    const alert = generateAlert(['DE'], [{
      areaDesc: random.words(2),
      geocode: [{
        value: '055150000000',
        valueName: 'SHN',
      }],
    }]);
    const meta: AlertMetadata = {
      hash: random.word(),
      hashJson: random.word(),
      platform: 'apns',
      provider: 'AP1',
      received: date.recent().toISOString(),
      s3Bucket: random.word(),
      s3Key: system.fileName(),
    };
    const zGems = [3530, 100001];
    mockPool.query.mockResolvedValueOnce({
      rowCount: 2,
      rows: zGems,
    });

    const mockOutputAdapter: MockType<AlertNotificationAdapter> = {
      handleNotification: jest.fn(),
    };

    // Override the service here
    service = new AlertService({
      logger: mockLogger as any,
      pool: mockPool as any,
      queryWkt: QUERY_MKT,
      querySHN: QUERY_SHN,
      queryWarnCell: QUERY_WARNCELLS,
      outputAdapters: [mockOutputAdapter as any],
      objectFlaggerAdapter: mockFlagger as any,
    });

    // Act
    const actual = await service.createAlertNotification('high', alert, meta);

    // Assert
    const expectedResult: AlertNotification = {
      hash: meta.hash,
      hashJson: meta.hashJson,
      i18nTitle: {
        'DE': alert.info[0].headline,
      },
      id: alert.identifier,
      payload: {
        hash: meta.hash,
        id: alert.identifier,
        type: 'ALERT',
        version: 1,
        data: {
          area: {
            type: 'ZGEM',
            data: zGems.join(','),
          },
          headline: alert.info[0].headline,
          msgType: alert.msgType,
          provider: meta.provider,
          severity: alert.info[0].severity,
          transKeys: {
            event: alert.identifier,
          },
        },
      },
      platform: meta.platform,
      provider: meta.provider,
      received: meta.received,
      s3Bucket: meta.s3Bucket,
      s3Key: meta.s3Key,
      sent: alert.sent,
      severity: alert.info[0].severity,
      regionKeys: ['055150000000'],
    };

    expect(actual).toEqual(expectedResult);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockPool.query.mock.calls[0]).toEqual([
      QUERY_SHN,
      [alert.info[0].area.map(a => a.geocode).flat(1).filter(c => c.valueName === 'SHN').map(c => c.value)],
    ]);
    expect(mockOutputAdapter.handleNotification).toHaveBeenCalledTimes(1);
    expect(mockOutputAdapter.handleNotification.mock.calls[0]).toEqual([
      'high',
      expectedResult,
      undefined,
    ]);
  });

  it('should call the second configured outgoing adapter with the result of the previous one', async () => {
    // Arrange
    const alert = generateAlert(['DE'], [{
      areaDesc: random.words(2),
      geocode: [{
        value: '055150000000',
        valueName: 'SHN',
      }],
    }]);
    const meta: AlertMetadata = {
      hash: random.word(),
      hashJson: random.word(),
      platform: 'apns',
      provider: 'AP1',
      received: date.recent().toISOString(),
      s3Bucket: random.word(),
      s3Key: system.fileName(),
    };
    const zGems = [3530, 100001];
    mockPool.query.mockResolvedValueOnce({
      rowCount: 2,
      rows: zGems,
    });

    const resultAdapterOne = {
      results: [
        {
          platform: 'apns',
          flowChannel: 'all',
          success: true,
        },
        {
          platform: 'apns',
          flowChannel: 'selected',
          success: true,
        },
      ],
    } as AlertNotificationAdapterResult;
    const mockOutputAdapter: MockType<AlertNotificationAdapter> = {
      handleNotification: jest.fn().mockReturnValueOnce(resultAdapterOne),
    };

    const mockOutputAdapterTwo: MockType<AlertNotificationAdapter> = {
      handleNotification: jest.fn(),
    };

    // Override the service here
    service = new AlertService({
      logger: mockLogger as any,
      pool: mockPool as any,
      queryWkt: QUERY_MKT,
      querySHN: QUERY_SHN,
      queryWarnCell: QUERY_WARNCELLS,
      outputAdapters: [mockOutputAdapter as any, mockOutputAdapterTwo as any],
    });

    // Act
    const actual = await service.createAlertNotification('high', alert, meta);

    // Assert
    const expectedResult: AlertNotification = {
      hash: meta.hash,
      hashJson: meta.hashJson,
      i18nTitle: {
        'DE': alert.info[0].headline,
      },
      id: alert.identifier,
      payload: {
        hash: meta.hash,
        id: alert.identifier,
        type: 'ALERT',
        version: 1,
        data: {
          area: {
            type: 'ZGEM',
            data: zGems.join(','),
          },
          headline: alert.info[0].headline,
          msgType: alert.msgType,
          provider: meta.provider,
          severity: alert.info[0].severity,
          transKeys: {
            event: alert.identifier,
          },
        },
      },
      platform: meta.platform,
      provider: meta.provider,
      received: meta.received,
      s3Bucket: meta.s3Bucket,
      s3Key: meta.s3Key,
      sent: alert.sent,
      severity: alert.info[0].severity,
      regionKeys: ['055150000000'],
    };

    expect(actual).toEqual(expectedResult);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockPool.query.mock.calls[0]).toEqual([
      QUERY_SHN,
      [alert.info[0].area.map(a => a.geocode).flat(1).filter(c => c.valueName === 'SHN').map(c => c.value)],
    ]);
    expect(mockOutputAdapter.handleNotification).toHaveBeenCalledTimes(1);
    expect(mockOutputAdapter.handleNotification.mock.calls[0]).toEqual([
      'high',
      expectedResult,
      undefined,
    ]);
    expect(mockOutputAdapterTwo.handleNotification).toHaveBeenCalledTimes(1);
    expect(mockOutputAdapterTwo.handleNotification.mock.calls[0]).toEqual([
      'high',
      expectedResult,
      resultAdapterOne,
    ]);
  });

  it('should call the configured flagging adapters', async () => {
    // Arrange
    const alert = generateAlert(['DE'], [{
      areaDesc: random.words(2),
      geocode: [{
        value: '055150000000',
        valueName: 'SHN',
      }],
    }]);
    const meta: AlertMetadata = {
      hash: random.word(),
      hashJson: random.word(),
      platform: 'apns',
      provider: 'AP1',
      received: date.recent().toISOString(),
      s3Bucket: random.word(),
      s3Key: system.fileName(),
    };
    const zGems = [3530, 100001];
    mockPool.query.mockResolvedValueOnce({
      rowCount: 2,
      rows: zGems,
    });

    const mockOutputAdapter: MockType<AlertNotificationAdapter> = {
      handleNotification: jest.fn(),
    };

    // Override the service here
    service = new AlertService({
      logger: mockLogger as any,
      pool: mockPool as any,
      queryWkt: QUERY_MKT,
      querySHN: QUERY_SHN,
      queryWarnCell: QUERY_WARNCELLS,
      outputAdapters: [mockOutputAdapter as any],
      objectFlaggerAdapter: mockFlagger as any,
    });

    // Act
    const actual = await service.createAlertNotification('high', alert, meta);

    // Assert
    const expectedResult: AlertNotification = {
      hash: meta.hash,
      hashJson: meta.hashJson,
      i18nTitle: {
        'DE': alert.info[0].headline,
      },
      id: alert.identifier,
      payload: {
        hash: meta.hash,
        id: alert.identifier,
        type: 'ALERT',
        version: 1,
        data: {
          area: {
            type: 'ZGEM',
            data: zGems.join(','),
          },
          headline: alert.info[0].headline,
          msgType: alert.msgType,
          provider: meta.provider,
          severity: alert.info[0].severity,
          transKeys: {
            event: alert.identifier,
          },
        },
      },
      platform: meta.platform,
      provider: meta.provider,
      received: meta.received,
      s3Bucket: meta.s3Bucket,
      s3Key: meta.s3Key,
      sent: alert.sent,
      severity: alert.info[0].severity,
      regionKeys: ['055150000000'],
    };

    expect(actual).toEqual(expectedResult);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockPool.query.mock.calls[0]).toEqual([
      QUERY_SHN,
      [alert.info[0].area.map(a => a.geocode).flat(1).filter(c => c.valueName === 'SHN').map(c => c.value)],
    ]);
    expect(mockOutputAdapter.handleNotification).toHaveBeenCalledTimes(1);
    expect(mockOutputAdapter.handleNotification.mock.calls[0]).toEqual([
      'high',
      expectedResult,
      undefined,
    ]);
    expect(mockFlagger.flagObject).toHaveBeenCalledTimes(1);
    expect(mockFlagger.flagObject.mock.calls[0]).toEqual([
      expectedResult,
    ]);
  });

  it('should call the configured watchdog adapter', async () => {
    // arrange
    const record = {} as S3EventRecord;

    // Override the service here
    service = new AlertService({
      logger: mockLogger as any,
      pool: mockPool as any,
      queryWkt: QUERY_MKT,
      querySHN: QUERY_SHN,
      queryWarnCell: QUERY_WARNCELLS,
      watchdogAdapter: mockWatchdogAdapter as any,
    });

    // act
    const actual = await service.createWatchdogNotification(record);

    // asset
    expect(mockWatchdogAdapter.invokeWatchdog).toHaveBeenCalledTimes(1);
    expect(mockWatchdogAdapter.invokeWatchdog.mock.calls[0]).toEqual([ record ]);
    expect(actual).toEqual(true);
  });

  it('should not attempt to call the watchdog adapter if not configured', async () => {
    // arrange
    const record = {} as S3EventRecord;

    // Override the service here
    service = new AlertService({
      logger: mockLogger as any,
      pool: mockPool as any,
      queryWkt: QUERY_MKT,
      querySHN: QUERY_SHN,
      queryWarnCell: QUERY_WARNCELLS,
    });

    // act
    const actual = await service.createWatchdogNotification(record);

    // asset
    expect(mockWatchdogAdapter.invokeWatchdog).toHaveBeenCalledTimes(0);
    expect(actual).toEqual(false);
  });
});
