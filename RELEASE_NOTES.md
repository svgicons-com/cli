# Svg/icons CLI 0.1.1

This patch release updates the npm package metadata for the public GitHub repository.

## New in 0.1.1

- Adds npm package metadata for the public GitHub repository, issues page, homepage, and package keywords.
- Keeps the CLI source code under the MIT License.
- Keeps command behavior unchanged from `0.1.0`.

## 0.1.0

This is the first stable pre-1.0 release of the Svg/icons CLI on npm. It removes prerelease package wording while keeping the current command surface compatible with the earlier preview series.

### New in 0.1.0

- Promotes the package to stable version `0.1.0`.
- Licenses the CLI source code under MIT while keeping hosted Pro API access governed by Svg/icons account terms.
- Updates package metadata, help text, README, and documentation for the stable install command.
- Includes the local read-only `svgicons check` command for generated artifact checks.
- Keeps current Pro workflows for search, recommendations, Icon Collections, exports, project sync/build, PNG export, and license checks.
- Keeps the same no-runtime-dependency CLI package shape.

### Included Workflows

- Token login/logout plus `auth status`, known scopes, config inspection, and `doctor`.
- Public icon search through the hosted MCP endpoint, with authenticated search when a token is configured.
- Icon metadata, URL, raw SVG, browser open, strict `id-name` SVG download, and single-icon PNG export.
- Icon Collection list, create, show, rename, update, add, remove, delete, export, status, and ZIP download.
- Collection exports for `svg-folder`, `svg-sprite`, `json-manifest`, `license-manifest`, `react-ts`, `vue`, `svelte`, `solid`, `blade`, `storybook`, `npm-package`, `png-pack`, and `iconify-json`.
- Framework export options such as `--default-size`, `--component-suffix`, `--title-prop`, `--no-title-prop`, `--decorative`, and `--no-decorative`.
- npm package scaffold metadata options: `--package-name` and `--package-version`.
- Local `svgicons.json` manifest, deterministic `svgicons.lock`, SVG build output, update checks, and license audits.
- Local read-only `svgicons check` for generated artifact sanity checks.
- Project scanner that detects UI concepts, svgicons.com URLs, generated SVG imports, and inline SVG blocks.
- `recommend` for UI-brief icon recommendations and Pro generated collections.
- `pick` for deterministic first-result selection, plus opt-in interactive terminal selection.
- Backward-compatible `kit` alias for collection commands.

### Safety Notes

- The scanner is read-only by default. It writes only when `--write-manifest` or `--create-collection` is used.
- `svgicons check` is read-only, does not call svgicons.com, does not require authentication, and does not run build tools.
- Destructive collection deletion requires confirmation or `--yes`.
- `--interactive` is rejected in CI/non-interactive shells.
- Tokens and authorization headers are redacted from config and diagnostic output.
- SVG download remains strict: the reference must include both icon ID and name.

### Known Limitations

- This is a stable `0.1.x` release, not `1.0.0`; command names and JSON response shapes may receive compatible refinements before `1.0.0`.
- The interactive picker is intentionally simple and terminal-only.
- Search and recommendation quality depend on the current MCP metadata search implementation.
- Local `build` currently writes SVG files. Framework component ZIPs are produced through collection exports.
- Live Pro workflows require an active Pro account, verified email, and API token scopes matching the command.
- The MIT license covers the CLI package code only. It does not grant free access to hosted Pro APIs, API tokens, subscriptions, generated export services, or third-party icon set licenses.

## Earlier Preview Builds

Earlier preview builds prepared the Pro Plan workflows, PNG export commands, extended collection export formats, package scaffold options, token setup safety, and public npm documentation that became part of the stable `0.1.0` release.

## Verification Checklist

Before publishing, run:

```bash
npm --prefix cli test
cd cli
npm pack --dry-run
```

When backend changes are also included, run the relevant Laravel tests for Pro API tokens, MCP, Icon Collections, and collection exports.
