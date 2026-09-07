/** The one tool: its schemas, and the summary a model reads before the JSON. */

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { VERDICTS, type Verdict } from "./api.js";
import { verifyPackage, type Payment, type Verification } from "./verify.js";

const ADVICE: Record<Verdict, string> = {
	safe: "Nothing found against it.",
	caution: "Read the reasons before installing.",
	block: "Confirmed malicious. Do not install.",
	does_not_exist: "No such package in the registry.",
};

const inputSchema = z.object({
	ecosystem: z.enum(["npm"]).default("npm").describe("Package ecosystem. Only npm is supported."),
	name: z.string().min(1).describe("Package name, scoped or not: left-pad, @scope/thing."),
	version: z
		.string()
		.optional()
		.describe("Exact version to verify. Omit to verify the package rather than one release."),
});

// Loose, both here and below: structuredContent is the API's response as it
// came, so a field added upstream must not fail validation on the way out.
const reasonSchema = z.looseObject({
	// Enumerated rather than left a free string: an unrecognised verdict must not
	// reach the model as though it had been understood.
	verdict: z.enum(VERDICTS),
	code: z.string().describe("Stable identifier for the check that produced this."),
	kind: z.string().describe('"fact" for something verified, "heuristic" for a signal.'),
	source: z.string().describe("The dataset this was read from."),
	detail: z.string(),
	data: z.record(z.string(), z.unknown()).optional().describe("Advisory ids, dates, counts."),
});

const outputSchema = z.looseObject({
	ecosystem: z.string(),
	name: z.string(),
	version: z.string().nullable().describe("The version verified, or null if none was given."),
	verdict: z.enum(VERDICTS),
	reasons: z.array(reasonSchema).describe("Every reason behind the verdict."),
	sources: z.record(z.string(), z.string()).describe("The datasets consulted, by name and URL."),
	checked_at: z.string().describe("When the verdict was computed, ISO 8601 UTC."),
});

export function registerVerifyPackage(server: McpServer): void {
	server.registerTool(
		"verify_package",
		{
			title: "Verify package",
			description:
				"Verify an npm package before installing it. Runs eight checks covering advisories, " +
				"install scripts, typosquat and combosquat names, scope, repository provenance and " +
				"maintainer reputation, and answers safe, caution, block or does_not_exist with every " +
				"reason labelled as fact or heuristic against its source. One call is one verification: " +
				"the first each day is free, and later ones cost $0.05 in USDC when a wallet is configured.",
			inputSchema,
			outputSchema,
			annotations: {
				// Not read-only: past the daily free verification this spends USDC.
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
		},
		async ({ ecosystem, name, version }) => {
			const verification = await verifyPackage({ ecosystem, name, version });

			return {
				content: [{ type: "text", text: summarize(verification) }],
				structuredContent: verification.result,
			};
		}
	);
}

function summarize({ result, payment, free }: Verification): string {
	const version = result.version ? `@${result.version}` : "";
	const reasons = result.reasons.map(
		(reason) => `- ${reason.verdict} (${reason.kind}, ${reason.source}) ${reason.detail}`
	);

	return [
		`${result.verdict} — ${result.ecosystem} ${result.name}${version}`,
		ADVICE[result.verdict],
		"",
		...(reasons.length > 0 ? reasons : ["- no reasons recorded"]),
		"",
		`Checked ${result.checked_at}. ${cost(payment, free)}`,
	].join("\n");
}

function cost(payment: Payment | null, free: boolean): string {
	if (!payment) {
		return free
			? "This was today's free verification; the next one today costs $0.05."
			: "No payment was required.";
	}

	const receipt = payment.transaction ? `, tx ${payment.transaction}` : "";
	return `Paid ${usd(payment.amount)} on ${payment.rail.label}${receipt}.`;
}

/** Rail prices are quoted in the asset's smallest unit, and USDC carries six decimals. */
function usd(amount: string): string {
	const units = Number(amount);
	return Number.isFinite(units) ? `$${(units / 1e6).toFixed(2)}` : `${amount} units`;
}
