#!/usr/bin/env node

/**
 * pkgproof MCP server.
 *
 * A local stdio server: the caller's own MCP client spawns this process, so
 * nothing here is hosted. It is a client of the live API at pkgproof.net, and the
 * only configuration it takes is an optional wallet key per payment rail.
 */

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { SERVER_NAME, SERVER_VERSION } from "./meta.js";
import { registerVerifyPackage } from "./tool.js";

function build(): McpServer {
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{ capabilities: { tools: {} } }
	);

	registerVerifyPackage(server);
	return server;
}

// One factory serves both protocol eras. stdout carries the JSON-RPC stream, so
// nothing else may ever be written to it; diagnostics go to stderr, which the
// client shows as server logs.
serveStdio(build, {
	onerror: (error) => {
		console.error("pkgproof-mcp:", error.message);
	},
});
