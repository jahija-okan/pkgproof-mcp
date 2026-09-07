#!/usr/bin/env node

/**
 * pkgproof MCP server.
 *
 * A local stdio server: the caller's own MCP client spawns this process, so
 * nothing here is hosted. It is a client of the already-live API at
 * x402.pkgproof.net, and the only configuration it takes is an optional
 * PKGPROOF_PRIVATE_KEY for paying past the daily free verification.
 *
 * Phase 1 is the scaffold: server identity and transport only. The
 * verify_package tool and the payment path land in the phases after it.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { SERVER_NAME, SERVER_VERSION } from "./meta.js";

async function main(): Promise<void> {
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{ capabilities: { tools: {} } }
	);

	// registerVerifyPackage(server) goes here in phase 2.

	// stdout carries the JSON-RPC stream, so nothing else may ever be written to
	// it. Diagnostics go to stderr, which the client shows as server logs.
	await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
	console.error("pkgproof-mcp failed to start:", error);
	process.exit(1);
});
