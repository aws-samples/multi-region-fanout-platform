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
import { date, internet, random } from 'faker';
import { v4 } from 'uuid';
import { MockType } from '../../test/mock-type';
import { LoggingServiceInterface, SecretsManagerRds } from '../interfaces';
import { DatabaseConfigurationService } from './db-configuration.service';

describe('DatabaseConfigurationServiceConfig', () => {
  let service: DatabaseConfigurationService;
  let mockSecretsManager: MockType<SecretsManager>;
  let mockLogger: MockType<LoggingServiceInterface>;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    mockSecretsManager = {
      getSecretValue: jest.fn(),
    };
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      setMetdadata: jest.fn(),
      verbose: jest.fn(),
      warn: jest.fn(),
    };
    service = new DatabaseConfigurationService({
      logger: mockLogger as any,
      secretsManagerClient: mockSecretsManager as any,
    });
  });

  it('should return the credentials from SecretsManager', async () => {
    // Arrange
    const expectedResult: SecretsManagerRds = {
      dbClusterIdentifier: random.word(),
      dbname: random.word(),
      engine: 'postgres',
      host: internet.domainName(),
      password: internet.password(24, false),
      port: 5432,
      username: internet.userName(),
    };
    mockSecretsManager.getSecretValue.mockReturnValueOnce({
      promise: jest.fn().mockResolvedValueOnce({
        ARN: random.word(),
        CreatedDate: date.recent().toISOString(),
        Name: random.alphaNumeric(),
        VersionId: v4(),
        SecretString: JSON.stringify(expectedResult),
      }),
    });

    const secretId = random.word();

    // Act
    const actual = await service.getCredentialsFromSecretsManager(secretId);

    // Assert
    expect(actual).toEqual(expectedResult);
    expect(mockSecretsManager.getSecretValue).toHaveBeenCalledTimes(1);
    expect(mockSecretsManager.getSecretValue.mock.calls[0]).toEqual([
      {
        SecretId: secretId,
      },
    ]);
  });

});
