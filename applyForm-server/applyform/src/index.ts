// --- Configuration ---
/**
 * IMPORTANT: Configure this with your public R2 URL base.
 * This is the prefix for avatar URLs. It should NOT have a trailing slash.
 * e.g., 'https://pub-xxxxxxxx.r2.dev' or 'https://your-custom-domain.com'
 */
const R2_PUBLIC_URL_BASE = 'https://ngu3-signup-bucket.srt.pub';

/** Max avatar file size in Megabytes */
const AVATAR_SIZE_LIMIT_MB = 2;

/**
 * IMPORTANT: Restrict this in production for security!
 * Use your frontend domain, e.g., 'https://your-frontend-domain.com'
 * '*' is insecure for production environments.
 */
const CORS_ALLOWED_ORIGIN = '*'; // Consider restricting this in production

/**
 * IMPORTANT: Define a secret key for admin access.
 * Store this in Cloudflare Worker Secrets (e.g., ADMIN_API_KEY).
 * DO NOT hardcode a sensitive key here in production code.
 */
// const ADMIN_API_KEY = 'YOUR_VERY_SECRET_ADMIN_KEY'; // Example - Use Secrets instead!

// --- Types ---
interface Env {
    DB: D1Database;
    AVATAR_BUCKET: R2Bucket; // R2 binding for storing avatars
    ADMIN_API_KEY?: string; // ADDED: Admin API Key secret
}

interface Member {
    id: number; // Internal DB id
    team_code: string;
    color: string;
    job: string;
    maimai_id: string;
    nickname: string;
    qq_number: string;
    avatar_url?: string | null; // URL from R2
    joined_at: number; // Unix timestamp (seconds)
    updated_at?: number | null; // Unix timestamp (seconds)
}

// --- CORS Headers ---
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': CORS_ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    // ADDED: Allow X-Admin-API-Key header for admin endpoints
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-API-Key',
    'Access-Control-Max-Age': '86400',
};

// --- Helper Functions ---

/** Creates a standard JSON success response with CORS headers. */
const apiResponse = (data: any, status = 200): Response => {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
        }
    });
};

/** Creates a standard JSON error response with CORS headers. Logs the error. */
const apiError = (message: string, status = 400, error?: Error | unknown): Response => {
     console.error(
         `[API Error ${status}]: ${message}`,
         error ? `\nDetails: ${error instanceof Error ? error.stack || error.message : JSON.stringify(error)}` : ''
     );
     return new Response(JSON.stringify({ error: message }), {
         status: status,
         headers: {
             'Content-Type': 'application/json',
             ...CORS_HEADERS
         }
     });
};

/**
 * Simple Authentication/Authorization Check using Maimai ID and QQ Number.
 * WARNING: This is INSECURE for production environments. Use proper auth methods if needed.
 * Returns the full member object if found and authorized, null otherwise.
 * NOTE: This is used for *user* initiated edits/deletes, NOT for admin endpoints.
 */
async function authorizeMemberSimple(db: D1Database, maimaiId: string, qqNumber: string): Promise<Member | null> {
     if (!maimaiId || !qqNumber || !/^[1-9][0-9]{4,14}$/.test(qqNumber)) {
          console.warn(`Authorization attempt failed due to invalid input - Maimai ID: ${maimaiId}, QQ: ${qqNumber}`);
          return null;
     }
    try {
         const member = await db.prepare('SELECT * FROM members WHERE maimai_id = ? AND qq_number = ?')
             .bind(maimaiId, qqNumber)
             .first<Member>();

         if (!member) {
             console.log(`Authorization failed: No matching record for Maimai ID ${maimaiId} and provided QQ.`);
         } else {
             console.log(`Authorization successful for Maimai ID ${maimaiId}.`);
         }
         return member;
     } catch (e) {
         console.error(`Authorization check database error for Maimai ID ${maimaiId}:`, e);
         return null;
     }
}

/**
 * ADDED: Admin Authentication Check.
 * Requires a specific header with the correct API key.
 */
function isAdminAuthenticated(request: Request, env: Env): boolean {
    const providedKey = request.headers.get('X-Admin-API-Key');
    // Check if the secret is configured and matches the provided key
    const isAuthenticated = env.ADMIN_API_KEY && providedKey === env.ADMIN_API_KEY;
    if (!isAuthenticated) {
        console.warn(`Admin authentication failed. Provided key: ${providedKey ? '...' + providedKey.slice(-4) : 'None'}`);
    }
    return isAuthenticated;
}


/**
 * Uploads an avatar file to the configured R2 bucket.
 * Handles validation (type, size), generates a unique key, and returns the public URL.
 * Returns the public URL string on success, null on failure or validation error.
 */
async function uploadAvatar(env: Env, file: File, maimaiId: string, teamCode: string): Promise<string | null> {
    if (!env.AVATAR_BUCKET) {
        console.error("Configuration Error: AVATAR_BUCKET binding not found. Cannot upload avatar.");
        return null;
    }
    if (!(file instanceof File)) {
        console.log(`Avatar upload skipped for ${maimaiId}: No valid file provided.`);
        return null;
    }

    try {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
             console.warn(`Avatar upload skipped for ${maimaiId}: Invalid file type ${file.type}.`);
             return null; // Or throw error if you want to block the operation
        }
        const sizeLimitBytes = AVATAR_SIZE_LIMIT_MB * 1024 * 1024;
        if (file.size > sizeLimitBytes) {
             console.warn(`Avatar upload skipped for ${maimaiId}: File size ${file.size} bytes exceeds ${AVATAR_SIZE_LIMIT_MB}MB limit.`);
             return null; // Or throw error
        }

        const fileNameParts = file.name.split('.');
        const fileExtension = fileNameParts.length > 1 ? `.${fileNameParts.pop()?.toLowerCase()}` : '.png';
        const objectKey = `avatars/${teamCode}/${maimaiId}-${Date.now()}${fileExtension}`;

        console.log(`Uploading avatar to R2 for ${maimaiId} as key: ${objectKey}`);
        const uploadedObject = await env.AVATAR_BUCKET.put(objectKey, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type },
        });

        if (!uploadedObject || !uploadedObject.key) {
             console.error(`R2 put operation failed for ${objectKey}. Upload result:`, uploadedObject);
            return null;
        }

         const publicUrl = `${R2_PUBLIC_URL_BASE.replace(/\/$/, '')}/${uploadedObject.key}`;
        console.log(`Avatar for ${maimaiId} uploaded successfully. Public URL: ${publicUrl}`);
        return publicUrl;

    } catch (uploadError) {
        console.error(`Failed during avatar upload process for ${maimaiId}:`, uploadError);
        return null;
    }
}

/**
 * Deletes an object from the R2 bucket based on its expected public URL.
 * This is a best-effort operation and logs errors without throwing.
 */
 async function deleteAvatarFromR2(env: Env, avatarUrl: string | null | undefined): Promise<void> {
     if (!avatarUrl || !env.AVATAR_BUCKET || !R2_PUBLIC_URL_BASE) {
         if (avatarUrl) console.log(`Skipping avatar deletion for ${avatarUrl}: R2 bucket or base URL not configured.`);
         return;
     }

     try {
         const baseUrl = R2_PUBLIC_URL_BASE.replace(/\/$/, '');
         if (!avatarUrl.startsWith(baseUrl + '/')) {
             console.warn(`Cannot delete avatar: URL '${avatarUrl}' does not match R2 base '${baseUrl}/'.`);
             return;
         }

         const keyToDelete = avatarUrl.substring(baseUrl.length + 1);

         if (!keyToDelete) {
             console.warn(`Could not extract a valid key from avatar URL: ${avatarUrl}`);
             return;
         }

         console.log(`Requesting deletion of avatar from R2 with key: ${keyToDelete}`);
         await env.AVATAR_BUCKET.delete(keyToDelete);
         console.log(`Successfully requested deletion for R2 key: ${keyToDelete}.`);

     } catch (deleteError) {
         console.error(`Failed to delete avatar from R2 (URL: ${avatarUrl}, Key: ${keyToDelete || 'unknown'}):`, deleteError);
     }
 }

/**
* Helper function to check if a team is empty after a member leaves/is deleted
* and deletes the team record if it is. Runs asynchronously.
*/
async function checkAndDeleteEmptyTeam(env: Env, teamCode: string): Promise<void> {
   try {
       console.log(`Checking if team ${teamCode} is empty after member deletion.`);
       const memberCountResult = await env.DB.prepare(
           'SELECT COUNT(*) as count FROM members WHERE team_code = ?'
       ).bind(teamCode).first<{ count: number }>();

       if (memberCountResult && memberCountResult.count === 0) {
           console.log(`Team ${teamCode} is empty. Attempting to delete team record.`);
           const deleteTeamResult = await env.DB.prepare('DELETE FROM teams WHERE code = ?').bind(teamCode).run();
           if (deleteTeamResult.success && deleteTeamResult.meta.changes > 0) {
               console.log(`Successfully deleted empty team ${teamCode}.`);
           } else {
               console.error(`Failed to delete empty team ${teamCode}. Result:`, deleteTeamResult);
           }
       } else {
           console.log(`Team ${teamCode} still has ${memberCountResult?.count ?? 'unknown'} members. Not deleting team.`);
       }
   } catch (e) {
       console.error(`Error during empty team check/delete for ${teamCode}:`, e);
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

        // Prepare for routing
        const url = new URL(request.url);
        const pathname = url.pathname;
        const method = request.method;
        console.log(`[Request] ${method} ${pathname}`);

        // --- ADDED: Admin Endpoint Authentication Check ---
        // Apply this check to all /api/admin paths
        if (pathname.startsWith('/api/admin/')) {
            if (!isAdminAuthenticated(request, env)) {
                return apiError('Authentication failed.', 401); // 401 Unauthorized
            }
        }
        // --- End Admin Auth Check ---


        try {
            // --- Routing Logic ---

            // POST /api/teams/check (Existing)
            if (method === 'POST' && pathname === '/api/teams/check') {
                const body = await request.json().catch(() => null);
                if (!body) return apiError('Invalid or missing JSON body.', 400);
                const code = body?.code;

                 if (!code || typeof code !== 'string' || code.length !== 4 || isNaN(parseInt(code))) {
                     return apiError('Invalid team code format (must be 4 digits).', 400);
                 }

                const teamResult = await env.DB.prepare('SELECT code, name FROM teams WHERE code = ?').bind(code).first<{ code: string; name: string }>();

                if (!teamResult) {
                    return apiResponse({ exists: false, code: code }, 200);
                }

                const membersResult = await env.DB.prepare(
                    'SELECT maimai_id, color, job, nickname, avatar_url FROM members WHERE team_code = ?'
                 ).bind(code).all();

                return apiResponse({
                    exists: true,
                    code: teamResult.code,
                    name: teamResult.name,
                    members: membersResult.results || []
                }, 200);
            }

            // POST /api/teams/create (Existing)
            else if (method === 'POST' && pathname === '/api/teams/create') {
                const body = await request.json().catch(() => null);
                if (!body) return apiError('Invalid or missing JSON body.', 400);
                const code = body?.code?.toString();
                const name = body?.name?.toString()?.trim();

                if (!code || code.length !== 4 || isNaN(parseInt(code))) {
                    return apiError('Invalid team code format (must be 4 digits).', 400);
                }
                if (!name || name.length === 0 || name.length > 50) {
                    return apiError('Invalid team name (must be 1-50 characters).', 400);
                }

                const existingTeam = await env.DB.prepare('SELECT 1 FROM teams WHERE code = ? LIMIT 1').bind(code).first();
                if (existingTeam) {
                   return apiError(`Team code ${code} is already taken.`, 409);
                }

                 const now = Math.floor(Date.now() / 1000);
                 const insertResult = await env.DB.prepare('INSERT INTO teams (code, name, created_at) VALUES (?, ?, ?)')
                     .bind(code, name, now)
                     .run();

                  if (!insertResult.success) {
                      console.error('Create team database insert failed:', insertResult.error);
                      if (insertResult.error?.includes('UNIQUE constraint failed')) {
                          return apiError(`Team code ${code} is already taken (constraint violation).`, 409);
                      }
                      return apiError('Failed to create team due to a database issue.', 500);
                  }

                 return apiResponse({ success: true, code: code, name: name }, 201);
            }

            // POST /api/teams/join (Existing - Handles FormData and Avatar)
            else if (method === 'POST' && pathname === '/api/teams/join') {
                let formData: FormData;
                try {
                    formData = await request.formData();
                } catch (e) {
                    return apiError('Invalid request format. Expected multipart/form-data.', 400, e);
                }

                const teamCode = formData.get('teamCode')?.toString();
                const color = formData.get('color')?.toString();
                const job = formData.get('job')?.toString();
                const maimaiId = formData.get('maimaiId')?.toString()?.trim();
                const nickname = formData.get('nickname')?.toString()?.trim();
                const qqNumber = formData.get('qqNumber')?.toString()?.trim();
                const avatarFile = formData.get('avatarFile');

                 if (!teamCode || teamCode.length !== 4 || isNaN(parseInt(teamCode))) return apiError('Invalid team code.', 400);
                 if (!color || !['red', 'green', 'blue'].includes(color)) return apiError('Invalid color selection.', 400);
                 if (!job || !['attacker', 'defender', 'supporter'].includes(job)) return apiError('Invalid job selection.', 400);
                 if (!maimaiId) return apiError('Maimai ID is required.', 400);
                 if (!nickname || nickname.length === 0 || nickname.length > 50) return apiError('Nickname is required (1-50 chars).', 400);
                 if (!qqNumber || !/^[1-9][0-9]{4,14}$/.test(qqNumber)) return apiError('A valid QQ number is required.', 400);

                try {
                     const teamChecks = await env.DB.batch([
                         env.DB.prepare('SELECT name FROM teams WHERE code = ? LIMIT 1').bind(teamCode),
                         env.DB.prepare('SELECT COUNT(*) as count FROM members WHERE team_code = ?').bind(teamCode)
                     ]);

                     const teamResult = teamChecks[0]?.results?.[0] as { name: string } | undefined;
                     const memberCount = (teamChecks[1]?.results?.[0] as { count: number } | undefined)?.count ?? 0;

                     if (!teamResult) return apiError(`Team with code ${teamCode} not found.`, 404);
                     if (memberCount >= 3) return apiError(`Team ${teamCode} is already full (3 members).`, 409);

                     // Check if maimai_id is already registered globally
                     const existingMemberWithId = await env.DB.prepare('SELECT 1 FROM members WHERE maimai_id = ? LIMIT 1').bind(maimaiId).first();
                     if (existingMemberWithId) {
                         return apiError(`Maimai ID '${maimaiId}' is already registered in a team.`, 409);
                     }

                     // Check if color or job is already taken in this specific team
                     const conflictCheck = await env.DB.prepare(
                         'SELECT 1 FROM members WHERE team_code = ? AND (color = ? OR job = ?) LIMIT 1'
                     ).bind(teamCode, color, job).first();
                     if (conflictCheck) {
                         // Need to query again to find which one is taken for a specific error message
                         const colorConflict = await env.DB.prepare('SELECT 1 FROM members WHERE team_code = ? AND color = ? LIMIT 1').bind(teamCode, color).first();
                         if (colorConflict) return apiError(`The color '${color}' is already taken in team ${teamCode}.`, 409);
                         const jobConflict = await env.DB.prepare('SELECT 1 FROM members WHERE team_code = ? AND job = ? LIMIT 1').bind(teamCode, job).first();
                         if (jobConflict) return apiError(`The job '${job}' is already taken in team ${teamCode}.`, 409);
                         // Fallback generic conflict
                         return apiError(`Color or job is already taken in team ${teamCode}.`, 409);
                     }


                     let avatarUrl: string | null = null;
                     if (avatarFile instanceof File) {
                          avatarUrl = await uploadAvatar(env, avatarFile, maimaiId, teamCode);
                           if (avatarUrl === null) {
                              console.warn(`Join blocked for ${maimaiId}: Avatar upload failed.`);
                              return apiError('Failed to upload avatar. Member not added.', 500);
                           }
                     }

                     const now = Math.floor(Date.now() / 1000);
                     const insertResult = await env.DB.prepare(
                         'INSERT INTO members (team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                     )
                     .bind(teamCode, color, job, maimaiId, nickname, qqNumber, avatarUrl, now)
                     .run();

                     if (!insertResult.success) {
                         console.error('Join team database insert failed:', insertResult.error);
                         // Specific unique constraint errors are handled above before insert
                         return apiError('Failed to add member due to a database issue.', 500);
                     }

                     const updatedMembersResult = await env.DB.prepare(
                        'SELECT color, job, nickname, avatar_url FROM members WHERE team_code = ?'
                     ).bind(teamCode).all();

                     return apiResponse({
                         success: true,
                         code: teamCode,
                         name: teamResult.name,
                         members: updatedMembersResult.results || []
                     }, 201);

                } catch (processingError) {
                    console.error('Error during join team processing pipeline:', processingError);
                    return apiError(
                         `Failed to process join request: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`,
                         500,
                         processingError
                    );
                }
            }

            // PATCH /api/members/:maimaiId (Existing - User initiated edit)
            else if (method === 'PATCH' && pathname.startsWith('/api/members/')) {
                 const parts = pathname.split('/');
                 if (parts.length !== 4 || !parts[3]) {
                     return apiError('Invalid API path. Use /api/members/:maimaiId', 400);
                 }
                 const targetMaimaiId = parts[3];

                let formData: FormData;
                try {
                    formData = await request.formData();
                } catch (e) {
                    return apiError('Invalid request format for update. Expected multipart/form-data.', 400, e);
                }

                const providedQqNumberAuth = formData.get('qqNumberAuth')?.toString()?.trim();
                if (!providedQqNumberAuth) {
                    return apiError('Authentication failed: Current QQ number (as qqNumberAuth) required for update.', 401);
                }

                const existingMember = await authorizeMemberSimple(env.DB, targetMaimaiId, providedQqNumberAuth);
                if (!existingMember) {
                    return apiError('Authorization failed: Invalid Maimai ID or QQ number.', 403);
                }

                const updates: Partial<Member> = {};
                const setClauses: string[] = [];
                const params: (string | number | null)[] = [];
                let newAvatarUrl: string | null | undefined = undefined;
                let oldAvatarUrlToDelete: string | null | undefined = undefined;

                const newNickname = formData.get('nickname')?.toString()?.trim();
                const newQqNumber = formData.get('qqNumber')?.toString()?.trim();
                const newColor = formData.get('color')?.toString();
                const newJob = formData.get('job')?.toString();
                const newAvatarFile = formData.get('avatarFile');
                const clearAvatar = formData.get('clearAvatar')?.toString() === 'true';

                if (newNickname !== null && newNickname !== undefined && newNickname !== existingMember.nickname) { // Check against null/undefined and existing value
                    if (newNickname.length === 0 || newNickname.length > 50) {
                        return apiError('Nickname must be between 1 and 50 characters.', 400);
                    }
                    updates.nickname = newNickname;
                    setClauses.push('nickname = ?');
                    params.push(newNickname);
                }
                if (newQqNumber !== null && newQqNumber !== undefined && newQqNumber !== existingMember.qq_number) { // Check against null/undefined and existing value
                    if (!/^[1-9][0-9]{4,14}$/.test(newQqNumber)) {
                        return apiError('Invalid format for new QQ number.', 400);
                    }
                    updates.qq_number = newQqNumber;
                    setClauses.push('qq_number = ?');
                    params.push(newQqNumber);
                }
                if (newColor !== null && newColor !== undefined && newColor !== existingMember.color) { // Check against null/undefined and existing value
                    if (!['red', 'green', 'blue'].includes(newColor)) return apiError('Invalid new color selection.', 400);
                    const conflictCheck = await env.DB.prepare(
                            'SELECT 1 FROM members WHERE team_code = ? AND color = ? AND maimai_id != ? LIMIT 1'
                        )
                        .bind(existingMember.team_code, newColor, targetMaimaiId)
                        .first();
                    if (conflictCheck) {
                        return apiError(`The color '${newColor}' is already taken by another member in your team.`, 409);
                    }
                    updates.color = newColor;
                    setClauses.push('color = ?');
                    params.push(newColor);
                }
               if (newJob !== null && newJob !== undefined && newJob !== existingMember.job) { // Check against null/undefined and existing value
                    if (!['attacker', 'defender', 'supporter'].includes(newJob)) return apiError('Invalid new job selection.', 400);
                     const conflictCheck = await env.DB.prepare(
                             'SELECT 1 FROM members WHERE team_code = ? AND job = ? AND maimai_id != ? LIMIT 1'
                        )
                        .bind(existingMember.team_code, newJob, targetMaimaiId)
                        .first();
                    if (conflictCheck) {
                        return apiError(`The job '${newJob}' is already taken by another member in your team.`, 409);
                    }
                    updates.job = newJob;
                    setClauses.push('job = ?');
                    params.push(newJob);
               }

                if (clearAvatar) {
                     newAvatarUrl = null;
                     updates.avatar_url = null;
                     if (existingMember.avatar_url) {
                          oldAvatarUrlToDelete = existingMember.avatar_url;
                     }
                } else if (newAvatarFile instanceof File) {
                    console.log(`Processing new avatar file upload for ${targetMaimaiId}`);
                    const uploadedUrl = await uploadAvatar(env, newAvatarFile, targetMaimaiId, existingMember.team_code);
                    if (uploadedUrl === null) {
                        console.error(`Update aborted for ${targetMaimaiId}: New avatar upload failed.`);
                        return apiError('Avatar upload failed. Profile update cancelled.', 500);
                    }
                    newAvatarUrl = uploadedUrl;
                    updates.avatar_url = newAvatarUrl;
                    if (existingMember.avatar_url && existingMember.avatar_url !== newAvatarUrl) {
                          oldAvatarUrlToDelete = existingMember.avatar_url;
                    }
                }
                 // Only add avatar_url to update if it was explicitly changed (cleared or new file)
                if (newAvatarUrl !== undefined) {
                    setClauses.push('avatar_url = ?');
                    params.push(newAvatarUrl);
                }


               if (setClauses.length === 0) {
                   return apiResponse({ message: "No changes detected.", member: existingMember }, 200);
               }

               const now = Math.floor(Date.now() / 1000);
               setClauses.push('updated_at = ?');
               params.push(now);

               params.push(existingMember.id); // Use ID for WHERE clause for safety

               const updateQuery = `UPDATE members SET ${setClauses.join(', ')} WHERE id = ?`;
               console.log(`Executing update for ${targetMaimaiId} (ID: ${existingMember.id}): ${updateQuery} with params: ${JSON.stringify(params.slice(0, -1))}`);

               try {
                   if (oldAvatarUrlToDelete) {
                        console.log(`Attempting to delete old avatar: ${oldAvatarUrlToDelete}`);
                        ctx.waitUntil(deleteAvatarFromR2(env, oldAvatarUrlToDelete)); // Delete asynchronously
                   }

                    const updateResult = await env.DB.prepare(updateQuery).bind(...params).run();

                    if (!updateResult.success) {
                         console.error(`Update member database operation failed for ${targetMaimaiId}:`, updateResult.error);
                          if (updateResult.error?.includes('UNIQUE constraint failed')) {
                               return apiError(`Update failed due to a conflict (color, job, or Maimai ID). Please refresh and try again.`, 409);
                          }
                         return apiError('Failed to update member information due to a database issue.', 500);
                    }

                    if (updateResult.meta.changes === 0) {
                        console.warn(`Update query executed for ${targetMaimaiId} but no rows were changed.`);
                        return apiError('Failed to update: Member record may have been modified or deleted.', 404);
                    }

                    console.log(`Successfully updated member ${targetMaimaiId}. Changes: ${updateResult.meta.changes}`);

                    const updatedMember = await env.DB.prepare('SELECT * FROM members WHERE id = ?')
                        .bind(existingMember.id)
                        .first<Member>();

                    if (!updatedMember) {
                          console.error(`Consistency issue: Member ${targetMaimaiId} (ID: ${existingMember.id}) updated but could not be re-fetched.`);
                          return apiError('Update successful, but failed to retrieve updated data.', 500);
                    }

                    return apiResponse({ success: true, message: "Information updated successfully.", member: updatedMember }, 200);

               } catch (updateProcessError) {
                    console.error(`Error during the member update process for ${targetMaimaiId}:`, updateProcessError);
                    return apiError(
                         `Failed to process update: ${updateProcessError instanceof Error ? updateProcessError.message : 'Unknown error'}`,
                         500,
                         updateProcessError
                    );
               }
           }

           // DELETE /api/members/:maimaiId (Existing - User initiated delete)
           else if (method === 'DELETE' && pathname.startsWith('/api/members/')) {
               const parts = pathname.split('/');
               if (parts.length !== 4 || !parts[3]) {
                   return apiError('Invalid API path. Use /api/members/:maimaiId', 400);
               }
               const targetMaimaiId = parts[3];

               const body = await request.json().catch(() => null);
               if (!body) return apiError('Invalid or missing JSON body for delete request.', 400);
               const providedQqNumberAuth = body?.qqNumberAuth?.toString()?.trim();

                if (!providedQqNumberAuth) {
                    return apiError('Authentication failed: Current QQ number (qqNumberAuth) required in JSON body.', 401);
                }

               const existingMember = await authorizeMemberSimple(env.DB, targetMaimaiId, providedQqNumberAuth);
                if (!existingMember) {
                    console.log(`Delete request for non-existent or unauthorized member: ${targetMaimaiId}`);
                    return apiError('Member not found or authorization failed.', 404);
                }

                try {
                    const teamCode = existingMember.team_code;
                    const avatarUrlToDelete = existingMember.avatar_url;

                    console.log(`Attempting to delete member record for ${targetMaimaiId} (ID: ${existingMember.id})`);
                    const deleteResult = await env.DB.prepare('DELETE FROM members WHERE id = ? AND maimai_id = ?')
                        .bind(existingMember.id, targetMaimaiId)
                        .run();

                    if (!deleteResult.success) {
                        console.error(`Delete member database operation failed for ${targetMaimaiId}:`, deleteResult.error);
                        return apiError('Failed to delete member due to a database issue.', 500);
                    }
                    if (deleteResult.meta.changes === 0) {
                         console.warn(`Delete query executed for ${targetMaimaiId} but no rows changed.`);
                         return apiError('Member not found or already deleted.', 404);
                    }
                    console.log(`Successfully deleted member record for ${targetMaimaiId}.`);

                    if (avatarUrlToDelete) {
                         console.log(`Attempting to delete associated avatar: ${avatarUrlToDelete}`);
                         ctx.waitUntil(deleteAvatarFromR2(env, avatarUrlToDelete));
                    }

                   ctx.waitUntil(checkAndDeleteEmptyTeam(env, teamCode));

                   return new Response(null, { status: 204, headers: CORS_HEADERS });

                } catch (deleteProcessError) {
                    console.error(`Error during member deletion process for ${targetMaimaiId}:`, deleteProcessError);
                    return apiError(
                       `Failed to process deletion: ${deleteProcessError instanceof Error ? deleteProcessError.message : 'Unknown error'}`,
                        500,
                        deleteProcessError
                    );
                }
           }

           // GET /api/teams/:code (Existing - Fetch Team Details)
           else if (method === 'GET' && pathname.startsWith('/api/teams/')) {
               const parts = pathname.split('/');
                if (parts.length !== 4 || !parts[3]) {
                    return apiError('Invalid API path. Use /api/teams/:teamCode', 400);
                }
                const teamCode = parts[3];

                if (typeof teamCode !== 'string' || teamCode.length !== 4 || isNaN(parseInt(teamCode))) {
                   return apiError('Invalid team code format in URL (must be 4 digits).', 400);
                }

                const results = await env.DB.batch([
                    env.DB.prepare('SELECT code, name, created_at FROM teams WHERE code = ?').bind(teamCode),
                    env.DB.prepare(
                       'SELECT id, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at FROM members WHERE team_code = ? ORDER BY joined_at ASC'
                    ).bind(teamCode)
                ]);

                const teamResult = results[0]?.results?.[0] as { code: string; name: string; created_at: number } | undefined;

                if (!teamResult) {
                    return apiError(`Team with code ${teamCode} not found.`, 404);
                }

                const membersResult = results[1]?.results as Member[] || [];

                return apiResponse({
                    code: teamResult.code,
                    name: teamResult.name,
                    createdAt: teamResult.created_at,
                    members: membersResult
                }, 200);
           }

           // --- ADDED: Admin Endpoints ---

           // GET /api/admin/members (Fetch All Members)
           else if (method === 'GET' && pathname === '/api/admin/members') {
               // Admin authentication already checked at the beginning of the try block

               try {
                   // Fetch all members, ordered by team code and then join time
                   const allMembers = await env.DB.prepare(
                       'SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at FROM members ORDER BY team_code ASC, joined_at ASC'
                   ).all<Member>();

                   return apiResponse({ members: allMembers.results || [] }, 200);

               } catch (e) {
                   console.error('Database error fetching all members for admin:', e);
                   return apiError('Failed to fetch all members from database.', 500, e);
               }
           }

           // POST /api/admin/members (Add New Member)
           else if (method === 'POST' && pathname === '/api/admin/members') {
               // Admin authentication already checked

               let formData: FormData;
               try {
                   formData = await request.formData();
               } catch (e) {
                   return apiError('Invalid request format. Expected multipart/form-data.', 400, e);
               }

               // Extract and validate fields from FormData (similar to /teams/join but no privacyAgreed)
               const teamCode = formData.get('teamCode')?.toString();
               const color = formData.get('color')?.toString();
               const job = formData.get('job')?.toString();
               const maimaiId = formData.get('maimaiId')?.toString()?.trim();
               const nickname = formData.get('nickname')?.toString()?.trim();
               const qqNumber = formData.get('qqNumber')?.toString()?.trim();
               const avatarFile = formData.get('avatarFile');

                if (!teamCode || teamCode.length !== 4 || isNaN(parseInt(teamCode))) return apiError('Invalid team code.', 400);
                if (!color || !['red', 'green', 'blue'].includes(color)) return apiError('Invalid color selection.', 400);
                if (!job || !['attacker', 'defender', 'supporter'].includes(job)) return apiError('Invalid job selection.', 400);
                if (!maimaiId || maimaiId.length === 0 || maimaiId.length > 13) return apiError('Maimai ID is required (1-13 chars).', 400);
                if (!nickname || nickname.length === 0 || nickname.length > 50) return apiError('Nickname is required (1-50 chars).', 400);
                if (!qqNumber || !/^[1-9][0-9]{4,14}$/.test(qqNumber)) return apiError('A valid QQ number is required.', 400);

               try {
                    // Check if team exists and is not full (optional for admin, but good practice)
                    const teamCheck = await env.DB.prepare('SELECT name FROM teams WHERE code = ? LIMIT 1').bind(teamCode).first();
                    if (!teamCheck) return apiError(`Team with code ${teamCode} not found.`, 404);

                    // Check for conflicts (maimai_id globally, color/job in team)
                    const conflictChecks = await env.DB.batch([
                        env.DB.prepare('SELECT 1 FROM members WHERE maimai_id = ? LIMIT 1').bind(maimaiId),
                        env.DB.prepare('SELECT 1 FROM members WHERE team_code = ? AND color = ? LIMIT 1').bind(teamCode, color),
                        env.DB.prepare('SELECT 1 FROM members WHERE team_code = ? AND job = ? LIMIT 1').bind(teamCode, job),
                    ]);

                    if (conflictChecks[0]?.results?.[0]) return apiError(`Maimai ID '${maimaiId}' is already registered.`, 409);
                    if (conflictChecks[1]?.results?.[0]) return apiError(`The color '${color}' is already taken in team ${teamCode}.`, 409);
                    if (conflictChecks[2]?.results?.[0]) return apiError(`The job '${job}' is already taken in team ${teamCode}.`, 409);


                    let avatarUrl: string | null = null;
                    if (avatarFile instanceof File) {
                         avatarUrl = await uploadAvatar(env, avatarFile, maimaiId, teamCode);
                          if (avatarUrl === null) {
                             console.warn(`Admin add blocked for ${maimaiId}: Avatar upload failed.`);
                             return apiError('Failed to upload avatar. Member not added.', 500);
                          }
                    }

                    const now = Math.floor(Date.now() / 1000);
                    const insertResult = await env.DB.prepare(
                        'INSERT INTO members (team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    )
                    .bind(teamCode, color, job, maimaiId, nickname, qqNumber, avatarUrl, now, now) // Set updated_at on creation too
                    .run();

                    if (!insertResult.success) {
                        console.error('Admin add member database insert failed:', insertResult.error);
                        // Specific unique constraint errors are handled above
                        return apiError('Failed to add member due to a database issue.', 500);
                    }

                    // Fetch the newly added member to return (optional, but useful)
                    const newMemberId = insertResult.meta.last_row_id;
                    const newMember = await env.DB.prepare('SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at FROM members WHERE id = ?')
                        .bind(newMemberId)
                        .first<Member>();


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

           // PATCH /api/admin/members/:id (Edit Member)
           else if (method === 'PATCH' && pathname.startsWith('/api/admin/members/')) {
               // Admin authentication already checked

               const parts = pathname.split('/');
                if (parts.length !== 5 || !parts[4]) { // Expect /api/admin/members/SOME_ID
                    return apiError('Invalid API path. Use /api/admin/members/:id', 400);
                }
                const targetMemberId = parseInt(parts[4]); // Get ID from path

                if (isNaN(targetMemberId)) {
                    return apiError('Invalid member ID format in path.', 400);
                }

               let formData: FormData;
               try {
                   formData = await request.formData();
               } catch (e) {
                   return apiError('Invalid request format for update. Expected multipart/form-data.', 400, e);
               }

               // Fetch existing member by ID
               const existingMember = await env.DB.prepare('SELECT * FROM members WHERE id = ?')
                   .bind(targetMemberId)
                   .first<Member>();

               if (!existingMember) {
                   return apiError(`Member with ID ${targetMemberId} not found.`, 404);
               }

               // Prepare updates
               const updates: Partial<Member> = {};
               const setClauses: string[] = [];
               const params: (string | number | null)[] = [];
               let newAvatarUrl: string | null | undefined = undefined;
               let oldAvatarUrlToDelete: string | null | undefined = undefined;

               // Get potential new values from FormData
               // Note: Admin can change teamCode, maimaiId, qqNumber, nickname, color, job, avatar
               const newTeamCode = formData.get('teamCode')?.toString();
               const newMaimaiId = formData.get('maimaiId')?.toString()?.trim();
               const newNickname = formData.get('nickname')?.toString()?.trim();
               const newQqNumber = formData.get('qqNumber')?.toString()?.trim();
               const newColor = formData.get('color')?.toString();
               const newJob = formData.get('job')?.toString();
               const newAvatarFile = formData.get('avatarFile');
               const clearAvatar = formData.get('clearAvatar')?.toString() === 'true';

               // --- Validate and Add Fields to Update ---
               // Team Code (Admin can change, but validate format and existence)
               if (newTeamCode !== null && newTeamCode !== undefined && newTeamCode !== existingMember.team_code) {
                   if (newTeamCode.length !== 4 || isNaN(parseInt(newTeamCode))) {
                       return apiError('Invalid new team code format (must be 4 digits).', 400);
                   }
                   // Check if the new team code exists
                   const teamCheck = await env.DB.prepare('SELECT 1 FROM teams WHERE code = ? LIMIT 1').bind(newTeamCode).first();
                   if (!teamCheck) {
                       return apiError(`New team code ${newTeamCode} not found.`, 404);
                   }
                   updates.team_code = newTeamCode;
                   setClauses.push('team_code = ?');
                   params.push(newTeamCode);
               }

               // Maimai ID (Admin can change, but validate format and global uniqueness)
               if (newMaimaiId !== null && newMaimaiId !== undefined && newMaimaiId !== existingMember.maimai_id) {
                   if (newMaimaiId.length === 0 || newMaimaiId.length > 13) {
                       return apiError('New Maimai ID is required (1-13 chars).', 400);
                   }
                   // Check if the new Maimai ID is already taken by *another* member
                   const conflictCheck = await env.DB.prepare('SELECT 1 FROM members WHERE maimai_id = ? AND id != ? LIMIT 1')
                       .bind(newMaimaiId, targetMemberId)
                       .first();
                   if (conflictCheck) {
                       return apiError(`Maimai ID '${newMaimaiId}' is already registered by another member.`, 409);
                   }
                   updates.maimai_id = newMaimaiId;
                   setClauses.push('maimai_id = ?');
                   params.push(newMaimaiId);
               }

               // Nickname
               if (newNickname !== null && newNickname !== undefined && newNickname !== existingMember.nickname) {
                   if (newNickname.length === 0 || newNickname.length > 50) {
                       return apiError('Nickname must be between 1 and 50 characters.', 400);
                   }
                   updates.nickname = newNickname;
                   setClauses.push('nickname = ?');
                   params.push(newNickname);
               }

               // QQ Number
               if (newQqNumber !== null && newQqNumber !== undefined && newQqNumber !== existingMember.qq_number) {
                   if (!/^[1-9][0-9]{4,14}$/.test(newQqNumber)) {
                       return apiError('Invalid format for new QQ number.', 400);
                   }
                   updates.qq_number = newQqNumber;
                   setClauses.push('qq_number = ?');
                   params.push(newQqNumber);
               }

               // Color (Check conflict in the *new* team if teamCode changed, otherwise in the current team)
               const teamCodeForConflictCheck = updates.team_code || existingMember.team_code; // Use new teamCode if changed
               if (newColor !== null && newColor !== undefined && newColor !== existingMember.color) {
                   if (!['red', 'green', 'blue'].includes(newColor)) return apiError('Invalid new color selection.', 400);
                   const conflictCheck = await env.DB.prepare(
                           'SELECT 1 FROM members WHERE team_code = ? AND color = ? AND id != ? LIMIT 1'
                       )
                       .bind(teamCodeForConflictCheck, newColor, targetMemberId)
                       .first();
                   if (conflictCheck) {
                       return apiError(`The color '${newColor}' is already taken by another member in team ${teamCodeForConflictCheck}.`, 409);
                   }
                   updates.color = newColor;
                   setClauses.push('color = ?');
                   params.push(newColor);
               }

              // Job (Check conflict in the *new* team if teamCode changed, otherwise in the current team)
              if (newJob !== null && newJob !== undefined && newJob !== existingMember.job) {
                   if (!['attacker', 'defender', 'supporter'].includes(newJob)) return apiError('Invalid new job selection.', 400);
                    const conflictCheck = await env.DB.prepare(
                            'SELECT 1 FROM members WHERE team_code = ? AND job = ? AND id != ? LIMIT 1'
                       )
                       .bind(teamCodeForConflictCheck, newJob, targetMemberId)
                       .first();
                   if (conflictCheck) {
                       return apiError(`The job '${newJob}' is already taken by another member in team ${teamCodeForConflictCheck}.`, 409);
                   }
                   updates.job = newJob;
                   setClauses.push('job = ?');
                   params.push(newJob);
              }

               // --- Handle Avatar Changes (Clear or Upload New) ---
               if (clearAvatar) {
                    newAvatarUrl = null;
                    updates.avatar_url = null;
                    if (existingMember.avatar_url) {
                         oldAvatarUrlToDelete = existingMember.avatar_url;
                    }
               } else if (newAvatarFile instanceof File) {
                   console.log(`Processing new avatar file upload for member ID ${targetMemberId}`);
                   // Use the *new* team code for the R2 path if it was changed, otherwise use the existing one
                   const teamCodeForAvatarPath = updates.team_code || existingMember.team_code;
                   // Use the *new* maimai ID for the R2 key if it was changed, otherwise use the existing one
                   const maimaiIdForAvatarKey = updates.maimai_id || existingMember.maimai_id;

                   const uploadedUrl = await uploadAvatar(env, newAvatarFile, maimaiIdForAvatarKey, teamCodeForAvatarPath);
                   if (uploadedUrl === null) {
                       console.error(`Admin update aborted for ID ${targetMemberId}: New avatar upload failed.`);
                       return apiError('Avatar upload failed. Member update cancelled.', 500);
                   }
                   newAvatarUrl = uploadedUrl;
                   updates.avatar_url = newAvatarUrl;
                   if (existingMember.avatar_url && existingMember.avatar_url !== newAvatarUrl) {
                         oldAvatarUrlToDelete = existingMember.avatar_url;
                   }
               }
                // Only add avatar_url to update if it was explicitly changed (cleared or new file)
               if (newAvatarUrl !== undefined) {
                   setClauses.push('avatar_url = ?');
                   params.push(newAvatarUrl);
               }


              if (setClauses.length === 0) {
                  return apiResponse({ message: "No changes detected.", member: existingMember }, 200);
              }

              const now = Math.floor(Date.now() / 1000);
              setClauses.push('updated_at = ?');
              params.push(now);

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
                              // Check which constraint (less precise than insert error)
                              return apiError(`Update failed due to a conflict (color, job in team, or Maimai ID globally). Please check values.`, 409);
                         }
                        return apiError('Failed to update member information due to a database issue.', 500);
                   }

                   if (updateResult.meta.changes === 0) {
                       console.warn(`Admin update query executed for ID ${targetMemberId} but no rows were changed.`);
                       return apiError('Failed to update: Member record may have been modified or deleted.', 404);
                   }

                   console.log(`Successfully updated member ID ${targetMemberId}. Changes: ${updateResult.meta.changes}`);

                   // If team code was changed, check if the OLD team is now empty and delete it asynchronously
                   if (updates.team_code && updates.team_code !== existingMember.team_code) {
                       console.log(`Team code changed from ${existingMember.team_code} to ${updates.team_code}. Checking old team.`);
                       ctx.waitUntil(checkAndDeleteEmptyTeam(env, existingMember.team_code));
                   }


                   // Fetch the *updated* member data to return
                   const updatedMember = await env.DB.prepare('SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at FROM members WHERE id = ?')
                       .bind(targetMemberId)
                       .first<Member>();

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

           // DELETE /api/admin/members/:id (Delete Member)
           else if (method === 'DELETE' && pathname.startsWith('/api/admin/members/')) {
               // Admin authentication already checked

               const parts = pathname.split('/');
               if (parts.length !== 5 || !parts[4]) { // Expect /api/admin/members/SOME_ID
                   return apiError('Invalid API path. Use /api/admin/members/:id', 400);
               }
               const targetMemberId = parseInt(parts[4]); // Get ID from path

               if (isNaN(targetMemberId)) {
                   return apiError('Invalid member ID format in path.', 400);
               }

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

           // GET /api/admin/export/csv (Export CSV)
           else if (method === 'GET' && pathname === '/api/admin/export/csv') {
               // Admin authentication already checked

               try {
                   // Fetch all members
                   const allMembersResult = await env.DB.prepare(
                       'SELECT id, team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at FROM members ORDER BY team_code ASC, joined_at ASC'
                   ).all<Member>();

                   const members = allMembersResult.results || [];

                   if (members.length === 0) {
                       // Return an empty CSV or an error if no data
                       return new Response("No data to export.", { status: 404, headers: CORS_HEADERS });
                   }

                   // Generate CSV content
                   const headers = ['ID', '队伍码', '颜色', '职业', '舞萌ID', '称呼', 'QQ号', '头像URL', '加入时间', '更新时间'];
                   let csvContent = headers.join(',') + '\n'; // Add header row

                   members.forEach(member => {
                       // Escape values that might contain commas or quotes
                       const escapeCsv = (value: any) => {
                           if (value === null || value === undefined) return '';
                           const stringValue = String(value);
                           // If value contains comma, double quote, or newline, wrap in double quotes
                           if (/[,"'\n]/.test(stringValue)) {
                               // Escape double quotes by doubling them
                               return `"${stringValue.replace(/"/g, '""')}"`;
                           }
                           return stringValue;
                       };

                       const row = [
                           escapeCsv(member.id),
                           escapeCsv(member.team_code),
                           escapeCsv(getColorText(member.color)), // Use helper for text
                           escapeCsv(getJobText(member.job)),     // Use helper for text
                           escapeCsv(member.maimai_id),
                           escapeCsv(member.nickname),
                           escapeCsv(member.qq_number),
                           escapeCsv(member.avatar_url || ''), // Handle null avatar_url
                           escapeCsv(formatTimestamp(member.joined_at)), // Use helper for formatted time
                           escapeCsv(formatTimestamp(member.updated_at)), // Use helper for formatted time
                       ];
                       csvContent += row.join(',') + '\n';
                   });

                   // Return CSV file
                   const now = new Date();
                   const timestamp = now.toISOString().replace(/[:.-]/g, '').slice(0, 14); // YYYYMMDDTHHMMSS
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


           // --- 404 Catch All ---
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

// Helper functions for CSV export (reused from frontend or defined here)
// Define them here if they are not already globally available or imported
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
        // Use a format that is less likely to contain commas/quotes, or ensure escaping
        // Example: YYYY-MM-DD HH:mm:ss
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
