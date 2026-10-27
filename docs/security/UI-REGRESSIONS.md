# Native UI regression diagnosis

## Reported symptoms

- Dark sidebar labels/icons were black or unreadable.
- Sidebar selection changed horizontal/vertical label alignment.
- Sessions/Pinned Sessions did not refresh the displayed list until navigating through Tunnels.
- A macOS dialog reported: `A keychain cannot be found to store "Chrome".`

## Reproduction and causes

The first component browser harness reproduced black icons and a 10px selection-dependent offset, but did not reproduce
the stale list. That test alone was insufficient: its JIT/template overrides were not equivalent to the production app.
The production Angular bundle was therefore exercised in a real Electron window with synthetic workspace data.

The native harness reproduced the stale list with a pinned and an unpinned fixture session. Changing only the session
component to `ChangeDetectionStrategy.Eager` changed the pinned list from two rendered rows to one immediately.
This confirmed Angular 22's new OnPush default as the cause for the app's imperative RxJS updates. Explicit eager
checking is retained across the existing legacy components, matching the previous behavior instead of partially
migrating a few views to signals/OnPush.

Material MDC uses list label/icon tokens and wrappers independently of host colors. Updating those dark-theme tokens,
using the supported `matListItemTitle`/`matSubheader` directives and applying equal row geometry fixes the sidebar.
The original Freeleapp palette is retained; no unrelated redesign was performed.

## Verification method

`scripts/ui-fixture/check.cjs` loads the production renderer in Electron, not a mocked screenshot or dev server.
It uses a marked, newly-created temporary HOME, a synthetic encrypted workspace, fake Keytar and process APIs,
blocked network requests, and a mock Chromium keychain. It never copies a user's browser profile, credentials,
workspace, integrations or Keychain entries. It does not start cloud sessions.

The harness checks direct/repeated Sessions/Pinned switches, return from Tunnels, dark/light text/icon contrast,
equal label x positions and vertical centering, and saves screenshots for visual inspection. The browser component
tests cover row rendering/color/geometry separately. Source-level security tests prevent accidental removal of the
explicit eager strategy or mock-keychain flags.

## Chrome dialog

The supplied screenshot identifies macOS Keychain Services acting on behalf of Chrome, not a Freeleapp-authored dialog.
Earlier automated Chrome tests inherited a temporary HOME without the browser's mock-keychain flags. That is a
plausible trigger for this dialog, but the requesting process was not captured and attribution is not certain.
The user's real login keychain was present and readable in metadata-only checks.

All local Karma launchers now use `--use-mock-keychain` and `--password-store=basic`, as do the native Electron fixtures.
The default local launcher is `ChromeSafe`; headless local testing uses `ChromeHeadlessSafe`.
No keychain reset/deletion, default/search-list mutation, password read or installed-app replacement was performed.
Canceling an existing dialog is preferable to resetting user keychains while the cause remains unconfirmed.

## Final checks

- 684 core tests, 85 desktop tests and 22 security regression tests passed.
- Production build and Electron type-check passed; changed-file lint has no errors (inherited annotation warnings remain).
- Dark and light native fixtures passed, including repeated session/pinned toggles and a round trip through Tunnels.
- Mounted DMG payload passed the same native fixture checks; labels had equal x positions and zero vertical-centering offset.
- DMG checksum and mounted application deep/strict ad-hoc signature validation passed; inspection volume detached.
- Published naming convention for the fixed development image: `Freeleapp-1.3.3-arm64.dmg` (the previous 1.3.2 test images are superseded).

Live authentication, production signing/notarization and the open security architecture findings remain outside this
synthetic UI verification. This is not a production-security certification.
