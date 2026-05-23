import express from 'express';

const app = express();

const requiredEnvVars = ['PUBLIC_API_URL', 'API_KEY', 'CLIENT_TOKEN'];
const missingEnvVars = requiredEnvVars.filter(name => !process.env[name]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const trimTrailingSlash = value => value.replace(/\/+$/, '');

const INTERNAL_API_URL = trimTrailingSlash(process.env.INTERNAL_API_URL || 'http://mtphotos:8063/api');
const PUBLIC_API_URL = trimTrailingSlash(process.env.PUBLIC_API_URL);
const API_KEY = process.env.API_KEY;
const CLIENT_TOKEN = process.env.CLIENT_TOKEN;
const PORT = process.env.PORT || 8064;

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

    const urlencoded_auth_code = encodeURIComponent(auth_code);
    const targetUrl = `${PUBLIC_API_URL}/gateway/proxy/${encodeURIComponent(MD5)}?id=${encodeURIComponent(id)}&auth_code=${urlencoded_auth_code}`;

    return res.redirect(302, targetUrl);

  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
