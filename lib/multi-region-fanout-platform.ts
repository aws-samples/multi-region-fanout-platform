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
import * as cdk from 'aws-cdk-lib';
import { Duration, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodeBuildStep, CodePipeline, CodePipelineSource } from 'aws-cdk-lib/pipelines';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import { DeploymentStage } from './stages/deployment-stage';
import { EnvironmentContext, ProcessEnv } from '../types/app-configuration';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface CodePipelineStackProps extends StackProps {
  solutionName: string;
  sourceBranch: string;
  repositoryName: string;
  environmentContexts: EnvironmentContext[];
  codebuildEnvVariables: ProcessEnv;
}

export class MultiRegionFanoutPlatform extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CodePipelineStackProps) {
    super(scope, id, props);

    const repository = new Repository(this, 'solutionRepository', {
      repositoryName: props.repositoryName,
      description: `Repository for the ${props.solutionName} solution`,
    });

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: `${props.solutionName}-code-pipeline`,
      crossAccountKeys: true,
      synth: new CodeBuildStep('Synth', {
        input: CodePipelineSource.codeCommit(repository, props.sourceBranch),
        commands: [ 'sh ./build.sh' ],
        env: {
          AWS_ACCOUNT_DEVOPS: this.account,
          PRIMARY_REGION: this.region,
          ...props.codebuildEnvVariables,
        },
        rolePolicyStatements: [
          new PolicyStatement({
            actions: ['sts:AssumeRole'],
            resources: [
              `arn:aws:iam::${props.codebuildEnvVariables.MRFP_AWS_ACCOUNT_SHARED_SERVICES_DEV}:role/cdk-*`,
              `arn:aws:iam::${props.codebuildEnvVariables.MRFP_AWS_ACCOUNT_WEBSITE_DEV}:role/cdk-*`,
              `arn:aws:iam::${props.codebuildEnvVariables.MRFP_AWS_ACCOUNT_PROCESSING_HIGH_DEV}:role/cdk-*`,
              `arn:aws:iam::${props.codebuildEnvVariables.MRFP_AWS_ACCOUNT_PROCESSING_REGULAR_DEV}:role/cdk-*`,
            ],
          }),
        ],
      }),
      selfMutation: true,
      publishAssetsInParallel: false,
    });

    props.environmentContexts.forEach((environment: EnvironmentContext) => {
      const wave = pipeline.addWave(`${environment.stage}-environment`);

      const primaryRegion = environment.primaryRegion;
      const secondaryRegion = environment.regions.find(region => region !== primaryRegion)!;

      environment.regions.forEach((region: string) => {

        const stage = new DeploymentStage(this, `${environment.stage}-${region}-stage`, {
          environment,
          region,
          solutionName: props.solutionName,
          websiteStackProps: {
            primaryRegion,
            secondaryRegion,
          },
          processingStackProps: {
            ddbFailoverQueueNames: {
              high: 'ddb-failover-queue',
              regular: 'ddb-failover-queue',
            },
            ddbPushTableName: 'alert-batch-table',
          },
          fanoutLambdaConfig: {
            allAlerts: {
              reservedConcurrentExecutions: 100,
              timeout: Duration.seconds(5),
              sqsEventSourceBatchSize: 10,
            },
            selectedAlerts: {
              reservedConcurrentExecutions: 100,
              timeout: Duration.seconds(5),
              sqsEventSourceBatchSize: 10,
            },
          },
          appDatabaseName: 'appgis',
        });

        // apply tags for all resources in this stage
        Tags.of(stage).add('SolutionName', props.solutionName);
        Tags.of(stage).add('Stage', environment.stage);
        wave.addStage(stage);
      });
    });
  }
}
