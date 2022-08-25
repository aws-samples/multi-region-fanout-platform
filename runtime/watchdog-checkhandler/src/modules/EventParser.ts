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
import { CheckStep, CheckEventPayload } from './CheckInterface';
import { ParserError } from './Errors';

export module CheckEventParser {
  enum eventSources {
    S3,
    SQS,
    UNDEFINED,
  }

  export class Parser {
    logger: any;

    constructor(logger: any) {
      this.logger = logger;
    }

    public parseEvent(event: any): CheckEventPayload {
      let eventSource: eventSources = this.getLambdaEventSource(event);
      if (eventSource == eventSources.SQS) {
        this.logger.debug({ message: 'Event Parser recognized SQS event' });
        return this.extractSQSCheckEventPayload(event);
      } else if (eventSource == eventSources.S3) {
        this.logger.debug({ message: 'Event Parser recognized S3 event' });
        return this.generateS3CheckEventPayload(event);
      } else 
        throw new ParserError('Event source unknown ' + eventSource);
      
    }

    private getLambdaEventSource(event: any): eventSources {
      if (event.Records && event.Records[0].eventSource === 'aws:s3')
        return eventSources.S3;

      if (event.Records && event.Records[0].eventSource === 'aws:sqs')
        return eventSources.SQS;

      return eventSources.UNDEFINED;
    }

    //TODO
    private extractSQSCheckEventPayload(event: any): CheckEventPayload {
      this.logger.debug({
        message: 'Generating CheckEventPayload from SQS Event',
      });
      return JSON.parse(event.Records[0].body);
    }

    private generateS3CheckEventPayload(event: any): CheckEventPayload {
      const bucket = event.Records[0].s3.bucket.name;
      const key = event.Records[0].s3.object.key;
      this.logger.debug({
        message: 'Generating CheckEventPayload from S3 Event',
      });
      return {
        lastCheckStep: CheckStep.NONE,
        currentStepRetryCounter: 0,
        invocationCounter: 0,
        nextCheckStep: CheckStep.INCOMING_ALERT_CHECK,
        followUpTime: 0,
        alertInformation: {
          alertS3BucketName: bucket,
          alertS3Key: key,
        },
        done: false,
      };
    }
  }
}
