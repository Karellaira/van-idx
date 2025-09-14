// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio'; // <- correct ESM import

const app = express();

// ===== Config
const PORT = process.env.PORT || 3001;

// CORS (allow everywhere; tighten later if you want)
app.use(cors({ origin: /.*/ }));
app.use(express.json());

// Root + health
app.get('/', (req, res) => {
  res
    .status(200)
    .send('Backend is running. Use /api/har/featured or /health');
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, message: 'Server is healthy' });
});

// ===== Simple in-memory cache (10 min default)
const cache = new Map();
const setCache = (k, v, ms = 10 * 60 * 1000) =>
  cache.set(k, { v, exp: Date.now() + ms });
const getCache = (k) => {
  const it = cache.get(k);
  if (!it || Date.now() > it.exp) {
    cache.delete(k);
    return null;
  }
  return it.v;
};

// Common headers (HAR sometimes needs realistic ones)
const HAR_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  referer: 'https://web.har.com/',
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'upgrade-insecure-requests': '1',
};

// ===== DEBUG: peek at fetched HTML (first 2000 chars)
app.get('/api/har/raw', async (req, res) => {
  try {
    const agent = (req.query.agent_number || '').toString().trim();
    const cid = (req.query.cid || '').toString().trim();
    if (!agent && !cid)
      return res.status(400).json({ error: 'Provide agent_number or cid' });

    const url = agent
      ? `https://web.har.com/aws/dispFeaturedIDX.cfm?agent_number=${encodeURIComponent(
          agent
        )}`
      : `https://web.har.com/aws/dispFeaturedIDX.cfm?cid=${encodeURIComponent(
          cid
        )}`;

    const r = await fetch(url, { headers: HAR_HEADERS });
    const html = await r.text();
    res.json({
      ok: true,
      status: r.status,
      url,
      length: html.length,
      snippet: html.slice(0, 2000),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ===== Featured IDX (server-side fetch + parse)
app.get('/api/har/featured', async (req, res) => {
  const agent = (req.query.agent_number || '').toString().trim();
  const cid = (req.query.cid || '').toString().trim();
  if (!agent && !cid)
    return res.status(400).json({ error: 'Provide agent_number or cid' });

  const url = agent
    ? `https://web.har.com/aws/dispFeaturedIDX.cfm?agent_number=${encodeURIComponent(
        agent
      )}`
    : `https://web.har.com/aws/dispFeaturedIDX.cfm?cid=${encodeURIComponent(
        cid
      )}`;

  const key = `har:${agent || cid}`;
  const cached = getCache(key);
  if (cached) return res.json({ ok: true, listings: cached });

  try {
    const r = await fetch(url, { headers: HAR_HEADERS });
    const html = await r.text();

    // Load DOM
    const $ = cheerio.load(html);

    // Collect potential cards
    const items = [];
    $('a[href]').each((_, a) => {
      const $a = $(a);
      const href = ($a.attr('href') || '').trim();
      if (!/har\.com/i.test(href)) return;

      // Try to find a reasonable "card" container
      const $card =
        $a.closest('li,article,div').length > 0 ? $a.closest('li,article,div') : $a.parent();

      // Image
      const $img = $card.find('img').first();
      const img = ($img.attr('src') || $img.attr('data-src') || '').trim();

      // Text content
      const txt = $card.text().replace(/\s+/g, ' ').trim();

      // Heuristic fields
      const price = (txt.match(/\$\s?[\d,]+/) || [])[0] || '';
      const beds = (txt.match(/(\d+)\s*Beds?/i) || [])[1] || '';
      const baths = (txt.match(/(\d+)\s*Baths?/i) || [])[1] || '';
      const address =
        ($a.attr('title') || '').trim() ||
        (txt.split('$')[0] || '').trim();

      // Skip obvious junk
      if (!img && !price && !address) return;

      items.push({
        link: href.startsWith('http') ? href : `https://www.har.com${href}`,
        photo: img ? (img.startsWith('http') ? img : `https:${img}`) : '',
        price,
        beds,
        baths,
        address,
      });
    });

    // De-dupe + limit
    const seen = new Set();
    const listings = items
      .filter((x) => {
        const k = `${x.link}|${x.photo}|${x.price}|${x.address}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 24);

    setCache(key, listings);
    res.json({ ok: true, listings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to load featured widget' });
  }
});

// ===== Start server (Render needs 0.0.0.0)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
