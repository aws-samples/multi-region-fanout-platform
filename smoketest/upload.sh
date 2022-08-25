#!/bin/sh
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

BUCKET_NAME_EU_CENTRAL_1=""
BUCKET_NAME_EU_WEST_3=""
REGION_HASH=0 # determines the primary processing region for this alert message

cp AP2-Test.json AP2-Test-$1.json
sed -i -e 's/XX/'$1'/g' AP2-Test-$1.json

aws s3api put-object --bucket "${BUCKET_NAME_EU_CENTRAL_1}" \
  --key api/warnings/AP2-Test-"$1".json \
  --body AP2-Test-$1.json \
  --tagging "AWS_Processed=false&JSON_Hash=0&Severity=Extreme&Hash=${REGION_HASH}&Alert_ID=AP2-Test-$1&Provider=AP2" \
  --profile $2

aws s3api put-object --bucket "${BUCKET_NAME_EU_WEST_3}" \
  --key api/warnings/AP2-Test-"$1".json \
  --body AP2-Test-$1.json \
  --tagging "AWS_Processed=false&JSON_Hash=0&Severity=Extreme&Hash=${REGION_HASH}&Alert_ID=AP2-Test-$1&Provider=AP2" \
  --profile $2

rm AP2-Test-$1.json*
