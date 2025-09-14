// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: [/^http:\/\/localhost(:\d+)?$/i, /fairdalerealty\.com$/i, /.*/] }));
app.use(express.json());

// health
app.get('/health', (req, res) => res.status(200).json({ ok: true, message: 'Server is healthy' }));

// small memory cache
const cache = new Map();
const setCache = (k, v, ms = 5 * 60 * 1000) => cache.set(k, { v, exp: Date.now() + ms });
const getCache = (k) => {
  const it = cache.get(k);
  if (!it || Date.now() > it.exp) { cache.delete(k); return null; }
  return it.v;
};

// helper: scrape one url
async function scrapeFeatured(url) {
  const html = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9',
      'referer': 'https://www.har.com/',
    }
  }).then(r => r.text());

  const $ = cheerio.load(html);

  // Collect anchors to HAR listing/detail urls
  const anchors = $('a[href*="har.com"]').toArray();

  const rows = [];
  for (const a of anchors) {
    const $a = $(a);
    const href = ($a.attr('href') || '').trim();
    if (!href) continue;

    // nearest container (try multiple levels)
    const $card = $a.closest('li,article,div').length ? $a.closest('li,article,div') : $a.parent();

    // text block around the link
    const text = $card.text().replace(/\s+/g, ' ').trim();

    // pull possible fields from surrounding text or title
    const raw = `${$a.attr('title') || ''} ${text}`;
    const price = (raw.match(/\$\s?[\d,]+/) || [])[0] || '';
    const beds  = (raw.match(/(\d+)\s*Beds?/i) || [])[1] || '';
    const baths = (raw.match(/(\d+)\s*Baths?/i) || [])[1] || '';
    const sqft  = ((raw.match(/([\d,]+)\s*(?:SF|Sq\s*Ft|sqft)/i) || [])[1] || '').replace(/,/g, '');
    const address = ($a.attr('title') || '').trim() || (raw.match(/\d{3,}[^$|]+?(?:, [A-Za-z\s]+)?/i) || [''])[0].trim();

    // we don’t rely on image (you said you’ll add photos)
    if (!price && !address) continue;

    const abs = href.startsWith('http') ? href : `https://www.har.com${href.startsWith('/') ? '' : '/'}${href}`;

    rows.push({
      url: abs,
      image: '',           // intentionally empty (minimalist + you’ll add photos)
      price, beds, baths, sqft, address
    });
  }

  // de-dupe + trim
  const seen = new Set();
  const clean = rows.filter(x => {
    const k = x.url + '|' + x.price + '|' + x.address;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 24);

  return clean;
}

/**
 * GET /api/har/featured?agent_number=633391
 * optional: &cid=5686  (used as fallback if agent has 0)
 */
app.get('/api/har/featured', async (req, res) => {
  const agent = (req.query.agent_number || '').toString().trim();
  const cid   = (req.query.cid || '').toString().trim();

  if (!agent && !cid) return res.status(400).json({ ok:false, error: 'Provide agent_number or cid' });

  const key = `har:${agent || cid}`;
  const cached = getCache(key);
  if (cached) return res.json({ ok: true, listings: cached });

  try {
    const primaryURL = agent
      ? `https://web.har.com/aws/dispFeaturedIDX.cfm?agent_number=${encodeURIComponent(agent)}`
      : `https://web.har.com/aws/dispFeaturedIDX.cfm?cid=${encodeURIComponent(cid)}`;

    let listings = await scrapeFeatured(primaryURL);

    // fallback: if agent returned 0 and a cid is known (use 5686 by default)
    if ((!listings || listings.length === 0) && agent) {
      const backCid = req.query.cid || '5686';
      const fallbackURL = `https://web.har.com/aws/dispFeaturedIDX.cfm?cid=${encodeURIComponent(backCid)}`;
      listings = await scrapeFeatured(fallbackURL);
    }

    setCache(key, listings);
    return res.json({ ok: true, listings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, error: 'Failed to load featured widget' });
  }
});

// root
app.get('/', (req, res) => {
  res.type('text/plain').send('Backend is running. Use /api/har/featured or /health');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
