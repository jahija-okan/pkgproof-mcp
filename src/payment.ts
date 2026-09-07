/** Which rail pays, how the terms get signed, and what the receipt says. */

import { toClientAvmSigner } from "@x402/avm";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

import type { Attempt } from "./api.js";
import { VerifyError } from "./errors.js";
import { PAID_RAIL_ORDER, RAILS, type Rail, type RailId } from "./meta.js";

export interface SignedPayment {
	headers: Record<string, string>;
	/** The price the rail quoted, in the asset's smallest unit. */
	amount: string;
}

const clients = new Map<RailId, x402HTTPClient>();

/** The rail money goes to: the first in preference order with a key configured. */
export function paidRail(): Rail | null {
	for (const id of PAID_RAIL_ORDER) {
		if (keyFor(RAILS[id])) {
			return RAILS[id];
		}
	}
	return null;
}

/** Sign a 402's terms once, under whatever header name the encoder chose for them. */
export async function signPayment(quote: Attempt): Promise<SignedPayment> {
	const client = clientFor(quote.rail);
	const terms = readTerms(client, quote);

	const payload = await client.createPaymentPayload(terms).catch((error: unknown) => {
		throw new VerifyError(`Could not sign the payment on ${quote.rail.label}: ${describe(error)}`);
	});

	const headers = client.encodePaymentSignatureHeader(payload);
	if (Object.keys(headers).length === 0) {
		throw new VerifyError("Signed the terms but the x402 client returned no payment header.");
	}

	return { headers, amount: payload.accepted.amount };
}

/** The transaction the facilitator submitted, when the response carries a receipt. */
export function settlementTransaction(rail: Rail, response: Response): string | null {
	try {
		return clientFor(rail).getPaymentSettleResponse((name) => response.headers.get(name))
			.transaction;
	} catch {
		// No receipt header. The payment went through; the account of it did not.
		return null;
	}
}

function keyFor(rail: Rail): string {
	return process.env[rail.keyEnvVar]?.trim() ?? "";
}

/**
 * The signing client for a rail, built once.
 *
 * A key that will not parse is reported by format alone. Both signers quote what
 * they were handed, so their message must not reach the caller.
 */
function clientFor(rail: Rail): x402HTTPClient {
	const built = clients.get(rail.id);
	if (built) {
		return built;
	}

	const key = keyFor(rail);
	if (!key) {
		throw new VerifyError(`${rail.keyEnvVar} is not set.`);
	}

	let client: x402HTTPClient;
	try {
		client = rail.id === "algorand" ? algorandClient(key) : baseClient(key);
	} catch {
		throw new VerifyError(`${rail.keyEnvVar} is not usable: expected a ${rail.keyFormat}.`);
	}

	clients.set(rail.id, client);
	return client;
}

/**
 * Registered on `algorand:*` rather than one network id: the rail quotes the full
 * genesis hash where the library's canonical form is truncated, and either has to
 * match.
 */
function algorandClient(key: string): x402HTTPClient {
	const scheme = new ExactAvmScheme(toClientAvmSigner(key));
	return new x402HTTPClient(new x402Client().register("algorand:*", scheme));
}

function baseClient(key: string): x402HTTPClient {
	const signer = privateKeyToAccount(key as `0x${string}`);
	return new x402HTTPClient(registerExactEvmScheme(new x402Client(), { signer }));
}

function readTerms(client: x402HTTPClient, quote: Attempt) {
	try {
		return client.getPaymentRequiredResponse(
			(name) => quote.response.headers.get(name),
			quote.body
		);
	} catch {
		throw new VerifyError(`${quote.rail.label} answered 402 but carried no payment terms.`);
	}
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
