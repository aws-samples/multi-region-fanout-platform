# Lambda "Alert Handler"

This Lambda function assumes a trigger from S3 events and performs geo lookups to create an alert notification (enriched alert).

## Environment Variables

| Variable | Description |
| -------- | ----------- |
| `DDB_TABLE_NAME` | The name of the DynamoDB table to store alert tasks in. |
| `LAMBDA_STEP2_ALL` | The name of the Lambda function which processes the mylocation=true notifications. |
| `LAMBDA_STEP2_SELECTED` | The name of the Lambda function which processes the mylocation=false notifications. |
|`APP_PLATFORM_NOTIFICATIONS` | The primary platform to send notifications via. Should be either 'apns' or 'fcm'. |
|`APP_PLATFORMSOTHER_NOTIFICATIONS` | The other platforms divided by semicolon. The Lambda adopter uses them to replicate the alert notification per provider. |
| `SECMGR_SECRETID_RDSCREDENTIALS` | The secret identifier from KMS which contains the RDS credentials. |
| `RDS_HOST_PRIMARY` | The primary endpoint from RDS. |
| `RDS_HOST_READONLY` | The read-only endpoint from RDS. |
| `RDS_PORT` | The port of the RDS endpoints. |
| `APP_QUERY_MKT` | The SQL query for resolving MKT to Z curves. |
| `APP_QUERY_SHN` | The SQL query for resolving SHN to Z curves. |
| `APP_QUERY_WARNCELLS` | The SQL query for resolving warn cells to Z curves. |
| `SQS_QUEUEURL_DDBFAILURE` | The SQS queue url if writing to DynamoDB fails. |
| `APP_REGIONID` | The short-hand region identifier as stringified number. |
