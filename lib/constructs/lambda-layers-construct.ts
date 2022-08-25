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
import { LambdaLayerConstruct } from './lambda-layer-construct';

export class LambdaLayersConstruct extends Construct {
  public readonly baseLayer: lambda.LayerVersion;
  public readonly pgLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const layerBase = new LambdaLayerConstruct(this, 'layer-base', {
      entry: 'base',
      layerDescription: 'Base libraries and shared functionality.',
      layerVersionName: 'base',
    });

    const layerPg = new LambdaLayerConstruct(this, 'layer-pg', {
      entry: 'rds-postgis',
      layerDescription: 'PostgreSQL libraries and data services.',
      layerVersionName: 'pg',
    });

    this.baseLayer = layerBase.lambdaLayer;
    this.pgLayer = layerPg.lambdaLayer;
  }
}