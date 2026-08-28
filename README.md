# BOM Tracker

## MongoDB setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` to your MongoDB Atlas connection string. Set `MONGODB_DB` if you want a database name other than `bom_tracker`.
2. Run `npm run seed` once to import the existing `inventory.json` records.
3. Start locally with `node server.js` and open `http://localhost:3000`.

For Vercel, add `MONGODB_URI` and `MONGODB_DB` under Project Settings > Environment Variables. Vercel discovers the API at `api/index.js`; the frontend remains in `public`.