# Distribution

State as of 2026-09-09. Working notes for publishing this server everywhere it
can be published. Nothing here is committed yet.

## Already live

- **npm** — `@pkgproof/mcp`, trusted publishing, provenance attestation per tag.
- **Official MCP Registry** — `net.pkgproof/pkgproof`, DNS-authenticated, 0.1.4
  serving as latest. Aggregators (Smithery, PulseMCP, Docker Hub, GitHub,
  Anthropic) scrape this on their own schedule.

## What was added to the repo

**New files**

- `.claude-plugin/plugin.json` — Claude Code plugin. Declares the MCP server
  inline: `npx -y @pkgproof/mcp@<version>`, pinned.
- `.claude-plugin/marketplace.json` — the repo is its own plugin marketplace, so
  users can install without waiting on Anthropic approval.
- `mcpb/manifest.json` — Claude Desktop bundle manifest. Both wallet keys are
  declared `sensitive: true`, so the host stores them in the OS secret store
  rather than a plaintext config file.
- `scripts/build-mcpb.js` — stages `dist/` beside a production-only dependency
  tree, packs the `.mcpb`, then runs `mcpb clean`. Wired up as `npm run mcpb`.
- `Dockerfile` + `.dockerignore` — multi-stage, node:22-alpine, non-root, built
  from committed source rather than the npm tarball.
- `glama.json` — Glama ownership claim.
- `PRIVACY.md` — written from what `src/api.ts` actually sends. Required by
  Anthropic review; a missing or incomplete one is an immediate rejection.
- `.prettierignore`

**Modified**

- `scripts/sync-version.js` — was syncing 2 files, now 4: adds
  `.claude-plugin/plugin.json` (version and the pinned npx spec) and
  `mcpb/manifest.json`.
- `.github/workflows/publish.yml` — new `bundle` job. On a tag it builds the
  `.mcpb`, creates the GitHub release if absent, and uploads the bundle.
- `README.md` — added "Claude Code", "Claude Desktop", "Privacy Policy".
- `eslint.config.js`, `.gitignore`, `package.json` — ignore the bundle build
  output, add the `mcpb` script.

**Verified, not assumed**

- `claude plugin validate . --strict` passes for both manifests.
- `mcpb validate` passes. The bundle packs to 14.8 MB; `mcpb clean` strips
  3.9 MB of transitive dev dependencies.
- Real stdio handshake against the staged bundle: `initialize` and `tools/list`
  return `verify_package`.
- `docker build` succeeds and the container answers the same handshake. Image is
  416 MB, dominated by viem; bundling with esbuild would cut it.
- `npm run lint` exits 0, `npm test` passes 29/29.

## Manual steps

### Before anything

1. Fill in server-side log retention in `PRIVACY.md`. It is deliberately left
   unstated — what pkgproof.net keeps is not verifiable from this repo, and
   reviewers check this section.
2. Optional but better: host that text at `https://pkgproof.net/privacy`
   (currently 404), then swap the URL in `mcpb/manifest.json` and the README.
3. Make a 400x400 PNG logo. Cline requires one. Add it to the repo and reference
   it from `mcpb/manifest.json` as `"icon"`.
4. Review the diff, commit, push.

### Cut a release

5. `npm version patch` — syncs all four version-bearing files — then push the
   tag. The `bundle` job produces the `.mcpb` that every downstream step needs;
   until that tag exists there is no downloadable bundle.
6. Confirm the release page carries `pkgproof-<version>.mcpb`.

### Submit

7. **Claude plugin directory** — <https://platform.claude.com/plugins/submit>,
   paste the repo URL. A Console account is enough; no Team plan needed. After
   approval, pushes to GitHub auto-mirror, so releases need no re-submission.
8. **Claude Desktop** — <https://clau.de/desktop-extention-submission>, upload
   the released `.mcpb`.
9. **Smithery** — `npx smithery mcp publish ./mcpb/pkgproof-<v>.mcpb -n <org>/pkgproof`.
   Needs a Smithery account first. `smithery.yaml` is the legacy path; local
   servers are distributed as MCPB now, so the bundle covers it.
10. **Glama** — nothing to do. It claims automatically once `glama.json` is on
    `main`.
11. **Docker catalog** — fork `docker/mcp-registry`. Copy the drafted
    `server.yaml` (below) to `servers/pkgproof/server.yaml` and replace
    `source.commit` with the tagged SHA. Run `task validate -- --name pkgproof`
    and `task build -- --tools pkgproof`, then open a PR with their template.
12. **Cline** — issue on `cline/mcp-marketplace`: repo URL, the 400x400 PNG, why
    it belongs there, and confirmation that Cline installed it from the README
    alone. Their criteria single out cryptocurrency servers for extra scrutiny,
    so expect questions about the wallet keys.
13. **Long tail** — PulseMCP submit form, mcp.so, cursor.directory.

### Verify after

14. `/plugin marketplace add jahija-okan/pkgproof-mcp` then
    `/plugin install pkgproof@pkgproof` in a throwaway Claude Code session.
15. Install the `.mcpb` in Claude Desktop, set a wallet key, and confirm it lands
    in the keychain and that the server answers.

## Out of reach

The Claude Connectors Directory takes remote HTTPS servers only (streamable HTTP
or SSE); stdio servers go to the desktop-extension or plugin paths instead. Same
for ChatGPT connectors. Both would need a hosted MCP endpoint that does not exist
today.

## Drafted Docker registry entry

Goes in the `docker/mcp-registry` fork as `servers/pkgproof/server.yaml`:

```yaml
name: pkgproof
image: mcp/pkgproof
type: server
meta:
  category: security
  tags:
    - security
    - npm
    - supply-chain
about:
  title: pkgproof
  description: Verify an npm package before you install it. One tool, verify_package, runs eight checks covering advisories, install scripts, typosquat and combosquat names, scope, repository provenance and maintainer reputation, and answers safe, caution, block or does_not_exist with every reason labelled as fact or heuristic against its source. The first verification each day is free; later calls cost $0.05 in USDC over x402 and only when a wallet is configured.
  icon: https://www.google.com/s2/favicons?domain=pkgproof.net&sz=64
source:
  project: https://github.com/jahija-okan/pkgproof-mcp
  branch: main
  commit: REPLACE_WITH_TAGGED_COMMIT_SHA
config:
  description: Optional throwaway wallet keys. Every caller gets one free verification per day with neither set.
  secrets:
    - name: pkgproof.algorand_private_key
      env: PKGPROOF_ALGORAND_PRIVATE_KEY
      example: BASE64_ALGORAND_ACCOUNT_KEY
    - name: pkgproof.base_private_key
      env: PKGPROOF_BASE_PRIVATE_KEY
      example: "0xYOUR_BASE_PRIVATE_KEY"
```

## Sources

- <https://claude.com/docs/plugins/submit>
- <https://code.claude.com/docs/en/plugin-marketplaces>
- <https://github.com/modelcontextprotocol/mcpb>
- <https://claude.com/docs/connectors/building/submission>
- <https://github.com/docker/mcp-registry/blob/main/docs/configuration.md>
- <https://github.com/cline/mcp-marketplace>
- <https://modelcontextprotocol.io/registry/registry-aggregators>
