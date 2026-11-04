#!/usr/bin/env node
// Generates the TREZO oracle keypair (ed25519).
//  - TREZO_ORACLE_SECRET_KEY goes in the *server* environment only (.env.local / host secrets).
//  - The public key (base64) is passed to the contract's `new` / `set_oracle_key`.
// The oracle key holds no NEAR and is not a NEAR account key; it only signs claim tickets.
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import crypto from "node:crypto";

const seed = new Uint8Array(crypto.randomBytes(32));
const pub = ed25519.getPublicKey(seed);
const full = new Uint8Array(64);
full.set(seed, 0);
full.set(pub, 32);

console.log("# Add to .env.local (server secret — never commit, never expose to the browser):");
console.log(`TREZO_ORACLE_SECRET_KEY=ed25519:${bs58.encode(full)}`);
console.log("");
console.log("# Public key for the contract (base64, used by scripts/deploy-contract.mjs automatically):");
console.log(`TREZO_ORACLE_PUBLIC_KEY_B64=${Buffer.from(pub).toString("base64")}`);
console.log(`# NEAR-style: ed25519:${bs58.encode(pub)}`);
