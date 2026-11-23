# Bucketlist

Pickup-basketball app: find a real court and people to play with. Success means games that actually happen.
Product direction lives in `PRODUCT.md`.

## Run
- `npm ci`, then `npm start` (port 3000; `PORT` overrides it)

## Verify
- `npm test`
- Browser suites need a server running on the port they expect, e.g. `PORT=3090 npm start`, then
  `APP_URL=http://127.0.0.1:3090 BROWSER_EXECUTABLE=/usr/bin/chromium npm run test:browser`.
  Also `test:showcase` (3092), `test:location` (3097), and `test:phone` after `build:web` + `preview:web`.

## Ship
- Push source to `main`, then `npm run publish:web` (updates `gh-pages`, never force-pushes).
- Community Worker: `npm run build:community`, then package `community-dist/`. Never ship the frontend `dist/` as the Worker.

## Gotchas
- Never edit an applied migration. Use `npm run db:generate` for schema changes.
- Honest data: sample and demo content stays labeled, with no invented ratings, occupancy or player counts. Unknown access info stays "unknown".
- Times are stored as ISO instants and shown in the device's timezone. Proposed times aren't court reservations.
- Leaflet is bundled in `public/vendor` (no CDN). Map tiles are blocked in cloud sessions, so never assert tile delivery in tests.
- Codex also works in this repo. Keep instructions here, not in tool-specific files.
