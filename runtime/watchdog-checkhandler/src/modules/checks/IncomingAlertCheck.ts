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
  CheckEventPayload,
  CheckResult,
  CheckStep,
  CheckResultStatus,
} from '../CheckInterface';
import { BaseCheck } from '../checks/BaseCheck';

/**
 * Incoming alert checks the s3 object for the required tags to insure that the first lambda has done its work
 */
export class IncomingAlertCheck extends BaseCheck {
  private s3: any;
  private requiredTags: string[];
  private alertIDTag: string;
  private severityTag: string;
  private providerTag: string;
  private hashTag: string;
  private lastBit: string;
  private processingBucketName: string;

  constructor(
    s3: any,
    requiredTags: string[],
    alertIDTag: string,
    hashTag: string,
    severityTag: string,
    providerTag: string,
    lambda: any,
    FailoverLambdaArn: string,
    ProcessingBucketName: string,
    lastBit: string,
  ) {
    super(lambda, FailoverLambdaArn);
    this.name = 'IncomingAlertCheck';
    this.description = 'Put Description Here';
    this.stepId = CheckStep.INCOMING_ALERT_CHECK;
    this.s3 = s3;
    this.requiredTags = requiredTags;
    this.alertIDTag = alertIDTag;
    this.severityTag = severityTag;
    this.hashTag = hashTag;
    this.processingBucketName = ProcessingBucketName;
    this.lastBit = lastBit;
    this.providerTag = providerTag;
  }

  /**
   * Fetches the object tags, verifies against the required list and passes or retries/fails
   **/
  public run = async (event: CheckEventPayload): Promise<CheckResult> => {
    this.logger.debug({
      message: 'IncomingAlertCheck: Running check for IncomingAlertCheck',
      data: event,
    });

    let s3_error;
    let contains_all_required_tags = false;
    let tags: Array<String> = [];
    try {
      tags = await this.getObjectTags(
        this.processingBucketName,
        event.alertInformation.alertS3Key,
      );

      this.logger.debug({
        message:
          'IncomingAlertCheck: Done looking for s3 object tags for alert',
        data: tags,
      });

      contains_all_required_tags = this.checkTags(tags);
    } catch (error) {
      //IN case the key is not there or s3 in that region not reachable an Error will be sent
      //We catch this to avoid that the watchdog fails without being put on the queue
      this.logger.debug({
        message: 'IncomingAlertCheck: Could not reach S3',
        data: {
          bucketName: this.processingBucketName,
          alertS3Key: event.alertInformation.alertS3Key,
        },
      });
      s3_error = error;
    }

    if (s3_error != undefined) {
      const checkResultStatus = this.evaluateRetryOrAction(event);
      if (checkResultStatus == CheckResultStatus.ACTION) {
        this.logger.warn({
          message:
            'IncomingAlertCheck: Could not reach S3 after the 3 tries. ACTION',
          data: {
            bucketInfo: {
              bucketName: this.processingBucketName,
              alertS3Key: event.alertInformation.alertS3Key,
            },
            event: event,
          },
          errorDetails: s3_error,
        });
      } else {
        this.logger.debug({
          message: 'IncomingAlertCheck: Could not reach S3. RETRY',
          data: {
            bucketInfo: {
              bucketName: this.processingBucketName,
              alertS3Key: event.alertInformation.alertS3Key,
            },
            event: event,
          },
          errorDetails: s3_error,
        });
      }
      return new Promise((resolve, reject) => {
        resolve({
          result: checkResultStatus,
          alertInformation: { ...event.alertInformation },
        });
      });
    } else if (contains_all_required_tags) {
      return new Promise((resolve, reject) => {
        this.logger.debug({
          message: 'IncomingAlertCheck: Found all required tags for alert',
          data: tags,
        });
        if (
          this.hashtoLastBit(this.getTag(this.hashTag, tags)) == this.lastBit
        ) {
          this.logger.debug({
            message:
              'IncomingAlertCheck: Last Bit check successfull - alert will be watched in this region',
            data: tags,
          });
          resolve({
            result: CheckResultStatus.PASS,
            alertInformation: {
              ...event.alertInformation,
              alertId: this.getTag(this.alertIDTag, tags),
              severity: this.mapSeverityToLevel(this.getTag(this.severityTag, tags)),
              provider: this.getTag(this.providerTag, tags),
            },
          });
        } else {
          this.logger.debug({
            message:
              'IncomingAlertCheck: Last Bit check unsuccessfull - alert will not be watched in this region',
            data: tags,
          });
          resolve({
            result: CheckResultStatus.ABORT,
            alertInformation: {
              ...event.alertInformation,
              alertId: this.getTag(this.alertIDTag, tags),
            },
          });
        }
      });
    } else {
      // Hier behandeln was passiert wenn Objekt nicht alle Tags hat.
      return new Promise((resolve, reject) => {
        this.logger.debug({
          message:
            'IncomingAlertCheck: Did not find all required tags for alert ' +
            event.alertInformation.alertId,
          data: tags,
        });
        resolve({
          result: this.evaluateRetryOrAction(event),
          alertInformation: { ...event.alertInformation },
        });
      });
    }
  };

  private checkTags = (tags: any) => {
    let tags_flat: any = [];
    tags.TagSet.forEach((tag: any) => {
      tags_flat.push(tag.Key);
    });
    return this.requiredTags.every((v) => tags_flat.indexOf(v) >= 0);
  };

  private getTag = (key: string, tags: any): string => {
    let val = '';
    tags.TagSet.forEach((tag: any) => {
      if (tag.Key == key) 
        val = tag.Value;
    });
    return val;
  };

  private extractObjectFromEvent = (event: any) => {
    return {
      bucket: event.Records[0].s3.bucket.name,
      key: event.Records[0].s3.object.key,
    };
  };

  private getObjectTags = async (bucket: string, key: string) => {
    return await this.s3
      .getObjectTagging({ Bucket: bucket, Key: key })
      .promise();
  };

  private hashtoLastBit(x: string) {
    const parsed = parseInt(x.slice(-1), 16);
    if (isNaN(parsed)) 
      return '0';
    
    return parsed.toString(2).slice(-1);
  }

  private mapSeverityToLevel(severity: string): string {
    let level = 'Minor';
    switch (severity) {
      case '0':
        level = 'Extreme';
        break;
      case '1':
        level = 'Severe';
        break;
      case '2':
        level = 'Moderate';
        break;
      case '3':
        level = 'Minor';
        break;
      default:
        level = 'Minor';
        break;
    }
  
    return level;
  }
  
}
