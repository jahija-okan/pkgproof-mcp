/**
 * Server identity, and the two payment rails it can talk to.
 *
 * SERVER_VERSION is duplicated from package.json rather than read from it: the
 * published tarball ships `dist` only, so there is no package.json next to the
 * built entry point to read at runtime. A test asserts the two stay equal, which
 * is the cheap half of the trade.
 */

/** Display identity. The registry name is `net.pkgproof/pkgproof`, declared as
 *  `mcpName` in package.json and as `name` in server.json. */
export const SERVER_NAME = "pkgproof";

export const SERVER_VERSION = "0.1.2";

export type RailId = "algorand" | "base";

export interface Rail {
	id: RailId;
	/** The paid endpoint for this rail. Each rail is its own hostname, and the
	 *  origin serves each its own discovery documents. */
	verifyUrl: string;
	/** CAIP-2 network id, exactly as the rail quotes it in its own 402. */
	network: string;
	/** Human label for messages the model and the user both read. */
	label: string;
	/** Whether an unpaid call to this rail can return a verdict. */
	freeTier: boolean;
	/** Environment variable holding the key that pays on this rail. */
	keyEnvVar: string;
	/** What that key looks like, because the two rails disagree and the wrong
	 *  format is the mistake a user makes once. */
	keyFormat: string;
}

export const RAILS: Record<RailId, Rail> = {
	algorand: {
		id: "algorand",
		verifyUrl: "https://x402-algo.pkgproof.net/v1/verify",
		network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
		label: "Algorand Mainnet",
		freeTier: false,
		keyEnvVar: "PKGPROOF_ALGORAND_PRIVATE_KEY",
		keyFormat: "base64 account key, not a 25-word mnemonic",
	},
	base: {
		id: "base",
		verifyUrl: "https://x402.pkgproof.net/v1/verify",
		network: "eip155:8453",
		label: "Base",
		freeTier: true,
		keyEnvVar: "PKGPROOF_BASE_PRIVATE_KEY",
		keyFormat: "0x-prefixed EVM private key",
	},
};

/**
 * The rail an unpaid call goes to, and the only one that can answer it.
 *
 * Base serves one free verdict per caller per UTC day. The Algorand rail refuses
 * every unpaid call by design, because that hostname exists to settle volume and
 * a free verdict there is a settlement that did not happen. So the free attempt
 * is Base or it is nothing, whatever the caller's preferred paid rail is.
 */
export const FREE_RAIL: Rail = RAILS.base;

/**
 * The rail money goes to when the caller has a key for it.
 *
 * Algorand, deliberately, and not because it is the better rail: it is the one
 * whose settled volume is ranked, and Base is not ranked on anything. A caller
 * who configures only a Base key still pays on Base; this is the preference, not
 * a restriction.
 */
export const PREFERRED_PAID_RAIL: Rail = RAILS.algorand;

/** Paid rails in the order they are tried, most preferred first. */
export const PAID_RAIL_ORDER: RailId[] = ["algorand", "base"];
