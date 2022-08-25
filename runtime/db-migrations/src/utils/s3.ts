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
import { S3 } from 'aws-sdk';
import * as semver from 'semver';
import { LoggingService } from '/opt/nodejs/src/services';

export interface ConfigurationRetrievalOptions {
  bucketName: string;
  s3Client: S3;
  logger: LoggingService;
  requestId: string;
}

export const getCurrentConfiguration = async (
  opts: ConfigurationRetrievalOptions,
): Promise<{ version: string }> => {
  try {
    // get the current configuration from S3
    const s3CurrentConfig = await opts.s3Client
      .getObject({
        Bucket: opts.bucketName,
        Key: 'applied_config/pg/current.json',
      })
      .promise();
    const currentConfigString = s3CurrentConfig.Body.toString('utf-8');
    const currentConfig: { version: string } = JSON.parse(currentConfigString);
    opts.logger.info({
      message: `Current database version: ${currentConfig.version}`,
      requestId: opts.requestId,
    });
    return currentConfig;
  } catch (error) {
    opts.logger.warn({
      errorDetails: error,
      message:
        'Failed to retrieve the current configuration from S3. Falling back to version 0.0.0.',
      requestId: opts.requestId,
    });
    return {
      version: '0.0.0',
    };
  }
};

export const getTargetConfiguration = async (
  opts: ConfigurationRetrievalOptions,
): Promise<{ version: string }> => {
  // get the target configuration from S3
  const s3VersionConfig = await opts.s3Client
    .getObject({
      Bucket: opts.bucketName,
      Key: 'config/pg/target.json',
    })
    .promise();
  const versionConfigString = s3VersionConfig.Body.toString('utf-8');
  const versionConfig: { version: string } = JSON.parse(versionConfigString);
  opts.logger.info({
    message: `Target database version: ${versionConfig.version}`,
    requestId: opts.requestId,
  });
  return versionConfig;
};

export const extractSemVerFromObjectname = (
  name: string,
): string | undefined => {
  let stripped = name.replace(/upgrade_/g, '');
  stripped = stripped.replace(/downgrade_/g, '');
  stripped = stripped.replace('.sql', '');
  stripped = stripped.replace(/_/g, '.');
  if (semver.valid(stripped)) 
    return stripped;
  

  return undefined;
};
