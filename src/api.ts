import type { Rail } from "./meta.js";

export const VERDICTS = ["safe", "caution", "block", "does_not_exist"] as const;

export type Verdict = (typeof VERDICTS)[number];

export interface VerifyRequest {
	ecosystem: string;
	name: string;
	version?: string;
}

export interface Reason {
	verdict: Verdict;
	code: string;
	kind: string;
	source: string;
	detail: string;
	data?: Record<string, unknown>;
}

export interface VerifyResult {
	ecosystem: string;
	name: string;
	version: string | null;
	verdict: Verdict;
	reasons: Reason[];
	sources: Record<string, string>;
	checked_at: string;
}

export interface Attempt {
	rail: Rail;
	response: Response;
	body: unknown;
}

export async function verifyOnce(
	rail: Rail,
	request: VerifyRequest,
	payment: Record<string, string> = {}
): Promise<Attempt> {
	const response = await fetch(rail.verifyUrl, {
		method: "POST",
		headers: { "content-type": "application/json", ...payment },
		body: JSON.stringify(request),
	});

	return { rail, response, body: await parseBody(response) };
}

export function wasFree(response: Response): boolean {
	return response.headers.get("x-free-verification") === "1";
}

/**
 * Errors arrive in two shapes: the origin's `{ error: { code, message } }` and
 * the paywall's `{ error: "<reason>" }`.
 */
export function apiError(body: unknown): { code: string; message: string } {
	const error = isRecord(body) ? body.error : body;

	if (typeof error === "string") {
		return { code: error, message: error };
	}
	if (isRecord(error)) {
		return { code: String(error.code ?? ""), message: String(error.message ?? "") };
	}
	return { code: "", message: "" };
}

async function parseBody(response: Response): Promise<unknown> {
	const text = await response.text();
	try {
		return JSON.parse(text) as unknown;
	} catch {
		// A non-JSON body is an infrastructure error page, not the service.
		return text.slice(0, 200);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
