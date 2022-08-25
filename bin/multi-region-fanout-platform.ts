#!/usr/bin/env node
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
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MultiRegionFanoutPlatform } from '../lib/multi-region-fanout-platform';
import { config } from 'dotenv';
import { CriticalityClassContext, EnvironmentContext, ProcessEnv } from '../types/app-configuration';
import { Tags } from 'aws-cdk-lib';

/**
 * Helper function to filter object keys by a start string pattern.
 */
const filterObjectKeysByStringPattern = (processEnvObject: ProcessEnv, varPrefix: string): ProcessEnv => {
  return Object.entries(processEnvObject).reduce((result, [key, value]) => {
    if (key.startsWith(varPrefix)) {
      return {
        ...result,
        [key]: value,
      };
    }
    return result;
  }, {});
};

config();
const app = new cdk.App();

// retrieve context variables from cdk.json
const solutionName = app.node.tryGetContext('solutionName');
const environments = app.node.tryGetContext('environments');
const repositoryName = app.node.tryGetContext('repositoryName');
const sourceBranch = app.node.tryGetContext('sourceBranch');
const primaryRegion = app.node.tryGetContext('primaryRegion');

// populate environments with account ids
const environmentContexts = environments.map((environment: EnvironmentContext) => ({
  stage: environment.stage,
  regions: environment.regions,
  primaryRegion: environment.primaryRegion,
  accountIdWebsite: process.env[environment.accountIdWebsite]!,
  accountIdSharedServices: process.env[environment.accountIdSharedServices]!,
  criticalityClasses: environment.criticalityClasses.map((criticalityClass: CriticalityClassContext) => ({
    class: criticalityClass.class,
    accountIdProcessing: process.env[criticalityClass.accountIdProcessing]!,
    accountIdFanoutPnp1: process.env[criticalityClass.accountIdFanoutPnp1]!,
    accountIdFanoutPnp2: process.env[criticalityClass.accountIdFanoutPnp2]!,
  })),
}),
);

// provision pipeline stack
const codePipelineStack = new MultiRegionFanoutPlatform(app, 'code-pipeline-stack', {
  env: {
    account: process.env.MRFP_AWS_ACCOUNT_DEVOPS,
    region: primaryRegion,
  },
  stackName: `${solutionName}-main`,
  solutionName,
  environmentContexts,
  repositoryName,
  sourceBranch,
  codebuildEnvVariables: filterObjectKeysByStringPattern(process.env, 'MRFP'),
});

// apply tags for all resources in this stack
Tags.of(codePipelineStack).add('SolutionName', solutionName);

app.synth();
