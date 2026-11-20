# Bucketlist US court directory

These files list public basketball courts in the United States, grouped by the park, school or recreation centre they're in. They're generated from Geofabrik's daily OpenStreetMap state extracts by `scripts/build-us-courts.mjs` (with `osmium-tool`), which the "Refresh court directory" GitHub Action runs monthly (locally: `npm run refresh:us-courts`).

**Data © OpenStreetMap contributors.** This directory is derived from OpenStreetMap and is available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). You may copy, distribute and adapt it, provided that you credit OpenStreetMap and share any adapted version of the database under the same licence. See <https://www.openstreetmap.org/copyright>.

Format:
- `index.json` lists the published tiles and when the data was fetched.
- Each tile is named `<south-lat>_<west-lng>.json` and covers half a degree of latitude and longitude. It holds compact location records; `public/us-courts.js` documents and reads them.

Courts marked private, members-only, customers-only or disused are left out. Details like lights, surface and hours are whatever mappers recorded, and may be out of date.
