
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.REPLIERS_API_KEY;

if (!API_KEY) {
  console.error('Missing REPLIERS_API_KEY in .env');
  process.exit(1);
}

app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^https:\/\/.+$/] }));
app.use(express.json());

function mapListing(api) {
  const get = (obj, path, fallback='') => {
    try { return path.split('.').reduce((o,k)=>o?.[k], obj) ?? fallback; } catch { return fallback; }
  };

  const price =
    get(api, 'listPriceFormatted') ||
    get(api, 'ListPriceFormatted') ||
    (get(api, 'ListPrice') ? `$${Number(get(api, 'ListPrice')).toLocaleString()}` : '');

  const addressParts = [
    get(api, 'address.full') || get(api, 'Address.Full'),
    get(api, 'address.city') || get(api, 'Address.City'),
    get(api, 'address.state') || get(api, 'Address.StateOrProvince') || get(api, 'Address.State'),
    get(api, 'address.zip') || get(api, 'Address.PostalCode')
  ].filter(Boolean);

  const featuresRaw =
    get(api, 'property.features', '') ||
    get(api, 'InteriorFeatures', '');

  const features = Array.isArray(featuresRaw)
    ? featuresRaw
    : String(featuresRaw).split(/\n|•|,|\u2022/).map(s=>s.trim()).filter(Boolean);

  return {
    id: get(api, 'id') || get(api, 'ListingID') || '',
    price,
    address: addressParts.join(', '),
    beds: get(api, 'property.bedrooms') ?? get(api, 'BedroomsTotal') ?? '',
    baths: get(api, 'property.bathrooms') ?? get(api, 'BathroomsTotalInteger') ?? '',
    sqft: get(api, 'property.sqft') ?? get(api, 'LivingArea') ?? '',
    lot: get(api, 'property.lotSize') ?? get(api, 'LotSizeArea') ?? '',
    year: get(api, 'property.yearBuilt') ?? get(api, 'YearBuilt') ?? '',
    features,
    brochureUrl: '#',
    idxUrl: get(api, 'urls.public') || get(api, 'PublicURL') || ''
  };
}

app.get('/api/listing', async (req, res) => {
  try {
    const { mlsId } = req.query;
    if (!mlsId) return res.status(400).json({ error: 'Missing mlsId' });

    const endpoint = `https://api.repliers.com/v1/listings/${encodeURIComponent(mlsId)}`;
    const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${API_KEY}` } });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: 'Upstream error', detail: text });
    }

    const data = await r.json();
    const raw = Array.isArray(data?.data) ? data.data[0] : (data?.data || data);
    const mapped = mapListing(raw || {});
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server exception' });
  }
});
// --- Featured IDX (server-side fetch + parse) ---
const cache = new Map();
const setCache = (k, v, ms=10*60*1000)=> cache.set(k,{v,exp:Date.now()+ms});
const getCache = (k)=>{ const it=cache.get(k); if(!it||Date.now()>it.exp){ cache.delete(k); return null; } return it.v; };

app.get("/api/har/featured", async (req, res) => {
  const agent = (req.query.agent_number || "").toString().trim();
    const cid   = (req.query.cid || "").toString().trim();

      if (!agent && !cid) return res.status(400).json({ error: "Provide agent_number or cid" });

        const url = agent
            ? `https://web.har.com/aws/dispFeaturedIDX.cfm?agent_number=${encodeURIComponent(agent)}`
                : `https://web.har.com/aws/dispFeaturedIDX.cfm?cid=${encodeURIComponent(cid)}`;

                  const key = `har:${agent || cid}`;
                    const cached = getCache(key);
                      if (cached) return res.json(cached);

                        try {
                            const html = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } }).then(r => r.text());
                                const $ = cheerio.load(html);

                                    const out = [];
                                        $("a[href*='har.com']").each((_, a) => {
                                              const $a = $(a);
                                                    const href = $a.attr("href") || "";
                                                          const $card = $a.closest("div,li,article").length ? $a.closest("div,li,article") : $a.parent();
                                                                const $img  = $card.find("img").first();
                                                                      const img   = $img.attr("src") || $img.attr("data-src") || "";

                                                                            const txt   = $card.text().replace(/\s+/g," ").trim();
                                                                                  const price = (txt.match(/\$\s?[\d,]+/)||[])[0] || "";
                                                                                        const beds  = (txt.match(/(\d+)\s*Beds?/i)||[])[1] || "";
                                                                                              const baths = (txt.match(/(\d+)\s*Baths?/i)||[])[1] || "";
                                                                                                    const sqft  = ((txt.match(/([\d,]+)\s*(?:SF|Sq\s*Ft|sqft)/i)||[])[1]||"").replace(/,/g,"");
                                                                                                          const addr  = $a.attr("title") || $a.text().trim() || "";

                                                                                                                out.push({
                                                                                                                        url: href.startsWith("http") ? href : `https://www.har.com${href}`,
                                                                                                                                image: img ? (img.startsWith("http") ? img : `https:${img}`) : "",
                                                                                                                                        price, beds, baths, sqft, address: addr
                                                                                                                                              });
                                                                                                                                                  });

                                                                                                                                                      const seen = new Set();
                                                                                                                                                          const clean = out.filter(x => {
                                                                                                                                                                const k = x.url + "|" + x.image;
                                                                                                                                                                      if (seen.has(k)) return false;
                                                                                                                                                                            seen.add(k);
                                                                                                                                                                                  return x.url;
                                                                                                                                                                                      }).slice(0, 24);

                                                                                                                                                                                          setCache(key, clean);
                                                                                                                                                                                              res.json(clean);
                                                                                                                                                                                                } catch (e) {
                                                                                                                                                                                                    console.error(e);
                                                                                                                                                                                                        res.status(500).json({ error: "Failed to load featured widget" });
                                                                                                                                                                                                          }
                                                                                                                                                                                                          });
app.listen(PORT, () => {
  console.log(`MLS proxy running on http://localhost:${PORT}`);
});
