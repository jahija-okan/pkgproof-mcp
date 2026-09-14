# Privacy Policy

Applies to the `@pkgproof/mcp` server, the Claude Code plugin, and the desktop
extension built from this repository. Last updated 2026-09-09.

## What the server sends

One HTTPS POST per `verify_package` call, to `x402.pkgproof.net` or
`x402-algo.pkgproof.net`. Its body carries exactly three fields:

- `ecosystem` — always `npm` today.
- `name` — the package name you asked about.
- `version` — the version you asked about, when you supplied one.

Nothing else is added to the body. As with any HTTPS request, network metadata
(your IP address, the TLS handshake) reaches the service.

Past the daily free verification, a paid call also carries an x402 payment
header: a signature over the payment terms, and the payer address it was signed
with.

## What the server does not send

No account, no telemetry, no analytics, no crash reporting, no conversation
content, no file contents, no directory listings. The server has one tool and it
transmits only the package identifier described above.

## Wallet keys

`PKGPROOF_ALGORAND_PRIVATE_KEY` and `PKGPROOF_BASE_PRIVATE_KEY` are read from the
environment, held in memory for the life of the process, and used only to sign
payment authorisations locally. Neither key is transmitted, logged, or written to
disk by this server.

The desktop extension stores them through the host application's secret storage
(`sensitive: true` in `manifest.json`). Configured any other way — an MCP client
JSON file, a shell profile — they sit in plain text in that file, which is not an
encrypted store.

## Payments are public

x402 payments settle on Algorand Mainnet and Base. A settled payment is a public
blockchain record: payer address, amount, and timestamp are permanent and
world-readable, and they link that address to the fact that a verification was
purchased. They do not record which package was verified.

## Third parties

- **pkgproof.net** — receives and answers the verification requests.
- **The x402 facilitators** — receive the payment authorisation and broadcast the
  settling transaction.
- **The npm registry** — receives a request for the package itself when the
  server is launched with `npx`, which is npm's normal install traffic, not
  something this server reports.

Verification requests are processed by the pkgproof service. Retention of
service-side request logs is set by the service operator; ask through the issue
tracker below.

## Contact

Privacy and security questions: <https://github.com/jahija-okan/pkgproof-mcp/issues>
