# Bucketlist accessibility

The engineering target is **WCAG 2.2 Level AA** for the public court app, shared courts/games and private groups/chat. This is a target, not a declaration of complete conformance.

## Changes in this branch

- Skip to main content on all three entry points; the court app also has a skip link to the court list. These shortcuts preserve game/group/court URL state.
- Button names include their visible labels so speech input and screen readers identify the same controls. Message deletion and member removal have contextual names.
- Visible keyboard focus, heading focus after navigation, focus return after dismissing search/notices/menu, correctly named dialogs and a permanently reachable menu-close button.
- Court-list browsing is an alternative to the two-dimensional map. Hidden map controls cannot receive focus behind the list.
- Court placement supports keyboard map panning and a Center pin action. The shared court form also accepts explicit latitude/longitude, validates Arizona coordinates and applies edits when saving. Pointer users can tap instead of dragging.
- Stronger text/action contrast in both themes, identifiable form borders, consistent select styling and larger location controls. The original logo colors are preserved.
- Pause automatic updates and Refresh now controls. Background chat/game updates preserve focused controls; explicit actions still obtain current data. Pausing also defers automatic release notices.
- Text wrapping, narrow-screen layout changes and reduced-motion CSS support.

## Repeatable verification

The **Accessibility** GitHub Actions workflow builds the frontend and native Worker, runs the existing Node tests and runs `node tests/accessibility.cjs`. It installs Playwright Chromium and `@axe-core/playwright` as test tools.

The browser suite starts loopback-only previews with local SQLite/object storage. It uses synthetic users/courts/games/messages, never production writes, real email, external sign-in credentials or push notifications. Street tiles and external directory responses are stubbed; screenshots show the neutral map fallback rather than verified street imagery.

Axe scans use WCAG 2.0/2.1/2.2 A/AA tags. The suite also checks skip links, menu/dialog focus, keyboard pin placement, invalid coordinates, saving edited coordinates, manual refresh while paused, chat focus during message refresh, 320 CSS-pixel reflow and WCAG text-spacing values. Screenshots and JSON findings are uploaded with each run. Incomplete axe results remain in the report for manual review; they are not silently discarded or treated as passes.

Reproduce on a development machine:

```sh
npm ci
npm install --no-save --package-lock=false @axe-core/playwright@4
npx playwright install chromium
npm run build:web
npm run build:community
node --test --test-isolation=none tests/*.test.js
node tests/accessibility.cjs
```

## Manual release checks still required

- VoiceOver + Safari and NVDA + Firefox/Chrome: reading order, landmarks/headings, status announcements, map/list equivalence, court contribution, group invitations, chat and all game actions.
- Keyboard only: every court detail, scheduler, profile/stats demonstration, private-group management and cancellation flow; no keyboard trap, obscured focus or unexpected focus change.
- Real browser zoom at 200% and 400%, text spacing and large system text across all screens, dialogs and errors. Automated 320px checks cover representative states and do not prove every state.
- Touch/low-vision review on real iPhone and Android, portrait/landscape, target spacing, focus visibility and high-contrast/forced-colors settings.
- External ChatGPT/Google-linked authentication, session expiry and recovery. That service's accessibility was not tested by the local identity adapter. Independent email sign-in remains disabled.
- Review map imagery/provider attribution, court photos and text alternatives with real provider responses. The map is inherently spatial; complete essential tasks must remain possible through forms/list controls.
- Check for assistive-technology announcement noise during repeated roster/chat changes, and verify pause/resume behavior with a screen reader.

A green automated run is evidence only for the states and assertions it covers. It does not establish full WCAG conformance, legal certification or the physical accessibility of a park/court.

## Publishing

Source changes are saved in GitHub PR #2. The live GitHub Pages build and hosted Worker must be published separately using the existing documented pipelines after validation. The current managed workspace failed to start, so its source push, artifact packaging and production deployment cannot be completed from this task's local environment. Do not present the branch or CI screenshots as a deployed update.
