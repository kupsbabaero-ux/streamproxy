const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

const STREAM_URL = "http://85.237.89.160:9590/usa-s/FOX-SPORTS-1/index.m3u8";

async function proxyFetch(targetUrl) {
  const origin = new URL(targetUrl).origin;
  return fetch(targetUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': '*/*',
      'Referer': origin + '/',
    }
  });
}

// CORS Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/foxsp.m3u8', async (req, res) => {
  const targetUrl = req.query.proxy || STREAM_URL;

  try {
    const response = await proxyFetch(targetUrl);

    if (!response.ok) {
      return res.status(response.status).send(`Stream error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // Kung M3U8 Manifest
    if (contentType.includes('mpegurl') || contentType.includes('apple') || targetUrl.includes('.m3u8')) {
      const manifestText = await response.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      const host = `${req.protocol}://${req.get('host')}`;

      const updatedManifest = manifestText.split('\n').map(line => {
        let trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
            const absUri = new URL(p1, baseUrl).href;
            return `URI="${host}/foxsp.m3u8?proxy=${encodeURIComponent(absUri)}"`;
          });
        }

        if (trimmed.startsWith('#')) return line;

        const absoluteUrl = new URL(trimmed, baseUrl).href;
        return `${host}/foxsp.m3u8?proxy=${encodeURIComponent(absoluteUrl)}`;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(updatedManifest);
    }

    // Kung TS Video Segment
    res.setHeader('Content-Type', contentType || 'video/mp2t');
    response.body.pipe(res);

  } catch (err) {
    res.status(500).send(`Server Error: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
