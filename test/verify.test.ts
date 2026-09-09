import { afterEach, describe, expect, it, vi } from "vitest";

import { RAILS } from "../src/meta.js";

/** Hardhat's first account, published in its docs and holding nothing. */
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

/** Captured from a live verification, not written by hand. */
const VERDICT = {
	ecosystem: "npm",
	name: "left-pad",
	version: null,
	verdict: "safe",
	reasons: [
		{
			verdict: "safe",
			code: "scope_recognized_package",
			kind: "heuristic",
			source: "scope_confusion",
			detail:
				"'left-pad' is itself a popular npm package (>= 100000 weekly downloads), not a scope lookalike.",
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

const REQUEST = { ecosystem: "npm", name: "left-pad" };

function verdictResponse(free: boolean): Response {
	return new Response(JSON.stringify(VERDICT), {
		status: 200,
		headers: free ? { "x-free-verification": "1" } : {},
	});
}

/** Captured: what the Base rail says when a signed authorisation reverts. */
const EMPTY_WALLET_REFUSAL =
	"invalid_payload: contract call failed: unable to call contract: execution reverted";

/** The account TEST_KEY signs as. */
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function refusalResponse(error: string): Response {
	return new Response(JSON.stringify({ error }), { status: 402 });
}

/** The origin's 409: the code is its own field, not the head of a sentence. */
function inFlightResponse(): Response {
	return new Response(
		JSON.stringify({
			error: {
				code: "payment_claim_in_flight",
				message:
					"Another verification is already running for this payer. This authorisation was not spent; resend it once that one finishes.",
			},
		}),
		{ status: 409 }
	);
}

function paywallResponse(): Response {
	return new Response(JSON.stringify(TERMS), {
		status: 402,
		headers: { "payment-required": Buffer.from(JSON.stringify(TERMS)).toString("base64") },
	});
}

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

/** Fresh modules: the payment client and the queue are each built once. */
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

		expect(calls).toHaveLength(2);
		expect(calls[1]?.url).toBe(RAILS.base.verifyUrl);
		expect(verification.free).toBe(false);
		expect(verification.payment?.amount).toBe("50000");
		expect(verification.payment?.rail.id).toBe("base");

		// Not asserted by name: v2 calls this PAYMENT-SIGNATURE, v1 X-PAYMENT.
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
		const { calls } = stubFetch([paywallResponse(), refusalResponse(EMPTY_WALLET_REFUSAL)]);

		await expect(verifyPackage(REQUEST)).rejects.toThrow(/No second payment was signed/);
		expect(calls).toHaveLength(2);
	});

	it("explains the refusal an empty Base wallet draws, and names the account", async () => {
		const { verifyPackage } = await load({ [RAILS.base.keyEnvVar]: TEST_KEY });
		stubFetch([paywallResponse(), refusalResponse(EMPTY_WALLET_REFUSAL)]);

		const error = await verifyPackage(REQUEST).catch((thrown: Error) => thrown);

		expect(error.message).toContain("rejected the authorisation on-chain");
		expect(error.message).toContain(TEST_ADDRESS);
	});

	it("reads the code out of the origin's 409, where it is a field rather than a prefix", async () => {
		const { verifyPackage } = await load({ [RAILS.base.keyEnvVar]: TEST_KEY });
		stubFetch([paywallResponse(), inFlightResponse()]);

		const error = await verifyPackage(REQUEST).catch((thrown: Error) => thrown);

		expect(error.message).toContain("This authorisation was not spent");
		expect(error.message).toContain("Another verification is already running for this wallet");
		expect(error.message).toContain(TEST_ADDRESS);
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
