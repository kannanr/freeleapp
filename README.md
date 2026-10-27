# Freeleapp — security fork

**Not yet approved for production cloud credentials.** This fork tracks the security audit and hardening work in
[docs/security/AUDIT.md](docs/security/AUDIT.md). Version 1.3.3 is an ad-hoc-signed development release, not a Developer-ID-signed/notarized release.
Upstream binaries and the upstream Homebrew cask do **not** contain these patches.

Temporary AWS and Azure credentials on your Mac, one click away. A maintained, free and open-source continuation of the [Leapp](https://github.com/Noovolari/leapp) desktop app.

## About

Leapp has had no release since v0.26.1 (June 2024), after Noovolari shut down. Freeleapp keeps the app working on current macOS versions and removes everything that depended on the discontinued company services.

Differences from upstream Leapp:

- One edition with every feature: no Pro or Team tier, no sign-in.
- No telemetry: the usage analytics client is removed.
- Updated for current macOS: new UI and icon, resizable window, AWS console multi-session instead of a browser extension.
- In this security fork, automatic updates are disabled until its own signed releases are verified. Release notes are bundled, not fetched remotely.
- Your Leapp setup moves over automatically: on first launch Freeleapp copies `~/.Leapp` to `~/.freeleapp` (the original stays as a backup) and moves keychain items to the `Freeleapp` service as they are used.

Documentation: [freeleapp.com](https://freeleapp.com).

Freeleapp is not affiliated with Noovolari or beSharp. "Leapp" is a trademark of its respective owners.

## How It Works

```mermaid
flowchart LR
    UI[Desktop app<br/>Electron + Angular] --> Core[Core library]
    Core --> Vault[(macOS Keychain)]
    Core --> Cfg[(~/.freeleapp)]
    Core --> Creds[~/.aws/credentials<br/>~/.azure]
    Core --> Cloud[AWS STS / IAM Identity Center<br/>Microsoft Entra ID]
```

The core library (`packages/core`) holds the session logic and the desktop app is built on top of it. Temporary credentials are written to the standard AWS and Azure CLI files, so any tool that reads them works unchanged. Long-term secrets stay in the macOS Keychain; the configuration file is encrypted.

## Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron |
| UI | Angular, Angular Material |
| Core library | TypeScript, AWS SDK v3, MSAL |
| Secrets | macOS Keychain (keytar) |
| Packaging | electron-builder, GitHub Actions (macOS arm64) |

## Install

Apple Silicon development images are published under [kannanr/freeleapp Releases](https://github.com/kannanr/freeleapp/releases)
as `Freeleapp-<version>-arm64.dmg`. They are ad-hoc signed and not notarized; publishing them does not resolve the audit blockers.
Do not use `sergioarojasm98/tap/freeleapp` to install this fork; it installs upstream Freeleapp.

## Build

```bash
nvm use                      # Node version from .nvmrc
npm ci
cd packages/core && npm ci && npm run build
cd ../desktop-app && npm ci
npx gushio gushio/target-build.js 'configuration production'
npx electron-builder build --mac dir --arm64 --publish never -c.mac.identity=null   # Xcode 26 compiles the Liquid Glass icon
```

Without `-c.mac.identity=null`, electron-builder signs with a Developer ID certificate from the keychain (or `CSC_LINK`). Release builds are signed and notarized in GitHub Actions.

Tests: `npm run test:security` at the root, `npx jest` in `packages/core`, and
`npm test -- --watch=false --browsers=ChromeHeadlessSafe` in `packages/desktop-app`.

## License

[Mozilla Public License 2.0](LICENSE), same as upstream. Original work © Noovolari and the Leapp contributors.
