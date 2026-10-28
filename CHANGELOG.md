# Changelog

All notable changes to Freeleapp are documented here. Versions follow [Semantic Versioning](https://semver.org/).

Freeleapp is based on **Leapp 0.26.1**. For the history before the fork, see the [Leapp changelog](https://github.com/Noovolari/leapp/blob/v0.26.1/CHANGELOG.md).

## 1.3.4 (2026-10-28)

### Bug Fixes

- **Sessions no longer stay "connecting" after a browser sign-in fails or times out.** Sessions waiting on the same sign-in now receive its error and stop, and the next start opens a new sign-in instead of needing an app restart.
- The pending spinner, notification icons and "Add new filter" icon render again. They used paid Font Awesome icons that were previously loaded from a CDN script; they now use the bundled free set.
- The integration online/offline dot sits on the provider logo again instead of below it.

### Distribution and Limitations

- Apple Silicon DMG only: `Freeleapp-1.3.4-arm64.dmg`, **ad-hoc signed, not Developer-ID signed or notarized**. The limitations listed for 1.3.3 still apply.

## 1.3.3 (2026-10-27)

### Bug Fixes

- Restore immediate Sessions/Pinned Sessions switching without having to visit Tunnels first. Preserve eager change detection for the existing RxJS-driven UI after the Angular 22 upgrade.
- Restore dark-theme sidebar text/icon contrast and consistent horizontal/vertical alignment using supported Material MDC list markup and tokens.
- Prevent a packaged-startup exception when electron-builder strips build settings from the application manifest. Missing update-feed settings now fail closed.
- Release notes load from the bundled application directory instead of relying on a Webpack `__dirname` shim.
- Unsubscribe destroyed integration views from highlight notifications.

### Security and Maintenance

- Update the compatible Node/Angular/Electron/AWS/MSAL tooling stack; retain compatible TypeScript/Jasmine versions rather than bypass peer checks.
- Remove live CDN JavaScript from the privileged renderer, tighten CSP/navigation/IPC controls, protect credential-file permissions and redact sensitive command logs.
- Keep automatic updates disabled and release destinations specific to this fork.
- Isolated test browsers use mock keychains and temporary profiles; native UI regression checks use only synthetic workspace data and stub credential APIs.

### Distribution and Limitations

- Apple Silicon DMG only: `Freeleapp-1.3.3-arm64.dmg`.
- This fork's locally built image is **ad-hoc signed, not Developer-ID signed or notarized**. It is not a production-security certification; legacy keychain items may still require per-item authorization.
- Live cloud authentication and the open renderer-isolation/security findings remain outside the synthetic test coverage. See `docs/security/AUDIT.md` and `docs/security/UI-REGRESSIONS.md`.

## 1.3.2 (2026-10-13)

### Bug Fixes

- **The window no longer stays blank when its renderer process dies.** If something outside Freeleapp ends that process (a crash, running out of memory, another tool sending it a signal), the window loads again by itself within a second, as after a relaunch: sessions start stopped, so start the ones you need again. Silent SSO renewals resume with it. If the window can't stay up (three times in five minutes), quit and open Freeleapp. Each event is written to the log (`~/Library/Logs/Freeleapp`).

### Features

- The page that the browser shows after an AWS sign-in follows the app's theme, so it's dark when Freeleapp is dark.

## 1.3.1 (2026-10-08)

### Bug Fixes

- **The browser sign-in no longer opens when the session could still be renewed silently.** When several sessions needed a new token at once, they all spent the same refresh token; AWS rotates it on use, so all but one were rejected and Freeleapp fell back to the browser. Sessions now share a single renewal.
- Network errors, throttling and AWS server errors while renewing are retried twice before opening the browser.
- Every silent renewal, and the reason whenever the browser sign-in opens, is now written to the log (`~/Library/Logs/Freeleapp`). Tokens are never logged.

## 1.3.0 (2026-10-07)

### Features

- **AWS SSO sessions renew without the browser.** Freeleapp now keeps the IAM Identity Center refresh token in the keychain, so when the access token expires it gets a new one silently. The browser only opens again when your Identity Center session itself ends (its length is set by your administrator).
- **Simpler AWS sign-in.** With the browser opening set to **In Browser**, sign-in uses the authorization code flow with PKCE, the same one as `aws sso login`: AWS only asks you to **Allow** access, there is no code to compare. The in-app window keeps the device code flow, which is also used automatically if the new flow can't start (for example behind a proxy).
- The OIDC client is registered once and reused for about 90 days instead of on every sign-in.

### Bug Fixes

- When AWS rejected a stored access token that still looked valid, Freeleapp retried with the same token instead of renewing it.

### How to check

Sign in to your AWS SSO integration once after updating. The next time the access token expires (usually after a few hours), sessions start without opening the browser.

## 1.2.1 (2026-10-03)

### Bug Fixes

- In the dark theme, the text next to the **Automatically Download Updates** and **Use Authentication** checkboxes in Settings was dark on a dark background.

## 1.2.0 (2026-10-03)

### Features

- Freeleapp is signed with an Apple Developer ID and notarized by Apple. macOS opens it without clearing the quarantine flag, and the keychain no longer asks you to allow Freeleapp again after every update. After updating from 1.1.0 or earlier, macOS asks one last time; choose **Always Allow**.
- **Automatically Download Updates** in Settings → General, on by default. A new version downloads in the background and an **Update** button appears in the bottom-left corner of the sidebar; click it to restart into the new version. Quitting Freeleapp also installs a downloaded update. Turned off, Freeleapp tells you about new versions as before and you download them yourself.

## 1.1.0 (2026-10-01)

### Features

- Freeleapp runs on Electron 44 (up from 22) and Node.js 24. The old Electron 22 is what made windows lag on macOS 26, and upcoming macOS versions flag it as outdated. Electron 44 needs **macOS 13 Ventura or later**; stay on 1.0.1 on macOS 12.
- Sign-in to AWS IAM Identity Center works behind corporate networks that inspect TLS. Freeleapp now also trusts the root certificates installed in the macOS keychain (for example the one a company's proxy adds), not only the ones bundled with Node.js.
- Each AWS IAM Identity Center role gets its own named profile, `<account>-<role>` (for example `payments-prod-AdministratorAccess`), so several roles can be active at the same time. You can still pick or type another profile. On first launch, roles that were on the `default` profile move to their own profile; roles with a profile you chose keep it.
- A named profile can only belong to one session. Choosing a profile that another session already uses shows which session has it, instead of silently stopping that session later. New sessions get `default` preselected only while no other session uses it.
- Settings → Profiles lists the profiles you manage: `default` and the ones you added. The profiles sessions have of their own (`<account>-<role>`, or the session name) are not listed; they are created with their session and deleted with it. `default` is now a profile like the others: it can be renamed or deleted, and added again by name. Deleting a profile moves its sessions to a profile of their own instead of `default`.
- **Tunnels**: SSM port forwarding that runs in the background. In View SSM Sessions, **Forward Port** on an instance saves a tunnel to a port on that instance, or through it to another host such as a database endpoint, and starts it without a terminal window. **Tunnels** in the sidebar lists them with their status and local address: start, stop, edit or delete them, copy `localhost:port`, or copy the equivalent `aws ssm start-session` command. A tunnel that drops reconnects with fresh credentials (up to three times), a busy local port is reported before starting, and a tunnel can start with its session. Tunnels stop when Freeleapp quits, and ones left by a crash are stopped on the next launch. They need the AWS CLI and the Session Manager plugin.
- **Copy Command** next to each instance in View SSM Sessions copies the `aws ssm start-session` command with the session's named profile, to paste in any terminal.
- The sidebar reads **Sessions**, **Pinned Sessions**, **Tunnels** and **Pinned Tunnels**. **Sessions** shows how many sessions are active, like **Tunnels** shows the running tunnels. Past 9 the badge reads *9+*; hover it for the exact number.
- Tunnels can be pinned from their menu and are then listed first and under **Pinned Tunnels**.
- In the Tunnels views the search box filters tunnels by name, session, profile, target or port. The session filters, which do not apply to tunnels, are hidden there.
- Saving, pinning or deleting a tunnel confirms it with a notification.
- Esc closes every dialog like its Cancel or close button: create and edit session, Settings, SSM, tunnels, confirmations and the rest. With a dropdown or menu open, Esc closes that first; with a confirmation on top of another dialog, it closes only the confirmation.
- View SSM Sessions opens on the region you used last for each session, else on the session's own region, and shows the instances it already loaded right away, with when they were loaded. The refresh button next to the region loads them from AWS again. The **Populate Region** setting, which left the region empty by default, is gone.
- **Default Local Port** in Settings → SSM decides what a tunnel with an empty Local Port uses: the remote port (as before), or the remote port unless something on your Mac already listens on it, and then a free port.
- The port forwarding form offers common remote ports in one click: PostgreSQL, MySQL, Redis, RabbitMQ and its management UI, SSH and RDP.
- Freeleapp can be installed and updated with Homebrew: `brew install --cask sergioarojasm98/tap/freeleapp`.
- Buttons look the same everywhere: blue with white text, with the same hover and pressed states, in both color themes. Filter chips turn blue while they filter something. Action buttons explain what they do on hover.

### Removed

- The **Local Workspace** entry at the top of the sidebar. It was the workspace switcher of Leapp Team, which Freeleapp does not have, so it did nothing.
- The plugin system, with its **Plugins** tab in Settings, the Plugins entry of the session menu and the `freeleapp://` links that installed plugins. Plugins were npm packages that ran with full access to your system and were no longer verified: the Leapp service that signed them is gone. SSM port forwarding, the most used plugin feature, is now built in. A leftover `~/.freeleapp/plugins` folder can be deleted.

### Bug Fixes

- If the IAM Identity Center portal URL cannot be reached (network or certificate error), syncing the integration fails with an error instead of waiting forever.
- The session list keeps a predictable order. **Order by Date** (on by default) now lists started sessions by start time and the rest by name; before, it left them in the order they were created. Ordering by a column header also survives starting or stopping a session, instead of jumping back to the default order.
- Starting or stopping a session from its row icon keeps that session selected. As the list re-ordered, the selection could land on another row.
- Deleting a profile or an IdP URL in Settings asks for confirmation on top of Settings instead of closing it. Profile and IdP URL rows keep their name and buttons on one line.
- Checked checkboxes use the app's blue instead of Material's pink.
- The status dot of a selected session stays visible while the pointer is over it.
- View SSM Sessions shows every instance by its EC2 Name tag, with its id, IP address and platform below. Instances launched together (for example by an Auto Scaling group) showed their id instead of their name, and stopped instances are no longer listed. The dialog is wider, so long names fit.

## 1.0.1 (2026-09-26)

### Features

- Labels, buttons, tabs, tooltips, placeholders and short notifications use Title Case consistently (for example *Options Saved*, *Add a New Named Profile*, *Installed Plugins*), and names such as URL, ID, MFA and macOS are spelled the same everywhere. Full-sentence messages keep sentence case.
- Settings has a **Cancel** link next to **Done**. Cancel, Esc or a click outside the dialog close it without saving; if you changed something, Freeleapp first asks whether to discard the changes. A color theme you were previewing goes back to the previous one. Adding, editing or deleting IdP URLs, profiles and plugins still apply right away.

### Removed

- The **AWS Credential Method** setting and its *credential-process* option. It relied on the Leapp CLI, which Freeleapp does not ship, so sessions using it could not get credentials. Freeleapp always writes temporary credentials to `~/.aws/credentials`. A Leapp setup that used credential-process is switched over on first launch, and only the `credential_process = leapp session generate …` profiles Leapp added to `~/.aws/config` are removed.

### Bug Fixes

- Macs without the AWS Session Manager plugin no longer get an error at startup. Freeleapp checks the AWS CLI and the plugin when you open **View SSM Sessions** and links to the install steps if one is missing.
- **Open Issue** and **Request Feature** stay available when the AWS CLI or the Session Manager plugin is not installed.
- A selected session no longer shows a small start/stop button squeezed next to the provider icon. The button replaces the icon only while the pointer is over the row, as before.
- The region list in the SSM dialog is no longer cut off by the dialog's edge.
- **Pinned** clears a saved filter or search before showing the pinned sessions, like **All Sessions** does. Before, it showed only the pinned sessions that also matched the previous filter, which was often an empty list.
- The IdP URL, Named Profiles and Plugins lists in Settings use the full height of the window instead of a fixed 230 px box.

## 1.0.0 (2026-09-25)

First Freeleapp release, a maintained fork of Leapp for current macOS versions.

### Features

- New identity: Freeleapp name, cloud icon with a Liquid Glass version for macOS 26 and later, and a blue and graphite color palette.
- One edition with every feature: the Leapp Pro and Team screens, sign-in, plans and workspace sync are gone.
- AWS console links sign in directly, so several accounts stay open side by side with the console's native multi-session support.
- Region dropdowns list the four most used regions first under *Recently used*.
- Press Escape in the search bar to clear it.
- *Saved segments* are now **Saved Filters**, saved from a proper **Save Filter** button.
- Modals and the overlay sidebar dim the window behind them the same way, in both themes.
- Active sessions show a green status dot, and the actions button appears next to it instead of replacing it.
- The window stays resizable when the sidebar is hidden, works with window managers such as Rectangle, and adapts to narrow widths: the sidebar hides itself and the sidebar button shows it on top of the list.
- Double-clicking the top bar follows the macOS title bar setting (zoom, minimize or nothing).
- Documentation, updates, release notes and issue links point to Freeleapp.
- *What's new* shows the release notes of the installed version.
- Freeleapp keeps its data under its own names: `~/.freeleapp`, the `Freeleapp` keychain service, `~/Library/Logs/Freeleapp` and the `freeleapp://` scheme. A Leapp setup is copied over automatically on first launch; `~/.Leapp` is left as a backup.

### Bug fixes

- Refreshing sessions from `leapp-cli` now reloads the app; it never did because the request went through the disabled Team service.
- The SSM dialog stays inside the window and scrolls its instance list.
- Saved filters apply on the first click.
- Logging out of federated sessions finds the login data again after the app rename.

### Removed

- Usage analytics (PostHog) and the Angular CLI analytics.
- The multi-console browser extension and its local WebSocket server on port 8095; use the AWS console's multi-session instead.
- The Noovolari shutdown notice and Slack community links.
- Touch ID and require-password options, which only applied to the Team lock screen.
