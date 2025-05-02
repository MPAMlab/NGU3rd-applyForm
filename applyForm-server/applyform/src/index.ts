// src/index.ts

// --- Imports ---
import { createRemoteJWKSet, jwtVerify } from 'jose'; // Import jose functions
import { Env } from './types'; // Import your updated Env interface
import { D1Database, R2Bucket, ExecutionContext } from "@cloudflare/workers-types"; // Standard Worker types

// --- Configuration & Constants ---
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*', // Or restrict to your frontend domain
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-API-Key, Authorization', // Include Authorization header
    'Access-Control-Max-Age': '86400', // Cache preflight requests for 24 hours
};

// Define JWKS outside the fetch handler to reuse the connection and cache keys
// This will fetch Kinde's public keys from the JWKS endpoint
let kindeJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

// --- Helper Functions (Ensure these are correctly implemented in your project) ---

// Basic API Response/Error helpers
function apiResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
        },
    });
}

function apiError(message: string, status: number = 500, error?: any): Response {
    console.error(`API Error (${status}): ${message}`, error);
    return new Response(JSON.stringify({ error: message }), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
        },
    });
}

// Admin Authentication Check (using API Key)
function isAdminAuthenticated(request: Request, env: Env): boolean {
    const apiKey = request.headers.get('X-Admin-API-Key');
    return apiKey === env.ADMIN_API_KEY;
}

// Placeholder for R2 Avatar Upload (Ensure this uses env.AVATAR_BUCKET)
async function uploadAvatar(env: Env, file: File, identifier: string, teamCode: string): Promise<string | null> {
    console.log(`[Placeholder] Uploading avatar for ${identifier} in team ${teamCode}`);
    // Implement your R2 upload logic here using env.AVATAR_BUCKET
    // Example key path: `avatars/${teamCode}/${identifier}_${Date.now()}.${extension}`
    // Return the public URL of the uploaded file
    try {
        const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const objectKey = `avatars/${teamCode}/${identifier}_${Date.now()}.${fileExtension}`;
        const uploadResult = await env.AVATAR_BUCKET.put(objectKey, file.stream());
        // Assuming your R2 bucket has a public access URL configured
        // Replace with your actual R2 public URL base
        const r2PublicUrlBase = 'https://pub-YOUR-R2-ID.r2.dev'; // <-- REPLACE WITH YOUR R2 PUBLIC URL BASE
        return `${r2PublicUrlBase}/${objectKey}`;
    } catch (e) {
        console.error("R2 upload failed:", e);
        return null;
    }
}

// Placeholder for R2 Avatar Deletion (Ensure this uses env.AVATAR_BUCKET)
async function deleteAvatarFromR2(env: Env, url: string): Promise<void> {
    console.log(`[Placeholder] Deleting avatar from R2: ${url}`);
    // Implement your R2 deletion logic here using env.AVATAR_BUCKET
    try {
        // Extract the object key from the URL
        const r2PublicUrlBase = 'https://pub-YOUR-R2-ID.r2.dev'; // <-- REPLACE WITH YOUR R2 PUBLIC URL BASE
        if (url.startsWith(r2PublicUrlBase)) {
            const objectKey = url.substring(r2PublicUrlBase.length + 1); // +1 for the leading slash
            console.log(`Deleting R2 object with key: ${objectKey}`);
            await env.AVATAR_BUCKET.delete(objectKey);
            console.log(`R2 object ${objectKey} deleted.`);
        } else {
            console.warn(`Avatar URL does not match R2 public URL base, skipping deletion: ${url}`);
        }
    } catch (e) {
        console.error("R2 deletion failed:", e);
        // Log the error but don't throw, deletion is best effort
    }
}

// Placeholder for checking and deleting empty teams
async function checkAndDeleteEmptyTeam(env: Env, teamCode: string): Promise<void> {
    console.log(`[Placeholder] Checking if team ${teamCode} is empty for deletion.`);
    // Implement logic to count members in the team and delete the team if count is 0
    try {
        const countResult = await env.DB.prepare('SELECT COUNT(*) as count FROM members WHERE team_code = ?').bind(teamCode).first<{ count: number }>();
        const memberCount = countResult?.count ?? 0;

        if (memberCount === 0) {
            console.log(`Team ${teamCode} is empty. Deleting team record.`);
            const deleteResult = await env.DB.prepare('DELETE FROM teams WHERE code = ?').bind(teamCode).run();
            if (deleteResult.success) {
                console.log(`Team ${teamCode} deleted successfully.`);
            } else {
                console.error(`Failed to delete empty team ${teamCode}:`, deleteResult.error);
            }
        } else {
            console.log(`Team ${teamCode} is not empty (${memberCount} members). Not deleting.`);
        }
    } catch (e) {
        console.error(`Error checking/deleting empty team ${teamCode}:`, e);
    }
}

// Helper functions for CSV export (reused from frontend or defined here)
function getColorText(colorId: string | null | undefined): string {
     const map: { [key: string]: string } = { red: '火', green: '木', blue: '水' };
     return map[colorId || ''] || '未知';
}

function getJobText(jobType: string | null | undefined): string {
    const map: { [key: string]: string } = { attacker: '绝剑士', defender: '矩盾手', supporter: '炼星师' };
    return map[jobType || ''] || '未知';
}

function formatTimestamp(timestamp: number | null | undefined): string {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
        const year = date.getFullYear();
        const month = ('0' + (date.getMonth() + 1)).slice(-2);
        const day = ('0' + date.getDate()).slice(-2);
        const hours = ('0' + date.getHours()).slice(-2);
        const minutes = ('0' + date.getMinutes()).slice(-2);
        const seconds = ('0' + date.getSeconds()).slice(-2);
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (e) {
        console.error("Failed to format timestamp:", timestamp, e);
        return 'Invalid Date';
    }
}


// --- Kinde Authentication Helpers ---

// Helper to verify Kinde Access Token using jose
async function verifyKindeToken(env: Env, token: string): Promise<{ userId: string, claims: any } | null> {
    if (!env.KINDE_ISSUER_URL) {
        console.error("KINDE_ISSUER_URL not configured in Worker secrets.");
        return null;
    }

    // Initialize JWKS set if not already done
    if (!kindeJwks) {
        try {
             // Kinde's JWKS endpoint is at /.well-known/jwks relative to the issuer URL
             kindeJwks = createRemoteJWKSet(new URL(`${env.KINDE_ISSUER_URL}/.well-known/jwks`));
             console.log("Kinde JWKS set created.");
        } catch (e) {
             console.error("Failed to create Kinde JWKS set:", e);
             return null; // Cannot verify without JWKS
        }
    }

    try {
        // Use jwtVerify to verify the token signature and claims
        const { payload, protectedHeader } = await jwtVerify(token, kindeJwks, {
            issuer: env.KINDE_ISSUER_URL, // Ensure the token was issued by your Kinde domain
            // audience: 'your_api_audience', // Optional: If you configured an API audience in Kinde
            // You might also check 'typ' or other claims if needed
        });

        // Kinde's user ID is typically stored in the 'sub' claim of the token payload
        if (!payload.sub) {
             console.error("Kinde token payload missing 'sub' claim.");
             return null;
        }

        // Return the user ID and the full payload claims
        return { userId: payload.sub, claims: payload };

    } catch (e) {
        console.error("Error verifying Kinde token with jose:", e);
        // This catch block will handle various JWT errors like:
        // - JWSInvalid: Invalid signature
        // - JWTExpired: Token expired
        // - JWTClaimValidationFailed: Issuer or audience mismatch
        // You can add more specific error logging based on the error type if needed.
        return null; // Token is invalid or expired
    }
}

// Middleware-like function to extract Kinde User ID from token/cookie
async function getAuthenticatedKindeUser(request: Request, env: Env): Promise<string | null> {
    const authHeader = request.headers.get('Authorization');
    let token = null;
    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    } else {
        const cookieHeader = request.headers.get('Cookie');
        if (cookieHeader) {
            const cookies = cookieHeader.split(';').map(c => c.trim().split('='));
            const accessTokenCookie = cookies.find(cookie => cookie[0] === 'kinde_access_token');
            if (accessTokenCookie) {
                token = accessTokenCookie[1];
            }
        }
    }

    if (!token) {
        return null; // No token found
    }

    const verificationResult = await verifyKindeToken(env, token);
    if (!verificationResult) {
        console.warn("Kinde token verification failed.");
        return null; // Token invalid or expired
    }

    return verificationResult.userId; // Return the Kinde user ID
}


// --- Route Handlers ---

// POST /api/kinde/callback
async function handleKindeCallback(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const body = await request.json().catch(() => null);
    if (!body) return apiError('Invalid or missing JSON body.', 400);

    const { code, code_verifier, redirect_uri } = body;

    if (!code || !code_verifier || !redirect_uri) {
        return apiError('Missing code, code_verifier, or redirect_uri in callback request.', 400);
    }

    if (!env.KINDE_CLIENT_ID || !env.KINDE_CLIENT_SECRET || !env.KINDE_ISSUER_URL || !env.KINDE_REDIRECT_URI) {
         console.error("Kinde secrets not configured in Worker.");
         return apiError('Server configuration error.', 500);
    }

    try {
        // Exchange code for tokens with Kinde
        const tokenUrl = `${env.KINDE_ISSUER_URL}/oauth2/token`;
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: env.KINDE_CLIENT_ID,
                client_secret: env.KINDE_CLIENT_SECRET,
                code: code,
                code_verifier: code_verifier, // PKCE verifier
                grant_type: 'authorization_code',
                redirect_uri: redirect_uri, // Must match the one used in the initial redirect
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error('Kinde token exchange failed:', tokenResponse.status, tokenData);
            return apiError(tokenData.error_description || tokenData.error || 'Failed to exchange authorization code for tokens.', tokenResponse.status);
        }

        // Successfully got tokens!
        const { access_token, id_token, refresh_token, expires_in } = tokenData;

        const headers = new Headers(CORS_HEADERS);
        const secure = url.protocol === 'https:' ? '; Secure' : '';
        // Set domain for cookies to your main domain or subdomain where cookies are needed
        // Using url.hostname is generally safer if cookies are only for this specific subdomain.
        const domain = url.hostname; // e.g., signup.ngu3rd.mpam-lab.xyz

        // Set Access Token cookie (short-lived, used for API auth)
        headers.append('Set-Cookie', `kinde_access_token=${access_token}; HttpOnly; Path=/; Max-Age=${expires_in}; SameSite=Lax${secure}; Domain=${domain}`);

        // Set Refresh Token cookie (long-lived, used to get new access tokens)
        // Kinde's refresh token flow needs to be implemented if you want sessions longer than access token expiry
        // For simplicity now, let's just set it, but you'd need a /refresh endpoint
        if (refresh_token) {
             // Set refresh token expiry longer, e.g., 30 days (adjust as needed)
             const refreshTokenMaxAge = 30 * 24 * 60 * 60; // 30 days in seconds
             headers.append('Set-Cookie', `kinde_refresh_token=${refresh_token}; HttpOnly; Path=/; Max-Age=${refreshTokenMaxAge}; SameSite=Lax${secure}; Domain=${domain}`);
        }

        // Decode ID token for basic user info to return to frontend
        let userInfo = {};
        try {
            const idTokenPayload = JSON.parse(atob(id_token.split('.')[1]));
            userInfo = {
                id: idTokenPayload.sub, // Kinde User ID
                email: idTokenPayload.email,
                name: idTokenPayload.given_name + ' ' + idTokenPayload.family_name, // Or other name claims
                // Add other claims you requested in scope (profile, etc.)
            };
        } catch (e) {
            console.error("Failed to decode ID token payload:", e);
        }


        return new Response(JSON.stringify({ success: true, user: userInfo }), {
            status: 200,
            headers: headers, // Include Set-Cookie headers
        });

    } catch (kindeError) {
        console.error('Error during Kinde token exchange:', kindeError);
        return apiError('Failed to communicate with authentication server.', 500, kindeError);
    }
}

// POST /api/auth/logout (Optional backend step to clear cookies)
async function handleLogout(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = new Headers(CORS_HEADERS);
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    const domain = url.hostname; // Or specific domain

    // Set Max-Age to 0 or a past date to delete cookies
    headers.append('Set-Cookie', `kinde_access_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}; Domain=${domain}`);
    headers.append('Set-Cookie', `kinde_refresh_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}; Domain=${domain}`);

    return new Response(JSON.stringify({ success: true, message: "Logged out successfully." }), {
        status: 200,
        headers: headers,
    });
}


// POST /api/teams/check (No auth needed)
async function handleCheckTeam(request: Request, env: Env): Promise<Response> {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.teamCode !== 'string') {
        return apiError('Invalid or missing teamCode in request body.', 400);
    }
    const teamCode = body.teamCode.trim();

    if (teamCode.length !== 4 || isNaN(parseInt(teamCode))) {
        return apiError('Invalid team code format.', 400);
    }

    try {
        // Fetch team and its members
        const teamResult = await env.DB.prepare('SELECT name FROM teams WHERE code = ? LIMIT 1').bind(teamCode).first<{ name: string }>();

        if (!teamResult) {
            return apiError(`Team with code ${teamCode} not found.`, 404);
        }

        const membersResult = await env.DB.prepare(
            'SELECT color, job, maimai_id, nickname, avatar_url FROM members WHERE team_code = ?'
        ).bind(teamCode).all();

        return apiResponse({
            success: true,
            code: teamCode,
            name: teamResult.name,
            members: membersResult.results || []
        }, 200);

    } catch (e) {
        console.error('Database error checking team:', e);
        return apiError('Failed to check team information.', 500, e);
    }
}

// POST /api/teams/create (No auth needed)
async function handleCreateTeam(request: Request, env: Env): Promise<Response> {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.teamCode !== 'string' || typeof body.teamName !== 'string') {
        return apiError('Invalid or missing teamCode or teamName in request body.', 400);
    }
    const teamCode = body.teamCode.trim();
    const teamName = body.teamName.trim();

    if (teamCode.length !== 4 || isNaN(parseInt(teamCode))) {
        return apiError('Invalid team code format.', 400);
    }
    if (teamName.length === 0 || teamName.length > 50) {
        return apiError('Team name is required (1-50 chars).', 400);
    }

    try {
        // Check if team code already exists
        const existingTeam = await env.DB.prepare('SELECT 1 FROM teams WHERE code = ? LIMIT 1').bind(teamCode).first();
        if (existingTeam) {
            return apiError(`Team code ${teamCode} already exists.`, 409);
        }

        const now = Math.floor(Date.now() / 1000);
        const insertResult = await env.DB.prepare(
            'INSERT INTO teams (code, name, created_at) VALUES (?, ?, ?)'
        )
        .bind(teamCode, teamName, now)
        .run();

        if (!insertResult.success) {
            console.error('Create team database insert failed:', insertResult.error);
            return apiError('Failed to create team due to a database issue.', 500);
        }

        return apiResponse({ success: true, message: "Team created successfully.", code: teamCode, name: teamName }, 201);

    } catch (e) {
        console.error('Database error creating team:', e);
        return apiError('Failed to create team.', 500, e);
    }
}


// POST /api/teams/join (Requires Kinde Auth)
async function handleJoinTeam(request: Request, env: Env, kindeUserId: string, ctx: ExecutionContext): Promise<Response> {
    let formData: FormData;
    try { formData = await request.formData(); } catch (e) { return apiError('Invalid request format. Expected multipart/form-data.', 400, e); }

    const teamCode = formData.get('teamCode')?.toString();
    const color = formData.get('color')?.toString();
    const job = formData.get('job')?.toString();
    const maimaiId = formData.get('maimaiId')?.toString()?.trim();
    const nickname = formData.get('nickname')?.toString()?.trim();
    const qqNumber = formData.get('qqNumber')?.toString()?.trim();
    const avatarFile = formData.get('avatarFile');

     // --- Input Validation ---
     if (!teamCode || teamCode.length !== 4 || isNaN(parseInt(teamCode))) return apiError('Invalid team code.', 400);
     if (!color || !['red', 'green', 'blue'].includes(color)) return apiError('Invalid color selection.', 400);
     if (!job || !['attacker', 'defender', 'supporter'].includes(job)) return apiError('Invalid job selection.', 400);
     if (!maimaiId || maimaiId.length === 0 || maimaiId.length > 13) return apiError('Maimai ID is required (1-13 chars).', 400);
     if (!nickname || nickname.length === 0 || nickname.length > 50) return apiError('Nickname is required (1-50 chars).', 400);
     if (!qqNumber || !/^[1-9][0-9]{4,14}$/.test(qqNumber)) return apiError('A valid QQ number is required.', 400);
     // --- End Validation ---

    try {
         // Use batch for checks
         const teamChecks = await env.DB.batch([
             env.DB.prepare('SELECT name FROM teams WHERE code = ? LIMIT 1').bind(teamCode),
             env.DB.prepare('SELECT COUNT(*) as count FROM members WHERE team_code = ?').bind(teamCode),
             // Check if THIS Kinde user ID already has a registration
             env.DB.prepare('SELECT 1 FROM members WHERE kinde_user_id = ? LIMIT 1').bind(kindeUserId),
             // Check if color or job is already taken in this specific team
             env.DB.prepare('SELECT 1 FROM members WHERE team_code = ? AND (color = ? OR job = ?) LIMIT 1').bind(teamCode, color, job),
             // Optional: Check if Maimai ID is already taken globally (if you want to enforce this)
             // env.DB.prepare('SELECT 1 FROM members WHERE maimai_id = ? LIMIT 1').bind(maimaiId),
         ]);

         const teamResult = teamChecks[0]?.results?.[0] as { name: string } | undefined;
         const memberCount = (teamChecks[1]?.results?.[0] as { count: number } | undefined)?.count ?? 0;
         const existingMemberWithKindeId = teamChecks[2]?.results?.[0];
         const conflictCheck = teamChecks[3]?.results?.[0];
         // const existingMemberWithMaimaiId = teamChecks[4]?.results?.[0]; // If checking Maimai ID globally

         if (!teamResult) return apiError(`Team with code ${teamCode} not found.`, 404);
         if (memberCount >= 3) return apiError(`Team ${teamCode} is already full (3 members).`, 409);
         // Conflict if Kinde user already registered
         if (existingMemberWithKindeId) {
             return apiError('你已经报名过了，一个账号只能报名一次。', 409);
         }
         // Optional: Conflict if Maimai ID taken globally
         // if (existingMemberWithMaimaiId) {
         //     return apiError(`Maimai ID '${maimaiId}' is already registered in a team.`, 409);
         // }

         if (conflictCheck) {
             // Need to query again to find which one is taken for a specific error message
             const colorConflict = await env.DB.prepare('SELECT 1 FROM members WHERE team_code = ? AND color = ? LIMIT 1').bind(teamCode, color).first();
             if (colorConflict) return apiError(`The color '${color}' is already taken in team ${teamCode}.`, 409);
             const jobConflict = await env.DB.prepare('SELECT 1 FROM members WHERE team_code = ? AND job = ? LIMIT 1').bind(teamCode, job).first();
             if (jobConflict) return apiError(`The job '${job}' is already taken in team ${teamCode}.`, 409);
             return apiError(`Color or job is already taken in team ${teamCode}.`, 409);
         }


         let avatarUrl: string | null = null;
         if (avatarFile instanceof File) {
              // Use Kinde User ID in avatar path for better uniqueness and association
              avatarUrl = await uploadAvatar(env, avatarFile, kindeUserId, teamCode); // Use kindeUserId
               if (avatarUrl === null) {
                  console.warn(`Join blocked for ${maimaiId}: Avatar upload failed.`);
                  return apiError('Failed to upload avatar. Member not added.', 500);
               }
         }

         const now = Math.floor(Date.now() / 1000);
         const insertResult = await env.DB.prepare(
             'INSERT INTO members (team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, kinde_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)' // ADDED kinde_user_id
         )
         .bind(teamCode, color, job, maimaiId, nickname, qqNumber, avatarUrl, now, kindeUserId) // ADDED kindeUserId
         .run();

         if (!insertResult.success) {
             console.error('Join team database insert failed:', insertResult.error);
             // Specific unique constraint errors are handled above
             return apiError('Failed to add member due to a database issue.', 500);
         }

         // Fetch the newly added member to return (optional, but useful)
         const newMemberId = insertResult.meta.last_row_id;
         const newMember = await env.DB.prepare('SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at, kinde_user_id FROM members WHERE id = ?') // Select kinde_user_id too
             .bind(newMemberId)
             .first<any>(); // Use any or define Member type

         return apiResponse({ success: true, message: "Member added successfully.", member: newMember }, 201);

    } catch (processingError) {
        console.error('Error during join team processing pipeline:', processingError);
        return apiError(
             `Failed to process join request: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`,
             500,
             processingError
        );
    }
}

// PATCH /api/members/:maimaiId (Requires Kinde Auth, uses Kinde ID for auth)
async function handleUserPatchMember(request: Request, env: Env, kindeUserId: string, ctx: ExecutionContext): Promise<Response> {
     const parts = new URL(request.url).pathname.split('/');
     if (parts.length !== 4 || !parts[3]) {
         return apiError('Invalid API path. Use /api/members/:maimaiId', 400);
     }
     const targetMaimaiId = parts[3]; // The Maimai ID from the URL path (used to find the record)

    let formData: FormData;
    try { formData = await request.formData(); } catch (e) { return apiError('Invalid request format for update. Expected multipart/form-data.', 400, e); }

    // --- Authorization Step ---
    // Verify the member exists AND belongs to the authenticated Kinde user
    const existingMember = await env.DB.prepare('SELECT * FROM members WHERE maimai_id = ? AND kinde_user_id = ?') // MODIFIED WHERE clause
        .bind(targetMaimaiId, kindeUserId) // Use Kinde ID for auth
        .first<any>(); // Use any or define Member type

    if (!existingMember) {
        // User not found with this Maimai ID OR it doesn't belong to the logged-in user
        return apiError('Authorization failed: Member not found or does not belong to your account.', 403); // 403 Forbidden
    }

    // --- Prepare Updates ---
    const updates: Partial<any> = {}; // Use any or define Member type
    const setClauses: string[] = [];
    const params: (string | number | null)[] = [];
    let newAvatarUrl: string | null | undefined = undefined;
    let oldAvatarUrlToDelete: string | null | undefined = undefined;

    // Get potential new values from FormData
    // User can update nickname, qqNumber, color, job, avatar
    const newNickname = formData.get('nickname')?.toString()?.trim();
    const newQqNumber = formData.get('qqNumber')?.toString()?.trim();
    const newColor = formData.get('color')?.toString();
    const newJob = formData.get('job')?.toString();
    const newAvatarFile = formData.get('avatarFile');
    const clearAvatar = formData.get('clearAvatar')?.toString() === 'true';

    // --- Validate and Add Fields to Update ---
    if (newNickname !== null && newNickname !== undefined && newNickname !== existingMember.nickname) { // Check against null/undefined and existing value
        if (newNickname.length === 0 || newNickname.length > 50) { return apiError('Nickname must be between 1 and 50 characters.', 400); }
        updates.nickname = newNickname; setClauses.push('nickname = ?'); params.push(newNickname);
    }
    if (newQqNumber !== null && newQqNumber !== undefined && newQqNumber !== existingMember.qq_number) { // Check against null/undefined and existing value
        if (!/^[1-9][0-9]{4,14}$/.test(newQqNumber)) { return apiError('Invalid format for new QQ number.', 400); }
        updates.qq_number = newQqNumber; setClauses.push('qq_number = ?'); params.push(newQqNumber);
    }
    // Check Color Change and Conflict (in the member's current team)
    if (newColor !== null && newColor !== undefined && newColor !== existingMember.color) { // Check against null/undefined and existing value
        if (!['red', 'green', 'blue'].includes(newColor)) return apiError('Invalid new color selection.', 400);
        const conflictCheck = await env.DB.prepare(
                'SELECT 1 FROM members WHERE team_code = ? AND color = ? AND id != ? LIMIT 1' // Check against other members by ID
            )
            .bind(existingMember.team_code, newColor, existingMember.id) // Use existingMember.id
            .first();
        if (conflictCheck) { return apiError(`The color '${newColor}' is already taken by another member in your team.`, 409); }
        updates.color = newColor; setClauses.push('color = ?'); params.push(newColor);
    }
   // Check Job Change and Conflict (in the member's current team)
   if (newJob !== null && newJob !== undefined && newJob !== existingMember.job) { // Check against null/undefined and existing value
        if (!['attacker', 'defender', 'supporter'].includes(newJob)) return apiError('Invalid new job selection.', 400);
         const conflictCheck = await env.DB.prepare(
                 'SELECT 1 FROM members WHERE team_code = ? AND job = ? AND id != ? LIMIT 1' // Check against other members by ID
            )
            .bind(existingMember.team_code, newJob, existingMember.id) // Use existingMember.id
            .first();
        if (conflictCheck) { return apiError(`The job '${newJob}' is already taken by another member in your team.`, 409); }
        updates.job = newJob; setClauses.push('job = ?'); params.push(newJob);
   }

    // --- Handle Avatar Changes ---
    if (clearAvatar) {
         newAvatarUrl = null; updates.avatar_url = null;
         if (existingMember.avatar_url) { oldAvatarUrlToDelete = existingMember.avatar_url; }
    } else if (newAvatarFile instanceof File) {
       console.log(`Processing new avatar file upload for member ID ${existingMember.id}`);
       // Use Kinde User ID in avatar path
       const idForAvatarPath = existingMember.kinde_user_id || existingMember.maimai_id; // Use Kinde ID if available
       const uploadedUrl = await uploadAvatar(env, newAvatarFile, idForAvatarPath, existingMember.team_code);
       if (uploadedUrl === null) { return apiError('Avatar upload failed. Profile update cancelled.', 500); }
       newAvatarUrl = uploadedUrl; updates.avatar_url = newAvatarUrl;
       if (existingMember.avatar_url && existingMember.avatar_url !== newAvatarUrl) { oldAvatarUrlToDelete = existingMember.avatar_url; }
    }
    if (newAvatarUrl !== undefined) { setClauses.push('avatar_url = ?'); params.push(newAvatarUrl); }


   if (setClauses.length === 0) { return apiResponse({ message: "No changes detected.", member: existingMember }, 200); }

   const now = Math.floor(Date.now() / 1000);
   setClauses.push('updated_at = ?'); params.push(now);

   params.push(existingMember.id); // Use internal ID for WHERE clause

   const updateQuery = `UPDATE members SET ${setClauses.join(', ')} WHERE id = ?`;
   console.log(`Executing user update for ID ${existingMember.id}: ${updateQuery} with params: ${JSON.stringify(params.slice(0, -1))}`);

   try {
       if (oldAvatarUrlToDelete) { ctx.waitUntil(deleteAvatarFromR2(env, oldAvatarUrlToDelete)); }

        const updateResult = await env.DB.prepare(updateQuery).bind(...params).run();

        if (!updateResult.success) {
             console.error(`User update member database operation failed for ID ${existingMember.id}:`, updateResult.error);
              if (updateResult.error?.includes('UNIQUE constraint failed')) {
                   return apiError(`Update failed due to a conflict (color or job in team). Please check values.`, 409);
              }
             return apiError('Failed to update member information due to a database issue.', 500);
        }

        if (updateResult.meta.changes === 0) {
            console.warn(`User update query executed for ID ${existingMember.id} but no rows were changed.`);
            // This might happen if the record was deleted between fetch and update, or if no fields actually changed (handled above)
            // Returning 404 might be more appropriate if the record is gone
            const checkExists = await env.DB.prepare('SELECT 1 FROM members WHERE id = ?').bind(existingMember.id).first();
            if (!checkExists) return apiError('Failed to update: Member record not found.', 404);
            return apiResponse({ message: "No changes detected or record unchanged.", member: existingMember }, 200); // Or 400 if no changes were sent
        }

        console.log(`Successfully updated member ID ${existingMember.id}. Changes: ${updateResult.meta.changes}`);

        // Fetch the *updated* member data to return
        const updatedMember = await env.DB.prepare('SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at, kinde_user_id FROM members WHERE id = ?') // Select kinde_user_id too
            .bind(existingMember.id)
            .first<any>(); // Use any or define Member type

        if (!updatedMember) {
              console.error(`Consistency issue: Member ID ${existingMember.id} updated but could not be re-fetched.`);
              return apiError('Update successful, but failed to retrieve updated data.', 500);
        }

        return apiResponse({ success: true, message: "Information updated successfully.", member: updatedMember }, 200);

   } catch (updateProcessError) {
        console.error(`Error during the user member update process for ID ${existingMember.id}:`, updateProcessError);
        return apiError(
             `Failed to process update: ${updateProcessError instanceof Error ? updateProcessError.message : 'Unknown error'}`,
             500,
             updateProcessError
        );
   }
}

// DELETE /api/members/:maimaiId (Requires Kinde Auth, uses Kinde ID for auth)
async function handleUserDeleteMember(request: Request, env: Env, kindeUserId: string, ctx: ExecutionContext): Promise<Response> {
    const parts = new URL(request.url).pathname.split('/');
    if (parts.length !== 4 || !parts[3]) {
        return apiError('Invalid API path. Use /api/members/:maimaiId', 400);
    }
    const targetMaimaiId = parts[3]; // The Maimai ID from the URL path

    // --- Authorize ---
    // Find the member by Maimai ID AND Kinde User ID
    const existingMember = await env.DB.prepare('SELECT id, team_code, avatar_url FROM members WHERE maimai_id = ? AND kinde_user_id = ?') // MODIFIED WHERE clause
        .bind(targetMaimaiId, kindeUserId) // Use Kinde ID for auth
        .first<{ id: number, team_code: string, avatar_url?: string | null }>();

    if (!existingMember) {
        // Member not found with this Maimai ID OR it doesn't belong to the logged-in user
        console.log(`User delete request for non-existent or unauthorized member: ${targetMaimaiId} (Kinde ID: ${kindeUserId})`);
        return apiError('Member not found or does not belong to your account.', 404); // 404 Not Found
    }

    // --- Execute Delete ---
    try {
        const teamCode = existingMember.team_code;
        const avatarUrlToDelete = existingMember.avatar_url;

        console.log(`Attempting to delete member record for ID ${existingMember.id} (Maimai ID: ${targetMaimaiId})`);
        const deleteResult = await env.DB.prepare('DELETE FROM members WHERE id = ?') // Delete by internal ID
            .bind(existingMember.id)
            .run();

        if (!deleteResult.success) {
            console.error(`User delete member database operation failed for ID ${existingMember.id}:`, deleteResult.error);
            return apiError('Failed to delete member due to a database issue.', 500);
        }
        if (deleteResult.meta.changes === 0) {
             console.warn(`User delete query executed for ID ${existingMember.id} but no rows changed.`);
             // This might happen if the record was deleted concurrently
             return apiError('Member not found or already deleted.', 404);
        }
        console.log(`Successfully deleted member record for ID ${existingMember.id}.`);

        if (avatarUrlToDelete) {
             console.log(`Attempting to delete associated avatar: ${avatarUrlToDelete}`);
             ctx.waitUntil(deleteAvatarFromR2(env, avatarUrlToDelete));
        }

       ctx.waitUntil(checkAndDeleteEmptyTeam(env, teamCode));

       return new Response(null, { status: 204, headers: CORS_HEADERS });

    } catch (deleteProcessError) {
        console.error(`Error during user member deletion process for ID ${existingMember.id}:`, deleteProcessError);
        return apiError(
           `Failed to process deletion: ${deleteProcessError instanceof Error ? deleteProcessError.message : 'Unknown error'}`,
            500,
            deleteProcessError
        );
    }
}

// GET /api/members/me (Requires Kinde Auth)
async function handleFetchMe(request: Request, env: Env, kindeUserId: string): Promise<Response> {
    try {
        // Find the member record associated with this Kinde User ID
        const member = await env.DB.prepare('SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at, kinde_user_id FROM members WHERE kinde_user_id = ?')
            .bind(kindeUserId)
            .first<any>(); // Use any or define Member type

        if (!member) {
            // This user is logged in via Kinde but hasn't registered yet
            return apiResponse({ member: null, message: "User not registered." }, 200); // Return 200 with null member
        }

        // User is logged in and has a registration
        return apiResponse({ member: member }, 200);

    } catch (e) {
        console.error(`Database error fetching member for Kinde ID ${kindeUserId}:`, e);
        return apiError('Failed to fetch member information.', 500, e);
    }
}

// GET /api/teams/:code (No auth needed)
async function handleGetTeamByCode(request: Request, env: Env): Promise<Response> {
    const parts = new URL(request.url).pathname.split('/');
    if (parts.length !== 4 || !parts[3]) {
        return apiError('Invalid API path. Use /api/teams/:code', 400);
    }
    const teamCode = parts[3];

    if (teamCode.length !== 4 || isNaN(parseInt(teamCode))) {
        return apiError('Invalid team code format.', 400);
    }

    try {
        // Fetch team and its members
        const teamResult = await env.DB.prepare('SELECT name FROM teams WHERE code = ? LIMIT 1').bind(teamCode).first<{ name: string }>();

        if (!teamResult) {
            return apiError(`Team with code ${teamCode} not found.`, 404);
        }

        // Select all member fields for admin/display purposes (excluding sensitive ones if any)
        const membersResult = await env.DB.prepare(
            'SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at, kinde_user_id FROM members WHERE team_code = ? ORDER BY joined_at ASC' // Include kinde_user_id
        ).bind(teamCode).all<any>(); // Use any or define Member type

        return apiResponse({
            success: true,
            code: teamCode,
            name: teamResult.name,
            members: membersResult.results || []
        }, 200);

    } catch (e) {
        console.error('Database error fetching team by code:', e);
        return apiError('Failed to fetch team information.', 500, e);
    }
}


// --- Admin Route Handlers (Require Admin API Key) ---

// GET /api/admin/members
async function handleAdminFetchMembers(request: Request, env: Env): Promise<Response> {
    // Admin authentication already checked by middleware
    try {
        // Fetch all members, including kinde_user_id
        const allMembers = await env.DB.prepare(
            'SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at, kinde_user_id FROM members ORDER BY team_code ASC, joined_at ASC' // ADDED kinde_user_id
        ).all<any>(); // Use any or define Member type
        return apiResponse({ members: allMembers.results || [] }, 200);
    } catch (e) {
        console.error('Database error fetching all members for admin:', e);
        return apiError('Failed to fetch all members from database.', 500, e);
    }
}

// POST /api/admin/members
async function handleAdminAddMember(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Admin authentication already checked by middleware

    let formData: FormData;
    try { formData = await request.formData(); } catch (e) { return apiError('Invalid request format. Expected multipart/form-data.', 400, e); }

    // Admin can provide all fields, including kinde_user_id
    const teamCode = formData.get('teamCode')?.toString();
    const color = formData.get('color')?.toString();
    const job = formData.get('job')?.toString();
    const maimaiId = formData.get('maimaiId')?.toString()?.trim();
    const nickname = formData.get('nickname')?.toString()?.trim();
    const qqNumber = formData.get('qqNumber')?.toString()?.trim();
    const kindeUserId = formData.get('kindeUserId')?.toString()?.trim() || null; // ADDED: Admin can provide Kinde ID (optional)
    const avatarFile = formData.get('avatarFile');

     // --- Input Validation ---
     if (!teamCode || teamCode.length !== 4 || isNaN(parseInt(teamCode))) return apiError('Invalid team code.', 400);
     if (!color || !['red', 'green', 'blue'].includes(color)) return apiError('Invalid color selection.', 400);
     if (!job || !['attacker', 'defender', 'supporter'].includes(job)) return apiError('Invalid job selection.', 400);
     if (!maimaiId || maimaiId.length === 0 || maimaiId.length > 13) return apiError('Maimai ID is required (1-13 chars).', 400);
     if (!nickname || nickname.length === 0 || nickname.length > 50) return apiError('Nickname is required (1-50 chars).', 400);
     if (!qqNumber || !/^[1-9][0-9]{4,14}$/.test(qqNumber)) return apiError('A valid QQ number is required.', 400);
     // Optional: Validate kindeUserId format if you have one
     // if (kindeUserId && !isValidKindeIdFormat(kindeUserId)) return apiError('Invalid Kinde User ID format.', 400);


    try {
        // Check if team exists
        const teamCheck = await env.DB.prepare('SELECT 1 FROM teams WHERE code = ? LIMIT 1').bind(teamCode).first();
        if (!teamCheck) return apiError(`Team with code ${teamCode} not found.`, 404);

        // Check for conflicts (maimai_id globally, kinde_user_id globally, color/job in team)
        const conflictChecks = await env.DB.batch([
            env.DB.prepare('SELECT 1 FROM members WHERE maimai_id = ? LIMIT 1').bind(maimaiId),
            // ADDED: Check if kinde_user_id is already taken globally (if provided)
            kindeUserId ? env.DB.prepare('SELECT 1 FROM members WHERE kinde_user_id = ? LIMIT 1').bind(kindeUserId) : env.DB.prepare('SELECT 0'), // Dummy query if no kindeUserId
            env.DB.prepare('SELECT 1 FROM members WHERE team_code = ? AND color = ? LIMIT 1').bind(teamCode, color),
            env.DB.prepare('SELECT 1 FROM members WHERE team_code = ? AND job = ? LIMIT 1').bind(teamCode, job),
        ]);

        if (conflictChecks[0]?.results?.[0]) return apiError(`Maimai ID '${maimaiId}' is already registered.`, 409);
        // ADDED: Kinde ID conflict check
        if (kindeUserId && conflictChecks[1]?.results?.[0]) return apiError(`Kinde User ID '${kindeUserId}' is already registered.`, 409);
        if (conflictChecks[2]?.results?.[0]) return apiError(`The color '${color}' is already taken in team ${teamCode}.`, 409);
        if (conflictChecks[3]?.results?.[0]) return apiError(`The job '${job}' is already taken in team ${teamCode}.`, 409);


        let avatarUrl: string | null = null;
        if (avatarFile instanceof File) {
             // Use Maimai ID or Kinde ID for avatar path
             const idForAvatarPath = kindeUserId || maimaiId; // Use kindeId if provided, else maimaiId
             avatarUrl = await uploadAvatar(env, avatarFile, idForAvatarPath, teamCode); // MODIFIED: Use idForAvatarPath
              if (avatarUrl === null) {
                 console.warn(`Admin add blocked for ${maimaiId}: Avatar upload failed.`);
                 return apiError('Failed to upload avatar. Member not added.', 500);
              }
        }

        const now = Math.floor(Date.now() / 1000);
        const insertResult = await env.DB.prepare(
            'INSERT INTO members (team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at, kinde_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)' // ADDED kinde_user_id
        )
        .bind(teamCode, color, job, maimaiId, nickname, qqNumber, avatarUrl, now, now, kindeUserId) // ADDED kindeUserId
        .run();

        if (!insertResult.success) {
            console.error('Admin add member database insert failed:', insertResult.error);
            return apiError('Failed to add member due to a database issue.', 500);
        }

        const newMemberId = insertResult.meta.last_row_id;
        const newMember = await env.DB.prepare('SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at, kinde_user_id FROM members WHERE id = ?') // Select kinde_user_id
            .bind(newMemberId)
            .first<any>(); // Use any or define Member type

        return apiResponse({ success: true, message: "Member added successfully.", member: newMember }, 201);

    } catch (processingError) {
        console.error('Error during admin add member processing:', processingError);
        return apiError(
             `Failed to process add member request: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`,
             500,
             processingError
        );
    }
}

// PATCH /api/admin/members/:id
async function handleAdminPatchMember(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Admin authentication already checked by middleware

    const parts = new URL(request.url).pathname.split('/');
     if (parts.length !== 5 || !parts[4]) { return apiError('Invalid API path. Use /api/admin/members/:id', 400); }
     const targetMemberId = parseInt(parts[4]);
     if (isNaN(targetMemberId)) { return apiError('Invalid member ID format in path.', 400); }

    let formData: FormData;
    try { formData = await request.formData(); } catch (e) { return apiError('Invalid request format for update. Expected multipart/form-data.', 400, e); }

    // Fetch existing member by ID (Admin bypasses Kinde ID auth here)
    const existingMember = await env.DB.prepare('SELECT * FROM members WHERE id = ?')
        .bind(targetMemberId)
        .first<any>(); // Use any or define Member type

    if (!existingMember) { return apiError(`Member with ID ${targetMemberId} not found.`, 404); }

    // Prepare updates
    const updates: Partial<any> = {}; // Use any or define Member type
    const setClauses: string[] = [];
    const params: (string | number | null)[] = [];
    let newAvatarUrl: string | null | undefined = undefined;
    let oldAvatarUrlToDelete: string | null | undefined = undefined;

    // Admin can update all fields
    const newTeamCode = formData.get('teamCode')?.toString();
    const newMaimaiId = formData.get('maimaiId')?.toString()?.trim();
    const newNickname = formData.get('nickname')?.toString()?.trim();
    const newQqNumber = formData.get('qqNumber')?.toString()?.trim();
    const newColor = formData.get('color')?.toString();
    const newJob = formData.get('job')?.toString();
    const newKindeUserId = formData.get('kindeUserId')?.toString()?.trim() || null; // ADDED: Admin can update Kinde ID
    const newAvatarFile = formData.get('avatarFile');
    const clearAvatar = formData.get('clearAvatar')?.toString() === 'true';

    // --- Validate and Add Fields to Update ---
    // Team Code
    if (newTeamCode !== null && newTeamCode !== undefined && newTeamCode !== existingMember.team_code) {
        if (newTeamCode.length !== 4 || isNaN(parseInt(newTeamCode))) { return apiError('Invalid new team code format (must be 4 digits).', 400); }
        const teamCheck = await env.DB.prepare('SELECT 1 FROM teams WHERE code = ? LIMIT 1').bind(newTeamCode).first();
        if (!teamCheck) { return apiError(`New team code ${newTeamCode} not found.`, 404); }
        updates.team_code = newTeamCode; setClauses.push('team_code = ?'); params.push(newTeamCode);
    }

    // Maimai ID
    if (newMaimaiId !== null && newMaimaiId !== undefined && newMaimaiId !== existingMember.maimai_id) {
        if (newMaimaiId.length === 0 || newMaimaiId.length > 13) { return apiError('New Maimai ID is required (1-13 chars).', 400); }
        const conflictCheck = await env.DB.prepare('SELECT 1 FROM members WHERE maimai_id = ? AND id != ? LIMIT 1').bind(newMaimaiId, targetMemberId).first();
        if (conflictCheck) { return apiError(`Maimai ID '${newMaimaiId}' is already registered by another member.`, 409); }
        updates.maimai_id = newMaimaiId; setClauses.push('maimai_id = ?'); params.push(newMaimaiId);
    }

    // Nickname
    if (newNickname !== null && newNickname !== undefined && newNickname !== existingMember.nickname) {
        if (newNickname.length === 0 || newNickname.length > 50) { return apiError('Nickname must be between 1 and 50 characters.', 400); }
        updates.nickname = newNickname; setClauses.push('nickname = ?'); params.push(newNickname);
    }

    // QQ Number
    if (newQqNumber !== null && newQqNumber !== undefined && newQqNumber !== existingMember.qq_number) {
        if (!/^[1-9][0-9]{4,14}$/.test(newQqNumber)) { return apiError('Invalid format for new QQ number.', 400); }
        updates.qq_number = newQqNumber; setClauses.push('qq_number = ?'); params.push(newQqNumber);
    }

    // Kinde User ID (ADDED)
    if (newKindeUserId !== null && newKindeUserId !== undefined && newKindeUserId !== existingMember.kinde_user_id) {
         // Optional: Validate format if you have one
         // if (newKindeUserId && !isValidKindeIdFormat(newKindeUserId)) return apiError('Invalid Kinde User ID format.', 400);

         // Check if the new Kinde User ID is already taken by *another* member (if not null)
         if (newKindeUserId) {
             const conflictCheck = await env.DB.prepare('SELECT 1 FROM members WHERE kinde_user_id = ? AND id != ? LIMIT 1')
                 .bind(newKindeUserId, targetMemberId)
                 .first();
             if (conflictCheck) {
                 return apiError(`Kinde User ID '${newKindeUserId}' is already registered by another member.`, 409);
             }
         }
        updates.kinde_user_id = newKindeUserId; setClauses.push('kinde_user_id = ?'); params.push(newKindeUserId);
    }

    // Color (Check conflict in the *new* team if teamCode changed, otherwise in the current team)
    const teamCodeForConflictCheck = updates.team_code || existingMember.team_code; // Use new teamCode if changed
    if (newColor !== null && newColor !== undefined && newColor !== existingMember.color) {
        if (!['red', 'green', 'blue'].includes(newColor)) return apiError('Invalid new color selection.', 400);
        const conflictCheck = await env.DB.prepare(
                'SELECT 1 FROM members WHERE team_code = ? AND color = ? AND id != ? LIMIT 1' // Check against other members by ID
            )
            .bind(teamCodeForConflictCheck, newColor, targetMemberId)
            .first();
        if (conflictCheck) { return apiError(`The color '${newColor}' is already taken by another member in team ${teamCodeForConflictCheck}.`, 409); }
        updates.color = newColor; setClauses.push('color = ?'); params.push(newColor);
    }

   // Job (Check conflict in the *new* team if teamCode changed, otherwise in the current team)
   if (newJob !== null && newJob !== undefined && newJob !== existingMember.job) {
        if (!['attacker', 'defender', 'supporter'].includes(newJob)) return apiError('Invalid new job selection.', 400);
         const conflictCheck = await env.DB.prepare(
                 'SELECT 1 FROM members WHERE team_code = ? AND job = ? AND id != ? LIMIT 1' // Check against other members by ID
            )
            .bind(teamCodeForConflictCheck, newJob, targetMemberId)
            .first();
        if (conflictCheck) { return apiError(`The job '${newJob}' is already taken by another member in team ${teamCodeForConflictCheck}.`, 409); }
        updates.job = newJob; setClauses.push('job = ?'); params.push(newJob);
   }

    // --- Handle Avatar Changes ---
    if (clearAvatar) {
         newAvatarUrl = null; updates.avatar_url = null;
         if (existingMember.avatar_url) { oldAvatarUrlToDelete = existingMember.avatar_url; }
    } else if (newAvatarFile instanceof File) {
       console.log(`Processing new avatar file upload for member ID ${targetMemberId}`);
       // Use the *new* team code for the R2 path if it was changed, otherwise use the existing one
       const teamCodeForAvatarPath = updates.team_code || existingMember.team_code;
       // Use the *new* maimai ID or kinde ID for the R2 key
       const idForAvatarKey = updates.kinde_user_id || existingMember.kinde_user_id || updates.maimai_id || existingMember.maimai_id; // Prioritize Kinde ID
       const uploadedUrl = await uploadAvatar(env, newAvatarFile, idForAvatarKey, teamCodeForAvatarPath);
       if (uploadedUrl === null) { return apiError('Avatar upload failed. Member update cancelled.', 500); }
       newAvatarUrl = uploadedUrl; updates.avatar_url = newAvatarUrl;
       if (existingMember.avatar_url && existingMember.avatar_url !== newAvatarUrl) { oldAvatarUrlToDelete = existingMember.avatar_url; }
    }
    if (newAvatarUrl !== undefined) { setClauses.push('avatar_url = ?'); params.push(newAvatarUrl); }


   if (setClauses.length === 0) { return apiResponse({ message: "No changes detected.", member: existingMember }, 200); }

   const now = Math.floor(Date.now() / 1000);
   setClauses.push('updated_at = ?'); params.push(now);

   params.push(targetMemberId); // For `WHERE id = ?`

   const updateQuery = `UPDATE members SET ${setClauses.join(', ')} WHERE id = ?`;
   console.log(`Executing admin update for ID ${targetMemberId}: ${updateQuery} with params: ${JSON.stringify(params.slice(0, -1))}`);

   try {
       // Delete old avatar asynchronously if needed
       if (oldAvatarUrlToDelete) {
            console.log(`Attempting to delete old avatar: ${oldAvatarUrlToDelete}`);
            ctx.waitUntil(deleteAvatarFromR2(env, oldAvatarUrlToDelete));
       }

        const updateResult = await env.DB.prepare(updateQuery).bind(...params).run();

        if (!updateResult.success) {
             console.error(`Admin update member database operation failed for ID ${targetMemberId}:`, updateResult.error);
              if (updateResult.error?.includes('UNIQUE constraint failed')) {
                   return apiError(`Update failed due to a conflict (color, job in team, Maimai ID globally, or Kinde ID globally). Please check values.`, 409);
              }
             return apiError('Failed to update member information due to a database issue.', 500);
        }

        if (updateResult.meta.changes === 0) {
            console.warn(`Admin update query executed for ID ${targetMemberId} but no rows were changed.`);
            const checkExists = await env.DB.prepare('SELECT 1 FROM members WHERE id = ?').bind(targetMemberId).first();
            if (!checkExists) return apiError('Failed to update: Member record not found.', 404);
            return apiResponse({ message: "No changes detected or record unchanged.", member: existingMember }, 200); // Or 400 if no changes were sent
        }

        console.log(`Successfully updated member ID ${targetMemberId}. Changes: ${updateResult.meta.changes}`);

        // If team code was changed, check if the OLD team is now empty and delete it asynchronously
        if (updates.team_code && updates.team_code !== existingMember.team_code) {
            console.log(`Team code changed from ${existingMember.team_code} to ${updates.team_code}. Checking old team.`);
            ctx.waitUntil(checkAndDeleteEmptyTeam(env, existingMember.team_code));
        }


        // Fetch the *updated* member data to return
        const updatedMember = await env.DB.prepare('SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at, kinde_user_id FROM members WHERE id = ?') // Select kinde_user_id
            .bind(targetMemberId)
            .first<any>(); // Use any or define Member type

        if (!updatedMember) {
              console.error(`Consistency issue: Member ID ${targetMemberId} updated but could not be re-fetched.`);
              return apiError('Update successful, but failed to retrieve updated data.', 500);
        }

        return apiResponse({ success: true, message: "Information updated successfully.", member: updatedMember }, 200);

   } catch (updateProcessError) {
        console.error(`Error during the admin member update process for ID ${targetMemberId}:`, updateProcessError);
        return apiError(
             `Failed to process update: ${updateProcessError instanceof Error ? updateProcessError.message : 'Unknown error'}`,
             500,
             updateProcessError
        );
   }
}

// DELETE /api/admin/members/:id
async function handleAdminDeleteMember(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Admin authentication already checked by middleware

    const parts = new URL(request.url).pathname.split('/');
    if (parts.length !== 5 || !parts[4]) { return apiError('Invalid API path. Use /api/admin/members/:id', 400); }
    const targetMemberId = parseInt(parts[4]);
    if (isNaN(targetMemberId)) { return apiError('Invalid member ID format in path.', 400); }

    // Fetch member by ID to get team_code and avatar_url before deleting
    const existingMember = await env.DB.prepare('SELECT id, team_code, avatar_url FROM members WHERE id = ?')
        .bind(targetMemberId)
        .first<{ id: number, team_code: string, avatar_url?: string | null }>();

    if (!existingMember) {
        console.log(`Admin delete request for non-existent member ID: ${targetMemberId}`);
        return apiError('Member not found.', 404);
    }

    try {
        const teamCode = existingMember.team_code;
        const avatarUrlToDelete = existingMember.avatar_url;

        console.log(`Attempting to delete member record for ID ${targetMemberId}`);
        const deleteResult = await env.DB.prepare('DELETE FROM members WHERE id = ?')
            .bind(targetMemberId)
            .run();

        if (!deleteResult.success) {
            console.error(`Admin delete member database operation failed for ID ${targetMemberId}:`, deleteResult.error);
            return apiError('Failed to delete member due to a database issue.', 500);
        }
        if (deleteResult.meta.changes === 0) {
             console.warn(`Admin delete query executed for ID ${targetMemberId} but no rows changed.`);
             return apiError('Member not found or already deleted.', 404);
        }
        console.log(`Successfully deleted member record for ID ${targetMemberId}.`);

        // Delete associated avatar asynchronously
        if (avatarUrlToDelete) {
             console.log(`Attempting to delete associated avatar: ${avatarUrlToDelete}`);
             ctx.waitUntil(deleteAvatarFromR2(env, avatarUrlToDelete));
        }

       // Check and delete empty team asynchronously
       ctx.waitUntil(checkAndDeleteEmptyTeam(env, teamCode));

       // Return 204 No Content on successful deletion
       return new Response(null, { status: 204, headers: CORS_HEADERS });

    } catch (deleteProcessError) {
        console.error(`Error during admin member deletion process for ID ${targetMemberId}:`, deleteProcessError);
        return apiError(
           `Failed to process deletion: ${deleteProcessError instanceof Error ? deleteProcessError.message : 'Unknown error'}`,
            500,
            deleteProcessError
        );
    }
}

// GET /api/admin/export/csv
async function handleAdminExportCsv(request: Request, env: Env): Promise<Response> {
    // Admin authentication already checked by middleware

    try {
        // Fetch all members, including kinde_user_id
        const allMembersResult = await env.DB.prepare(
            'SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at, kinde_user_id FROM members ORDER BY team_code ASC, joined_at ASC' // ADDED kinde_user_id
        ).all<any>(); // Use any or define Member type

        const members = allMembersResult.results || [];

        if (members.length === 0) {
            return new Response("No data to export.", { status: 404, headers: CORS_HEADERS });
        }

        // Generate CSV content
        const headers = ['ID', '队伍码', '颜色', '职业', '舞萌ID', '称呼', 'QQ号', 'Kinde用户ID', '头像URL', '加入时间', '更新时间']; // ADDED Kinde用户ID header
        let csvContent = headers.join(',') + '\n';

        members.forEach(member => {
            const escapeCsv = (value: any) => {
                if (value === null || value === undefined) return '';
                const stringValue = String(value);
                if (/[,"'\n]/.test(stringValue)) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            };

            const row = [
                escapeCsv(member.id),
                escapeCsv(member.team_code),
                escapeCsv(getColorText(member.color)),
                escapeCsv(getJobText(member.job)),
                escapeCsv(member.maimai_id),
                escapeCsv(member.nickname),
                escapeCsv(member.qq_number),
                escapeCsv(member.kinde_user_id || ''), // ADDED Kinde User ID
                escapeCsv(member.avatar_url || ''),
                escapeCsv(formatTimestamp(member.joined_at)),
                escapeCsv(formatTimestamp(member.updated_at)),
            ];
            csvContent += row.join(',') + '\n';
        });

        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.-]/g, '').slice(0, 14);
        const filename = `members_export_${timestamp}.csv`;

        return new Response(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
                ...CORS_HEADERS,
            },
        });

    } catch (e) {
        console.error('Database or processing error during CSV export:', e);
        return apiError('Failed to generate CSV export.', 500, e);
    }
}


// --- Main Worker Fetch Handler ---

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

        // --- 1. Handle CORS Preflight Request (OPTIONS) ---
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: CORS_HEADERS
            });
        }

        const url = new URL(request.url);
        const pathname = url.pathname;
        const method = request.method;
        console.log(`[Request] ${method} ${pathname}`);

        // --- 2. Admin Endpoint Authentication Check (API Key) ---
        // Apply this check *before* Kinde auth, as admin uses a different method
        if (pathname.startsWith('/api/admin/')) {
            if (!isAdminAuthenticated(request, env)) {
                return apiError('Authentication failed.', 401);
            }
            // If authenticated, proceed to admin route handlers
        }
        // --- End Admin Auth Check ---


        try {
            // --- 3. Kinde Authentication Middleware for User Routes ---
            const protectedUserPaths = [
                '/api/teams/join',
                '/api/members/', // User edit/delete starts with this
                '/api/members/me', // New endpoint
            ];

            const isProtectedUserRoute = protectedUserPaths.some(p => pathname.startsWith(p));

            let kindeUserId: string | null = null;
            if (isProtectedUserRoute) {
                 kindeUserId = await getAuthenticatedKindeUser(request, env);
                 if (!kindeUserId) {
                     // Return 401 if no token/invalid token for protected user routes
                     return apiError('Authentication required.', 401);
                 }
                 // kindeUserId is now available for the user route handlers below
             }
            // --- End Kinde Authentication Middleware ---


            // --- 4. Routing Logic ---

            // Kinde Callback Endpoint
            if (method === 'POST' && pathname === '/api/kinde/callback') {
                return handleKindeCallback(request, env, ctx);
            }

            // Kinde Logout Endpoint (Optional backend step)
            else if (method === 'POST' && pathname === '/api/auth/logout') {
                 return handleLogout(request, env);
            }

            // Public Team Check
            else if (method === 'POST' && pathname === '/api/teams/check') {
                return handleCheckTeam(request, env);
            }

            // Public Team Create
            else if (method === 'POST' && pathname === '/api/teams/create') {
                return handleCreateTeam(request, env);
            }

            // User Join Team (Requires Kinde Auth)
            else if (method === 'POST' && pathname === '/api/teams/join') {
                 // kindeUserId is guaranteed to be non-null here by the middleware
                 return handleJoinTeam(request, env, kindeUserId!, ctx); // Use non-null assertion as middleware checked
            }

            // User Patch Member (Requires Kinde Auth)
            else if (method === 'PATCH' && pathname.startsWith('/api/members/')) {
                 // kindeUserId is guaranteed to be non-null here by the middleware
                 return handleUserPatchMember(request, env, kindeUserId!, ctx); // Use non-null assertion
            }

           // User Delete Member (Requires Kinde Auth)
           else if (method === 'DELETE' && pathname.startsWith('/api/members/')) {
               // kindeUserId is guaranteed to be non-null here by the middleware
               return handleUserDeleteMember(request, env, kindeUserId!, ctx); // Use non-null assertion
           }

           // Fetch Current User's Member Info (Requires Kinde Auth)
           else if (method === 'GET' && pathname === '/api/members/me') {
               // kindeUserId is guaranteed to be non-null here by the middleware
               return handleFetchMe(request, env, kindeUserId!); // Use non-null assertion
           }

           // Public Get Team by Code
           else if (method === 'GET' && pathname.startsWith('/api/teams/')) {
               return handleGetTeamByCode(request, env);
           }

           // --- Admin Endpoints (Admin Auth already checked) ---

           // Admin Fetch All Members
           else if (method === 'GET' && pathname === '/api/admin/members') {
               return handleAdminFetchMembers(request, env);
           }

           // Admin Add Member
           else if (method === 'POST' && pathname === '/api/admin/members') {
               return handleAdminAddMember(request, env, ctx);
           }

           // Admin Patch Member
           else if (method === 'PATCH' && pathname.startsWith('/api/admin/members/')) {
               return handleAdminPatchMember(request, env, ctx);
           }

           // Admin Delete Member
           else if (method === 'DELETE' && pathname.startsWith('/api/admin/members/')) {
               return handleAdminDeleteMember(request, env, ctx);
           }

           // Admin Export CSV
           else if (method === 'GET' && pathname === '/api/admin/export/csv') {
               return handleAdminExportCsv(request, env);
           }


           // --- 5. 404 Catch All ---
           else {
               // If no route matched
               return apiError('Endpoint not found.', 404);
           }

       } catch (globalError) { // Catch any unexpected errors not handled by specific routes
           console.error('Unhandled exception in Worker:', globalError);
           return apiError(
               'An unexpected internal server error occurred.',
               500,
               globalError instanceof Error ? globalError : new Error(JSON.stringify(globalError))
           );
       }
   },
};

// Optional: Define a basic Member type if you prefer type safety over 'any'
// interface Member {
//     id: number;
//     team_code: string;
//     color: string;
//     job: string;
//     maimai_id: string;
//     nickname: string;
//     qq_number: string;
//     avatar_url: string | null;
//     joined_at: number;
//     updated_at: number;
//     kinde_user_id: string | null;
// }
