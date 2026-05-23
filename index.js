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

async function isUsableImageUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok && (response.headers.get('content-type') || '').startsWith('image/');
  } catch {
    return false;
  }
}

app.get('/random.jpg', async (req, res) => {
  const { token } = req.query;

  if (token !== CLIENT_TOKEN) {
    return res.status(401).json({ error: 'Invalid Token' });
  }

  try {
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

    const auth_code = authData?.auth_code;
    if (!auth_code) {
      return res.status(500).json({ error: 'Failed to obtain auth_code from upstream' });
    }

    if (!listData || !Array.isArray(listData.result)) {
      return res.status(500).json({ error: 'Invalid timeline data format received' });
    }

    const photoList = listData.result
      .flatMap(dayItem => dayItem.list || [])
      .filter(item => item?.id && item?.MD5);

    if (photoList.length === 0) {
      return res.status(404).json({ error: 'No valid photos found in timeline' });
    }

    const randomIndex = Math.floor(Math.random() * photoList.length);
    const { id, MD5 } = photoList[randomIndex];

    const internalProxyUrl = imageUrl(INTERNAL_API_URL, 'proxy', id, MD5, auth_code);
    const publicType = await isUsableImageUrl(internalProxyUrl) ? 'proxy' : 's260';
    const targetUrl = imageUrl(PUBLIC_API_URL, publicType, id, MD5, auth_code);

    return res.redirect(302, targetUrl);

  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
