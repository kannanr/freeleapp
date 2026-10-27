# Runtime and dependency modernization

## Baseline

The audited hardening work is preserved in local commit `f9d54a3e`. This upgrade is a separate change on the same
checkout and branch; nothing has been pushed. Build/test success is a compatibility signal, not production-security
approval or proof that native authentication flows work.

## Target versions and compatibility decisions

Versions were checked against official Node/Electron releases and the npm registry on 2026-10-27.

| Area | Target | Reason |
| --- | --- | --- |
| Development/CI Node | 26.12.1 | Latest stable Node 26 release; official arm64 binary and published SHA-256 used for verification. |
| Angular framework | 22.2.3 | Latest stable supported Angular, replacing unsupported Angular 15. |
| Angular CLI/build/Material/CDK | 22.2.4 | Current compatible tooling/components for Angular 22. |
| TypeScript | 6.0.3 | Latest 6.0 patch. Angular 22 requires `>=6.0 <6.1`; TypeScript 7 is deliberately not forced. |
| Electron | 45.0.0 | Current stable release; bundles Node 24.22.0, independently of the development Node version. |
| RxJS / Zone.js | 7.8.2 / 0.16.3 | Supported by Angular 22; existing zone-based rendering explicitly retained. |
| AWS service clients | 3.1157.0 | Current stable SDK v3 service clients, with compatible Smithy/types packages. |
| MSAL Node | 7.1.1 | Current stable release; serialized cache types now imported through its public entrypoint. |
| UUID | 11.1.1 | Latest compatible CommonJS-capable line; UUID 14 is ESM-only and is not blindly substituted. |
| Lint / tests | ESLint 10.13.0, Jest 30.5.2, Jasmine 6.3 | Jasmine 7's read-only environment breaks Zone.js patching; retain the compatible 6.x line. |

Not every package can or should move to its latest major in one step. CommonJS/native adapters, CLI cache format
compatibility and the shipped dependency tree still need review. Exact retained versions and advisory results belong
in the final verification section below; no peer-dependency override is permission to claim compatibility.

## Source adaptations

- Keep NgModule-declared components/pipes explicitly `standalone: false` after Angular's standalone-default change.
- Remove obsolete `entryComponents`; use supported Material imports in place of removed legacy modules.
- Preserve Zone.js change detection with `provideZoneChangeDetection()` rather than accidentally enabling zoneless mode.
- Remove unused `ngx-toastr`/`ngx-json-viewer` registration and dependencies: the app's notifications already use its
  existing Material snackbar, and there is no JSON-viewer template usage.
- Modernize TypeScript resolution for package exports and Electron/CommonJS output; retain compatible class-field semantics.
- Remove unused translation registration/extraction/ng-packagr tools; migrate ESLint configuration and Husky commands.
- Remove the unused native unzip hook and direct runtime `extract-zip` dependency, plus the unused HTTP translation
  backend. The same vulnerable archive dependency can still appear in development-only Electron packaging tools.
- Override only Gushio's Glob dependency to the compatible 10.5.0 security patch; do not force unrelated latest majors.
- Keep TypeScript's previous non-strict checking explicitly: TypeScript 6 changes that default; a separate strictness
  migration must not be confused with this compatibility upgrade.
- Update Material CSS selectors for MDC without changing the existing palette/spacing, fix dropdown position values,
  and retain authored tab icon/label classes. Native visual validation is still required.
- Modernize removed Jest/Angular testing aliases and repair incomplete mocks exposed by RxJS 7's error reporting;
  preserve zone-based test behavior and test the supported standalone ng-select through imports.
- Locate bundled changelog files through the Electron application path, not Webpack's former `__dirname` shim.
- Repair a real untracked integration-highlight subscription and verify that destroyed views stop receiving highlights.
- Keep all prior hardening controls, including disabled auto-updates, fork-owned release destinations and restrictive CSP.

## Verification

Verified on Apple Silicon using Node 26.12.1 after regenerating all three dependency trees and performing clean
`npm ci --ignore-scripts` installs. No `--force` or `--legacy-peer-deps` flags were used.

| Gate | Result |
| --- | --- |
| Core build | Passed |
| Core Jest tests | 67 suites / 684 passed |
| Desktop ChromeHeadless tests | 81 passed |
| Security regression suite | 19 passed |
| Production Angular build | Passed |
| Electron TypeScript check | Passed |
| Changed TypeScript lint | Zero errors; 64 warnings for inherited missing return/accessibility annotations |
| Changed HTML lint | Zero errors/warnings |
| Manifest/lock consistency and `git diff --check` | Passed |

Sass import deprecations, CommonJS/bundle-size warnings and shallow-fixture template diagnostics remain. The current
Webpack/Karma builder is supported but deprecated; moving this Node-enabled renderer to a different bundler is a
separate compatibility exercise, not a reason to silently drop its Node/asset behavior.

### Advisory counts after the upgrade

`npm audit --package-lock-only --ignore-scripts --json`, checked 2026-10-27:

| Tree | Low | Moderate | High | Critical | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Root tooling | 1 | 2 | 0 | 0 | 3 |
| Core | 3 | 2 | 0 | 0 | 5 |
| Desktop full tree | 5 | 2 | 1 | 0 | 8 |
| Desktop `--omit=dev` approximation | 2 | 0 | 0 | 0 | 2 |

The remaining high finding is Vite's Windows `launch-editor` command-escaping advisory in development tooling.
The direct runtime archive extractor was unused and removed; counts do not prove the exact packaged SBOM or absence
of exploitation. Review the built artifact before relying on development/runtime classifications.

Native packaged UI, Material styling, IdP authentication and signing/notarization are **not verified** and need
independent smoke testing before production use. The privileged renderer and other open audit findings still prevent
production-security approval. The system-wide Node installation was not modified; `.nvmrc` pins the project/CI runtime.
