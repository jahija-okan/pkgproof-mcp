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

interface RailClient {
	client: x402HTTPClient;
	address: string;
}

const clients = new Map<RailId, RailClient>();

export function paidRail(): Rail | null {
	for (const id of PAID_RAIL_ORDER) {
		if (keyFor(RAILS[id])) {
			return RAILS[id];
		}
	}
	return null;
}

export function payerAddress(rail: Rail): string | null {
	try {
		return clientFor(rail).address;
	} catch {
		return null;
	}
}

export async function signPayment(quote: Attempt): Promise<SignedPayment> {
	const { client } = clientFor(quote.rail);
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

export function settlementTransaction(rail: Rail, response: Response): string | null {
	try {
		return clientFor(rail).client.getPaymentSettleResponse((name) => response.headers.get(name))
			.transaction;
	} catch {
		return null;
	}
}

function keyFor(rail: Rail): string {
	return process.env[rail.keyEnvVar]?.trim() ?? "";
}

function clientFor(rail: Rail): RailClient {
	const built = clients.get(rail.id);
	if (built) {
		return built;
	}

	const key = keyFor(rail);
	if (!key) {
		throw new VerifyError(`${rail.keyEnvVar} is not set.`);
	}

	let client: RailClient;
	try {
		client = rail.id === "algorand" ? algorandClient(key) : baseClient(key);
	} catch {
		// Both signers quote the key they were handed, so their message must not
		// reach the caller: report the format only.
		throw new VerifyError(`${rail.keyEnvVar} is not usable: expected a ${rail.keyFormat}.`);
	}

	clients.set(rail.id, client);
	return client;
}

function algorandClient(key: string): RailClient {
	const signer = toClientAvmSigner(key);
	const scheme = new ExactAvmScheme(signer);

	// Registered on `algorand:*` rather than one network id: the rail quotes the
	// full genesis hash where the library's canonical form is truncated.
	return {
		client: new x402HTTPClient(new x402Client().register("algorand:*", scheme)),
		address: signer.address,
	};
}

function baseClient(key: string): RailClient {
	const signer = privateKeyToAccount(key as `0x${string}`);

	return {
		client: new x402HTTPClient(registerExactEvmScheme(new x402Client(), { signer })),
		address: signer.address,
	};
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
