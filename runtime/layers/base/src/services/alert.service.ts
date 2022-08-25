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
  Alert,
  AlertDashboardMapReduceAdapter,
  AlertMetadata,
  AlertNotification,
  AlertNotificationAdapter,
  AlertNotificationAdapterResult,
  AlertObjectFlaggerAdapter,
  AlertServiceInterface,
  LoggingServiceInterface,
} from './../interfaces';
import { Pool } from 'pg';
import { S3EventRecord } from 'aws-lambda';
import { AlertWatchdogAdapter } from '../interfaces/alert-watchdog.adapter';

export interface AlertServiceConfig {
  logger: LoggingServiceInterface,
  pool: Pool,
  querySHN: string;
  queryWarnCell: string;
  queryWkt: string;
  outputAdapters?: AlertNotificationAdapter[];
  objectFlaggerAdapter?: AlertObjectFlaggerAdapter;
  dashboardMapReduceAdapter?: AlertDashboardMapReduceAdapter;
  watchdogAdapter?: AlertWatchdogAdapter;
}

export class AlertService implements AlertServiceInterface {

  constructor(public readonly config: AlertServiceConfig) {

  }

  async createAlertNotification(
    priority: 'high' | 'regular',
    alert: Alert,
    metadata: AlertMetadata,
  ): Promise<AlertNotification> {
    const allGeocodes = alert.info[0].area.map(a => a.geocode).flat(1);
    const shnGeocodes = allGeocodes.filter(c => c.valueName === 'SHN');
    const warncellGeocodes = allGeocodes.filter(c => c.valueName === 'WARNCELL');
    const wktGeocodes = allGeocodes.filter(c => c.valueName === 'WKT');

    const zCurves: number[] = [];

    if (shnGeocodes.length > 0) {
      const zCurvesSHN = await this.resolveZCurvesForGeocodesSHN(shnGeocodes.map(c => c.value));
      zCurves.push(...zCurvesSHN);
    }

    if (warncellGeocodes.length > 0) {
      const zCurvesWarnCells = await this.resolveZCurvesForGeocodesWarnCell(
        warncellGeocodes.map(c => parseInt(c.value, 10)),
      );
      zCurves.push(...zCurvesWarnCells);
    }

    if (wktGeocodes.length > 0) {
      for await (const c of wktGeocodes) {
        const zCurvesWkt = await this.resolveZCurvesForGeocodeWkt(c.value);
        zCurves.push(...zCurvesWkt);
      }
    }

    const uniqueZCurves = [...new Set(zCurves)];

    const infoGerman = alert.info.find(i => i.language === 'DE');

    const alertNotification: AlertNotification = {
      hash: metadata.hash,
      hashJson: metadata.hashJson,
      id: alert.identifier,
      platform: metadata.platform,
      provider: metadata.provider,
      received: metadata.received,
      s3Bucket: metadata.s3Bucket,
      s3Key: metadata.s3Key,
      severity: alert.info[0].severity,
      i18nTitle: {},
      sent: alert.sent,
      payload: {
        id: alert.identifier,
        hash: metadata.hash,
        type: 'ALERT',
        version: 1,
        data: {
          headline: infoGerman.headline,
          msgType: alert.msgType,
          provider: metadata.provider,
          severity: infoGerman.severity,
          transKeys: {
            event: alert.identifier,
          },
          area: {
            type: 'ZGEM',
            data: uniqueZCurves.join(','),
          },
        },
      },
      regionKeys: uniqueZCurves ? uniqueZCurves.map(n => `${n}`) : [], // Move to unique Z-Curves: shnGeocodes.length > 0 ? shnGeocodes.map(s => s.value)
    };

    for (const info of alert.info) 
      alertNotification.i18nTitle[info.language] = info.headline;
    

    if (this.config.outputAdapters && this.config.outputAdapters.length > 0) {
      let previousResult: AlertNotificationAdapterResult = undefined;
      for await (const adapter of this.config.outputAdapters) 
        previousResult = await adapter.handleNotification(priority, alertNotification, previousResult);
      
    }

    // Invoke the L5a Lambda to start map/reduce for dashboard
    if (this.config.dashboardMapReduceAdapter) 
      await this.config.dashboardMapReduceAdapter.startMapReduce(priority, alertNotification);
    


    // Everything is fine here, so flag the S3 object if an adapter is configured
    if (this.config.objectFlaggerAdapter) 
      await this.config.objectFlaggerAdapter.flagObject(alertNotification);
    


    return alertNotification;
  }

  async createWatchdogNotification(record: S3EventRecord): Promise<boolean> {
    if (this.config.watchdogAdapter) {
      await this.config.watchdogAdapter.invokeWatchdog(record);
      return true;
    }
    return false;
  }

  private async resolveZCurvesForGeocodesSHN(regionkeys: string[]): Promise<number[]> {
    this.config.logger.debug({
      message: 'Resolving Z-Curves for Geocodes of type SHN...',
      data: regionkeys,
      query: this.config.querySHN,
      regionkeys: regionkeys,
    });
    const queryResult = await this.config.pool.query(this.config.querySHN, [regionkeys]);

    this.config.logger.debug({
      message: `Resolved ${queryResult.rowCount} Z-Curves for Geocodes of type SHN.`,
      data: queryResult,
    });

    return queryResult.rows as number[];
  }

  private async resolveZCurvesForGeocodesWarnCell(warnCellIds: number[]) {
    this.config.logger.debug({
      message: 'Resolving Z-Curves for Geocodes of type WARNCELL...',
      data: warnCellIds,
      query: this.config.queryWarnCell,
      warnCellIds: warnCellIds,
    });
    const queryResult = await this.config.pool.query(this.config.queryWarnCell, [warnCellIds]);

    this.config.logger.debug({
      message: `Resolved ${queryResult.rowCount} Z-Curves for Geocodes of type WARNCELL.`,
      data: queryResult,
    });

    return queryResult.rows.map(r => parseInt(r.zcurve_gem, 10)) as number[];
  }

  private async resolveZCurvesForGeocodeWkt(polygon: string) {
    this.config.logger.debug({
      message: 'Resolving Z-Curves for Geocode of type WKT...',
      data: polygon,
      query: this.config.queryWkt,
      polygon: polygon,
    });
    const queryResult = await this.config.pool.query(this.config.queryWkt, [polygon]);

    this.config.logger.debug({
      message: `Resolved ${queryResult.rowCount} Z-Curves for Geocode of type WKT.`,
      data: queryResult,
    });

    return queryResult.rows as number[];
  }
}
