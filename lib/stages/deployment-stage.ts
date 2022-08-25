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
import { ArnComponents, Stack, Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WebsiteStack } from '../stacks/website-stack/website-stack';
import { ProcessingStack } from '../stacks/processing-stack/processing-stack';
import { FanoutStack } from '../stacks/fanout-stack/fanout-stack';
import { SharedServicesStack } from '../stacks/shared-services-stack/shared-services-stack';
import {
  CriticalityClassContext,
  EnvironmentContext,
  DynamodbArns,
  ProcessingAccountRoleArns,
  ProcessingLambdaNameComponents,
  CriticalityLevel,
} from '../../types/app-configuration';
import { ConsumerLambdaConfig } from '../stacks/fanout-stack/types';
import { QueueType } from '../stacks/types';
import { AlertTableStack } from '../stacks/alert-table-stack/alert-table-stack';
import { RdsClusterConstruct } from '../stacks/shared-services-stack/constructs/rds-cluster-construct';
import { DeviceCacheBucketConstruct } from '../stacks/shared-services-stack/constructs/device-cache-bucket-construct';
import { SqsQueueConstruct } from '../constructs/sqs-queue-construct';
import { WebsiteRolesStack } from '../stacks/website-stack/website-roles-stack';
import { ProcessingRolesStack } from '../stacks/processing-stack/processing-roles-stack';
import { SharedServicesRolesStack } from '../stacks/shared-services-stack/shared-services-roles-stack';
import { FanoutRolesStack } from '../stacks/fanout-stack/fanout-roles-stack';
import { WatchdogRolesStack } from '../stacks/watchdog-stack/watchdog-roles-stack';
import { ProcessingCrossAccountRolesStack } from '../stacks/processing-stack/processing-cross-account-roles-stack';
import { ProcessingAccountConfig } from '../stacks/processing-stack/types';
import { WatchdogStack } from '../stacks/watchdog-stack/watchdog-stack';

export interface DeploymentStageProps extends StageProps {
  environment: EnvironmentContext,
  region: string,
  solutionName: string,
  websiteStackProps: {
    primaryRegion: string,
    secondaryRegion: string,
  },
  processingStackProps: {
    ddbFailoverQueueNames: {
      [level in CriticalityLevel]: string
    },
    ddbPushTableName: string,
  },
  fanoutLambdaConfig: {
    [key in QueueType]: ConsumerLambdaConfig
  },
  appDatabaseName: string;
}

export class DeploymentStage extends Stage {
  constructor(scope: Construct, id: string, props: DeploymentStageProps) {
    super(scope, id, props);

    const rolesStacks: Stack[] = [];

    // create stacks with Lambda execution roles first
    rolesStacks.push(new WebsiteRolesStack(this, `website-roles-stack-${props.region}`, {
      env: { account: props.environment.accountIdWebsite, region: props.region },
    }));
    props.environment.criticalityClasses.forEach((criticalityClass: CriticalityClassContext) => {
      rolesStacks.push(new ProcessingRolesStack(this, `processing-roles-stack-${criticalityClass.class}-${props.region}`, {
        env: { account: criticalityClass.accountIdProcessing, region: props.region },
      }));
      rolesStacks.push(new FanoutRolesStack(this, `fanout-roles-stack-pnp1-${criticalityClass.class}-${props.region}`, {
        env: { account: criticalityClass.accountIdFanoutPnp1, region: props.region },
      }));
      rolesStacks.push(new FanoutRolesStack(this, `fanout-roles-stack-pnp2-${criticalityClass.class}-${props.region}`, {
        env: { account: criticalityClass.accountIdFanoutPnp2, region: props.region },
      }));
    });
    rolesStacks.push(new WatchdogRolesStack(this, `watchdog-roles-stack-${props.region}`, {
      env: { account: props.environment.accountIdWebsite, region: props.region },
    }));

    const websiteBucketName = `${props.environment.accountIdWebsite}-website-bucket-${props.region}`;
    const crossRegion = props.region === props.websiteStackProps.primaryRegion ? props.websiteStackProps.secondaryRegion : props.websiteStackProps.primaryRegion;
    const websiteBucketNameCrossRegion = `${props.environment.accountIdWebsite}-website-bucket-${crossRegion}`;

    // create stack with cross account IAM role in shared services account
    const processingAccountIds: ProcessingAccountConfig = props.environment.criticalityClasses.reduce(
      (accountIds: ProcessingAccountConfig, criticalityClass: CriticalityClassContext) => {
        accountIds[criticalityClass.class] = criticalityClass.accountIdProcessing;
        return accountIds;
      },
      {} as ProcessingAccountConfig,
    );
    const sharedServicesRolesStack = new SharedServicesRolesStack(this, `shared-services-role-stack-${props.region}`, {
      env: { account: props.environment.accountIdSharedServices, region: props.region },
      websiteAccountId: props.environment.accountIdWebsite,
      processingAccountIds: processingAccountIds,
    });
    this.addDependenciesToStack(rolesStacks, sharedServicesRolesStack);

    // create stacks with cross account IAM roles in processing account
    const processingCrossAccountRolesStacks: Stack[] = [];
    props.environment.criticalityClasses.forEach((criticalityClass: CriticalityClassContext) => {
      const processingCrossAccountRolesStack = new ProcessingCrossAccountRolesStack(this, `processing-cross-account-roles-stack-${criticalityClass.class}-${props.region}`, {
        env: { account: criticalityClass.accountIdProcessing, region: props.region },
        websiteAccountId: props.environment.accountIdWebsite,
        watchdogAccountId: props.environment.accountIdWebsite,
        crossRegion: crossRegion,
      });
      this.addDependenciesToStack(rolesStacks, processingCrossAccountRolesStack);
      processingCrossAccountRolesStacks.push(processingCrossAccountRolesStack);
    });


    // create shared services stack
    const sharedServicesStack = new SharedServicesStack(this, `shared-services-stack-${props.region}`, {
      env: { account: props.environment.accountIdSharedServices, region: props.region },
      stage: props.environment.stage,
      ramPrincipals: [
        ...props.environment.criticalityClasses.map((criticalityClass: CriticalityClassContext) => criticalityClass.accountIdProcessing),
        props.environment.accountIdWebsite,
      ],
      lambdaRoleArnsProcessingSelectedAlerts: props.environment.criticalityClasses.map((criticalityClass: CriticalityClassContext) =>
        ProcessingRolesStack.getLambdaRoleArnComponents(props.region, criticalityClass.accountIdProcessing, 'selectedAlerts'),
      ),
      lambdaRoleArnsProcessingAllAlerts: props.environment.criticalityClasses.map((criticalityClass: CriticalityClassContext) =>
        ProcessingRolesStack.getLambdaRoleArnComponents(props.region, criticalityClass.accountIdProcessing, 'allAlerts'),
      ),
      lambdaRoleArnsFanoutAllAlerts: props.environment.criticalityClasses.reduce((result: ArnComponents[], criticalityClass: CriticalityClassContext) => {
        result.push(FanoutRolesStack.getLambdaRoleArnComponents(props.region, criticalityClass.accountIdFanoutPnp1, 'allAlerts'));
        result.push(FanoutRolesStack.getLambdaRoleArnComponents(props.region, criticalityClass.accountIdFanoutPnp2, 'allAlerts'));
        return result;
      }, []),
      websiteAccountId: props.environment.accountIdWebsite,
      processingAccountIds: Object.values(props.environment.criticalityClasses).map(criticalityClass => criticalityClass.accountIdProcessing),
      appDatabaseName: props.appDatabaseName,
    });
    this.addDependenciesToStack([sharedServicesRolesStack, ...processingCrossAccountRolesStacks], sharedServicesStack);

    const processingAccountsRoleNamesForWebsiteAccount = {} as ProcessingAccountRoleArns;
    const processingAccountsFunctionNamesAllAlerts = {} as ProcessingLambdaNameComponents;
    const processingAccountsFunctionNamesSelectedAlerts = {} as ProcessingLambdaNameComponents;
    const processingAccountsFailoverQueueUrls = {} as { [level in CriticalityLevel]: string };
    const ddbTableArns = {} as DynamodbArns;
    props.environment.criticalityClasses.forEach((criticalityClass: CriticalityClassContext) => {
      processingAccountsRoleNamesForWebsiteAccount[criticalityClass.class] = ProcessingCrossAccountRolesStack
        .getCrossAccountRoleArnComponents(props.region, criticalityClass.accountIdProcessing, 'website');
      processingAccountsFunctionNamesAllAlerts[criticalityClass.class] = ProcessingRolesStack.processingLambdaNameConfig.allAlerts;
      processingAccountsFunctionNamesSelectedAlerts[criticalityClass.class] = ProcessingRolesStack.processingLambdaNameConfig.selectedAlerts;
      processingAccountsFailoverQueueUrls[criticalityClass.class] = SqsQueueConstruct.getQueueUrlFromName(
        props.processingStackProps.ddbFailoverQueueNames[criticalityClass.class],
        props.region,
        criticalityClass.accountIdProcessing,
      );
      ddbTableArns[criticalityClass.class] = {
        region: props.environment.primaryRegion,
        account: criticalityClass.accountIdProcessing,
        partition: 'aws',
        service: 'dynamodb',
        resource: 'table',
        resourceName: AlertTableStack.tableName,
      };
    });

    const stacks: Stack[] = [];
    const websiteStack = new WebsiteStack(this, `website-stack-${props.region}`, {
      env: { account: props.environment.accountIdWebsite, region: props.region },
      primaryRegion: props.websiteStackProps.primaryRegion,
      sharedVpcOwnerId: props.environment.accountIdSharedServices,
      secondaryRegion: props.websiteStackProps.secondaryRegion,
      rdsDatabaseSecretName: RdsClusterConstruct.getAppUserSecretName(props.region),
      sharedServicesCrossAccountRole: SharedServicesRolesStack.getCrossAccountRoleArnComponent(props.region, props.environment.accountIdSharedServices),
      processingAccountsRoleNames: processingAccountsRoleNamesForWebsiteAccount,
      processingAccountsFunctionNamesAllAlerts: processingAccountsFunctionNamesAllAlerts,
      processingAccountsFunctionNamesSelectedAlerts: processingAccountsFunctionNamesSelectedAlerts,
      ddbTableArns,
      ddbFailoverQueueUrlHigh: processingAccountsFailoverQueueUrls.high,
      ddbFailoverQueueUrlRegular: processingAccountsFailoverQueueUrls.regular,
      websiteBucketName: websiteBucketName,
      appDatabaseName: props.appDatabaseName,
    });
    websiteStack.addDependency(sharedServicesStack);
    stacks.push(websiteStack);

    props.environment.criticalityClasses.forEach((criticalityClass: CriticalityClassContext) => {

      const allAlertsProcessingLambdaArnComponents: ArnComponents = ProcessingRolesStack.getLambdaRoleArnComponents(props.region, criticalityClass.accountIdProcessing, 'allAlerts');
      const selectedAlertsProcessingLambdaArnComponents: ArnComponents = ProcessingRolesStack.getLambdaRoleArnComponents(props.region, criticalityClass.accountIdProcessing, 'selectedAlerts');

      if (props.region == props.environment.primaryRegion) {
        const alertTableStack = new AlertTableStack(this, `alert-table-stack-${criticalityClass.class}-${props.region}`, {
          env: { account: criticalityClass.accountIdProcessing, region: props.region },
          replicationRegions: props.environment.regions.filter((region: string) => region != props.environment.primaryRegion),
          principalArnComponents: [...Object.values(allAlertsProcessingLambdaArnComponents), ...Object.values(selectedAlertsProcessingLambdaArnComponents)],
        });
        alertTableStack.addDependency(sharedServicesStack);
        stacks.push(alertTableStack);
      }

      const fanoutPnp1 = new FanoutStack(this, `fanout-stack-pnp1-${criticalityClass.class}-${props.region}`, {
        env: { account: criticalityClass.accountIdFanoutPnp1, region: props.region },
        stage: props.environment.stage,
        notificationService: 'pnp1',
        criticalityClass: criticalityClass.class,
        lambdaConfig: {
          allAlerts: {
            consumerLambdaConfig: props.fanoutLambdaConfig.allAlerts,
            producerLambdaRoleArnComponents: allAlertsProcessingLambdaArnComponents,
          },
          selectedAlerts: {
            consumerLambdaConfig: props.fanoutLambdaConfig.selectedAlerts,
            producerLambdaRoleArnComponents: selectedAlertsProcessingLambdaArnComponents,
          },
        },
        ddbPushTableName: props.processingStackProps.ddbPushTableName,
        allAlertsDeviceCacheBucketName: DeviceCacheBucketConstruct.getBucketName(props.environment.accountIdSharedServices, props.region),
        sharedServiceAccountId: props.environment.accountIdSharedServices,
        processingAccountId: criticalityClass.accountIdProcessing,
        queueArnBatchProtocol: SqsQueueConstruct.getQueueArnFromName(ProcessingStack.queueNameBatchProtocol, props.region, criticalityClass.accountIdProcessing),
      });
      fanoutPnp1.addDependency(sharedServicesStack);
      stacks.push(fanoutPnp1);

      const fanoutPnp2 = new FanoutStack(this, `fanout-stack-pnp2-${criticalityClass.class}-${props.region}`, {
        env: { account: criticalityClass.accountIdFanoutPnp2, region: props.region },
        stage: props.environment.stage,
        notificationService: 'pnp2',
        criticalityClass: criticalityClass.class,
        lambdaConfig: {
          allAlerts: {
            consumerLambdaConfig: props.fanoutLambdaConfig.allAlerts,
            producerLambdaRoleArnComponents: allAlertsProcessingLambdaArnComponents,
          },
          selectedAlerts: {
            consumerLambdaConfig: props.fanoutLambdaConfig.selectedAlerts,
            producerLambdaRoleArnComponents: selectedAlertsProcessingLambdaArnComponents,
          },
        },
        ddbPushTableName: props.processingStackProps.ddbPushTableName,
        allAlertsDeviceCacheBucketName: DeviceCacheBucketConstruct.getBucketName(props.environment.accountIdSharedServices, props.region),
        sharedServiceAccountId: props.environment.accountIdSharedServices,
        processingAccountId: criticalityClass.accountIdProcessing,
        queueArnBatchProtocol: SqsQueueConstruct.getQueueArnFromName(ProcessingStack.queueNameBatchProtocol, props.region, criticalityClass.accountIdProcessing),
      });
      fanoutPnp2.addDependency(sharedServicesStack);
      stacks.push(fanoutPnp2);

      const processingStack = new ProcessingStack(this, `processing-stack-${criticalityClass.class}-${props.region}`, {
        env: { account: criticalityClass.accountIdProcessing, region: props.region },
        stage: props.environment.stage,
        websiteAccountId: props.environment.accountIdWebsite,
        fanoutPnp1AccountId: criticalityClass.accountIdFanoutPnp1,
        fanoutPnp2AccountId: criticalityClass.accountIdFanoutPnp2,
        ddbAlertsTableName: AlertTableStack.tableName,
        ddbPushTableName: props.processingStackProps.ddbPushTableName,
        sharedVpcOwnerId: props.environment.accountIdSharedServices,
        appUserSecret: RdsClusterConstruct.getAppUserSecretName(props.region),
        sharedServicesCrossAccountRole: SharedServicesRolesStack.getCrossAccountRoleArnComponent(props.region, props.environment.accountIdSharedServices),
        allAlertsDeviceCacheBucketName: DeviceCacheBucketConstruct.getBucketName(props.environment.accountIdSharedServices, props.region),
        fanoutQueueConfig: {
          allAlerts: {
            pnp1: SqsQueueConstruct.getQueueArnFromName(fanoutPnp1.allAlertsQueueName, props.region, criticalityClass.accountIdFanoutPnp1),
            pnp2: SqsQueueConstruct.getQueueArnFromName(fanoutPnp2.allAlertsQueueName, props.region, criticalityClass.accountIdFanoutPnp2),
          },
          selectedAlerts: {
            pnp1: SqsQueueConstruct.getQueueArnFromName(fanoutPnp1.selectedAlertsQueueName, props.region, criticalityClass.accountIdFanoutPnp1),
            pnp2: SqsQueueConstruct.getQueueArnFromName(fanoutPnp2.selectedAlertsQueueName, props.region, criticalityClass.accountIdFanoutPnp2),
          },
        },
        ddbFailoverQueueName: props.processingStackProps.ddbFailoverQueueNames[criticalityClass.class],
        ddbFailoverQueueMessageProducerArn: WebsiteRolesStack.getLambdaRoleArnComponents(props.region, props.environment.accountIdWebsite, 'alertHandler'),
        appDatabaseName: props.appDatabaseName,
      });
      processingStack.addDependency(sharedServicesStack);
      stacks.push(processingStack);
    });

    const watchdogStack = new WatchdogStack(this, `watchdog-stack-${props.region}`, {
      env: { account: props.environment.accountIdWebsite, region: props.region },
      websiteAccountId: props.environment.accountIdWebsite,
      alertTableName: AlertTableStack.tableName,
      alertBatchesTableName: props.processingStackProps.ddbPushTableName,
      ddbCrossAccountRoleHigh: ProcessingCrossAccountRolesStack.getCrossAccountRoleArnComponents(crossRegion, processingAccountIds.high, 'watchdog'),
      ddbCrossAccountRoleRegular: ProcessingCrossAccountRolesStack.getCrossAccountRoleArnComponents(crossRegion, processingAccountIds.regular, 'watchdog'),
      websiteBucketNameCrossRegion: websiteBucketNameCrossRegion,
      websiteBucketNameSameRegion: websiteBucketName,
      alertHandlerFunctionNameSameRegion: WebsiteRolesStack.websiteLambdaNameConfig.alertHandler,
      isPrimaryRegion: props.region === props.websiteStackProps.primaryRegion,
      crossRegion: crossRegion,
    });
    this.addDependenciesToStack(stacks, watchdogStack);
  }

  private addDependenciesToStack(dependencies: Stack[], stack: Stack) {
    dependencies.forEach((dependency: Stack) => stack.addDependency(dependency));
  }
}