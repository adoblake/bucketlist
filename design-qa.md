# Game Plan — selected option 2

final result: passed

## Source and capture setup

The user selected option 2, Game Plan, from the three BucketList concepts informed by related Swish screens. The selected generated image is `/workspace/generated_images/exec-b6220462-410d-46b9-8550-aae5f9f3348f.png` (853 × 1844). A proportionally resized copy is preserved at `docs/design/option-2-reference.png` (390 × 844).

Implementation captures use a real Chromium browser through the existing Playwright harness: 390 × 844 CSS pixels, density 1, America/Phoenix timezone, fictional demo profile, Encanto Park next run, and acknowledged location notices. The native Work browser controller was unavailable; these are browser-rendered application screenshots, not a claimed native preview session. External street-map tiles were blocked during deterministic browser checks; venue photographs remain actual source assets. Managed Chromium also blocks file:// navigation, so the compiled single-file artifact is exercised through an intercepted local HTTP route.

Evidence reviewed together:

- `docs/design/game-plan-comparison.jpg`: full selected source and implementation, side by side at equal scale.
- `docs/design/game-plan-comparison-details.jpg`: focused header/type and facts/action/progress comparisons.
- `docs/game-plan-light.png`: final light screen.
- `docs/game-plan-dark.png`: final dark screen after the theme transition and transient toast complete.

## Required visual surfaces

| Surface | Result |
| --- | --- |
| Fonts | Local Inter variable font, strong wordmark, 42px main heading, compact fact labels, and tab labels match the selected hierarchy. |
| Spacing | At 390 × 844, the photo begins at y=225; the primary action is around y=555; all progress content ends above the fixed navigation at y=776. |
| Colors | Warm off-white, near-black type, orange action/brand accents, and muted gray metadata follow the light source. Dark mode supplies legible surfaces, icons, credits, and active-tab contrast. Text links use a darker orange in light mode. |
| Images | Encanto uses the original City of Phoenix Parks court photograph, not a regenerated depiction. Its visible publication year and source link supplement the concept. Other venues load their own mapped aerial image and source date when available. |
| Copy | The title, section labels, action, and four tabs follow the selected concept. Today/date, roster, personal sessions, and PPG are computed from application data. Guest personal values are blank. Demo content remains labeled. |

## Findings corrected

| Severity | Finding | Correction and verification |
| --- | --- | --- |
| P1 | Progress and View stats were partly behind the fixed tab bar. | Reduced heading/section spacing to the source rhythm and adjusted value/action spacing. Browser assertion verifies the stats action ends above navigation. |
| P2 | Legacy SVG stroke styling suppressed the new bottom-nav icons. | Scoped fill/stroke rules restore the original Phosphor icons. All four tabs are visible and usable. |
| P2 | Main title was undersized in the first pass. | Matched the selected heading scale and weight; reviewed the full and focused comparisons. |
| P1 | Opening the initially hidden map shifted the current-location point toward the edge and could remove visible results. | Preserve map center during size invalidation. Browser assertions verify the point remains within 15px of map center and nearby court results are present. |
| P1 | The map’s Start a game action overlapped the new tab bar. | Raised the fixed action above navigation; the full guest scheduling flow exercises its click target. |

## Intentional differences

The original photograph is cropped to the source layout without inventing court details. The photo includes its publication year; capture date remains explicitly unknown in the full gallery. The signed-in fictional showcase has an 8/10 roster and 13.3 PPG from its existing records, rather than the concept’s static 7/10 and 18.5. The unread bell indicator appears only when there is unseen information. The reference date is dynamic in the implementation. Icons come from the unmodified, locally bundled Phosphor library; Inter and icon licenses are retained.

## Behavior and regression validation

- 35 Node tests pass, including next-run eligibility, Arizona boundaries, capacity, own joined games, photo tie-breaks, empty areas, calendar/date boundaries, privacy, stats, and HTTP routes.
- Game-plan browser checks pass: guest landing, actual court photo, sign-in/team join, live roster and stats, expanded games, all four tabs, map center, sign-out privacy, showcase isolation, saved theme, and widths 320/390/768/1280.
- Calendar browser checks pass: guest roster privacy, profile preview, week navigation, single-slot selection, duration, confirmation/cancel, preserved form values, explicit timezone, persisted end time, and both themes.
- Appearance/notice browser checks pass: saved Light/Dark, location-specific information, dismissal and reopening, no repeated notices, recovery failures, newly found courts, keyboard dismissal, and narrow/desktop dropdown bounds.
- Court-photo browser checks pass: matching venue imagery, credit and date, zoom, stale responses, error recovery, and mobile presentation.
- Full browser regression passes: court selection, protected actions, teams/names, private/public profiles, separate chats, stats, persistence, validation, escaping, destination recovery, system/light/dark themes, responsive overflow, and the compiled standalone artifact.
- Standalone/PWA build and JavaScript syntax checks pass. No JavaScript page errors occurred in the passing focused browser suites.

No unresolved P0, P1, or P2 visual findings remain in the selected layout. Shared accounts, cross-device chat, live occupancy, and photography taken today remain outside this browser-local prototype; the UI continues to describe those limits accurately.


## Brand consistency update — November 2, 2026

After selecting the layout, the user requested the original primary basketball-pin logo and “Bucketlist” spelling while retaining the newer header placement. The split-color BucketList wordmark and trailing basketball symbol were replaced by the existing orange pin and a single-color wordmark. A shared lockup renderer and shared wordmark styles now serve the header, welcome, sign-in, menu, and install screens. The compact header and larger stacked version use the same mark and type treatment. The original pin paths and colors are unchanged; favicons and home-screen icons already use this primary mark.

`docs/brand-consistency.jpg` shows the current light/dark header and stacked sign-in treatment. `docs/game-plan-light.png` and `docs/game-plan-dark.png` reflect the updated brand. Earlier option-2 comparisons above record the layout before this later user-requested brand restoration.

The focused browser review passes: matching original pin paths in each brand surface, consistent wordmark spelling and contrast, header fit at 320/390/768/1280 pixels, small-screen welcome dismissal, correct dialog labeling, and no page errors. The existing game-plan browser regression also passes with the updated brand, covering sign-in, team participation, roster/stats, navigation, saved themes, and data isolation. Build and syntax checks pass. No new tests were added for this visual correction.

## Public URL update — November 2, 2026

The public address is `https://adoblake.github.io/bucketlist/`, with source and Pages deployment in the renamed repository `adoblake/bucketlist`. One shared site configuration supplies the standalone fallback, both QR-code generators, the preview subpath, and the Pages publisher. The hosted app continues to derive its ordinary share links from its current origin and path. The private working Site remains owner-only.

Validation: the build and all 35 Node tests pass. The mobile `/bucketlist/` regression passes for the Game Plan opening, primary branding, directory, manifest/icons/QR assets, service-worker control, offline reload/showcase, install help, and subpath-aware sharing.
