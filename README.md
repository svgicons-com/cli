# Svg/icons CLI

The Svg/icons CLI connects your terminal to [svgicons.com](https://svgicons.com), a growing search engine of 312K+ open-source SVG icons and icon sets for developer projects. It is designed for frontend developers, product engineers, and teams who want to find the right icon faster and move it into a real codebase without breaking their workflow.

With the CLI, you can search icons, inspect metadata, download SVG files, scan an existing project for icon needs, ask for icon recommendations from a UI brief, create Icon Collections, add icons to collections, queue framework-ready exports, build a local icon folder, and generate license/provenance reports.

Public icon search works without changing the default endpoint. Pro workflows require a Svg/icons Pro Plan API token, including raw SVG access, Icon Collections, exports, recommendations that create collections, and project synchronization. These features are built to speed up icon selection for both new interfaces and existing projects by keeping discovery, selection, export, and license checks in one repeatable developer workflow.

The scanner is read-only by default. It never edits project files unless a future command explicitly adds that behavior.

Current package version: `0.1.0`.

## Requirements

- Node.js 18.18 or newer
- A Svg/icons Pro API token for collection and export commands

Install the stable package:

```bash
npm install -g @svgicons-com/cli
```

## Login

```bash
svgicons login --token "YOUR_PRO_API_TOKEN"
```

The explicit auth namespace is also supported:

```bash
svgicons auth login --token "YOUR_PRO_API_TOKEN"
svgicons auth status
svgicons doctor
```

Pro API tokens may start with a numeric prefix and a pipe character, such as `10|...`. Keep the full token and wrap it in quotes when using a shell command.

You can also avoid writing a config file by setting `SVGICONS_TOKEN` or `SVGICONS_API_TOKEN`.

Inspect local config without exposing the stored token:

```bash
svgicons config list
svgicons config get baseUrl
svgicons config set baseUrl https://svgicons.com
```

## Commands

```bash
svgicons version
svgicons auth login --token "YOUR_PRO_API_TOKEN"
svgicons auth status --json
svgicons config list --json
svgicons doctor --json
svgicons check ./generated-icons --strict
svgicons search "arrow left" --limit 10
svgicons search "arrow left" --anonymous
svgicons recommend "billing settings dashboard" --limit 12
svgicons recommend "billing settings dashboard" --create-collection --collection-name "Billing icons"
svgicons pick "settings gear" --download --output ./icons
svgicons pick "credit card" --add "Billing icons"
svgicons pick "settings gear" --interactive
svgicons icon show 33716
svgicons icon url 33716-arrow-circle-up-fill
svgicons icon raw 33716-arrow-circle-up-fill
svgicons icon download 33716-arrow-circle-up-fill --output ./icons
svgicons icon png 33716-arrow-circle-up-fill --size 512 --output ./icons
svgicons collection list
svgicons collection create --name "Dashboard icons" --description "Navigation and status icons"
svgicons collection show "Dashboard icons" --icons
svgicons collection rename "Dashboard icons" --name "Billing icons"
svgicons collection update "Billing icons" --framework vue --color-policy preserve
svgicons collection add "Dashboard icons" 33716 240297
svgicons collection remove "Dashboard icons" 33716-arrow-circle-up-fill
svgicons collection delete "Dashboard icons" --yes
svgicons collection export "Dashboard icons" --formats react-ts,vue --color-policy currentColor --output ./exports
svgicons collection export "Dashboard icons" --formats svelte --output ./exports
svgicons collection export "Dashboard icons" --formats solid --output ./exports
svgicons collection export "Dashboard icons" --formats blade --output ./exports
svgicons collection export "Dashboard icons" --formats storybook --output ./exports
svgicons collection export "Dashboard icons" --formats npm-package --package-name svgicons-dashboard-icons --output ./exports
svgicons collection export "Dashboard icons" --formats png-pack --png-sizes 24,48,512 --output ./exports
svgicons collection export "Dashboard icons" --formats iconify-json --output ./exports
svgicons collection export "Dashboard icons" --formats react-ts --no-size-props --no-typescript --output ./exports
svgicons collection export "Dashboard icons" --formats react-ts,solid --default-size 20 --component-suffix Glyph --no-decorative --output ./exports
svgicons export status 55 --collection "Dashboard icons"
svgicons export download 55 --collection "Dashboard icons" --output ./exports
svgicons init --collection "Dashboard icons" --output ./src/icons
svgicons sync
svgicons build --ci
svgicons update --check
svgicons license check --allow MIT,Apache-2.0,ISC --fail
svgicons license export --format markdown --output THIRD_PARTY_ICONS.md
svgicons scan .
svgicons scan . --write-manifest
```

Use `--json` on commands when integrating with scripts.

## Release status

This package is a stable `0.1.x` release. It is intended for real projects, while still being pre-`1.0.0`; command names and JSON response shapes may receive compatible refinements before `1.0.0`.

See `RELEASE_NOTES.md` for included workflows, safety notes, and known limitations.

Maintainers should use `../docs/svgicons-cli-npm-publishing.md` before publishing a new npm version.

## License and service access

The Svg/icons CLI source code is licensed under the MIT License. See `LICENSE`.

Some commands require access to hosted svgicons.com Pro APIs. API tokens, usage limits, subscriptions, icon metadata, generated export services, and other hosted services are governed by the Svg/icons terms of service and are not granted by the MIT License.

Third-party icon sets keep their own licenses. Review icon license metadata before shipping icons in a product.

## Development

```bash
npm install
npm test
node bin/svgicons.js --help
```

See `CONTRIBUTING.md` before opening a pull request and `SECURITY.md` for responsible vulnerability reporting.

## Local project checks

```bash
svgicons check
svgicons check ./generated-icons --strict
svgicons check ./generated-icons --json
```

`check` validates the target directory, parses `package.json` when present, detects likely Svg/icons generated artifacts, validates `icons.manifest.json` and `license-manifest.json`, and checks simple `src/icons/index.ts` export lines for missing local component files. It does not call svgicons.com, require authentication, run build tools, or modify files.

## Download one icon

Download a single SVG file to the current folder:

```bash
svgicons icon download 33716-arrow-circle-up-fill
```

Download to a folder:

```bash
svgicons icon download 33716-arrow-circle-up-fill --output ./icons
```

Download to a specific file:

```bash
svgicons icon download 33716-arrow-circle-up-fill --output ./icons/arrow-up.svg
```

The icon reference must include both the numeric ID and the icon name, such as `33716-arrow-circle-up-fill`. The CLI checks the returned icon metadata before writing the file. This makes sequential ID-only download scripts less useful.

This command uses the MCP `get_icon` tool with raw SVG output, so the token needs `mcp:use` and `icons:read`. Existing files are not overwritten unless you add `--force`.

Export a Pro PNG asset from a single icon:

```bash
svgicons icon png 33716-arrow-circle-up-fill --size 512 --output ./icons
svgicons icon png 33716-arrow-circle-up-fill --sizes 128,256,512 --density 1,2 --zip --output ./icons
svgicons icon png 33716-arrow-circle-up-fill --size 512 --color black --background solid --background-color "#ffffff"
```

Single-icon PNG export uses the Pro REST API, not the public anonymous search API. The token needs `icons:read` and `exports:create`. The icon reference must include both ID and name, and the server verifies that the name matches before rendering.

Read-only icon commands accept a numeric ID, an `id-name` reference, or a full svgicons.com icon URL:

```bash
svgicons icon show 33716
svgicons icon url 33716-arrow-circle-up-fill
svgicons icon raw https://svgicons.com/icon/33716/arrow-circle-up-fill
```

## Recommend and pick icons

Ask Svg/icons for icon candidates based on a UI brief:

```bash
svgicons recommend "billing settings dashboard with invoices, payment methods, and security"
```

`recommend` uses the hosted MCP `recommend_icons_for_ui` tool. It returns metadata by default, so it can work without writing files. Add `--json` for automation.

Create a Pro Icon Collection directly from a recommendation:

```bash
svgicons recommend "billing settings dashboard" --create-collection --collection-name "Billing icons"
```

This uses the MCP `generate_icon_kit_for_project` tool and requires a Pro token with `mcp:use` and `collections:write`.

For deterministic scripts, `pick` selects the first search result:

```bash
svgicons pick "settings gear"
svgicons pick "settings gear" --download --output ./icons
svgicons pick "credit card" --add "Billing icons"
```

Use `--download` when you want the selected SVG written locally. Use `--add <collection>` when you want the selected icon added to an Icon Collection.

For manual terminal selection, opt in to the interactive picker:

```bash
svgicons pick "settings gear" --interactive
svgicons pick "settings gear" --interactive --download --output ./icons
```

`--interactive` requires a real terminal and is rejected in CI/non-interactive shells. Omit it for deterministic scripts.

## Export and download a collection ZIP

Queue an export, wait for the background job to finish, and download the ZIP:

```bash
svgicons collection export "Dashboard icons" --formats react-ts,vue --output ./exports
```

The command polls every 2 seconds for up to 180 seconds by default. Use `--timeout 300` for larger collections, or `--no-wait` if you only want to queue the export and manually download it later.

Supported export flags:

```bash
--formats react-ts,vue,svelte,solid,blade,storybook,npm-package,png-pack,iconify-json
--color-policy currentColor|preserve|strip
--naming-policy kebab|pascal|camel
--size-props / --no-size-props
--typescript / --no-typescript
--default-size 24
--title-prop / --no-title-prop
--decorative / --no-decorative
--component-suffix Icon
--package-name svgicons-dashboard-icons
--package-version 0.1.0
--png-sizes 24,48,512
--png-densities 1,2
--png-background transparent|solid
--png-background-color "#ffffff"
--png-color preserve|black|white|custom
--png-icon-color "#2563eb"
--png-padding 48
```

Use `--formats png` as a shorthand for `--formats png-pack`. PNG pack exports are generated by the server queue worker and downloaded as part of the collection ZIP. Use `--formats svelte` to include Svelte components, `--formats solid` to include Solid components, `--formats blade` to include Laravel Blade components, `--formats storybook` to include a React Storybook gallery, `--formats npm-package` to include a React TypeScript package scaffold, or `--formats iconify-json` to include an Iconify-compatible `iconify.json` file in the collection ZIP.

Collection commands accept a numeric ID, exact slug, or exact case-insensitive collection name. The legacy `kit` alias remains available for old scripts.

Lifecycle commands are available for collection maintenance:

```bash
svgicons collection show "Dashboard icons" --icons
svgicons collection update "Dashboard icons" --description "Core product UI icons"
svgicons collection rename "Dashboard icons" --name "Billing icons"
svgicons collection remove "Billing icons" 33716-arrow-circle-up-fill
svgicons collection delete "Billing icons" --yes
```

`collection delete` prompts for confirmation in an interactive shell. Use `--yes` in CI or scripts.

If you queued an export with `--no-wait`, check and download it later:

```bash
svgicons export status 55 --collection "Dashboard icons"
svgicons export download 55 --collection "Dashboard icons" --output ./exports
```

## Local project manifest and lockfile

Initialize a local project:

```bash
svgicons init --collection "Dashboard icons" --output ./src/icons
```

This creates `svgicons.json`. The manifest can reference individual icon IDs or Icon Collections:

```json
{
  "version": 1,
  "format": "svg",
  "output": "./src/icons",
  "icons": [{ "ref": "33716-arrow-circle-up-fill" }],
  "collections": [{ "ref": "Dashboard icons" }]
}
```

Sync the manifest into a deterministic lockfile:

```bash
svgicons sync
```

This writes `svgicons.lock` with icon SVG markup, source icon set metadata, license data, and SVG hashes. Build local SVG files from the lockfile:

```bash
svgicons build --ci
```

`build` uses only `svgicons.lock`, so CI builds do not depend on live API responses. Re-running `build` writes stable SVG files with stable names.

Check whether locked icons changed upstream:

```bash
svgicons update --check
```

## License audit

Check local icon licenses from `svgicons.lock`:

```bash
svgicons license check --allow MIT,Apache-2.0,ISC,CC0-1.0 --fail
```

Use `--deny` for forbidden licenses:

```bash
svgicons license check --deny GPL,CC-BY-NC-SA-4.0 --fail
```

Export a license summary for your repository:

```bash
svgicons license export --format markdown --output THIRD_PARTY_ICONS.md
svgicons license export --format json --output third-party-icons.json
svgicons license export --format csv --output third-party-icons.csv
```

## Scanner

The scanner reads common frontend files, detects UI concepts such as dashboard, search, billing, upload, auth, and settings, and reports a proposed Icon Collection. It also detects existing `svgicons.com/icon/{id}/{name}` links, generated SVG imports, and inline SVG blocks.

```bash
svgicons scan ./src --max-files 300
```

To update a local `svgicons.json` manifest from detected icon refs, opt in explicitly:

```bash
svgicons scan . --write-manifest
```

To create a collection from existing icon URLs found in the scan, opt in explicitly:

```bash
svgicons scan . --create-collection
```
