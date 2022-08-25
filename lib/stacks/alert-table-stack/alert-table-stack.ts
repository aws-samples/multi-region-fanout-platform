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
import { ArnComponents, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs/lib/construct';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

interface Props extends StackProps {
  replicationRegions: string[],
  principalArnComponents: ArnComponents[],
}

export class AlertTableStack extends Stack {
  public static readonly tableName: string = 'alert-table';

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'global-table', {
      tableName: AlertTableStack.tableName,
      partitionKey: { name: 'alertId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'platform', type: dynamodb.AttributeType.STRING },
      replicationRegions: props.replicationRegions,
    });

    props.principalArnComponents.forEach((arnComponents: ArnComponents) => {
      table.grantReadWriteData(new iam.ArnPrincipal(this.formatArn(arnComponents)));
    });
  }

}