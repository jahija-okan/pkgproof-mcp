/** One verification: unpaid first, paid only once the free one is gone. */

import {
	apiError,
	verifyOnce,
	wasFree,
	type Attempt,
	type VerifyRequest,
	type VerifyResult,
} from "./api.js";
import { VerifyError } from "./errors.js";
import { FREE_RAIL, RAILS, type Rail } from "./meta.js";
import { paidRail, settlementTransaction, signPayment } from "./payment.js";

export interface Payment {
	rail: Rail;
	amount: string;
	transaction: string | null;
}

export interface Verification {
	result: VerifyResult;
	/** null when the service answered without being paid. */
	payment: Payment | null;
	free: boolean;
}

/**
 * The origin allows one verification in flight per payer and answers 409 to the
 * second, so an agent walking a dependency list queues here instead of failing on
 * everything but the first.
 */
let queue: Promise<unknown> = Promise.resolve();

export function verifyPackage(request: VerifyRequest): Promise<Verification> {
	const next = queue.then(() => run(request));
	queue = next.catch(() => undefined);
	return next;
}

async function run(request: VerifyRequest): Promise<Verification> {
	// Unpaid first, always, even with a key configured: charging for something we
	// were about to be given is indefensible the first time someone reads the
	// receipts.
	const free = await verifyOnce(FREE_RAIL, request);
	if (free.response.ok) {
		return served(free);
	}
	if (free.response.status !== 402) {
		throw new VerifyError(serviceError(free));
	}

	const rail = paidRail();
	if (!rail) {
		throw new VerifyError(noWalletMessage());
	}

	// The free attempt and the payment can land on different hosts, so the paid
	// rail is quoted on its own unless it is the one already asked.
	const quote = rail.id === FREE_RAIL.id ? free : await verifyOnce(rail, request);
	if (quote.response.ok) {
		return served(quote);
	}
	if (quote.response.status !== 402) {
		throw new VerifyError(serviceError(quote));
	}

	const payment = await signPayment(quote);
	const paid = await verifyOnce(rail, request, payment.headers);

	// One tool call signs at most one authorisation. A retry that signs a fresh
	// one is a second real charge for the same question, so a failure stops here.
	if (!paid.response.ok) {
		throw new VerifyError(paymentFailure(paid));
	}

	return {
		result: paid.body as VerifyResult,
		payment: {
			rail,
			amount: payment.amount,
			transaction: settlementTransaction(rail, paid.response),
		},
		free: false,
	};
}

function served(attempt: Attempt): Verification {
	return {
		result: attempt.body as VerifyResult,
		payment: null,
		free: wasFree(attempt.response),
	};
}

function noWalletMessage(): string {
	return [
		"The free verification for today is spent (one per caller per UTC day), and no wallet is configured.",
		"",
		"Set one of these to pay $0.05 per verification:",
		`  ${RAILS.algorand.keyEnvVar} — ${RAILS.algorand.keyFormat} (${RAILS.algorand.label}, preferred)`,
		`  ${RAILS.base.keyEnvVar} — ${RAILS.base.keyFormat} (${RAILS.base.label})`,
		"",
		"Fund a throwaway wallet only: there is no spend cap, so its balance is the limit.",
		"Setup: https://github.com/jahija-okan/pkgproof-mcp#paid-with-a-wallet",
	].join("\n");
}

/** The service refused before anything was signed. */
function serviceError(attempt: Attempt): string {
	const error = apiError(attempt.body);
	return `${attempt.rail.label} answered ${attempt.response.status}: ${detail(error)}`;
}

function paymentFailure(attempt: Attempt): string {
	const error = apiError(attempt.body);

	return [
		`${attempt.rail.label} refused the payment (${attempt.response.status}): ${detail(error)}`,
		"",
		hintFor(attempt.rail, error.code),
		"Nothing settled: a failed request is never charged. No second payment was signed.",
	]
		.filter((line) => line !== "")
		.join("\n");
}

function hintFor(rail: Rail, code: string): string {
	if (/insufficient/i.test(code)) {
		return rail.id === "algorand"
			? `The wallet is out of USDC. Top up ASA 31566704 on ${rail.label}, and note that an account holds none of an asset it has not opted into, whatever was sent to it.`
			: `The wallet is out of USDC. Top it up on ${rail.label}.`;
	}
	if (code === "payment_claim_in_flight") {
		return "Another verification is already running for this wallet. Try again once it finishes.";
	}
	return "";
}

function detail({ code, message }: { code: string; message: string }): string {
	return message || code || "no detail given";
}
