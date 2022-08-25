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
import { Lambda } from 'aws-sdk';
import {
  AlertNotification,
  AlertNotificationAdapter,
  AlertNotificationAdapterResult,
  LoggingServiceInterface,
} from './../../../layers/base/src/interfaces';

export interface LambdaOutputAdapterConfig {
  functionNameAllAlertsHigh: string;
  functionNameAllAlertsRegular: string;
  functionNameSelectedAlertsHigh: string;
  functionNameSelectedAlertsRegular: string;
  lambdaClientHigh: Lambda;
  lambdaClientRegular: Lambda;
  logger: LoggingServiceInterface;
  notificationOtherPlatforms: string[];
}

export class LambdaOutputAdapter implements AlertNotificationAdapter {

  readonly functionNameAllAlertsHigh: string;
  readonly functionNameAllAlertsRegular: string;
  readonly functionNameSelectedAlertsHigh: string;
  readonly functionNameSelectedAlertsRegular: string;
  readonly lambdaClientHigh: Lambda;
  readonly lambdaClientRegular: Lambda;
  readonly logger: LoggingServiceInterface;
  readonly notificationOtherPlatforms: string[];

  constructor(config: LambdaOutputAdapterConfig) {
    this.functionNameAllAlertsHigh = config.functionNameAllAlertsHigh;
    this.functionNameAllAlertsRegular = config.functionNameAllAlertsRegular;
    this.functionNameSelectedAlertsHigh = config.functionNameSelectedAlertsHigh;
    this.functionNameSelectedAlertsRegular = config.functionNameSelectedAlertsRegular;
    this.lambdaClientHigh = config.lambdaClientHigh;
    this.lambdaClientRegular = config.lambdaClientRegular;
    this.logger = config.logger;
    this.notificationOtherPlatforms = config.notificationOtherPlatforms;
  }


  async handleNotification(priority: 'high' | 'regular', notification: AlertNotification): Promise<AlertNotificationAdapterResult> {
    this.logger.debug({
      message: 'Sending alert notification to downstream Lambda functions...',
      data: notification,
    });

    const adapterResult: AlertNotificationAdapterResult = {
      results: [],
    };

    let processingPlatform: string = notification.platform;
    let processingFlowChannel: 'all' | 'selected' = 'all';

    const lambdaClient = priority === 'high' ? this.lambdaClientHigh : this.lambdaClientRegular;
    const functionNameAllAlerts = priority === 'high' ? this.functionNameAllAlertsHigh : this.functionNameAllAlertsRegular;
    const functionNameSelectedAlerts = priority === 'high' ? this.functionNameSelectedAlertsHigh : this.functionNameSelectedAlertsRegular;

    try {
      // Send it for the current provider
      const invokeAllAlerts = await  lambdaClient.invoke({
        FunctionName: functionNameAllAlerts,
        InvocationType: 'Event',
        Payload: JSON.stringify(notification),
      }).promise();
      adapterResult.results.push({
        flowChannel: processingFlowChannel,
        platform: processingPlatform,
        success: true,
      });

      processingFlowChannel = 'selected';
      const invokeSelectedAlerts = await lambdaClient.invoke({
        FunctionName: functionNameSelectedAlerts,
        InvocationType: 'Event',
        Payload: JSON.stringify(notification),
      }).promise();
      adapterResult.results.push({
        flowChannel: processingFlowChannel,
        platform: processingPlatform,
        success: true,
      });

      const invokeResults = [invokeAllAlerts, invokeSelectedAlerts];

      for (const platform of this.notificationOtherPlatforms) {
        processingPlatform = platform;
        processingFlowChannel = 'all';
        const invokeAllAlertsProviderX = await  lambdaClient.invoke({
          FunctionName: functionNameAllAlerts,
          InvocationType: 'Event',
          Payload: JSON.stringify({
            ...notification,
            platform: processingPlatform,
          }),
        }).promise();
        adapterResult.results.push({
          flowChannel: processingFlowChannel,
          platform: processingPlatform,
          success: true,
        });
        invokeResults.push(invokeAllAlertsProviderX);

        processingFlowChannel = 'selected';
        const invokeSelectedAlertsProviderX = await lambdaClient.invoke({
          FunctionName: functionNameSelectedAlerts,
          InvocationType: 'Event',
          Payload: JSON.stringify({
            ...notification,
            platform: processingPlatform,
          }),
        }).promise();
        adapterResult.results.push({
          flowChannel: processingFlowChannel,
          platform: processingPlatform,
          success: true,
        });
        invokeResults.push(invokeSelectedAlertsProviderX);
      }

      this.logger.debug({
        message: 'Sent alert notification to downstream Lambda functions.',
        data: invokeResults,
      });
    } catch (error) {
      this.logger.error({
        message: 'Failed to send alert notification to downstream Lambda functions.',
        errorDetails: {
          ...error,
        },
      });

      adapterResult.results.push({
        flowChannel: processingFlowChannel,
        platform: processingPlatform,
        success: false,
        error,
      });

    } finally {
      return adapterResult;
    }
  }

}
