export const SERVER_NAME = "pkgproof";

// Duplicated from package.json: the published tarball ships dist only, so there
// is no package.json beside the entry point to read at runtime. A test asserts
// the two stay equal.
export const SERVER_VERSION = "0.1.4";

export type RailId = "algorand" | "base";

export interface Rail {
	id: RailId;
	verifyUrl: string;
	/** CAIP-2 network id, exactly as the rail quotes it in its own 402. */
	network: string;
	label: string;
	freeTier: boolean;
	keyEnvVar: string;
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

// Base serves one free verdict per caller per UTC day. The Algorand rail refuses
// every unpaid call by design, so the free attempt is Base or it is nothing.
export const FREE_RAIL: Rail = RAILS.base;

// Algorand is the rail whose settled volume is ranked; Base is ranked on nothing.
export const PREFERRED_PAID_RAIL: Rail = RAILS.algorand;

export const PAID_RAIL_ORDER: RailId[] = ["algorand", "base"];
