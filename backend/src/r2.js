const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function getClient() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      'R2 is not configured yet (missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in .env)'
    );
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

// Photos go straight from the device to R2 with this URL — never through
// this server — so a photo upload never competes with API request handling.
async function getPresignedUploadUrl(key) {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error('R2 is not configured yet (missing R2_BUCKET_NAME in .env)');
  }
  const client = getClient();
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'image/jpeg' });
  return getSignedUrl(client, command, { expiresIn: 900 }); // 15 minutes
}

module.exports = { getPresignedUploadUrl };
