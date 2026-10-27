# Freeleapp security audit and hardening

## Decision

**Not approved for production cloud credentials.** These patches reduce concrete risks, but do not constitute a
complete security certification. The dependency modernization in [UPGRADE.md](UPGRADE.md) replaces unsupported Angular;
the privileged renderer and the other unresolved findings below remain blockers.
No signed patched binary has been built or independently assessed yet. Do not install upstream binaries expecting
these changes, and do not bypass Gatekeeper to test this fork with real credentials.

## Baseline and scope

- Date: 2026-10-27.
- Source: `sergioarojasm98/freeleapp`, release `v1.3.2`.
- Pinned commit: `7a9a1aea06294352e7a962d351fc4315b82b3062` (local tag `freeleapp-v1.3.2`).
- Fork: `https://github.com/kannanr/freeleapp`; current checkout and branch retained.
- Target: Apple Silicon macOS; Windows ACLs and Linux desktop behavior are not covered.
- Reviewed: Electron entrypoints and IPC, authentication windows, SSO PKCE/refresh handling, credential-file writes,
  keychain migration, local configuration encryption, command execution/logging, outbound endpoint declarations,
  dependency lockfiles, CI and release configuration.
- Method: static inspection, npm advisory scans, filesystem regression tests, mocked authentication/window tests,
  core tests and compilation. No production cloud calls, real credentials or user keychain access were used.
- This is an initial, scoped audit, not a line-by-line review of every dependency or a malware-free guarantee.

## Findings and disposition

| ID | Priority | Finding | Disposition |
| --- | --- | --- | --- |
| SEC-001 | P0 | A live Font Awesome CDN script ran inside the Node-enabled renderer. CDN/kit compromise would therefore execute with local process privileges. | Removed remote script; bundled Font Awesome CSS/fonts; `script-src 'self'`, no inline/eval/data script exceptions. |
| SEC-002 | P0 | Main/tray renderer has `nodeIntegration: true`, `contextIsolation: false` and `@electron/remote`. An applicable renderer injection bug could reach filesystem, shell and secrets. | **Open architecture blocker.** Navigation, redirects, new windows, webviews, permissions and IPC were constrained as defense in depth; Node/remote access remains. |
| SEC-003 | P0 | Angular 15 was unsupported; installed Angular packages had high-severity advisories, including sanitizer/XSS findings. Other transitive dependencies also had high/critical advisories. | Supported Angular 22 and current compatible SDK/tooling versions are now installed and tested; see [UPGRADE.md](UPGRADE.md) for the renewed scan and limits. Remaining findings and the actual packaged dependency tree still require review. No blanket `npm audit fix --force` was used. |
| SEC-004 | P1 | AWS credentials, SSM environment files and macOS Azure token caches relied on default write permissions; a typical umask can create mode 0644 files. Supplying a creation mode alone does not repair an existing file. | Shared private writer creates mode 0600 files, checks the opened inode, tightens existing permissions before truncation, rejects final-component symlinks and hard links, and closes descriptors on errors. New FileService directories use mode 0700. |
| SEC-005 | P1 | A personal fork retained upstream update/feed/install destinations, allowing upstream releases to replace patched builds. | Fork-owned feed/app ID; updates disabled by default, including unpackaged builds; no install-on-quit; bundled-only changelog; upstream Homebrew publishing job removed. Re-enabling updates requires signed fork releases and additional verification. |
| SEC-006 | P1 | Arbitrary schemes were passed to OS URL handlers; authentication windows relied on implicit security defaults. | External/authentication links require HTTPS without userinfo/control characters. Auth windows explicitly disable Node, enable isolation/sandbox/web security, deny popups, non-HTTPS navigation and permission grants. HTTP/custom-scheme IdPs may no longer work. |
| SEC-007 | P2 | Any invalid loopback callback terminated an active SSO PKCE flow, enabling sign-in denial of service. Responses could reflect provider error text and lacked cache/referrer restrictions. | Wrong state/Host/method/path and duplicate/conflicting parameters are ignored without ending sign-in; genuine state-bound errors still end it. Callback pages have no-store, no-referrer and restrictive CSP headers. PKCE and state randomness were retained. |
| SEC-008 | P1 | ExecuteService logged command arguments and stdout/stderr, which can contain passwords/tokens; output masking did not mask command/error text. | Logs contain status only. Sensitive failures redact message, stack and stdout/stderr. Other logging sites still need a complete secret-canary review. Existing logs are not modified. |
| SEC-009 | P1 | CI/release actions used mutable tags and builds used `npm install`; checkout credentials and an upstream tap mutation remained in the release path. | Build/test/release actions pinned to verified commit SHAs, explicit read-only permissions except publish, checkout credential persistence disabled, `npm ci`, script-free test installs, security test gates. Native packaging still needs dependency scripts and signing secrets. |
| SEC-010 | P2 | Workspace AES uses a machine identifier as its passphrase, not a secret encryption key; authenticity is not established by this scheme. Azure CLI-compatible token caches remain plaintext on macOS. | **Open.** Mode 0600 is a mitigation, not cryptographic confidentiality against same-user malware. Long-term secrets and SSO refresh tokens use the OS vault in the reviewed paths. A versioned keychain-backed authenticated-encryption migration needs separate design and recovery tests. |
| SEC-011 | P2 | Legacy migration copies files, potentially preserving permissive modes/symlinks, before subsequent FileService writes. | **Open.** The private writer protects covered subsequent writes, not every copied file or parent-directory symlink. Migration must be tested and hardened separately without damaging existing user data. |
| SEC-012 | P2 | The separately compiled Electron main process imported Angular's development environment; Angular file replacements do not control this compilation. | Packaged-mode DevTools decisions now use `app.isPackaged`; the development updater override was removed. Native packaged behavior still needs smoke testing. |

Priorities express remediation order and potential impact, not independently demonstrated exploitation of every advisory.
Static endpoint searches found AWS/Azure endpoints, GitHub/releases/documentation and Google Fonts; no active telemetry
client or TLS-verification-disable switch was found in the reviewed source. Google Fonts requests remain. This is **not**
a captured-network proof that no unexpected egress can occur.

## Dependency evidence

Use `npm audit --package-lock-only --ignore-scripts --json` separately at the root, in `packages/core`, and in
`packages/desktop-app`. Also inspect `--omit=dev`, but do not interpret it as the exact shipped SBOM: the local core
link can expose development dependencies to the scanner, and some tooling is listed as runtime dependencies.
Local linked-package lock records were refreshed after the direct dependency updates.

Historical baseline scanner counts (packages with advisories, not distinct CVEs, not proven exploitable paths):

| Lockfile | High | Critical | Total |
| --- | ---: | ---: | ---: |
| Root | 36 | 1 | 53 |
| Core | 32 | 3 | 76 |
| Desktop | 64 | 6 | 140 |

Remaining examples requiring reachability review include Angular, `fast-xml-parser`, `extract-zip`, `handlebars` and
`tar`. Angular SSR advisories do not automatically apply to a desktop app; conversely, build-time dependencies can
still compromise release output. Scan counts alone cannot settle either question.

After the initial hardening patch set and linked-lock refresh: root **34 high / 1 critical / 50 total**; core **31 high / 3 critical /
74 total**; desktop **60 high / 6 critical / 135 total**. Desktop `--omit=dev` reports **37 high / 3 critical / 90 total**,
subject to the linked-package caveat above. The scanner no longer flags Axios, Electron, follow-redirects or markdown-it
in the three lockfiles. These counts are dated observations, not a future clean bill of health.

The subsequent modernization scan is recorded in [UPGRADE.md](UPGRADE.md): no critical findings in any tree, no high
findings in root/core or the desktop omit-dev approximation, and one development-tool high finding in the desktop
full tree. These scanner classifications are not a verified shipped SBOM.

Sources: [Angular support policy](https://angular.dev/reference/releases),
[Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security),
[Angular SVG sanitizer advisory](https://github.com/advisories/GHSA-jrmj-c5cx-3cw6),
[fast-xml-parser entity expansion advisory](https://github.com/advisories/GHSA-jmr7-xgp7-cmfj).

## Verification and remaining work

Security regression command: `npm run test:security` (Node 24+; tests use only synthetic values and temporary files).
It checks real file modes/link rejection, scheme validation, mocked navigation/permission controls, IPC identities,
PKCE callbacks, CSP source invariants and fork update configuration. Source-invariant tests supplement, not replace,
runtime checks. Desktop tests additionally exercise window creation, the callback lifecycle and offline release notes.

Verification used Node 24.22.1 (an official Apple Silicon binary, downloaded into the approved temporary directory and
checked against Node's published SHA-256), after initial checks with Node 26.7.0/npm 11.19.0. CI and the Electron 44
runtime target Node 24. Tests were run with an isolated HOME and AWS/Azure environment settings removed.
Package installation used `--ignore-scripts`: the native Electron application was deliberately not launched.

Initial hardening verification on Apple Silicon with Node 24.22.1 (before the subsequent modernization):

| Check | Result |
| --- | --- |
| Root `npm run test:security` | 17 passed |
| Core `npm run build` | Passed |
| Core `./node_modules/.bin/jest --runInBand --silent` | 67 suites, 684 tests passed |
| Desktop `npm test -- --watch=false --browsers=ChromeHeadless --progress=false` | 80 passed |
| Desktop `./node_modules/.bin/ng build --configuration production --base-href ./ --progress=false` | Passed |
| Desktop `./node_modules/.bin/tsc --project electron --noEmit` | Passed |
| ESLint on changed non-Electron TypeScript files | Zero errors/warnings; Electron files are excluded by the repository configuration |
| CI/release YAML parsing, job references and action-pin checks | Passed; hosted workflows were not executed |
| `git diff --check` | Passed |

The production bundle has size/CommonJS warnings, and shallow desktop test fixtures emit Angular template diagnostics
despite passing. Neither unit-test success nor compilation proves that a native packaged app or live IdP flows work.

Before any approval:

1. Supported Angular and compatible libraries are now installed and regression-tested; complete native-flow and advisory
   reachability verification rather than treating compilation as proof of safety.
2. Move core/native operations to the main process; add a narrow validated preload API; disable renderer Node/remote,
   enable context isolation and sandboxing. Do not simply flip flags: the current services call Node synchronously.
3. Review and reduce the actual packaged dependency tree; pin and inspect native/build-time execution paths.
4. Harden and test migration, secret logging/redaction and workspace encryption, including corrupted/old-data recovery.
5. Smoke-test the production CSP/UI and SSO/SAML/SSM/Azure flows in a native test environment with synthetic/test-only
   accounts. Confirm that popup restrictions do not break required IdPs and that credential files are cleaned on failure.
6. Build this fork with its own Developer ID, notarize it, verify signatures/signer identity and hashes independently,
   inspect packaged contents, and capture outbound traffic using canary credentials. Do not copy upstream signing keys.
7. Commit/push reviewed patches and configure fork CI/signing before publishing any release. No patched binary or
   remote patch commit is implied by creating the GitHub fork.
