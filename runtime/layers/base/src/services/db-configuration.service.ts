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
import { SecretsManager } from 'aws-sdk';
import { LoggingServiceInterface, SecretsManagerRds } from './../interfaces';

export interface DatabaseConfigurationServiceConfig {
  logger: LoggingServiceInterface;
  secretsManagerClient: SecretsManager;
}

export class DatabaseConfigurationService {
  constructor(public readonly config: DatabaseConfigurationServiceConfig) {
  }

  async getCredentialsFromSecretsManager(secretId: string): Promise<SecretsManagerRds> {
    this.config.logger.debug({
      message: 'Retrieving secret for database...',
      data: secretId,
    });

    const getSecretResponse = await this.config.secretsManagerClient.getSecretValue({
      SecretId: secretId,
    }).promise();

    const secretValue = JSON.parse(getSecretResponse.SecretString) as SecretsManagerRds;

    this.config.logger.debug({
      message: 'Retrieved secret for database.',
      data: {
        ARN: getSecretResponse.ARN,
        CreatedDate: getSecretResponse.CreatedDate,
        Name: getSecretResponse.Name,
        VersionId: getSecretResponse.VersionId,
        VersionStages: getSecretResponse.VersionStages,
      },
    });

    return secretValue;
  }
}
