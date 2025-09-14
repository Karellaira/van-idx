
# Van IDX Demo (Secure API Proxy + Luxury Overlay)

## Quick start
1) Open a terminal in `server/`:
```
npm install
npm start
```
This starts http://localhost:3001 with your API key from `.env`.

2) Serve the `public/` folder (use any static server or open `public/index.html`).  
   The page requests: `http://localhost:3001/api/listing?mlsId=MLS123456`

3) Append a real MLS ID to the URL, e.g.:
```
public/index.html?listing=MLS123456
```

## Security
- The API key is stored in `server/.env` and never sent to the browser.
- Restrict CORS in `server.js` to your real domain(s).

## Customize
- Map provider fields in `mapListing()` to match your API’s schema.
- Set the default HAR IDX iframe in `index.html` or let `idxUrl` from the API override it.
