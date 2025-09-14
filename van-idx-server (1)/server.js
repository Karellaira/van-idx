
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

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

app.listen(PORT, () => {
  console.log(`MLS proxy running on http://localhost:${PORT}`);
});
