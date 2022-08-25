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
export type NotificationPlatform = 'apns' | 'fcm';

export interface AlertNotification {
  /**
   * Gets or sets the alert identifier.
   */
  id: string;
  /**
   * Gets or sets the provider of the alert.
   */
  provider: string;
  /**
   * Gets or sets the hash of the initially received file.
   */
  hash: string;
  /**
   * Gets or sets the hash of the standardized JSON file.
   */
  hashJson: string;
  /**
   * Gets or sets the severity of the alert.
   */
  severity: string;
  /**
   * Gets or sets the platform to send notifications through.
   */
  platform: NotificationPlatform;
  /**
   * Gets or sets the timestamp when the alert has been received.
   */
  received: string;
  /**
   * Gets or sets the name of the S3 bucket.
   */
  s3Bucket: string;
  /**
   * Gets or sets the key of the S3 object.
   */
  s3Key: string;

  /**
   * Gets or sets the alert notification payload.
   */
  payload: AlertNotificationPayload;

  /**
   * Gets or sets the i18n titles required for regional dashboards.
   */
  i18nTitle: {
    [key: string]: string;
  }

  /**
   * Gets or sets the timestamp when the alert was sent by the provider.
   */
  sent: string;

  /**
   * Gets or sets the region keys, used in the second step for flowControl SELECTED.
   */
  regionKeys: string[];
}

export interface AlertNotificationPayload {
  id: string;
  type: string;
  version: number;
  hash: string;
  data: {
    area: {
      type: string;
      data: string;
    };
    headline: string;
    msgType: string;
    provider: string;
    severity: string;
    transKeys: {
      event: string;
    }
  }
}
