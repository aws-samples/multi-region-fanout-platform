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
import * as AWS from 'aws-sdk';
import { DescribeSubnetsResult, Subnet } from 'aws-sdk/clients/ec2';

interface CustomResourceRequest {
  RequestType: string,
  StackId: string,
  RequestId: string,
  LogicalResourceId: string,
  PhysicalResourceId: string,
  ResourceProperties: {
    ownerId: string,
  };
}

enum EventStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

const ec2 = new AWS.EC2();

const createResource = async (event: CustomResourceRequest) => {
  try {
    const resp: DescribeSubnetsResult = await ec2.describeSubnets({
      Filters: [{ 
        Name: 'owner-id',
        Values: [event.ResourceProperties.ownerId],
      }],
    }).promise();
    if (!resp.Subnets?.length)
      throw new Error('no vpcs found');
    const vpcId: string = resp.Subnets[0].VpcId!;

    const subnetIds = resp.Subnets.reduce((res: string[], subnet: Subnet) => (
      subnet.SubnetId ?       
        [
          ...res,
          subnet.SubnetId,
        ] : 
        res
    ), []);
    console.log({ vpcId });
    console.log({ subnetIds });

    return {
      Status: EventStatus.SUCCESS,
      Data: {
        vpcId: vpcId,
        subnetIdA: subnetIds[0],
        subnetIdB: subnetIds[1],
        subnetIdC: subnetIds[2],
      },
    };
  } catch (e) {
    return {
      Status: EventStatus.FAILED,
      Reason: e.message ?? e,
    };
  }
};

const updateResource = async (event: CustomResourceRequest) => ({
  Status: EventStatus.SUCCESS,
  PhysicalResourceId: event.PhysicalResourceId,
});

const deleteResource = async (event: CustomResourceRequest) => ({
  Status: EventStatus.SUCCESS,
  PhysicalResourceId: event.PhysicalResourceId,
});

export const onEvent = async (event: CustomResourceRequest) => {
  let response;
  switch (event.RequestType) {
    case 'Create':
      response = await createResource(event);
      break;
    case 'Update':
      response = await updateResource(event);
      break;
    case 'Delete':
      response = await deleteResource(event);
      break;
    default:
      throw Error('onEvent request type not implemented');
  }
  return {
    ...response,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    StackId: event.StackId,
  };
};
