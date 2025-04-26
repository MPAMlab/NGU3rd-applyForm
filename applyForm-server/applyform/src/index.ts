// Define the type for the D1 database binding
interface Env {
    DB: D1Database;
}

// --- CORS Headers ---
// Define these once to reuse
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*', // Adjust for production
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', // Methods your API uses
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Headers your client might send
    'Access-Control-Max-Age': '86400', // Cache preflight for 1 day
};

// --- Helper Functions (Independent of itty-router) ---

/**
 * Creates a standard JSON success response.
 * @param data The data payload.
 * @param status HTTP status code (default: 200).
 */
const apiResponse = (data: any, status = 200): Response => {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS // Include CORS headers
        }
    });
};

/**
 * Creates a standard JSON error response.
 * @param message Error message string.
 * @param status HTTP status code (default: 400).
 */
const apiError = (message: string, status = 400): Response => {
     console.error(`[API Error ${status}]: ${message}`); // Log errors server-side
     return new Response(JSON.stringify({ error: message }), {
         status: status,
         headers: {
             'Content-Type': 'application/json',
             ...CORS_HEADERS // Include CORS headers
         }
     });
};

// --- Main Fetch Handler ---

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // --- 1. Handle CORS Preflight (OPTIONS) ---
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204, // No Content
                headers: CORS_HEADERS
            });
        }

        const url = new URL(request.url);
        const pathname = url.pathname;
        console.log(`[Request] ${request.method} ${pathname}`); // Log incoming request

        try {
            // --- 2. Routing Logic ---

            // POST /api/teams/check
            if (request.method === 'POST' && pathname === '/api/teams/check') {
                const body = await request.json();
                const code = body?.code; // Optional chaining for safety

                if (!code || typeof code !== 'string' || code.length !== 4 || isNaN(parseInt(code))) {
                    return apiError('Invalid team code format.', 400);
                }

                const teamResult = await env.DB.prepare('SELECT code, name FROM teams WHERE code = ?')
                    .bind(code)
                    .first();

                if (!teamResult) {
                    return apiResponse({ exists: false, code: code }, 200);
                }

                const membersResult = await env.DB.prepare('SELECT color, job, nickname FROM members WHERE team_code = ?')
                    .bind(code)
                    .all();

                return apiResponse({
                    exists: true,
                    code: teamResult.code,
                    name: teamResult.name,
                    members: membersResult.results || []
                }, 200);
            }

            // POST /api/teams/create
            else if (request.method === 'POST' && pathname === '/api/teams/create') {
                const body = await request.json();
                const code = body?.code;
                const name = body?.name;

                if (!code || typeof code !== 'string' || code.length !== 4 || isNaN(parseInt(code))) {
                    return apiError('Invalid team code format.', 400);
                }
                if (!name || typeof name !== 'string' || name.trim().length === 0) {
                    return apiError('Invalid team name.', 400);
                }

                // Check if team already exists
                const existingTeam = await env.DB.prepare('SELECT code FROM teams WHERE code = ?')
                   .bind(code)
                   .first();

                if (existingTeam) {
                   return apiError(`Team code ${code} already exists.`, 409); // Conflict
                }

                const now = Math.floor(Date.now() / 1000);
                const insertResult = await env.DB.prepare('INSERT INTO teams (code, name, created_at) VALUES (?, ?, ?)')
                    .bind(code, name.trim(), now)
                    .run();

                if (!insertResult.success) {
                     console.error('Create team insert failed:', insertResult);
                     // Check if it was specifically a unique constraint violation (redundant but safe)
                     if (insertResult.error?.includes('UNIQUE constraint failed')) {
                        return apiError(`Team code ${code} already exists.`, 409);
                     }
                     return apiError('Failed to create team.', 500); // Generic DB error
                }

                return apiResponse({ success: true, code: code, name: name.trim() }, 201); // Created
            }

            // POST /api/teams/join
            else if (request.method === 'POST' && pathname === '/api/teams/join') {
                let body: any; // Declare body outside try block for use in catch
                try {
                    body = await request.json();
                    const { teamCode, color, job, maimaiId, nickname, qqNumber } = body;

                    // --- Input Validation ---
                    if (!teamCode || typeof teamCode !== 'string' || teamCode.length !== 4 || isNaN(parseInt(teamCode))) {
                        return apiError('Invalid team code format.', 400);
                    }
                    if (!color || !['red', 'green', 'blue'].includes(color)) {
                        return apiError('Invalid color selected.', 400);
                    }
                    if (!job || !['attacker', 'defender', 'supporter'].includes(job)) {
                        return apiError('Invalid job selected.', 400);
                    }
                    if (!maimaiId || typeof maimaiId !== 'string' || maimaiId.trim().length === 0) {
                        return apiError('Maimai ID is required.', 400);
                    }
                    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
                        return apiError('Nickname is required.', 400);
                    }
                    if (!qqNumber || typeof qqNumber !== 'string' || qqNumber.trim().length === 0) {
                        return apiError('QQ number is required.', 400);
                    }
                    // --- End Validation ---

                    // Check if team exists
                    const teamResult = await env.DB.prepare('SELECT code, name FROM teams WHERE code = ?') // Fetch name here too
                        .bind(teamCode)
                        .first<{ code: string; name: string }>(); // Type assertion

                    if (!teamResult) {
                        return apiError(`Team with code ${teamCode} not found.`, 404);
                    }

                    // Check if team is full
                    const memberCountResult = await env.DB.prepare('SELECT COUNT(*) as count FROM members WHERE team_code = ?')
                        .bind(teamCode)
                        .first<{ count: number }>();

                    if (memberCountResult && memberCountResult.count >= 3) {
                        return apiError(`Team ${teamCode} is already full (3 members).`, 409);
                    }

                    // Insert new member (UNIQUE constraints will handle color/job conflicts)
                    const now = Math.floor(Date.now() / 1000);
                    const insertResult = await env.DB.prepare('INSERT INTO members (team_code, color, job, maimai_id, nickname, qq_number, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                        .bind(teamCode, color, job, maimaiId.trim(), nickname.trim(), qqNumber.trim(), now)
                        .run();

                    if (!insertResult.success) {
                         console.error('Join team insert failed:', insertResult);
                         // Specific conflict errors are handled by the D1 unique constraints and caught below
                         return apiError('Failed to add member to team due to database error. Check logs.', 500);
                    }

                    // Fetch updated team info for the success response
                     const updatedMembersResult = await env.DB.prepare('SELECT color, job, nickname FROM members WHERE team_code = ?')
                        .bind(teamCode)
                        .all();

                     return apiResponse({
                        success: true,
                        code: teamCode,
                        name: teamResult.name, // Use the name fetched earlier
                        members: updatedMembersResult.results || []
                     }, 201); // Created

                } catch (e: any) { // Catch errors from DB insert particularly
                    console.error('Error during join team processing:', e);
                    // Use body?.variable safely in case request.json() failed earlier
                    if (e.message && e.message.includes('UNIQUE constraint failed')) {
                        if (e.message.includes('members.team_code, members.color')) {
                            return apiError(`Color ${body?.color || 'selected'} is already taken in team ${body?.teamCode || ''}.`, 409);
                        }
                        if (e.message.includes('members.team_code, members.job')) {
                            return apiError(`Job ${body?.job || 'selected'} is already taken in team ${body?.teamCode || ''}.`, 409);
                        }
                    }
                    // Handle JSON parsing error or other generic error
                    return apiError(`Failed to process join request. ${e.message}`, 500);
                }
            }

            // GET /api/teams/:code
            else if (request.method === 'GET' && pathname.startsWith('/api/teams/')) {
                const parts = pathname.split('/'); // ['', 'api', 'teams', 'CODE']
                if (parts.length === 4) {
                    const teamCode = parts[3];

                    if (!teamCode || typeof teamCode !== 'string' || teamCode.length !== 4 || isNaN(parseInt(teamCode))) {
                        return apiError('Invalid team code format in URL.', 400);
                    }

                    const teamResult = await env.DB.prepare('SELECT code, name, created_at FROM teams WHERE code = ?')
                        .bind(teamCode)
                        .first();

                    if (!teamResult) {
                        return apiError(`Team with code ${teamCode} not found.`, 404);
                    }

                    const membersResult = await env.DB.prepare('SELECT color, job, maimai_id, nickname, qq_number, joined_at FROM members WHERE team_code = ?')
                        .bind(teamCode)
                        .all();

                    return apiResponse({
                        code: teamResult.code,
                        name: teamResult.name,
                        createdAt: teamResult.created_at,
                        members: membersResult.results || []
                    }, 200);

                } else {
                    // Malformed path like /api/teams/ or /api/teams/abc/def
                    return apiError('Invalid GET request path for teams.', 400);
                }
            }

            // --- 3. Handle Not Found (404) ---
            else {
                return apiError('Endpoint not found.', 404);
            }

        } catch (e: any) { // Catch top-level errors (e.g., unexpected errors before routing)
            console.error('Unhandled Exception in fetch:', e);
             if (e instanceof SyntaxError && e.message.includes('JSON')) {
                return apiError('Invalid JSON in request body.', 400);
            }
            return apiError(`Internal Server Error: ${e.message}`, 500);
        }
    },
};