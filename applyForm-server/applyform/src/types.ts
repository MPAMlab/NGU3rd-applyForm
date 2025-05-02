// src/types.ts

// Import necessary types from Cloudflare Workers
import { D1Database, R2Bucket } from "@cloudflare/workers-types";

/**
 * Defines the environment variables and bindings available to the Worker.
 * These should match the configuration in your wrangler.jsonc and secrets.
 */
export interface Env {
    // D1 Database binding (matches "binding": "DB" in wrangler.jsonc)
    DB: D1Database;

    // R2 Bucket binding (matches "binding": "AVATAR_BUCKET" in wrangler.jsonc)
    AVATAR_BUCKET: R2Bucket;

    // Secrets (added via `wrangler secret put`)
    ADMIN_API_KEY: string; // Your secret key for admin access
    KINDE_CLIENT_ID: string; // Kinde Client ID
    KINDE_CLIENT_SECRET: string; // Kinde Client Secret
    KINDE_REDIRECT_URI: string; // Kinde Redirect URI (your frontend callback URL)
    KINDE_ISSUER_URL: string; // Kinde Issuer URL (your Kinde domain)

    // Add any other bindings or variables defined in wrangler.jsonc or secrets here
    // For example, if you had KV storage: MY_KV: KVNamespace;
}

/**
 * Defines the structure of a member record in the D1 database.
 * Used for type safety when interacting with the 'members' table.
 */
export interface Member {
    id: number; // Internal database ID (integer primary key)
    team_code: string; // 4-digit team code
    color: 'red' | 'green' | 'blue'; // Member's color role
    job: 'attacker' | 'defender' | 'supporter'; // Member's job role
    maimai_id: string; // Maimai ID
    nickname: string; // Member's nickname
    qq_number: string; // Member's QQ number
    avatar_url: string | null; // URL to the avatar image in R2, or null
    joined_at: number; // Unix timestamp (seconds) when the member joined
    updated_at: number | null; // Unix timestamp (seconds) when the member was last updated, or null
    kinde_user_id: string | null; // Kinde user's unique ID, or null if not linked
}

/**
 * Defines the basic structure of the Kinde user information we expect.
 */
export interface KindeUser {
    id: string; // Kinde's unique user ID (sub claim)
    email?: string; // User's email (if requested in scope)
    name?: string; // User's full name (if requested in scope)
    given_name?: string; // User's given name
    family_name?: string; // User's family name
    // Add other claims you might use from the ID token or /userinfo endpoint
}


// You can define other types here if needed for your application logic,
// e.g., interfaces for API request/response bodies.
