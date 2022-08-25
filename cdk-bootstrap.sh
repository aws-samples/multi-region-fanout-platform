#!/bin/zsh
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of this
# software and associated documentation files (the "Software"), to deal in the Software
# without restriction, including without limitation the rights to use, copy, modify,
# merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
# permit persons to whom the Software is furnished to do so.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
# PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
# HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
# OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
# SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
#

primary_region='eu-central-1'
secondary_region='eu-west-3'

if [ -f .env ]; then
  export $(cat .env | xargs)
  while read -r line; do
    if [[ "$line" == "MRFP_AWS_ACCOUNT"* ]]; then
      account_key="${line%=*}"
      profile_key="PROFILE_${account_key}"

      echo "Bootstrapping ${account_key}"

      if [ "$account_key" == MRFP_AWS_ACCOUNT_DEVOPS ]; then
        npx cdk bootstrap aws://"${!account_key}"/"${primary_region}" --profile "${!profile_key}"
      else
        npx cdk bootstrap --trust "${MRFP_AWS_ACCOUNT_DEVOPS}" --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess aws://"${!account_key}"/"${primary_region}" --profile "${!profile_key}"
        npx cdk bootstrap --trust "${MRFP_AWS_ACCOUNT_DEVOPS}" --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess aws://"${!account_key}"/"${secondary_region}" --profile "${!profile_key}"
      fi
    fi
  done <.env
else
  echo "No .env file found. Please create it from .env.sample and edit it according the documentation."
fi