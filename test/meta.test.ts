import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
	FREE_RAIL,
	PAID_RAIL_ORDER,
	PREFERRED_PAID_RAIL,
	RAILS,
	SERVER_VERSION,
} from "../src/meta.js";

const packageJson = JSON.parse(
	readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")
) as { version: string; mcpName: string; name: string };

const serverJson = JSON.parse(
	readFileSync(fileURLToPath(new URL("../server.json", import.meta.url)), "utf8")
) as {
	name: string;
	version: string;
	packages: { identifier: string; version: string; environmentVariables: { name: string }[] }[];
};

describe("metadata", () => {
	it("keeps SERVER_VERSION equal to the package version", () => {
		expect(SERVER_VERSION).toBe(packageJson.version);
	});

	// The registry proves the npm package is ours by matching these two. A
	// mismatch fails at publish time, after the tarball is already on npm.
	it("keeps mcpName equal to the registry server name", () => {
		expect(packageJson.mcpName).toBe(serverJson.name);
	});

	it("points server.json at this npm package and version", () => {
		expect(serverJson.packages[0]?.identifier).toBe(packageJson.name);
		expect(serverJson.packages[0]?.version).toBe(packageJson.version);
		expect(serverJson.version).toBe(packageJson.version);
	});
});

describe("rails", () => {
	// Each rail is its own hostname and quotes its own network in its own 402.
	// Swapping either would send payers to the wrong chain.
	it("keeps each rail on its own host and network", () => {
		expect(RAILS.base.verifyUrl).toBe("https://x402.pkgproof.net/v1/verify");
		expect(RAILS.base.network).toBe("eip155:8453");
		expect(RAILS.algorand.verifyUrl).toBe("https://x402-algo.pkgproof.net/v1/verify");
		expect(RAILS.algorand.network).toBe("algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=");
	});

	// The Algorand rail refuses every unpaid call by design, so a free attempt
	// aimed there would break the path that makes this work with no key at all.
	it("only ever attempts a free call on the rail that serves one", () => {
		expect(FREE_RAIL.freeTier).toBe(true);
		expect(FREE_RAIL.id).toBe("base");
		expect(RAILS.algorand.freeTier).toBe(false);
	});

	// Algorand is ranked on settled volume and Base is ranked on nothing.
	it("prefers the ranked rail for payment", () => {
		expect(PREFERRED_PAID_RAIL.id).toBe("algorand");
		expect(PAID_RAIL_ORDER[0]).toBe("algorand");
	});

	// Two rails, two key formats, two variables. One shared variable would make
	// the wrong-format mistake silent.
	it("gives each rail its own key variable, and declares them in server.json", () => {
		expect(RAILS.base.keyEnvVar).not.toBe(RAILS.algorand.keyEnvVar);
		const declared = serverJson.packages[0]?.environmentVariables.map((v) => v.name) ?? [];
		expect(declared).toContain(RAILS.algorand.keyEnvVar);
		expect(declared).toContain(RAILS.base.keyEnvVar);
	});
});
