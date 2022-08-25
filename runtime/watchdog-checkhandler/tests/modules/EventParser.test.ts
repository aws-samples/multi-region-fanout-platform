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
import { expect } from 'chai';
import { stubInterface } from 'ts-sinon';
import { CheckEventParser } from '../../src/modules/EventParser';
import { ParserError } from '../../src/modules/Errors';
import { CheckStep } from '../../src/modules/CheckInterface';
import { LoggingServiceInterface } from '../../src/modules/LoggingServiceInterface';
const logger = stubInterface<LoggingServiceInterface>();

const s3_event = {
  Records: [
    {
      eventVersion: '2.0',
      eventSource: 'aws:s3',
      awsRegion: 'us-west-2',
      eventTime: '1970-01-01T00:00:00.000Z',
      eventName: 'ObjectCreated:Put',
      userIdentity: {
        principalId: 'EXAMPLE',
      },
      requestParameters: {
        sourceIPAddress: '127.0.0.1',
      },
      responseElements: {
        'x-amz-request-id': 'EXAMPLE123456789',
        'x-amz-id-2':
          'EXAMPLE123/5678abcdefghijklambdaisawesome/mnopqrstuvwxyzABCDEFGH',
      },
      s3: {
        s3SchemaVersion: '1.0',
        configurationId: 'testConfigRule',
        bucket: {
          name: 'my-s3-bucket',
          ownerIdentity: {
            principalId: 'EXAMPLE',
          },
          arn: 'arn:aws:s3:::example-bucket',
        },
        object: {
          key: 'HappyFace.jpg',
          size: 1024,
          eTag: '0123456789abcdef0123456789abcdef',
          sequencer: '0A1B2C3D4E5F678901',
        },
      },
    },
  ],
};
const sqs_event = {
  Records: [
    {
      eventVersion: '2.0',
      eventSource: 'aws:sqs',
      awsRegion: 'us-west-2',
      eventTime: '1970-01-01T00:00:00.000Z',
      eventName: 'ObjectCreated:Put',
      userIdentity: {
        principalId: 'EXAMPLE',
      },
      requestParameters: {
        sourceIPAddress: '127.0.0.1',
      },
      responseElements: {
        'x-amz-request-id': 'EXAMPLE123456789',
        'x-amz-id-2':
          'EXAMPLE123/5678abcdefghijklambdaisawesome/mnopqrstuvwxyzABCDEFGH',
      },
      body: '{"lastCheckStep":0,"currentStepRetryCounter":0,"invocationCounter":0,"nextCheckStep":1,"followUpTime":0,"alertInformation":{"alertS3BucketName":"my-s3-bucket","alertS3Key":"HappyFace.jpg"},"done":false}',
    },
  ],
};
const pong_event = {
  Records: [
    {
      eventVersion: '2.0',
      eventSource: 'aws:pong',
      awsRegion: 'us-west-2',
      eventTime: '1970-01-01T00:00:00.000Z',
      eventName: 'ObjectCreated:Put',
      userIdentity: {
        principalId: 'EXAMPLE',
      },
      requestParameters: {
        sourceIPAddress: '127.0.0.1',
      },
      responseElements: {
        'x-amz-request-id': 'EXAMPLE123456789',
        'x-amz-id-2':
          'EXAMPLE123/5678abcdefghijklambdaisawesome/mnopqrstuvwxyzABCDEFGH',
      },
    },
  ],
};

function CreateParser() {
  return new CheckEventParser.Parser(stubInterface<LoggingServiceInterface>());
}

describe('EventParser tests', () => {
  
  it('throws an error when unknown event type is parsed', () => {
    expect(() => new CheckEventParser.Parser(logger).parseEvent(pong_event)).to.throw(ParserError);
  });
  
  it('parse an S3 Event', () => {
    const parsed_s3_event = new CheckEventParser.Parser(logger).parseEvent(s3_event);
    expect(JSON.stringify(parsed_s3_event)).to.equal(
      JSON.stringify({
        lastCheckStep: CheckStep.NONE,
        currentStepRetryCounter: 0,
        invocationCounter: 0,
        nextCheckStep: CheckStep.INCOMING_ALERT_CHECK,
        followUpTime: 0,
        alertInformation: {
          alertS3BucketName: 'my-s3-bucket',
          alertS3Key: 'HappyFace.jpg',
        },
        done: false,
      }),
    );
  });
  
  it('parse an SQS Event', () => {
    const parsed_sqs_event = new CheckEventParser.Parser(logger).parseEvent(sqs_event);
    expect(JSON.stringify(parsed_sqs_event)).to.equal(
      JSON.stringify({
        lastCheckStep: CheckStep.NONE,
        currentStepRetryCounter: 0,
        invocationCounter: 0,
        nextCheckStep: CheckStep.INCOMING_ALERT_CHECK,
        followUpTime: 0,
        alertInformation: {
          alertS3BucketName: 'my-s3-bucket',
          alertS3Key: 'HappyFace.jpg',
        },
        done: false,
      }),
    );
  });
  
  
});
