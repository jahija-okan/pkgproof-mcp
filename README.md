# pkgproof-mcp

An MCP server that verifies an npm package before you install it.

One tool, `verify_package`. It runs eight checks against
[pkgproof.net](https://pkgproof.net) covering advisories, install scripts,
typosquat and combosquat names, scope, repository provenance and maintainer
reputation, and answers `safe`, `caution`, `block` or `does_not_exist` with every
reason labelled as fact or heuristic against its source.

**The first verification each day is free and needs no configuration at all.** No
account, no key, no signup. Later calls the same day cost $0.05 in USDC, paid per
call over [x402](https://x402.org), and only if you configure a wallet.

## Install

Nothing to install or host: your MCP client runs the server itself. Needs Node 22
or newer.

Every release from 0.1.1 on is built and signed by CI and carries an npm
[provenance attestation](https://docs.npmjs.com/generating-provenance-statements)
tying the tarball to the commit and workflow run that produced it. A tool that
reports on other packages' provenance should be checkable the same way:

```sh
npm audit signatures
```

The server is also listed in the [MCP Registry](https://registry.modelcontextprotocol.io)
as `net.pkgproof/pkgproof`.

## Free, no key

Add this to your MCP client configuration and you are done:

```json
{
	"mcpServers": {
		"pkgproof": {
			"command": "npx",
			"args": ["-y", "@pkgproof/mcp"]
		}
	}
}
```

## The tool

`verify_package`, and nothing else. One call is one verification, so the daily
allowance means the same thing here as it does over HTTP.

| Argument    | Required | Meaning                                                            |
| ----------- | -------- | ------------------------------------------------------------------ |
| `name`      | yes      | Package name, scoped or not: `left-pad`, `@scope/thing`.           |
| `version`   | no       | Exact version. Omit to verify the package rather than one release. |
| `ecosystem` | no       | Defaults to `npm`, the only ecosystem this service covers.         |

It answers twice over: a summary the agent reads, and the service's own JSON
alongside it in `structuredContent`, under a declared output schema, carrying the
verdict, every reason with its source, and the time the verdict was computed.

Calls run one at a time. The service allows one verification in flight per payer
and refuses the second, so an agent walking a dependency list is queued here
rather than failed.

## Two networks

pkgproof settles on two chains, each on its own endpoint. They are not
interchangeable: they take different key formats, and only one of them has a free
tier.

|                         | Algorand Mainnet                                        | Base                                |
| ----------------------- | ------------------------------------------------------- | ----------------------------------- |
| Endpoint                | `x402-algo.pkgproof.net`                                | `x402.pkgproof.net`                 |
| Network                 | `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=` | `eip155:8453`                       |
| Asset                   | USDC, ASA `31566704`                                    | USDC, `0x8335…2913`                 |
| Price                   | $0.05 per verification                                  | $0.05 per verification              |
| Free tier               | no, every call is paid                                  | yes, one verdict per caller per day |
| Key variable            | `PKGPROOF_ALGORAND_PRIVATE_KEY`                         | `PKGPROOF_BASE_PRIVATE_KEY`         |
| Key format              | base64 account key                                      | `0x`-prefixed EVM key               |
| Network fee per payment | none, sponsored                                         | none, sponsored                     |
| One-time setup          | ~0.3 ALGO, and an opt-in to the asset                   | none, just send USDC                |

**How the server picks.** The free attempt always goes to Base, because it is the
only rail that answers an unpaid call. Payments prefer **Algorand**, and fall back
to Base only when no Algorand key is configured. So a wallet on either chain
works, and configuring neither still gets you a verdict a day.

## Paid, with a wallet

> [!WARNING]
> **Fund a throwaway wallet, never a main one.** The key is stored in plain text
> in your MCP client's configuration file, which is not an encrypted store, and
> anything able to read that file can spend the wallet. Put in what you are
> willing to spend on package verification and nothing more. There is
> deliberately no spend cap in this server, so the wallet's own balance is the
> only limit.

### Algorand (preferred)

**Verifications cost the account no ALGO.** The 402 names a fee payer, so the
facilitator covers the network fee on every payment and your ALGO balance does
not move.

**Setting the account up does cost ALGO, once.** An Algorand account cannot
receive an asset until it opts into it, so USDC sent to an account that has not
opted in will not arrive. Three steps, in this order:

1. Fund the throwaway account with about **0.3 ALGO**. Algorand locks 0.1 as the
   account's minimum balance, another 0.1 for as long as it holds USDC, and the
   opt-in transaction itself costs a fee.
2. **Opt into ASA `31566704`** (USDC on Mainnet). This is a zero-amount transfer
   from the account to itself; any Algorand wallet will do it.
3. Send USDC to the account.

The key is the base64 account key, **not** a 25-word mnemonic.

```json
{
	"mcpServers": {
		"pkgproof": {
			"command": "npx",
			"args": ["-y", "@pkgproof/mcp"],
			"env": {
				"PKGPROOF_ALGORAND_PRIVATE_KEY": "..."
			}
		}
	}
}
```

### Base

Send USDC on Base to the throwaway wallet's address. You do **not** need ETH:
payment is an off-chain signature and the facilitator pays the gas.

```json
{
	"mcpServers": {
		"pkgproof": {
			"command": "npx",
			"args": ["-y", "@pkgproof/mcp"],
			"env": {
				"PKGPROOF_BASE_PRIVATE_KEY": "0x..."
			}
		}
	}
}
```

The server always tries the free call first, so a configured wallet is only
charged once the day's free verification is used up.

## Configuration

| Variable                        | Required | Meaning                                                                                     |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `PKGPROOF_ALGORAND_PRIVATE_KEY` | no       | Throwaway Algorand account holding USDC on Mainnet, base64. Preferred for payment when set. |
| `PKGPROOF_BASE_PRIVATE_KEY`     | no       | Throwaway EVM wallet holding USDC on Base, `0x`-prefixed. Used when no Algorand key is set. |

With neither set, the server is free-tier only and says so once the day's
verification is spent.

## Development

```sh
npm install
npm test           # unit tests, and a real client handshake over an in-memory transport
npm run lint       # typecheck, formatting, eslint
npm run inspector  # build, then the MCP inspector against the local server
```

No test spends anything, and the suite enforces it rather than trusting it: a
test that reaches for the network fails, and the run refuses to start at all if a
wallet key is set in the environment. The payment path is exercised against a
fabricated 402 and a published test account, so an EIP-3009 authorisation is
signed locally and the payload and header are checked without a wallet.

## Links

- Service and docs: <https://pkgproof.net/docs>
- MCP Registry entry:
  <https://registry.modelcontextprotocol.io/v0/servers?search=pkgproof>
- OpenAPI, Base rail: <https://x402.pkgproof.net/openapi.json>
- OpenAPI, Algorand rail: <https://x402-algo.pkgproof.net/openapi.json>

## License

[Apache-2.0](LICENSE). If you distribute a modified version, section 4(b)
requires you to mark the files you changed: a fork of a security tool that still
carries this name should not be mistakable for this one.
