# Contributing to the Svg/icons CLI

Thanks for helping improve the Svg/icons CLI.

## Development setup

Use Node.js 18.18 or newer.

```bash
npm install
npm test
node bin/svgicons.js --help
```

The CLI intentionally has no runtime dependencies. Keep new dependencies out unless they are clearly needed and small enough for a command-line package.

## Local testing

Run the full CLI test suite before opening a pull request:

```bash
npm test
```

When changing command output, keep human-readable text stable and keep `--json` output predictable for scripts.

## Tokens and Pro API access

Some commands require a Svg/icons Pro API token. Do not put real API tokens in issues, pull requests, fixtures, snapshots, logs, or test output.

Use environment variables or the CLI login command for local testing:

```bash
svgicons auth login --token "YOUR_PRO_API_TOKEN"
```

The CLI source code is MIT licensed, but hosted Pro APIs, API tokens, rate limits, subscriptions, generated export services, and icon metadata access are governed by the Svg/icons terms and the user's account plan.

## Pull request guidelines

- Keep changes focused.
- Preserve existing command aliases.
- Do not print secrets, authorization headers, or stored tokens.
- Add or update tests for command behavior.
- Update `README.md` when user-facing commands, options, or workflows change.
