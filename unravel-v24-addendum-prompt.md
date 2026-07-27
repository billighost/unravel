# UNRAVEL — V24 ADDENDUM PROMPT

Copy everything below into your AI coding agent as a follow-up instruction on the existing Unravel codebase.

---

## CONTEXT

This is a large bundle covering several bug fixes and one substantial new feature (optional username+PIN accounts, replacing the anonymous-only device model with an opt-in way to recognize a returning user across devices/data-clears). Read the whole prompt before writing code — several sections depend on each other (the custom keyboard in section 4 is used by the account system in section 3; the font fix in section 7 and the cache-versioning fix are the same root cause).

---

## 1. FIX: GALLERY PAGE CAN'T SCROLL

- The gallery page currently doesn't scroll. The most likely cause: the full-page canvas work from an earlier addendum (which expanded the main cube canvas to fill the viewport and disabled page-level scrolling so cubes could occupy the whole screen) probably set `overflow: hidden` at a global level (`html`/`body`) rather than scoped specifically to the main cube canvas route — check for exactly this, since a global overflow lock would silently break scrolling on every other page, including the gallery.
- Fix by scoping that overflow lock specifically to the main cube canvas view (e.g. applied/removed on mount/unmount of that specific screen, or via a route-specific class rather than a global style), and confirm the gallery page (and any other non-canvas page — challenge pages, the about/terms pages from section 5, etc.) scrolls normally.

## 2. VIEW/CLICK COUNT ON GALLERY IMAGES

- Add a `view_count` column to the creations table, incremented when a gallery entry is actually opened/viewed (not just when it appears in a gallery listing scroll).
- Guard against trivial inflation: only increment once per device per creation within a reasonable window (e.g. check via device ID + creation ID, don't increment again on a same-device refresh/revisit within a short period) rather than incrementing on every single request.
- Display the count on the gallery thumbnail (small, unobtrusive, consistent with the existing chunky pixel-UI style — e.g. a small eye icon + number) and on the creation/challenge detail page itself.

## 3. USERNAME + PIN ACCOUNTS (OPT-IN, REPLACES THE EARLIER RECOVERY-CODE PLAN)

This replaces the device-recognition approach from the previous addendum's plan. Anonymous device IDs remain the default, zero-friction experience for anyone who never sets this up — this is purely an **optional upgrade** a user can choose, not a required login gate.

### a) Data model & security
- Add an `accounts` table: `username` (unique, case-insensitive), `pin_hash`, `created_at`. Never store the PIN in plaintext — hash it with a strong, slow hashing algorithm (bcrypt or argon2, not a fast general-purpose hash), with a proper per-account salt (bcrypt/argon2 handle this natively).
- **Require a minimum 6-digit PIN, not 4** — a 4-digit PIN has only 10,000 possible values, which is trivially brute-forceable without strong protection; 6 digits (1,000,000 possibilities) combined with rate limiting below is a meaningfully better baseline while still being easy to remember.
- **Rate-limit login attempts aggressively**, using the Upstash Redis already in the stack: cap failed attempts per username (e.g. 5 attempts, then a lockout window with exponential backoff on repeated failures) and also rate-limit by IP as a second layer. This is the most important security control here, since a short numeric PIN is inherently low-entropy compared to a real password — the protection has to come from limiting guesses, not from the PIN's own strength alone.
- On signup, **link the current device's existing anonymous creations/streak data to the new account** (migrate rather than discard) so setting up a username doesn't feel like starting over.
- On login (from any device, including one where local data was cleared), verify username+PIN, and re-associate that device's local session with the account's server-side data — this is what actually solves the original "recognize me after clearing data" problem, since identity now lives server-side keyed by something the user remembers, not by anything stored client-side.

### b) Where this is offered (keep it low-friction, per the app's core design principle)
- **Do not prompt for this on first app open** — that would reintroduce exactly the friction this app has avoided from the start.
- Add a quiet, low-emphasis entry point inside the **Menu popover** (from the V15 consolidation) — something like "Save Your Progress" or "Set Up a Username," styled the same weight as the other menu items, not visually promoted above them.
- Additionally, show a **gentle, dismissible, one-time contextual nudge** at a moment where saving progress actually means something — e.g. right after a user reaches their second day of a daily-challenge streak (the first moment they have something worth not losing), or right after their first gallery share. This should never block the flow it appears alongside, should be easy to dismiss, and should not reappear repeatedly once dismissed.
- The signup/login screen itself: one small, minimal screen matching the existing pixel-UI aesthetic — username field, PIN field (using the custom keypad from section 4), one primary action button, and a small toggle link between "Set up a username" and "Already have one? Log in."

## 4. CUSTOM ON-SCREEN KEYBOARD & KEYPAD (APP-WIDE, REPLACES THE NATIVE MOBILE KEYBOARD)

Build a lightweight, custom on-screen input system used for every text/numeric input across the app on touch devices — username entry, PIN entry, and the existing Type Mode text input — instead of triggering the device's native keyboard.

### a) Two components
- **`CustomKeypad`** — a numeric-only pad (0-9, backspace, and a submit/done key), used for PIN entry specifically. Mask entered digits as filled dots as they're typed (standard PIN-entry convention) rather than showing plaintext digits, both for a bit of shoulder-surfing protection and because it's the expected pattern for this kind of input.
- **`CustomKeyboard`** — a compact QWERTY-style layout (letters, space, backspace, a shift/caps toggle for uppercase, and a minimal punctuation row sufficient for Type Mode's typed phrases) — used for username entry and the Type Mode text input.
- Both should be built from the app's existing chunky pixel-UI button styling — no third-party virtual-keyboard library, since the goal is genuinely lightweight, not a full IME replacement.

### b) Suppressing the native keyboard, correctly
- On the underlying text input/textarea element, set `inputMode="none"` (the standard technique for allowing focus/cursor/selection while preventing the native virtual keyboard from appearing on mobile), with a `readOnly` fallback for browsers that don't fully respect `inputMode="none"`.
- Manage the actual field value through the custom keyboard/keypad's key-press handlers, updating the underlying input's value programmatically, rather than relying on native typing input events.
- Dock the custom keyboard/keypad at the bottom of the screen when a relevant field is focused, matching the app's existing bottom-sheet/popover visual language from earlier addenda.

### c) Touch devices only — don't break desktop
- **This should only activate on touch devices** — detect this appropriately (e.g. via pointer type / touch capability, not just viewport width, since some laptops have touchscreens too) and on desktop/non-touch devices, let inputs behave completely normally with the physical keyboard and no custom on-screen component at all. Forcing a click-only virtual keyboard on a desktop user with a physical keyboard would be a clear usability regression, not an improvement — this feature is specifically solving a mobile-native-keyboard problem, not a desktop one.

## 5. TERMS, PRIVACY, AND ABOUT PAGES

- Build three lightweight, static-content pages/sections — **Terms**, **Privacy**, and **About** — styled consistently with the rest of the app (chunky pixel-UI panels, the established typography from the V18 addendum, generous whitespace).
- **Privacy content should accurately reflect what's actually built**: the anonymous device-ID default, the optional username+PIN account and what it stores, what's stored via Cloudinary/Neon (thumbnails, creations, gallery entries), the report-based moderation approach and its current limitation (reuse the honest framing from the V13 moderation note — don't overstate protection that isn't actually in place yet), and a plain-language note about the daily-challenge/streak data if applicable.
- **About** should be short and in the app's actual voice/tone (not corporate boilerplate) — what Unravel is and why it exists, consistent with the product's playful, tactile identity.
- **Important caveat to flag, not silently skip**: generated Terms/Privacy text is a reasonable starting draft, not verified legal advice — since this app collects user-submitted photos and has a public gallery, a real review by someone qualified (a lawyer, or at least a proper legal-template service) is worth doing before treating this as final, especially given the audience may include people less equipped to understand what they're agreeing to. Leave a clear code comment/README note flagging this, same treatment as the moderation-limitation note from V13.
- **Placement**: small, low-emphasis text links on the username/PIN login screen (e.g. "By continuing, you agree to our Terms & Privacy"), and small list items inside the Menu popover ("About," "Terms & Privacy") at the same low visual weight as the other secondary menu items — nowhere prominent, consistent with how minimally this information should intrude on the core experience.

## 6. FIX: TEXT & DRAWING MODE CUBES STILL BLURRY

The photo-sharpness work from a previous addendum was scoped primarily around photos; Draw Mode and Type Mode still look blurry and need the same level of attention specifically tuned to their content type.

- Apply the same grid-resolution-increase principle from the photo fix to Draw Mode and Type Mode specifically — re-verify the actual resolution currently used for these two modes hasn't been left at a lower/older default while the photo path was updated.
- Text and line art have different detail characteristics than photos (high-contrast edges, thin strokes, small glyph details) — a resolution/supersampling setting tuned primarily for photographic color detail may not be well-suited to keeping small text legible or thin brush strokes crisp; tune these two modes' defaults specifically against their own content (test with genuinely small text and thin brush strokes, not just large bold examples) rather than assuming the photo fix automatically covers them.
- Do a dedicated before/after comparison for both modes specifically, the same rigor as the photo comparisons done in earlier addenda — this should be confirmed directly, not assumed to have been fixed as a side effect of the photo work.

## 7. FIX: NEW FONT NOT LOADING ON iPHONE (LINKED TO CACHE VERSIONING)

These are very likely the same bug: the font change from a previous addendum works elsewhere but not on an iPhone, and the app has no cache-versioning strategy — meaning Safari is very likely still serving a stale cached stylesheet from before that change shipped, since there's nothing forcing the old cached CSS/font files to be invalidated on deploy.

- **Implement proper cache versioning for the service worker**: tie the cache name/version to something that changes on every deploy (e.g. the build ID / git commit SHA, available as a Vercel environment variable) rather than a static cache name that never changes.
- On service worker `activate`, **delete any previously-named/versioned caches** that don't match the current version — this is the step that actually clears out stale fonts/CSS/JS from a user's device after a deploy.
- Implement `skipWaiting()` in the service worker and `clients.claim()` on activation so a newly-deployed service worker takes control immediately rather than waiting for every open tab to fully close first — without this, a returning user can keep running the old cached version indefinitely across multiple visits.
- Confirm font files specifically are included in whatever precache manifest/versioning system is in place, so a font change in the source code reliably invalidates the previously-cached font file on the next deploy.
- After implementing this, verify specifically on an iPhone/Safari: load the app, confirm the current (correct) font, then simulate a version bump and confirm the update is picked up cleanly on next load without needing the user to manually clear anything.

## 8. FIX: RECORDED MP4 NOT PLAYABLE IN NORMAL PLAYERS (ONLY WORKS IN VLC)

A file that only VLC can play (while native OS players, QuickTime, or a browser's own `<video>` tag struggle) is a classic sign of a **non-standard container structure or unusual codec/profile**, not genuine corruption — VLC's demuxer is unusually permissive and tolerates things stricter players reject.

- Check the actual Cloudinary transformation parameters used for the WebM→MP4 conversion from the earlier addendum — explicitly specify **H.264 video codec** (broadly compatible profile — baseline or main, not an unusual/high profile) and **AAC audio codec**, rather than leaving format conversion to automatic/default detection, which can produce a technically-valid but unusually-encoded result depending on what codec the source WebM happened to use.
- Confirm the output uses a **"fast start" / streaming-optimized MP4 structure** (moov atom positioned at the start of the file rather than the end) — a moov atom at the end is a common cause of files that "work" in tolerant players but fail or stall in stricter ones, including some mobile OS video players.
- After regenerating a test export, **verify the actual file's codec/container metadata directly** (e.g. via `ffprobe` or an equivalent inspection tool) to confirm it matches standard, widely-compatible MP4 expectations — don't just confirm it plays in one player and assume it's fixed, since that was exactly the trap with the current VLC-only behavior.
- Test playback specifically in: the iOS/macOS native player (QuickTime or Photos), a standard Android video player, and directly in a browser's native `<video>` tag (not just download-and-open) — confirm all of these play it normally before considering this fixed.

---

## DELIVERABLE EXPECTATIONS

- The gallery page (and every other non-canvas page) scrolls normally; confirm the main cube canvas's own scroll-lock still works correctly and wasn't accidentally removed while fixing this.
- View counts increment correctly once per device per creation (not inflated by repeat visits) and display clearly on both the gallery grid and detail pages.
- The username+PIN system: signup migrates existing anonymous data correctly, login from a fresh/cleared device correctly restores the account's data, PINs are properly hashed (never stored in plaintext, verify this directly in the database), and rate limiting genuinely blocks rapid repeated login attempts when tested directly.
- The custom keyboard/keypad correctly replaces the native keyboard on touch devices for username, PIN, and Type Mode text entry, while desktop behavior remains completely normal and untouched.
- Terms, Privacy, and About pages exist, are accurate to what's actually implemented, are linked from the login screen and the Menu popover at appropriately low visual emphasis, and the legal-review caveat is clearly noted in the codebase/README.
- Draw Mode and Type Mode cubes show a clear, dedicated sharpness improvement, verified with its own before/after comparison rather than assumed from the photo fix.
- The iPhone font issue is resolved, verified directly on iOS Safari, and the underlying cache-versioning fix is confirmed to correctly clear stale caches on a simulated future deploy.
- Recorded MP4s play correctly in standard native players on both iOS and Android, and in a browser's native video element — not just in VLC.
