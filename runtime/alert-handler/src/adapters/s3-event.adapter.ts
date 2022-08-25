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
import { S3Event, S3EventRecord } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { DateTime } from 'luxon';
import { Alert, AlertMetadata, AlertServiceInterface, LoggingServiceInterface } from './../../../layers/base/src/interfaces';

function hashtoLastBit(x: string) {
  const parsed = parseInt(x.slice(-1), 16);
  if (isNaN(parsed))  
    return '0'; 
  return parsed.toString(2).slice(-1);
}

export interface S3EventAdapterConfig {
  alertService: AlertServiceInterface;
  logger: LoggingServiceInterface;
  notificationPlatform: string;
  s3Client: S3;
  s3TagHash: string;
  s3TagHashJson: string;
  s3TagProvider: string;
  hashBitToProcess: string;
  s3Bucket3R: string;
}

export class S3EventAdapter {

  readonly alertService: AlertServiceInterface;

  readonly logger: LoggingServiceInterface;
  readonly notificationPlatform: string;
  readonly s3Client: S3;
  readonly s3TagHash: string;
  readonly s3TagHashJson: string;
  readonly s3TagProvider: string;
  readonly hashBitToProcess: string;
  readonly s3Bucket3R: string;

  constructor(config: S3EventAdapterConfig) {
    this.alertService = config.alertService;
    this.logger = config.logger;
    this.notificationPlatform = config.notificationPlatform;
    this.s3Client = config.s3Client;
    this.s3TagHash = config.s3TagHash;
    this.s3TagHashJson = config.s3TagHashJson;
    this.s3TagProvider = config.s3TagProvider;
    this.hashBitToProcess = config.hashBitToProcess;
    this.s3Bucket3R = config.s3Bucket3R;
  }

  async handleEvent(event: S3Event): Promise<void> {
    this.logger.debug({
      message: 'Processing S3 event...',
      data: event,
    });

    for await (const record of event.Records) 
      await this.handleEventRecord(record);
    

    this.logger.debug({
      message: 'Processed S3 event.',
      data: {
        recordsCount: event.Records.length,
      },
    });
  }

  private async handleEventRecord(record: S3EventRecord) {
    this.logger.debug({
      message: 'Processing S3 event record...',
      data: record,
    });

    const alert = await this.getAlertFromS3(
      record.s3.bucket.name,
      record.s3.object.key,
    );

    const alertMeta = await this.getAlertMetadataFromS3(
      record.s3.bucket.name,
      record.s3.object.key,
    );

    if (alert && alertMeta.meta) {
      // Decide whether the region should process the alert
      const decisionFlag = hashtoLastBit(alertMeta.meta.hash);
      if (decisionFlag === this.hashBitToProcess || record.eventSource == 'watchdog') {
        // Decide whether the regular or high processing pipeline should be triggered
        let priority: 'high' | 'regular' = 'regular';
        if (alertMeta.meta.provider.toUpperCase() === 'AP1' || alert.info[0].severity.toUpperCase() === 'EXTREME') 
          priority = 'high';
        

        await this.alertService.createAlertNotification(priority, alert, alertMeta.meta);
      } else {
        this.logger.debug({
          message: 'Alert will be processed primarily in the other region.',
        });
        await this.alertService.createWatchdogNotification(record);
      }
    } else {
      this.logger.warn({
        message: 'Alert is not valid and cannot be processed further.',
      });

      await this.moveTo3RBucket(
        alert,
        alertMeta.tagSet,
        record.s3.bucket.name,
        record.s3.object.key,
      );
    }


    this.logger.debug({
      message: 'Processed S3 event record.',
      data: record,
    });
  }

  private async getAlertFromS3(
    bucket: string,
    key: string,
  ): Promise<Alert> {
    this.logger.debug({
      message: 'Retrieving object from S3...',
      data: {
        bucket,
        key,
      },
    });

    const s3GetResponse = await this.s3Client.getObject({
      Bucket: bucket,
      Key: key,
    }).promise();


    this.logger.debug({
      message: 'Retrieved object from S3.',
      data: {
        bucket,
        key,
        sizeBytes: s3GetResponse.ContentLength,
      },
    });

    return JSON.parse(s3GetResponse.Body.toString());
  }

  private async getAlertMetadataFromS3(
    bucket: string,
    key: string,
  ): Promise<{ meta: AlertMetadata, tagSet: S3.TagSet }> {
    this.logger.debug({
      message: 'Retrieving object tags from S3...',
      data: {
        bucket,
        key,
      },
    });

    const getObjectTagsResponse = await this.s3Client.getObjectTagging({
      Bucket: bucket,
      Key: key,
    }).promise();

    this.logger.debug({
      message: 'Retrieved object tags from S3.',
      data: {
        bucket,
        key,
        tagsCount: getObjectTagsResponse.TagSet.length,
      },
    });

    // TODO: Handle invalid information
    const tagKeys = getObjectTagsResponse.TagSet.map(e => e.Key);
    let hasRequiredTags = true;
    if (!tagKeys.includes(this.s3TagHash)) {
      this.logger.warn({
        message: `Tag '${this.s3TagHash}' is missing.`,
      });
      hasRequiredTags = false;
    }

    if (!tagKeys.includes(this.s3TagHashJson)) {
      this.logger.warn({
        message: `Tag '${this.s3TagHashJson}' is missing.`,
      });
      hasRequiredTags = false;
    }

    if (!tagKeys.includes(this.s3TagProvider)) {
      this.logger.warn({
        message: `Tag '${this.s3TagProvider}' is missing.`,
      });
      hasRequiredTags = false;
    }

    if (!hasRequiredTags) 
      return { meta: undefined, tagSet: getObjectTagsResponse.TagSet };
    

    const result: AlertMetadata = {
      hash: getObjectTagsResponse.TagSet.find(t => t.Key === this.s3TagHash).Value,
      hashJson: getObjectTagsResponse.TagSet.find(t => t.Key === this.s3TagHashJson).Value,
      platform: this.notificationPlatform as any,
      provider: getObjectTagsResponse.TagSet.find(t => t.Key === this.s3TagProvider).Value,
      received: DateTime.utc().toISO(), // Note at this point the object was machine readable which starts the 30 second SLA
      s3Bucket: bucket,
      s3Key: key,
    };

    this.logger.debug({
      message: 'Determined alert metadata',
      data: result,
    });

    return { meta: result, tagSet: getObjectTagsResponse.TagSet };
  }

  private async moveTo3RBucket(content: Alert, tagSet: S3.TagSet, originBucket: string, key: string): Promise<void> {
    try {
      this.logger.debug({
        message: "Moving object to Rudi's Resterampe...",
        data: {
          bucket: originBucket,
          key,
        },
      });

      const putObjectResponse = await this.s3Client.putObject({
        Bucket: this.s3Bucket3R,
        Key: key,
        Body: JSON.stringify(content),
        ContentType: 'application/json',
        Tagging: tagSet.map(t => `${t.Key}=${t.Value}`).join('&'),
      }).promise();

      this.logger.debug({
        message: "Put object to Rudi's Resterampe.",
        data: putObjectResponse,
      });

      const deleteObjectResponse = await this.s3Client.deleteObject({
        Bucket: originBucket,
        Key: key,
      }).promise();

      this.logger.debug({
        message: 'Deleted object from origin bucket.',
        data: deleteObjectResponse,
      });

    } catch (error) {
      this.logger.error({
        message: 'Failed to move object to 3R Bucket',
        errorDetails: error,
      });
    }
  }
}
