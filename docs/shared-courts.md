# Shared court pins and pickup games

On the map, **+ Add court** sits below Search courts, between the menu and Near me. You can also use **App menu → Add a missing court**.

1. Find the park and choose **+ Add court**.
2. Drag the orange pin, or tap its exact court location inside the park, then choose **Use this pin**.
3. Continue through the existing ChatGPT sign-in, choose a display name if needed, and enter the park, city, and court name. A photo and finding-the-court notes are optional.
4. Save the court. From its page, choose **Schedule a game here**. Other phones can find that court, open its game, and join.

Browsing remains open. Adding, confirming, reporting a correction, hosting, and joining use a signed-in account. Google remains available through a Google-linked ChatGPT account. Independent email signup remains paused.

## What players see

Courts have stable IDs and belong to a named park. Multiple physical courts can belong to the same park. Player contributions carry an **Added by a player** label and a count of other players who confirm them. The pin and park association are supplied by the contributor; no park-boundary verification or current access claim is made.

Very close duplicate pins are rejected. Nearby existing courts appear for review; a player can confirm that an adjacent pin describes a separate physical court. Other players can suggest location, duplicate, access, or other corrections. The contributor can review them and edit the listing. A court with game history retains its park and coordinates so existing game plans keep their venue. Before games exist, moving a court clears its old confirmations and photo. Confirmations, photos, and game creation check the court version the player viewed.

Optional court photos are stored on the shared service. The upload form resizes/re-encodes a selected photo as JPEG, dropping its original metadata. Server uploads require ownership, an observed court version, a supported image signature, and a maximum 5 MB payload. Published photos identify the contributor as their source; capture dates remain unknown. Aerial imagery is still available. No generic court picture replaces a missing venue photo.

Shared games support a future date within 180 days, 30/60/90/120-minute durations, 2–20 total players including the host, play style, and public meeting notes. Times use **America/Phoenix**. Hosts count toward capacity. Atomic joins prevent concurrent users taking the same last spot. Players can leave; hosts can cancel. Cancellation keeps a visible record and optional reason rather than deleting the plan. A pickup game does not reserve the park or confirm access, lighting, or hours.

Roster counts and game details are public. Names become visible to players who join that game. Public discovery never exposes account IDs, emails, private groups, invitations, or push subscriptions. The main map refreshes shared records periodically; open game pages refresh their status. Browsers need internet for live changes.

Message/game alerts are optional per device. A host cancellation can notify participants who previously enabled alerts. OS/browser permission and delivery rules apply; unregistered link holders cannot be notified while the app is closed. iPhone/iPad users enable supported alerts through the installed Groups surface. Real physical-device push delivery has not been tested.

## Development and deployment

- The main app remains `https://adoblake.github.io/bucketlist/`.
- Shared court/game pages use `https://bucketlist-recovered-oct29.adoblake.chatgpt.site/play/` with the same identity as private groups.
- Anonymous `/api/public/courts` and `/api/public/games` reads return bounded, paginated public records. The GitHub map omits credentials. CORS is confined to public reads; `/api/community/*` keeps its existing same-origin write and authentication checks.
- Authenticated `/api/community/play/*` handles contributions, corrections, photos, games, and membership. Identity/ownership comes from the existing server authentication boundary.
- D1 uses `DB`; uploaded photos use `BUCKET` in R2. `drizzle/0001_military_mentor.sql` adds six play tables alongside the existing community tables. Applied migrations remain immutable. The native Sites deployment applies schema migrations and provisions bindings before serving the saved Worker.
- The local adapter applies the migration journal and simulates identities on loopback only. Its SQLite batches execute atomically; preview photo storage is in memory. It is excluded from production.
- Sample game-plan, scheduling, chat, stats, and profile tools remain explicit device-local demos. The Games tab presents shared games and an expandable sample game plan. Sample people and games are never uploaded.

Publish the Worker before the GitHub frontend so the new public reads and authenticated routes exist when users see **+ Add court**. See the repository README for the existing packaging and Pages publishing commands.

## Verification

62 Node tests pass, including duplicate and adjacent pins, idempotent retries, Arizona validation, confirmation uniqueness/version checks, correction privacy, capacity races, host ownership, cancellation persistence, photo validation, pagination, and court-removal/relocation races.

The real local Worker browser test uses separate browser accounts to add a court/photo, confirm it, suggest a correction, schedule and join a game, reload, verify roster privacy, view the pin/photo on the main map, hand off a new pin, and propagate cancellation. It checks themes, CSP, 320–1280px layouts, and absence of automatic notification prompts. The original local-game regression, sample game plan, and installable/offline phone checks also pass.

Browser QA uses fixture parks and a synthetic photo. No fixtures are seeded into production, and no real verification email or push is sent by these checks. External street-tile delivery and physical-device installation/location are not asserted.
