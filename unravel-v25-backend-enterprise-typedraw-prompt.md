# UNRAVEL — V25 ADDENDUM PROMPT (ENTERPRISE BACKEND PERFORMANCE + TYPE/DRAW MODE OVERHAUL)

Copy everything below into your AI coding agent as a follow-up instruction on the existing Unravel codebase.

---

## CONTEXT

This is a large, two-part addendum. **Part A** is a serious, structured backend performance overhaul — going meaningfully beyond the query-level optimization from the earlier performance addendum, since real usage (sharing a challenge, uploading to the gallery) is still producing multiple requests with inconsistent latency (some 2 seconds, some 6 seconds) and needs an architecture-level fix, not another round of query tuning. **Part B** is a substantial feature overhaul of Type Mode and Draw Mode. Read the whole prompt before writing any code — Part A in particular should be approached diagnostically (measure first) rather than applying every technique blindly.

---

# PART A: ENTERPRISE-GRADE BACKEND PERFORMANCE

## A1. DIAGNOSE BEFORE OPTIMIZING FURTHER — FIND THE REAL BOTTLENECK

Before applying more fixes, get real data on what's actually slow, specifically for the two reported flows (share-to-gallery, challenge creation):

- Add or extend request-timing instrumentation (from the earlier performance addendum) to break down each of these flows into distinct phases with logged timestamps: client-side upload time, server request-received time, database query time, external service (Cloudinary) call time, and total round-trip time. This needs to be granular enough to say definitively *which specific step* is responsible for the 2s vs. 6s variance, not just "the request was slow."
- **Specifically check for Neon compute cold-start/auto-suspend latency as a leading hypothesis for the variance.** Neon (especially on free/lower tiers) automatically suspends its compute after a period of inactivity to save cost — the next query after a suspend has to wait for the compute to "wake up," which can add real, noticeable latency (potentially several seconds) on top of normal query time. This lines up very well with the reported symptom (*some* requests fast, *some* slow) — a request hitting a warm compute is fast, one hitting a cold/suspended compute is slow. Check Neon's project settings for the compute suspend timeout and correlate slow requests against gaps in traffic to confirm or rule this out directly, rather than guessing.
- Once the actual bottleneck(s) are identified, apply the specific fixes below that address them — don't apply every technique in this section indiscriminately if profiling shows only one or two are actually relevant to the current bottleneck.

## A2. MITIGATE NEON COLD STARTS (IF CONFIRMED AS A CAUSE)

- If cold starts are confirmed as a real contributor, the practical free-tier-friendly mitigation is a **lightweight keep-alive**: a scheduled Vercel Cron job (reusing the cron capability already in the stack for the daily challenge) that pings the database with a trivial query every few minutes during expected active hours, preventing the compute from suspending during normal usage. This trades a small amount of constant background load for eliminating the worst-case cold-start latency spikes.
- If budget allows and this remains a persistent problem even with a keep-alive, evaluate Neon's paid tiers for a higher minimum compute / reduced or disabled auto-suspend — note this as an option to consider, not a requirement, since it has a real cost implication beyond the free tier this project has otherwise stayed within.

## A3. COMBINE AND PARALLELIZE REQUESTS — STOP CHAINING SEQUENTIAL ROUND TRIPS

- Audit the "Share to Gallery" and "Challenge a Friend" flows specifically for sequential `await`-then-`await`-then-`await` chains on the client (e.g. upload media, *then* create the database record, *then* update visibility, as three separate sequential round trips) — this is very likely a real contributor to the reported multi-second totals, independent of any single query's own speed, since round-trip latency compounds every time a step waits for the previous one to fully finish before starting.
- **Combine what can be combined into a single server-side endpoint call** that performs all necessary steps together (e.g. one API route that creates the record and sets initial visibility/metadata in one request, one database transaction), rather than the client making several separate calls that each wait on the network individually.
- **Parallelize what's genuinely independent**, both client-side and server-side: if two operations don't depend on each other's result (e.g., logging an analytics event and creating the database record), run them concurrently (`Promise.all`) rather than sequentially. This applies inside a single API route's handler too, not just across separate client-side calls.
- Confirm media upload is genuinely happening **directly from the client to Cloudinary** (per the earlier direct-upload addendum) and not still being proxied through a Vercel function anywhere in these two specific flows — re-verify this explicitly for the gallery-upload and challenge-creation paths, since a slow request in exactly this territory (multi-second, inconsistent) is a classic symptom of a large file still passing through a serverless function instead of going straight to object storage.

## A4. MOVE NON-CRITICAL WORK OFF THE SYNCHRONOUS REQUEST PATH (BACKGROUND JOB QUEUE)

This is the highest-leverage architectural change available, and the core of doing this "the enterprise way" rather than just tuning queries further: **the user shouldn't have to wait for anything that isn't strictly necessary for their immediate success confirmation.**

- Introduce **Upstash QStash** (same provider as the Redis already in this stack, purpose-built as a serverless-friendly message queue/task scheduler that integrates cleanly with Vercel functions) for any work that can happen *after* the user already has their result — thumbnail post-processing/optimization, any future moderation-scanning work, and any other non-essential side effects.
- Restructure the relevant endpoints so they do the **minimal necessary synchronous work** (write the core database record, confirm success) and return a response to the user immediately, while enqueueing everything else as a background job via QStash rather than making the user's request wait for it.
- For anything the user does need to eventually see the result of but that's genuinely slow (e.g., a thumbnail that takes a moment to generate), have the client show the immediate success state right away (per the V19 loading/success pattern) and let the thumbnail/asset update in place once the background job completes, rather than blocking the whole action on it.

## A5. AGGRESSIVE, WRITE-THROUGH CACHING

- Extend the caching work from the earlier performance addendum from **read-through only** (cache populated on a cache-miss read) to also include **write-through updates**: when a new gallery entry or challenge is created, proactively update the relevant Redis cache entries immediately (e.g. prepend to a cached recent-gallery-entries list) rather than only relying on the next read to repopulate the cache — this means a freshly created item appears instantly to other users without a cold cache-miss round trip.
- Re-verify the daily-challenge and gallery caching from the earlier addendum is genuinely covering these two specific flows end-to-end, not just the simpler read paths it may have originally been tested against.

## A6. DATABASE-LEVEL: COMBINE ROUND TRIPS, NOT JUST QUERY SPEED

- Beyond individual query optimization (already covered in the earlier performance addendum), look specifically for places where **multiple separate queries could become one** — e.g. an `INSERT ... RETURNING` that both creates a record and returns what's needed for the response in one round trip, rather than an `INSERT` followed by a separate `SELECT` to fetch what was just written; or a single transaction wrapping multiple related writes (e.g. creating a creation record and its initial gallery-visibility flag together) instead of sequential separate statements.
- Reconfirm the Neon serverless HTTP driver (not a traditional persistent connection pool) is used consistently across every endpoint touched in this pass — a connection-pooling approach not suited to serverless can itself introduce the kind of inconsistent latency being reported here.

## A7. LOAD-TEST FOR REAL CONCURRENT USAGE, NOT JUST SINGLE-REQUEST LATENCY

- Since "handle multiple users" is an explicit goal here, don't just verify these fixes against a single request in isolation — run a basic concurrency/load test (a simple script firing many concurrent requests at the share-to-gallery and challenge-creation endpoints) and confirm response times hold up reasonably well under simultaneous multi-user load, not just when tested one request at a time. This is the only way to actually confirm "enterprise-ready," as opposed to "fast when nobody else is using it."

## A8. RE-MEASURE AND REPORT

- After applying the fixes above, re-run the same phase-by-phase timing instrumentation from A1 against the same two flows and report clear before/after numbers — this pass is only successful if there's measured proof of improvement across both the typical case and the previously-worst-case (6-second) scenario specifically, not just a general sense that things feel faster.

---

# PART B: TYPE MODE & DRAW MODE OVERHAUL

## B1. TYPE MODE: MULTI-LINE TEXT WITH AUTO-SCALING FONT SIZE

- Fix the current text input so it supports **multiple lines**, not just one — replace the single-line input with a proper multi-line text area (still using the custom on-screen keyboard from the account-system addendum where applicable on touch devices).
- **Cap input at 6 lines** — once a user reaches the 6th line, further line breaks should not be accepted (or should be prevented/ignored) rather than allowing unbounded growth.
- **Auto-scale the live preview font size down** as the user types more content — both more lines and longer lines within a line should reduce the displayed font size proportionally, so the full text always stays visibly contained within the preview area rather than overflowing it. This should feel smooth and responsive as the user types, not jumpy — consider a continuous scale function based on total character count and line count together, rather than only reacting to line count in discrete steps.
- This auto-scaled font size is also what gets used when the text is actually sampled into the cube grid — confirm the cube-rendering step uses the same final, fitted font size/layout the user saw in the live preview, so what they see is genuinely what they get.

## B2. DRAW MODE: FIX THE BROKEN COLOR PICKER

- The custom color picker (saturation/brightness square + hue strip, built in an earlier addendum) is currently not functioning in Draw Mode. Investigate directly — likely causes to check: pointer/touch event handling on the picker's drag surfaces may have broken during a later UI restructuring (the menu consolidation or custom-keyboard work are the most likely culprits, since both touched input/interaction handling broadly around the same areas of the app), the picker's open/close state may not be correctly wired to the toolbar's current trigger button after the Draw Mode toolbar consolidation, or the picker's selected-color output may not be correctly flowing back into the actual brush-color state used by the drawing canvas.
- Test the fix on both desktop (mouse drag) and mobile (touch drag) specifically, since a touch-vs-pointer-event handling gap is a common and easy way for exactly this kind of regression to occur.

## B3. DRAW MODE: RANDOM/DYNAMIC DEFAULT BRUSH COLOR

- Instead of always defaulting to the fixed accent red when Draw Mode opens, **pick a random starting color each time** — either a fully random HSB value, or (likely nicer visually) a random pick from a small curated set of pleasant, high-contrast starting colors, so the very first color a user sees isn't always the same. This ties into the broader "make each session feel a little different" principle already established elsewhere in the app.

## B4. DRAW MODE: MULTIPLE BRUSH TYPES

- Add a small icon-button trigger (consistent with the app's other icon+popover patterns, e.g. from the consolidated menu work) that opens a popover offering a handful of distinct **brush types** — not just color/size variations, but genuinely different stroke rendering characteristics. Include a small set such as: a solid/marker brush (clean, consistent opacity and width — the current default), a textured/chalky brush (slightly varied opacity/edge roughness along the stroke), a spray/dotted brush (scattered dot texture rather than a continuous line), and a tapered/calligraphy-style brush (width that varies with stroke speed/angle, thin-to-thick).
- Keep this to a small, well-chosen set (4-5 types) rather than an exhaustive brush library — each should be visually distinct enough to be worth choosing, consistent with the app's overall "few well-chosen options, not a dense settings panel" design philosophy.
- The selected brush type should affect how strokes are drawn onto the canvas before sampling into cubes, and should persist as the active choice until changed, similar to how brush size/color already persist during a drawing session.

## B5. DRAW MODE (AND WHEREVER ELSE RELEVANT): EXPAND/FULLSCREEN CANVAS MODE

- Add an "expand" icon button that grows the drawing canvas container to fill the entire screen, removing surrounding chrome for users who want maximum drawing space.
- While expanded: show a small, clearly-visible close/back button (to exit fullscreen and return to the normal layout) and relocate the drawing controls (brush color, brush type, size, undo, start over, turn-into-cubes) to a control bar docked at the bottom of the now-fullscreen canvas.
- Add a **minimize control** for that bottom control bar specifically: tapping it collapses the entire control bar down into a single small icon anchored at the bottom-left corner, maximizing usable canvas space; tapping that small icon again re-expands the full control bar. This should feel smooth and quick (a simple slide/fade transition), not jarring.
- This expand/fullscreen pattern is specifically valuable for Draw Mode given its need for precise input space, but consider whether it's worth offering consistently on the main cube canvas as well for the same "more space" benefit — use judgement on whether that's a natural extension or unnecessary scope for this particular pass.

## B6. TYPE MODE: MULTIPLE FONT CHOICES (UP TO 5, ACROSS DIFFERENT CATEGORIES)

- Replace the current single-font-only behavior in Type Mode with a selection of **up to 5 fonts spanning different visual categories** — for example: a clean geometric sans-serif, a bold display/headline font, a handwritten/script-style font, a classic serif, and a pixel/retro font (distinct from the app's own Pixelify Sans brand font, to keep this a genuine creative choice rather than just reusing the UI's own typeface). Choose actual fonts that render legibly at various sizes and support the character sets likely to be typed.
- Add a small font-selector control (icon + popover, consistent with the brush-type pattern from B4 and the app's other minimal icon-triggered pickers) showing a short preview of each font option so the choice is visual, not just a text list of font names.
- **Critical: the selected font must be the actual font used when rendering the text into the cube grid**, not just in the live on-screen preview — this means `renderTextToCanvas.ts` (or wherever the text-to-cube sampling happens) needs to accept the currently selected font as a parameter and use it directly, consistent with the auto-scaling behavior from B1, so the cube-grid result genuinely matches what the user designed in the preview.
- Ensure all 5 fonts are loaded efficiently (e.g. only the selected font needs to be loaded/used for the actual cube-rendering step at conversion time, though preview text for the picker itself will need each font loaded to render its preview) — don't let adding 5 fonts meaningfully bloat the app's initial load weight, consistent with the performance-conscious approach used throughout this project; lazy-load font files as needed rather than eagerly loading all 5 on every app visit regardless of whether Type Mode is even used.

---

## DELIVERABLE EXPECTATIONS

**Part A:**
- Clear before/after timing data for the share-to-gallery and challenge-creation flows, covering both typical and previously-worst-case scenarios.
- A confirmed diagnosis of whether Neon cold starts were a real contributor, with the keep-alive mitigation in place if so.
- Both flows restructured to minimize sequential round trips, with non-critical work genuinely moved to a background queue (QStash) rather than blocking the user's response.
- A basic concurrency/load test demonstrating the system holds up reasonably under simultaneous multi-user load, not just single-request testing.

**Part B:**
- Type Mode supports genuine multi-line input (capped at 6 lines) with smooth, proportional auto-scaling font size, and the cube-grid output matches the live preview exactly, including the selected font.
- The Draw Mode color picker works correctly on both desktop and mobile, verified directly, not assumed fixed.
- Draw Mode opens with a randomized starting color each session.
- At least 4-5 visually distinct brush types are available via a small icon+popover control and genuinely affect stroke rendering, not just cosmetic labeling.
- The expand/fullscreen canvas mode works smoothly, with a working minimize-to-icon control bar and a clear way to exit fullscreen.
- Up to 5 selectable fonts are available in Type Mode, each visually distinct and spanning different categories, with the selected font correctly carried through into the actual cube-grid rendering, not just the on-screen preview.
