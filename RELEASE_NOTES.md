# Svg/icons CLI 0.1.0

This is the first stable pre-1.0 release of the Svg/icons CLI on npm. It removes the alpha package wording while keeping the current command surface compatible with the alpha series.

## New in 0.1.0

- Promotes the package from `0.1.0-alpha.5` to `0.1.0`.
- Licenses the CLI source code under MIT while keeping hosted Pro API access governed by Svg/icons account terms.
- Updates package metadata, help text, README, and documentation for the stable install command.
- Includes the local read-only `svgicons check` command for generated artifact checks.
- Keeps current Pro workflows for search, recommendations, Icon Collections, exports, project sync/build, PNG export, and license checks.
- Keeps the same no-runtime-dependency CLI package shape.

## Included Workflows

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

## Safety Notes

- The scanner is read-only by default. It writes only when `--write-manifest` or `--create-collection` is used.
- `svgicons check` is read-only, does not call svgicons.com, does not require authentication, and does not run build tools.
- Destructive collection deletion requires confirmation or `--yes`.
- `--interactive` is rejected in CI/non-interactive shells.
- Tokens and authorization headers are redacted from config and diagnostic output.
- SVG download remains strict: the reference must include both icon ID and name.

## Known Limitations

- This is a stable `0.1.x` release, not `1.0.0`; command names and JSON response shapes may receive compatible refinements before `1.0.0`.
- The interactive picker is intentionally simple and terminal-only.
- Search and recommendation quality depend on the current MCP metadata search implementation.
- Local `build` currently writes SVG files. Framework component ZIPs are produced through collection exports.
- Live Pro workflows require an active Pro account, verified email, and API token scopes matching the command.
- The MIT license covers the CLI package code only. It does not grant free access to hosted Pro APIs, API tokens, subscriptions, generated export services, or third-party icon set licenses.

## Previous Alpha Releases

### 0.1.0-alpha.5

- Version bump for npm alpha publication after `0.1.0-alpha.4`.
- No runtime command changes from `0.1.0-alpha.4`.
- Kept the package README and release notes aligned with the current CLI export surface.

### 0.1.0-alpha.4

- Added single-icon PNG export with `svgicons icon png`, including PNG and ZIP variant downloads.
- Added collection PNG pack export with size, density, background, color, padding, and fit options.
- Added collection export format support for `svelte`, `solid`, `blade`, `storybook`, `npm-package`, and `iconify-json`.
- Added `png` as a shorthand for the `png-pack` collection export format.
- Added safe framework export options: `--default-size`, `--component-suffix`, `--title-prop`, `--no-title-prop`, `--decorative`, and `--no-decorative`.
- Added npm package export metadata options: `--package-name` and `--package-version`.
- Added `svgicons export download <export-id> --collection <collection>` for downloading queued collection export ZIPs.
- Updated CLI docs and tests for the newer Pro API export formats.

### 0.1.0-alpha.3

- Improved token setup safety. `login` rejects obviously truncated numeric tokens, which commonly happens when a shell command is run without quoting a Sanctum-style token containing `|`.

### 0.1.0-alpha.2

- Removed local-development wording from the public npm README. Runtime behavior was unchanged from `0.1.0-alpha.1`.

### 0.1.0-alpha.1

- Prepared the CLI for real Pro Plan workflows against the svgicons.com Laravel backend.

## Verification Checklist

Before publishing, run:

```bash
npm --prefix cli test
cd cli
npm pack --dry-run
```

When backend changes are also included, run the relevant Laravel tests for Pro API tokens, MCP, Icon Collections, and collection exports.
