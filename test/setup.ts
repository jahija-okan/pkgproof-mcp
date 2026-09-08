/**
 * Two things a test in this repo must never do: reach the live service, or sign
 * with a real key. A verification costs USDC, so both are guarded here rather
 * than left to review — the failure they prevent is a charge, not a red test.
 */

import { beforeEach } from "vitest";

import { RAILS } from "../src/meta.js";

for (const rail of Object.values(RAILS)) {
	if (process.env[rail.keyEnvVar]) {
		throw new Error(
			`${rail.keyEnvVar} is set. Tests sign against fabricated terms and must not see a funded wallet: unset it, or run without your .env loaded.`
		);
	}
}

beforeEach(() => {
	globalThis.fetch = unreachable;
});

/** Replaces `fetch` before every test, so forgetting to stub it fails the test
 *  rather than quietly spending a verification. */
function unreachable(): never {
	throw new Error(
		"fetch was not stubbed. Tests must not reach the live service; stub it with vi.stubGlobal."
	);
}
