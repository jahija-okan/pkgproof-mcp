// A verification costs USDC. No test may reach the live service or hold a real
// key, so both are guarded here rather than left to review.

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

function unreachable(): never {
	throw new Error(
		"fetch was not stubbed. Tests must not reach the live service; stub it with vi.stubGlobal."
	);
}
