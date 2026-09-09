#!/usr/bin/env node

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

// stdout carries the JSON-RPC stream, so diagnostics must go to stderr.
serveStdio(build, {
	onerror: (error) => {
		console.error("pkgproof-mcp:", error.message);
	},
});
