import express from 'express';

const app = express();

const requiredEnvVars = ['PUBLIC_API_URL', 'API_KEY', 'CLIENT_TOKEN'];
const missingEnvVars = requiredEnvVars.filter(name => !process.env[name]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const trimTrailingSlash = value => value.replace(/\/+$/, '');

const INTERNAL_API_URL = trimTrailingSlash(process.env.INTERNAL_API_URL || 'http://mtphotos:8063');
const PUBLIC_API_URL = trimTrailingSlash(process.env.PUBLIC_API_URL);
const API_KEY = process.env.API_KEY;
const CLIENT_TOKEN = process.env.CLIENT_TOKEN;
const PORT = process.env.PORT || 8064;

function imageUrl(baseUrl, type, id, md5, authCode) {
  return `${baseUrl}/gateway/${type}/${encodeURIComponent(md5)}?id=${encodeURIComponent(id)}&auth_code=${encodeURIComponent(authCode)}`;
}

function webUrl(baseUrl, id) {
  return `${baseUrl}/photoDetail?id=${encodeURIComponent(id)}`;
}

async function isUsableImageUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok && (response.headers.get('content-type') || '').startsWith('image/');
  } catch {
    return false;
  }
}

function assertClientToken(req, res) {
  if (req.query.token === CLIENT_TOKEN) return true;

  res.status(401).json({ error: 'Invalid Token' });
  return false;
}

async function getRandomPhoto() {
  const authPromise = fetch(`${INTERNAL_API_URL}/auth/auth_code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: API_KEY })
  }).then(r => r.json());

  const listPromise = fetch(`${INTERNAL_API_URL}/gateway/filesInTimelineV2`, {
    method: 'GET',
    headers: { 'x-api-key': API_KEY }
  }).then(r => r.json());

  const [authData, listData] = await Promise.all([authPromise, listPromise]);

  const authCode = authData?.auth_code;
  if (!authCode) {
    const error = new Error('Failed to obtain auth_code from upstream');
    error.statusCode = 500;
    throw error;
  }

  if (!listData || !Array.isArray(listData.result)) {
    const error = new Error('Invalid timeline data format received');
    error.statusCode = 500;
    throw error;
  }

  const photoList = listData.result
    .flatMap(dayItem => dayItem.list || [])
    .filter(item => item?.id && item?.MD5);

  if (photoList.length === 0) {
    const error = new Error('No valid photos found in timeline');
    error.statusCode = 404;
    throw error;
  }

  const randomIndex = Math.floor(Math.random() * photoList.length);
  const { id, MD5 } = photoList[randomIndex];

  const internalProxyUrl = imageUrl(INTERNAL_API_URL, 'proxy', id, MD5, authCode);
  const imageType = await isUsableImageUrl(internalProxyUrl) ? 'proxy' : 's260';

  return {
    id,
    md5: MD5,
    imageType,
    imageUrl: imageUrl(PUBLIC_API_URL, imageType, id, MD5, authCode),
    webUrl: webUrl(PUBLIC_API_URL, id)
  };
}

app.get('/random.jpg', async (req, res) => {
  if (!assertClientToken(req, res)) return;

  try {
    const photo = await getRandomPhoto();
    return res.redirect(302, photo.imageUrl);
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.get('/random.json', async (req, res) => {
  if (!assertClientToken(req, res)) return;

  try {
    const photo = await getRandomPhoto();
    return res.json(photo);
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
