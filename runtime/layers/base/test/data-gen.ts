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
import { Alert, AlertMetadata, AlertNotification } from './../src/interfaces';

export const generateAlert = (languages: string[], area: {
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

export const generateAlertNotification = (languages: string[], area: {
  areaDesc: string;
  geocode: {
    valueName: string;
    value: string;
  }[];
}[]): AlertNotification => {
  const alert = generateAlert(languages, area);
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
  const alertNotification: AlertNotification = {
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

  return alertNotification;
};
