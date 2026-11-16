# Launching Bucketlist on Google Play

Bucketlist is an installable web app (PWA). The quickest way onto Google Play is to wrap it as a **Trusted Web Activity (TWA)**: a small Android app that opens the website full-screen in Chrome with no browser bar. The Android wrapper is built with Google's [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) CLI or the [PWABuilder](https://www.pwabuilder.com/) website. You don't need to rewrite the app.

The wrapper is the easy part. Most of the work below is about hosting, accounts and Play policy. It's ordered so that each step unblocks the next one.

## Current state (audited 2026-11-16)

| Area | Status |
| --- | --- |
| Unit/API tests (`npm test`) | 64/64 pass |
| `build`, `build:web`, `build:community` | Build cleanly and reproducibly |
| Browser suites: browser, game-plan, appearance, location, calendar, phone, app-updates, court-photos, play, community, email-auth | Pass |
| Browser suites: `courts.cjs`, `showcase.cjs`, `arizona-browser.cjs` | **Stale.** They assume all 125 Phoenix pins are on screen at once, which stopped being true when results became limited to the visible map area (commit `c533476`). `location.cjs` already covers the current behavior. These three need rewriting, not an app fix. |
| Install manifest | Has maskable icons, orientation, language and categories, which Android needs for a correct adaptive launcher icon |

Test notes: the browser tests now use Playwright's own Chromium unless `BROWSER_EXECUTABLE` is set. They write QA screenshots to `$QA_OUT`, which defaults to the system temp folder (previously a hard-coded `/workspace/work`). Some suites still overwrite the committed images in `docs/`. Run `git checkout -- docs/` after a test run unless you mean to refresh them.

## Blockers: fix these before submitting

### 1. Put the whole app on one domain you own

Today the app lives on three origins:

- Map: `adoblake.github.io/bucketlist/` (GitHub Pages)
- Shared courts and games: `bucketlist-recovered-oct29.adoblake.chatgpt.site/play/`
- Groups and chat: `…chatgpt.site/community/`

A TWA proves it owns its website through the file `https://<domain>/.well-known/assetlinks.json`, and that file must sit at the **root** of the domain:

- GitHub Pages can't do this from the `/bucketlist/` sub-path. It would need a separate `adoblake.github.io` repository.
- On the `chatgpt.site` host, it's unknown whether that path can be served. Any origin that isn't verified opens with a visible browser address bar inside the app, which looks broken and reviewers notice it.

**Recommendation:** buy a domain (about $10–20 per year) and serve the map, `/play/` and `/community/` from that one origin. The community Worker already serves `/play/` and `/community/`, so it can also serve the map's static files and `/.well-known/assetlinks.json`.

There's a second reason to move the backend: it currently runs on OpenAI's ChatGPT Sites platform and depends on that platform's identity headers (`oai-authenticated-user-id`). Migrating it to Cloudflare Workers + D1 + R2 is the natural fit, because the code is already written against those APIs (`DB`, `BUCKET` bindings). It also puts the app's data and uptime under your own account.

### 2. Sign-in that every Android user and the Play reviewer can use

Today, real sign-in requires a ChatGPT account. That's a barrier for players, and Google's reviewers need working credentials you give them in **App content → App access**.

- Turn on the email + one-time-code sign-in that's already built. See [email-sign-in.md](email-sign-in.md): a Supabase project, a custom SMTP sender, and `EMAIL_AUTH_ENABLED=true`.
- Create a reviewer test account whose code they can get. For example, give the reviewer a dedicated inbox's password, or add a fixed-code bypass for one allow-listed review address.
- Optional later: native "Sign in with Google".

If the backend moves off ChatGPT Sites, the "Continue with ChatGPT" option goes away with it, and email sign-in becomes the main path.

### 3. Account deletion (Play policy, required)

Any app that lets people create an account must offer:

- **In-app deletion:** Profile → Delete account. It removes the profile, memberships, messages, contributed courts and photos, push subscriptions and the email identity. Explain any data you keep and why.
- **A public web page** where people can request deletion without reinstalling. Its URL goes into the Data safety form.

The API has no account-deletion endpoint yet. Today only groups, messages, memberships and push subscriptions can be removed one at a time.

### 4. User-generated content safety (Play policy, required)

Chat, court photos and player-added pins count as user-generated content. Play requires:

- **Terms of use** that forbid objectionable content, and that users accept before posting.
- **In-app reporting** of messages, photos, courts and users, sent to *you* as the moderator. Today the only report path is "suggest a correction", which goes to the court's contributor, not to you.
- **Blocking other users.** This isn't built yet.
- **A way for you to act on reports:** remove content and ban accounts, even through a simple admin page or SQL runbook.

### 5. Privacy policy and Data safety form (required)

You need a public privacy policy page (HTML, not a PDF) on your domain, plus the matching Data safety answers in Play Console. Based on the code, declare:

- **Collected:**
  - Name/nickname
  - Email address (email sign-in)
  - Messages
  - Photos (court photos)
  - Approximate and precise location. It's used in the moment to center the map and is not stored on the server.
  - Push tokens
  - User IDs
- **Shared with or sent to third parties:**
  - OpenStreetMap tiles and Nominatim (searched place names)
  - Overpass (map area)
  - Esri World Imagery (court coordinates)
  - Supabase (email)
  - Google Maps, only when the user taps Directions
- **Security:** encrypted in transit (HTTPS). Deletion available (see item 3).

### 6. Map and geodata providers suitable for a store app

The public OpenStreetMap tile server, Nominatim and Overpass have fair-use policies that don't allow heavy app traffic. Before launch, switch the tile URL to a provider with a free or paid tier and app terms, such as MapTiler, Stadia Maps or Thunderforest. Do the same for search, or rate-limit and cache it. The Phoenix court list is already bundled, so that part is unaffected.

### 7. Store-facing wording

The manifest description says "explore a pickup-game community **demo**". Play can reject apps that present themselves as demos ("minimum functionality" policy). Once the real shared features are the main experience, update the description in `scripts/build-web.mjs`. Keep the fictional showcase clearly labelled as a sample, as it already is.

## Building the Android app (after blockers 1–2)

Prerequisites: Node 22+, a JDK, and the Android SDK. Bubblewrap can download the last two for you.

```sh
npm i -g @bubblewrap/cli
mkdir android && cd android
bubblewrap init --manifest https://YOUR-DOMAIN/manifest.webmanifest
```

When Bubblewrap asks, choose:

- **Application ID:** something permanent, for example `app.bucketlist.twa`. It can never change after the first upload.
- **Location delegation: yes.** The map uses device location.
- **Notification delegation: yes.** Message alerts use Web Push. Android 13+ shows the notification permission prompt.
- **Target SDK:** Google Play now requires **API 36 (Android 16)** for new apps. Use the current Bubblewrap release and check that `targetSdkVersion` in the generated project is 36 or higher.
- **Signing key:** let Bubblewrap create an *upload* key. Back up the `.keystore` file and its passwords somewhere safe. Losing them blocks future updates until Google resets the key.

```sh
bubblewrap build        # produces app-release-bundle.aab (upload this to Play)
```

Next:

1. Upload the `.aab` to Play Console. Enroll in **Play App Signing** (the default).
2. Copy the **app signing key SHA-256** from Play Console → Test and release → App integrity. This is a different key from your upload key.
3. Run `bubblewrap fingerprint add <SHA-256>`, then `bubblewrap fingerprint generateAssetLinks`.
4. Serve the resulting `assetlinks.json` at `https://YOUR-DOMAIN/.well-known/assetlinks.json` with `Content-Type: application/json`. If you also install local test builds, include your upload-key fingerprint too.
5. Install from the Play testing track and confirm there's **no address bar**. If one appears, Digital Asset Links verification failed.

Commit the generated `android/` project, but not the keystore: add `*.keystore` and `*.jks` to `.gitignore`.

## Play Console checklist

1. **Developer account:** a one-time $25 fee, plus identity verification.
   - **Personal** account: before production access, you must run a **closed test with at least 12 testers opted in for 14 days in a row**. Line up testers early, for example local hoopers.
   - **Organization** account: skips the 12-tester rule but needs a D-U-N-S number, which can take weeks.
2. **App content:**
   - Privacy policy URL
   - App access (reviewer credentials)
   - Ads: none
   - Content rating questionnaire. Answer yes to user interaction/chat and to location sharing between users, since court pins are shared.
   - Target audience **18+**, matching PRODUCT.md and avoiding the extra rules for apps aimed at children
   - Data safety
   - Account-deletion URL
3. **Store listing:**
   - App name, a short description (80 characters or fewer) and a full description
   - 512×512 icon (use `public/icons/icon-512.png`)
   - 1024×500 feature graphic
   - At least 2 phone screenshots (taken from the real app, not the mocked QA captures)
   - Category: Sports
   - Contact email
4. **Release track order:** Internal testing → Closed testing (12 testers / 14 days) → apply for Production → staged rollout.

## Rough order of work

1. Choose and buy a domain. Decide on backend hosting (Cloudflare recommended).
2. Move the map, `/play/` and `/community/` to that domain. Turn on email sign-in.
3. Build account deletion, report/block, terms acceptance and a basic moderation path.
4. Publish the privacy policy, terms and deletion-request pages. Switch the map tile provider.
5. Generate the TWA, upload to internal testing, and fix assetlinks verification.
6. Run the closed test (14 days) while finishing the store listing. Then apply for production.

## Reference links

- Target API requirement: https://support.google.com/googleplay/android-developer/answer/11926878
- Testing requirement for new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Account deletion policy: https://support.google.com/googleplay/android-developer/answer/13327111
- User-generated content policy: https://support.google.com/googleplay/android-developer/answer/9876937
- Trusted Web Activity overview: https://developer.chrome.com/docs/android/trusted-web-activity
