# Contributing to Freeleapp

Bug reports, fixes and ideas are welcome through [GitHub Issues](https://github.com/sergioarojasm98/freeleapp/issues) and pull requests.

This project follows the [Contributor Covenant Code of Conduct](./.github/CODE_OF_CONDUCT.md).

## Reporting bugs

Use the bug report template and include:

- Freeleapp version (Freeleapp menu → About) and operating system version.
- Session type involved (IAM User, IAM Role Federated/Chained, IAM Identity Center, Azure).
- Steps to reproduce, expected and actual behavior.
- Relevant lines from the log file (`~/Library/Logs/Freeleapp/log.electronService.log` on macOS). Remove account IDs, ARNs and tokens first.

## Code contributions

1. Set up the environment as described in [DEVELOPMENT.md](./DEVELOPMENT.md).
2. Create a branch from `master`.
3. Keep commits in [Conventional Commits](https://www.conventionalcommits.org/) format (`fix:`, `feat:`, `chore:`...).
4. Run the tests before opening the pull request:
   - `packages/core`: `npx jest`
   - `packages/desktop-app`: `npm test -- --watch=false --browsers=ChromeHeadless`
5. Open the pull request against `master`; CI builds the macOS app on every push.

Fixes that also apply to upstream Leapp can be sent to [Noovolari/leapp](https://github.com/Noovolari/leapp) as well.

## Releasing

1. On `master`, set the new version in `packages/desktop-app/package.json` (and its lockfile) and date its section in `CHANGELOG.md` (`## 1.2.3 (YYYY-MM-DD)`).
2. Commit as `chore(release): 1.2.3` and push.
3. Tag and push: `git tag -a v1.2.3 -m "Freeleapp 1.2.3" && git push origin v1.2.3`.
4. Publishing is separate from tag pushes. For signed/notarized builds, manually dispatch the Release workflow with
   the existing tag. It publishes only `Freeleapp-<version>-arm64.dmg`; local development releases must explicitly
   disclose ad-hoc signing and lack of notarization in their release notes.

The Release workflow checks that the tag, the app version and the changelog agree, builds the tagged source, and
publishes a GitHub Release with the DMG only. The release notes come from the changelog section. Automatic updates
remain disabled in this security fork; no update-feed assets or upstream Homebrew tap changes are published.
