const aws = require('aws-sdk');
const s3 = new aws.S3();
const https = require("https");
const url = require("url");

exports.handler = async (event, context) => {
  console.log("Custom Resource Request:\n" + JSON.stringify(event))

  switch (event.RequestType) {
    case "Create":
      console.log("Start creating dummy data in s3 bucket.");
      await createChunks(
        event.ResourceProperties.bucketName,
        event.ResourceProperties.chunks,
        event.ResourceProperties.chunkSize,
        event.ResourceProperties.tokenLength,
        event.ResourceProperties.provider,
        event.ResourceProperties.platform,
        event.ResourceProperties.severity
      )
      break;
    default:
      console.log("Not implemented.");
      break;
  }

  console.log("Done creating dummy data.")

  let responseData = {};
  await sendCustomResourceResponse(event, context, "SUCCESS", responseData);

};

const createChunks = async (bucketName, chunks, chunkSize, tokenLength, provider, platform, severity) => {

  // Loop through chunks
  for (let i = 1; i <= chunks; i++) {

    // Chunk content
    let content_array = [];
    let content_string = [];
    for (let c = 1; c <= chunkSize; c++) {
      content_array.push(randomString(tokenLength));
    }
    content_string = JSON.stringify(content_array);

    // Upload to S3
    await s3.putObject({
      Bucket: bucketName,
      Key: `${provider}/${platform}/${severity}/${i}.json`,
      ContentType: 'application/json',
      Body: Buffer.from(content_string, 'binary')
    }).promise();

  }


}


const randomString = (length) => {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

const sendCustomResourceResponse = (event, context, responseStatus, responseData) => {
  return new Promise((resolve, reject) => {
    const responseBody = JSON.stringify({
      Status: responseStatus,
      Reason: context.logStreamName,
      PhysicalResourceId: context.logStreamName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: responseData,
    });
  
    const parsedUrl = url.parse(event.ResponseURL);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: "PUT",
      headers: {
        "content-type": "",
        "content-length": responseBody.length,
      },
    };
  
    console.log("Sending custom resource response...\n");
  
    const req = https.request(options, (res) => {
      console.log("Custom Resource S3 response statusCode: " + res.statusCode);
      console.log("Custom Resource S3 response headers: " + JSON.stringify(res.headers));
      res.on('end', () => {
        resolve();
      });
    });
  
    req.on('error', (error) => {
      console.log("Send custom resource response error:" + error);
      reject();
    });
  
    // send body
    req.write(responseBody);
    req.end();
  });
}