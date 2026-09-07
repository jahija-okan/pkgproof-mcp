import { afterEach, describe, expect, it, vi } from "vitest";

import { RAILS } from "../src/meta.js";

/**
 * Hardhat's first account: published in its docs, holds nothing anywhere, and
 * signs here only against a fabricated 402. EIP-3009 is signed off chain, so
 * these tests reach no network and no wallet.
 */
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/** The Base rail's live terms, trimmed to what the client reads. */
const TERMS = {
	x402Version: 2,
	error: "Payment required.",
	resource: { url: RAILS.base.verifyUrl, mimeType: "application/json" },
	accepts: [
		{
			scheme: "exact",
			network: RAILS.base.network,
			amount: "50000",
			asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
			payTo: "0xB1fe0fd90C16800C3D5e811c6f07972dE9d2b98E",
			maxTimeoutSeconds: 60,
			extra: { name: "USD Coin", version: "2" },
		},
	],
};

const VERDICT = {
	ecosystem: "npm",
	name: "left-pad",
	version: "1.3.0",
	verdict: "safe",
	reasons: [
		{
			verdict: "safe",
			code: "package_exists",
			kind: "fact",
			source: "npm registry",
			detail: "left-pad 1.3.0 is published on the npm registry.",
		},
	],
	sources: { "npm registry": "https://registry.npmjs.org" },
	checked_at: "2026-09-07T12:00:00Z",
};

const REQUEST = { ecosystem: "npm", name: "left-pad", version: "1.3.0" };

function verdictResponse(free: boolean): Response {
	return new Response(JSON.stringify(VERDICT), {
		status: 200,
		headers: free ? { "x-free-verification": "1" } : {},
	});
}

function paywallResponse(): Response {
	return new Response(JSON.stringify(TERMS), {
		status: 402,
		headers: { "payment-required": Buffer.from(JSON.stringify(TERMS)).toString("base64") },
	});
}

/** Answers each call in turn, and records what was sent. */
function stubFetch(responses: Response[]): { calls: { url: string; headers: Headers }[] } {
	const calls: { url: string; headers: Headers }[] = [];

	vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
		calls.push({ url, headers: new Headers(init.headers) });
		const next = responses[calls.length - 1];
		if (!next) throw new Error(`unexpected request ${calls.length} to ${url}`);
		return Promise.resolve(next);
	});

	return { calls };
}

/**
 * A fresh copy of the modules, because both the payment client and the queue are
 * built once and hold whichever keys were set when they were.
 */
async function load(keys: Record<string, string | undefined>) {
	vi.resetModules();

	for (const rail of Object.values(RAILS)) {
		const key = keys[rail.keyEnvVar];
		if (key === undefined) {
			delete process.env[rail.keyEnvVar];
		} else {
			process.env[rail.keyEnvVar] = key;
		}
	}

	return {
		...(await import("../src/verify.js")),
		...(await import("../src/payment.js")),
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("the free attempt", () => {
	it("takes the free verdict without signing anything, even with a key set", async () => {
		const { verifyPackage } = await load({ [RAILS.base.keyEnvVar]: TEST_KEY });
		const { calls } = stubFetch([verdictResponse(true)]);

		const verification = await verifyPackage(REQUEST);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(RAILS.base.verifyUrl);
		expect(verification.free).toBe(true);
		expect(verification.payment).toBeNull();
		expect(verification.result.verdict).toBe("safe");
	});

	// Base is the only rail that answers an unpaid call at all.
	it("always goes to the free rail", async () => {
		const { verifyPackage } = await load({});
		const { calls } = stubFetch([verdictResponse(true)]);

		await verifyPackage(REQUEST);

		expect(calls[0]?.url).toBe(RAILS.base.verifyUrl);
		expect(calls[0]?.headers.has("payment-signature")).toBe(false);
		expect(calls[0]?.headers.has("x-payment")).toBe(false);
	});

	it("names both key variables when the day's verdict is spent and none is set", async () => {
		const { verifyPackage } = await load({});
		stubFetch([paywallResponse()]);

		await expect(verifyPackage(REQUEST)).rejects.toThrow(RAILS.algorand.keyEnvVar);
	});

	it("does not pay past an error that is not a 402", async () => {
		const { verifyPackage } = await load({ [RAILS.base.keyEnvVar]: TEST_KEY });
		const { calls } = stubFetch([
			new Response(
				JSON.stringify({ error: { code: "invalid_request", message: "'name' is required" } }),
				{
					status: 422,
				}
			),
		]);

		await expect(verifyPackage(REQUEST)).rejects.toThrow("'name' is required");
		expect(calls).toHaveLength(1);
	});
});

describe("paying", () => {
	it("signs the quoted terms and resends under the header the encoder chose", async () => {
		const { verifyPackage } = await load({ [RAILS.base.keyEnvVar]: TEST_KEY });
		const { calls } = stubFetch([paywallResponse(), verdictResponse(false)]);

		const verification = await verifyPackage(REQUEST);

		// The free attempt is reused as the quote: same rail, so no second 402.
		expect(calls).toHaveLength(2);
		expect(calls[1]?.url).toBe(RAILS.base.verifyUrl);
		expect(verification.free).toBe(false);
		expect(verification.payment?.amount).toBe("50000");
		expect(verification.payment?.rail.id).toBe("base");

		// Not asserted by name: v2 calls this PAYMENT-SIGNATURE where v1 called it
		// X-PAYMENT, and this server hardcodes neither.
		const payment = [...(calls[1]?.headers ?? [])].find(([name]) => /payment/i.test(name));
		expect(payment).toBeDefined();

		const payload = JSON.parse(Buffer.from(payment?.[1] ?? "", "base64").toString()) as {
			accepted: { amount: string; network: string };
		};
		expect(payload.accepted.amount).toBe("50000");
		expect(payload.accepted.network).toBe(RAILS.base.network);
	});

	it("stops on a refused payment rather than signing a second one", async () => {
		const { verifyPackage } = await load({ [RAILS.base.keyEnvVar]: TEST_KEY });
		const { calls } = stubFetch([
			paywallResponse(),
			new Response(JSON.stringify({ error: "invalid_exact_evm_insufficient_balance" }), {
				status: 402,
			}),
		]);

		await expect(verifyPackage(REQUEST)).rejects.toThrow(/out of USDC/);
		expect(calls).toHaveLength(2);
	});

	it("reports an unusable key by format, never by value", async () => {
		const { verifyPackage } = await load({ [RAILS.base.keyEnvVar]: "not-a-key" });
		stubFetch([paywallResponse()]);

		const error = await verifyPackage(REQUEST).catch((thrown: Error) => thrown);

		expect(error.message).toContain(RAILS.base.keyFormat);
		expect(error.message).not.toContain("not-a-key");
	});
});

describe("rail preference", () => {
	it("prefers Algorand when both keys are set", async () => {
		const { paidRail } = await load({
			[RAILS.algorand.keyEnvVar]: "a-key",
			[RAILS.base.keyEnvVar]: TEST_KEY,
		});

		expect(paidRail()?.id).toBe("algorand");
	});

	it("falls back to Base when only its key is set", async () => {
		const { paidRail } = await load({ [RAILS.base.keyEnvVar]: TEST_KEY });

		expect(paidRail()?.id).toBe("base");
	});

	it("has nothing to pay with when neither is set", async () => {
		const { paidRail } = await load({});

		expect(paidRail()).toBeNull();
	});
});

describe("concurrency", () => {
	// The origin allows one verification in flight per payer and answers 409 to
	// the second, so the calls have to queue rather than overlap.
	it("runs one verification at a time", async () => {
		const { verifyPackage } = await load({});

		let inFlight = 0;
		let overlapped = false;

		vi.stubGlobal("fetch", async () => {
			inFlight += 1;
			overlapped ||= inFlight > 1;
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight -= 1;
			return verdictResponse(true);
		});

		await Promise.all([verifyPackage(REQUEST), verifyPackage(REQUEST), verifyPackage(REQUEST)]);

		expect(overlapped).toBe(false);
	});

	it("keeps the queue moving after a failure", async () => {
		const { verifyPackage } = await load({});
		stubFetch([new Response("gateway", { status: 502 }), verdictResponse(true)]);

		const failed = verifyPackage(REQUEST);
		const after = verifyPackage(REQUEST);

		await expect(failed).rejects.toThrow("502");
		await expect(after).resolves.toMatchObject({ free: true });
	});
});
