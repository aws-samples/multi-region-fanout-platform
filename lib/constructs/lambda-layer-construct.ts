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
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { RemovalPolicy } from 'aws-cdk-lib';

interface Props {
  entry: string,
  layerDescription: string,
  layerVersionName: string,
}

export class LambdaLayerConstruct extends Construct {
  public readonly lambdaLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    this.lambdaLayer =  new lambda.LayerVersion(this, 'lambda-layer', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '..', '..', 'runtime', 'layers', props.entry, `${props.entry}.zip`),
      ),
      compatibleRuntimes: [
        lambda.Runtime.NODEJS_14_X,
      ],
      removalPolicy: RemovalPolicy.RETAIN,
      description: props.layerDescription,
      license: 'Apache-2.0',
      layerVersionName: props.layerVersionName,
    });
  }
}