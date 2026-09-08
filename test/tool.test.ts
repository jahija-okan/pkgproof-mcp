import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SERVER_NAME, SERVER_VERSION } from "../src/meta.js";
import { registerVerifyPackage } from "../src/tool.js";

/** Captured from a live verification. A reason's `source` is drawn from a
 *  different vocabulary than the `sources` keys: sometimes an upstream
 *  (`npm_registry`, `osv.dev`), sometimes the check that produced it. */
const VERDICT = {
	ecosystem: "npm",
	name: "left-pad",
	version: null,
	verdict: "safe",
	reasons: [
		{
			verdict: "safe",
			code: "source_repository_present",
			kind: "fact",
			source: "repository_provenance",
			detail:
				"'left-pad' declares a source repository (git+ssh://git@github.com/stevemao/left-pad.git). The declaration is unverified: pkgproof does not confirm the repository exists or that it publishes this package.",
			data: {
				name: "left-pad",
				repository: "git+ssh://git@github.com/stevemao/left-pad.git",
				owner: "stevemao",
				repo: "left-pad",
				verified: false,
			},
		},
		{
			verdict: "safe",
			code: "no_combosquat_match",
			kind: "heuristic",
			source: "combosquat_heuristic",
			detail: "Name 'left-pad' is not a popular package name with a generic affix attached.",
			data: { name: "left-pad" },
		},
	],
	sources: {
		npm_registry: "https://registry.npmjs.org",
		osv: "https://api.osv.dev/v1",
		npm_downloads: "https://api.npmjs.org/downloads/point/last-week",
	},
	checked_at: "2026-09-08T10:28:51Z",
};

/**
 * A real client over a real handshake, so the tool is exercised the way a client
 * exercises it: the schemas go over the wire and the client validates the result
 * against the output schema this server advertised.
 */
async function connect(): Promise<Client> {
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{ capabilities: { tools: {} } }
	);
	registerVerifyPackage(server);

	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "test", version: "0" });

	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	return client;
}

function respond(body: unknown, init: ResponseInit = { status: 200 }): void {
	vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(body), init)));
}

let client: Client;

beforeEach(async () => {
	delete process.env.PKGPROOF_ALGORAND_PRIVATE_KEY;
	delete process.env.PKGPROOF_BASE_PRIVATE_KEY;
	client = await connect();
});

afterEach(async () => {
	vi.unstubAllGlobals();
	await client.close();
});

describe("the tool it advertises", () => {
	it("offers one tool, because one call is one verification", async () => {
		const { tools } = await client.listTools();

		expect(tools).toHaveLength(1);
		expect(tools[0]?.name).toBe("verify_package");
	});

	it("asks only for a package name", async () => {
		const { tools } = await client.listTools();
		const input = tools[0]?.inputSchema as {
			required?: string[];
			properties: Record<string, { default?: string }>;
		};

		expect(input.required).toEqual(["name"]);
		expect(input.properties.ecosystem?.default).toBe("npm");
		expect(Object.keys(input.properties)).toEqual(["ecosystem", "name", "version"]);
	});

	// Past the daily free verification this spends USDC, so a client must not be
	// able to read it as free to call.
	it("does not claim to be read-only", async () => {
		const { tools } = await client.listTools();

		expect(tools[0]?.annotations?.readOnlyHint).toBe(false);
		expect(tools[0]?.annotations?.openWorldHint).toBe(true);
	});

	it("declares an output schema, which is what makes structuredContent required", async () => {
		const { tools } = await client.listTools();
		const output = tools[0]?.outputSchema as { required?: string[] };

		expect(output.required).toContain("verdict");
		expect(output.required).toContain("reasons");
		expect(output.required).toContain("checked_at");
	});
});

describe("calling it", () => {
	it("returns the verdict as text and the API's own JSON beside it", async () => {
		respond(VERDICT, { status: 200, headers: { "x-free-verification": "1" } });

		const result = await client.callTool({
			name: "verify_package",
			arguments: { name: "left-pad" },
		});
		const [text] = result.content as { text: string }[];

		expect(result.isError).toBeFalsy();
		expect(text?.text).toContain("safe — npm left-pad");
		expect(text?.text).toContain("- safe (fact, repository_provenance) 'left-pad' declares");
		expect(text?.text).toContain("today's free verification");
		expect(result.structuredContent).toEqual(VERDICT);
	});

	it("names the version in the summary when one was verified", async () => {
		respond({ ...VERDICT, version: "1.3.0" }, { status: 200 });

		const result = await client.callTool({
			name: "verify_package",
			arguments: { name: "left-pad", version: "1.3.0" },
		});
		const [text] = result.content as { text: string }[];

		expect(text?.text).toContain("safe — npm left-pad@1.3.0");
	});

	it("refuses a nameless call before spending anything", async () => {
		const fetched = vi.fn();
		vi.stubGlobal("fetch", fetched);

		const result = await client.callTool({ name: "verify_package", arguments: { name: "" } });

		expect(result.isError).toBe(true);
		expect(fetched).not.toHaveBeenCalled();
	});

	// An error carries no structuredContent, which is what keeps a failure from
	// being read as a verdict.
	it("reports a paywall with no wallet as an error, not as a verdict", async () => {
		respond({ error: "Payment required." }, { status: 402 });

		const result = await client.callTool({
			name: "verify_package",
			arguments: { name: "left-pad" },
		});
		const [text] = result.content as { text: string }[];

		expect(result.isError).toBe(true);
		expect(result.structuredContent).toBeUndefined();
		expect(text?.text).toContain("PKGPROOF_ALGORAND_PRIVATE_KEY");
	});
});
