// server.js  (final)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { load } from 'cheerio';   // ⬅️ change is here

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: [/^http:\/\/localhost(:\d+)?$/i, /fairdalerealty\.com$/i, /.*/] }));
app.use(express.json());

// Basic index + health
app.get('/', (req, res) => res.type('text').send('Backend is running. Use /api/har/featured or /health'));
app.get('/health', (req, res) => res.status(200).json({ ok: true, message: 'Server is healthy' }));

// --- simple cache
const cache = new Map();
const setCache = (k, v, ms = 10 * 60 * 1000) => cache.set(k, { v, exp: Date.now() + ms });
const getCache = (k) => {
  const it = cache.get(k);
  if (!it || Date.now() > it.exp) { cache.delete(k); return null; }
  return it.v;
};

/**
 * GET /api/har/featured?agent_number=633391
 *  or /api/har/featured?cid=5686
 */
app.get('/api/har/featured', async (req, res) => {
  const agent = (req.query.agent_number || '').toString().trim();
  const cid   = (req.query.cid || '').toString().trim();
  if (!agent && !cid) return res.status(400).json({ error: 'Provide agent_number or cid' });

  const url = agent
    ? `https://web.har.com/aws/dispFeaturedIDX.cfm?agent_number=${encodeURIComponent(agent)}`
    : `https://web.har.com/aws/dispFeaturedIDX.cfm?cid=${encodeURIComponent(cid)}`;

  const key = `har:${agent || cid}`;
  const cached = getCache(key);
  if (cached) return res.json({ ok: true, listings: cached });

  try {
    const html = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } }).then(r => r.text());
    const $ = load(html);     // ⬅️ use load()

    const out = [];
    // Be generous: walk anchor cards, try to grab image + text bits
    $("a[href*='har.com']").each((_, a) => {
      const $a = $(a);
      const href = $a.attr('href') || '';
      const $card = $a.closest('div,li,article').length ? $a.closest('div,li,article') : $a.parent();
      const $img  = $card.find('img').first();
      const img   = $img.attr('src') || $img.attr('data-src') || '';

      const txt   = $card.text().replace(/\s+/g, ' ').trim();
      const price = (txt.match(/\$\s?[\d,]+/) || [])[0] || '';
      const beds  = (txt.match(/(\d+)\s*Beds?/i) || [])[1] || '';
      const baths = (txt.match(/(\d+)\s*Baths?/i) || [])[1] || '';
      const sqft  = ((txt.match(/([\d,]+)\s*(?:SF|Sq\s*Ft|sqft)/i) || [])[1] || '').replace(/,/g, '');
      const addr  = $a.attr('title') || $a.text().trim() || '';

      const absoluteUrl = href?.startsWith('http') ? href : (href ? `https://www.har.com${href}` : '');
      const absoluteImg = img ? (img.startsWith('http') ? img : `https:${img}`) : '';

      if (absoluteUrl) {
        out.push({ url: absoluteUrl, image: absoluteImg, price, beds, baths, sqft, address: addr });
      }
    });

    // de-dupe, cap to 24
    const seen = new Set();
    const clean = out.filter(x => {
      const k = `${x.url}|${x.image}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 24);

    setCache(key, clean);
    res.json({ ok: true, listings: clean });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Failed to load featured widget' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on ${PORT}`));
