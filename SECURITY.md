# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security-sensitive reports.

Use the contact form at:

https://svgicons.com/contact

Include a concise description, reproduction steps, affected command or workflow, and whether any API token, exported artifact, or user data may be involved. Do not include real API tokens, bearer tokens, session cookies, or private SVG/customer data in the report.

## Security expectations

- The CLI must not print API tokens, authorization headers, session identifiers, or token hashes.
- The CLI must not store secrets in project files.
- Diagnostic output should redact sensitive fields.
- Commands that write files should avoid overwriting user files unless an explicit force option is used.
- Pro API commands must rely on the hosted API for authentication, authorization, scopes, and entitlement checks.

## Supported versions

Security fixes are handled on the latest published CLI version unless a separate support window is announced.
