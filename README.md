# BOM Tracker

## MongoDB setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` to your MongoDB Atlas connection string. Set `MONGODB_DB` if you want a database name other than `bom_tracker`, and set a strong `ADMIN_PASSWORD`.
2. Run `npm run seed` once to import the existing `inventory.json` records.
3. Start locally with `node server.js` and open `http://localhost:3000`.

For Vercel, add `MONGODB_URI`, `MONGODB_DB`, and `ADMIN_PASSWORD` under Project Settings > Environment Variables. Vercel discovers the API at `api/index.js`; the frontend remains in `public`. Inventory reads are public; adding components and updating stock require the admin password entered in the page.

Setting stock to `0` removes the record from active inventory, releases its location for reuse, and archives it in the Out of stock list. New components must have stock greater than zero and cannot use an already assigned location.