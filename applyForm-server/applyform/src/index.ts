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
const CORS_ALLOWED_ORIGIN = '*';

// --- Types ---
interface Env {
    DB: D1Database;
    AVATAR_BUCKET: R2Bucket; // R2 binding for storing avatars
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Add others if needed by your client
    'Access-Control-Max-Age': '86400', // Cache preflight response for 1 day
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
     // Basic logging of errors
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
 */
async function authorizeMemberSimple(db: D1Database, maimaiId: string, qqNumber: string): Promise<Member | null> {
    // Basic input validation
     if (!maimaiId || !qqNumber || !/^[1-9][0-9]{4,14}$/.test(qqNumber)) {
          console.warn(`Authorization attempt failed due to invalid input - Maimai ID: ${maimaiId}, QQ: ${qqNumber}`);
          return null;
     }
    try {
        // Find the member matching both maimai_id and qq_number
         const member = await db.prepare('SELECT * FROM members WHERE maimai_id = ? AND qq_number = ?')
             .bind(maimaiId, qqNumber)
             .first<Member>();

         if (!member) {
             console.log(`Authorization failed: No matching record for Maimai ID ${maimaiId} and provided QQ.`);
         } else {
             console.log(`Authorization successful for Maimai ID ${maimaiId}.`);
         }
         return member; // Returns member object on success, null on failure
     } catch (e) {
         console.error(`Authorization check database error for Maimai ID ${maimaiId}:`, e);
         return null; // Treat DB errors as authorization failure
     }
}

/**
 * Uploads an avatar file to the configured R2 bucket.
 * Handles validation (type, size), generates a unique key, and returns the public URL.
 * Returns the public URL string on success, null on failure or validation error.
 */
async function uploadAvatar(env: Env, file: File, maimaiId: string, teamCode: string): Promise<string | null> {
    if (!env.AVATAR_BUCKET) {
        console.error("Configuration Error: AVATAR_BUCKET binding not found. Cannot upload avatar.");
        return null; // R2 not configured
    }
    if (!(file instanceof File)) {
        console.log(`Avatar upload skipped for ${maimaiId}: No valid file provided.`);
        return null;
    }

    try {
         // 1. Validation
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
             console.warn(`Avatar upload skipped for ${maimaiId}: Invalid file type ${file.type}. Allowed: ${allowedTypes.join(', ')}`);
             // Optionally: throw new Error('Invalid file type') to return a 400 Bad Request
             return null;
        }
        const sizeLimitBytes = AVATAR_SIZE_LIMIT_MB * 1024 * 1024;
        if (file.size > sizeLimitBytes) {
             console.warn(`Avatar upload skipped for ${maimaiId}: File size ${file.size} bytes exceeds ${AVATAR_SIZE_LIMIT_MB}MB limit.`);
             // Optionally: throw new Error('File size exceeds limit') for a 400 response
             return null;
        }

        // 2. Generate a unique R2 object key
        const fileNameParts = file.name.split('.');
        const fileExtension = fileNameParts.length > 1 ? `.${fileNameParts.pop()?.toLowerCase()}` : '.png'; // Default extension
        // Key format: avatars/<team_code>/<maimai_id>-<timestamp><.ext>
        const objectKey = `avatars/${teamCode}/${maimaiId}-${Date.now()}${fileExtension}`;

        // 3. Upload the file to R2
        console.log(`Uploading avatar to R2 for ${maimaiId} as key: ${objectKey}`);
        const uploadedObject = await env.AVATAR_BUCKET.put(objectKey, await file.arrayBuffer(), {
            httpMetadata: {
                contentType: file.type,
                // cacheControl: 'public, max-age=604800', // Optional: Cache for 1 week
            },
            // customMetadata: { // Optional
            //     uploaderId: maimaiId,
            // },
        });

        // Check if upload was successful (put returns the R2Object upon success)
        if (!uploadedObject || !uploadedObject.key) {
             console.error(`R2 put operation failed for ${objectKey}. Upload result:`, uploadedObject);
             // Should not happen often unless R2 service issue or permission problem
            return null;
        }

         // 4. Construct the Public URL (Ensure R2_PUBLIC_URL_BASE is correctly set and bucket is public/linked)
         // Remove trailing slash from base URL if it exists, then append the object key.
         const publicUrl = `${R2_PUBLIC_URL_BASE.replace(/\/$/, '')}/${uploadedObject.key}`;
        console.log(`Avatar for ${maimaiId} uploaded successfully. Public URL: ${publicUrl}`);
        return publicUrl;

    } catch (uploadError) {
        console.error(`Failed during avatar upload process for ${maimaiId}:`, uploadError);
        return null; // Return null signifies upload failure
    }
}

/**
 * Deletes an object from the R2 bucket based on its expected public URL.
 * This is a best-effort operation and logs errors without throwing.
 * It extracts the R2 key assuming the URL follows the pattern: ${R2_PUBLIC_URL_BASE}/<key>
 */
 async function deleteAvatarFromR2(env: Env, avatarUrl: string | null | undefined): Promise<void> {
     // Validate inputs
     if (!avatarUrl || !env.AVATAR_BUCKET || !R2_PUBLIC_URL_BASE) {
         if (avatarUrl) console.log(`Skipping avatar deletion for ${avatarUrl}: R2 bucket or base URL not configured.`);
         return;
     }

     try {
         // Ensure the URL starts with the expected base path
         const baseUrl = R2_PUBLIC_URL_BASE.replace(/\/$/, ''); // Ensure no trailing slash
         if (!avatarUrl.startsWith(baseUrl + '/')) {
             console.warn(`Cannot delete avatar: URL '${avatarUrl}' does not match R2 base '${baseUrl}/'.`);
             return;
         }

         // Extract the object key from the URL (the part after the base URL and the slash)
         const keyToDelete = avatarUrl.substring(baseUrl.length + 1);

         if (!keyToDelete) {
             console.warn(`Could not extract a valid key from avatar URL: ${avatarUrl}`);
             return;
         }

         console.log(`Requesting deletion of avatar from R2 with key: ${keyToDelete}`);
         await env.AVATAR_BUCKET.delete(keyToDelete);
         // Note: R2 delete doesn't throw an error if the key doesn't exist.
         console.log(`Successfully requested deletion for R2 key: ${keyToDelete} (Actual deletion might be asynchronous).`);

     } catch (deleteError) {
         // Log errors but don't block the main operation
         console.error(`Failed to delete avatar from R2 (URL: ${avatarUrl}, Key: ${keyToDelete || 'unknown'}):`, deleteError);
     }
 }

// --- Main Worker Fetch Handler ---
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

        // --- 1. Handle CORS Preflight Request (OPTIONS) ---
        if (request.method === 'OPTIONS') {
            // Handle CORS preflight requests.
            return new Response(null, {
                status: 204, // No Content
                headers: CORS_HEADERS
            });
        }

        // Prepare for routing
        const url = new URL(request.url);
        const pathname = url.pathname;
        const method = request.method;
        console.log(`[Request] ${method} ${pathname}`); // Log request entry

        try { // Main try...catch block for unexpected errors during processing
            // --- Routing Logic ---

            // POST /api/teams/check
            if (method === 'POST' && pathname === '/api/teams/check') {
                const body = await request.json().catch(() => null);
                if (!body) return apiError('Invalid or missing JSON body.', 400);
                const code = body?.code;

                 if (!code || typeof code !== 'string' || code.length !== 4 || isNaN(parseInt(code))) {
                     return apiError('Invalid team code format (must be 4 digits).', 400);
                 }

                const teamResult = await env.DB.prepare('SELECT code, name FROM teams WHERE code = ?').bind(code).first<{ code: string; name: string }>();

                if (!teamResult) {
                    // Team doesn't exist, which is valid info for the client
                    return apiResponse({ exists: false, code: code }, 200);
                }

                // Team exists, get its members
                const membersResult = await env.DB.prepare(
                    'SELECT color, job, nickname, avatar_url FROM members WHERE team_code = ?' // Include avatar_url
                 ).bind(code).all();

                return apiResponse({
                    exists: true,
                    code: teamResult.code,
                    name: teamResult.name,
                    members: membersResult.results || [] // Ensure members is always an array
                }, 200);
            }

            // POST /api/teams/create
            else if (method === 'POST' && pathname === '/api/teams/create') {
                const body = await request.json().catch(() => null);
                if (!body) return apiError('Invalid or missing JSON body.', 400);
                const code = body?.code?.toString(); // Ensure string
                const name = body?.name?.toString()?.trim(); // Trim whitespace

                if (!code || code.length !== 4 || isNaN(parseInt(code))) {
                    return apiError('Invalid team code format (must be 4 digits).', 400);
                }
                if (!name || name.length === 0 || name.length > 50) { // Add length check
                    return apiError('Invalid team name (must be 1-50 characters).', 400);
                }

                 // Check if team code already exists using a quick query
                const existingTeam = await env.DB.prepare('SELECT 1 FROM teams WHERE code = ? LIMIT 1').bind(code).first();
                if (existingTeam) {
                   return apiError(`Team code ${code} is already taken.`, 409); // 409 Conflict
                }

                 // Create the team
                 const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
                 const insertResult = await env.DB.prepare('INSERT INTO teams (code, name, created_at) VALUES (?, ?, ?)')
                     .bind(code, name, now)
                     .run();

                  // Check D1 insert success
                  if (!insertResult.success) {
                      // Log the specific D1 error if available
                      console.error('Create team database insert failed:', insertResult.error);
                      // It's possible the check above missed a race condition, check for UNIQUE constraint again
                      if (insertResult.error?.includes('UNIQUE constraint failed')) {
                          return apiError(`Team code ${code} is already taken (constraint violation).`, 409);
                      }
                      // Generic fallback for other DB errors
                      return apiError('Failed to create team due to a database issue.', 500);
                  }

                 // Successfully created
                 return apiResponse({ success: true, code: code, name: name }, 201); // 201 Created
            }

            // POST /api/teams/join (Handles FormData and Avatar)
            else if (method === 'POST' && pathname === '/api/teams/join') {
                let formData: FormData;
                try {
                    // Expect multipart/form-data for potential file uploads
                    formData = await request.formData();
                } catch (e) {
                    // If parsing FormData fails
                    return apiError('Invalid request format. Expected multipart/form-data.', 400, e);
                }

                // Extract and validate fields from FormData
                const teamCode = formData.get('teamCode')?.toString();
                const color = formData.get('color')?.toString();
                const job = formData.get('job')?.toString();
                const maimaiId = formData.get('maimaiId')?.toString()?.trim();
                const nickname = formData.get('nickname')?.toString()?.trim();
                const qqNumber = formData.get('qqNumber')?.toString()?.trim();
                const avatarFile = formData.get('avatarFile'); // This will be a File object or null

                 // --- Input Validation ---
                 if (!teamCode || teamCode.length !== 4 || isNaN(parseInt(teamCode))) return apiError('Invalid team code.', 400);
                 if (!color || !['red', 'green', 'blue'].includes(color)) return apiError('Invalid color selection.', 400);
                 if (!job || !['attacker', 'defender', 'supporter'].includes(job)) return apiError('Invalid job selection.', 400);
                 if (!maimaiId) return apiError('Maimai ID is required.', 400); // Ensure maimaiId is present
                 if (!nickname || nickname.length === 0 || nickname.length > 50) return apiError('Nickname is required (1-50 chars).', 400);
                 if (!qqNumber || !/^[1-9][0-9]{4,14}$/.test(qqNumber)) return apiError('A valid QQ number is required.', 400);
                 // --- End Validation ---

                try {
                     // Use batch to check team existence and member count efficiently
                     const teamChecks = await env.DB.batch([
                         env.DB.prepare('SELECT name FROM teams WHERE code = ? LIMIT 1').bind(teamCode),
                         env.DB.prepare('SELECT COUNT(*) as count FROM members WHERE team_code = ?').bind(teamCode)
                     ]);

                     const teamResult = teamChecks[0]?.results?.[0] as { name: string } | undefined;
                     const memberCount = (teamChecks[1]?.results?.[0] as { count: number } | undefined)?.count ?? 0;

                     if (!teamResult) return apiError(`Team with code ${teamCode} not found.`, 404);
                     if (memberCount >= 3) return apiError(`Team ${teamCode} is already full (3 members).`, 409); // 409 Conflict

                     // Attempt to upload avatar if a file was provided
                     let avatarUrl: string | null = null;
                     if (avatarFile instanceof File) {
                          avatarUrl = await uploadAvatar(env, avatarFile, maimaiId, teamCode);
                          // Decide how to handle upload failure:
                          // Option 1: Block join if upload fails
                           if (avatarUrl === null) {
                              console.warn(`Join blocked for ${maimaiId}: Avatar upload failed.`);
                              // Return error so user knows avatar didn't save
                              return apiError('Failed to upload avatar. Member not added.', 500);
                           }
                          // Option 2: Allow join even if upload fails (avatarUrl remains null)
                          // if (avatarUrl === null) {
                          //    console.warn(`Continuing join for ${maimaiId} despite avatar upload failure.`);
                          // }
                     }

                     // Insert the new member record into the database
                     const now = Math.floor(Date.now() / 1000);
                     const insertResult = await env.DB.prepare(
                         'INSERT INTO members (team_code, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                     )
                     .bind(teamCode, color, job, maimaiId, nickname, qqNumber, avatarUrl, now) // avatarUrl will be null if no file or upload failed (Option 2)
                     .run();

                     // Check for D1 insert errors, especially UNIQUE constraints
                     if (!insertResult.success) {
                         console.error('Join team database insert failed:', insertResult.error);
                         if (insertResult.error?.includes('UNIQUE constraint failed')) {
                            // Check which constraint failed based on D1's error message structure
                             if (insertResult.error.includes('.color')) return apiError(`The color '${color}' is already taken in team ${teamCode}.`, 409);
                             if (insertResult.error.includes('.job')) return apiError(`The job '${job}' is already taken in team ${teamCode}.`, 409);
                             // Check for the global maimai_id constraint added to the schema
                             if (insertResult.error.includes('.maimai_id')) return apiError(`Maimai ID '${maimaiId}' is already registered in a team.`, 409);
                         }
                         // Generic DB error if not a specific unique constraint
                         return apiError('Failed to add member due to a database issue.', 500);
                     }

                     // Successfully added member, fetch the updated list to return to client
                     const updatedMembersResult = await env.DB.prepare(
                        'SELECT color, job, nickname, avatar_url FROM members WHERE team_code = ?'
                     ).bind(teamCode).all();

                     return apiResponse({
                         success: true,
                         code: teamCode,
                         name: teamResult.name, // Get team name from earlier check
                         members: updatedMembersResult.results || []
                     }, 201); // 201 Created

                } catch (processingError) { // Catch errors from batch, insert, or upload logic
                    console.error('Error during join team processing pipeline:', processingError);
                    return apiError(`Failed to process join request: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`, 500, processingError);
                }
            }

            // PATCH /api/members/:maimaiId (Modify Member Info)
            else if (method === 'PATCH' && pathname.startsWith('/api/members/')) {
                 const parts = pathname.split('/');
                 if (parts.length !== 4 || !parts[3]) { // Ensure path is /api/members/SOME_ID
                     return apiError('Invalid API path. Use /api/members/:maimaiId', 400);
                 }
                 const targetMaimaiId = parts[3]; // The Maimai ID from the URL path

                let formData: FormData;
                try {
                    // Updates likely involve avatars, so expect FormData
                    formData = await request.formData();
                } catch (e) {
                    return apiError('Invalid request format for update. Expected multipart/form-data.', 400, e);
                }

                // --- Authentication via QQ Number provided in the update request ---
                const providedQqNumberAuth = formData.get('qqNumberAuth')?.toString()?.trim();
                if (!providedQqNumberAuth) {
                    // Client MUST send the current QQ number for auth purposes
                    return apiError('Authentication failed: Current QQ number (as qqNumberAuth) required for update.', 401);
                }

                // --- Authorization Step ---
                // Verify the user exists and the provided QQ matches the target Maimai ID
                const existingMember = await authorizeMemberSimple(env.DB, targetMaimaiId, providedQqNumberAuth);
                if (!existingMember) {
                    // User not found or QQ number incorrect
                    return apiError('Authorization failed: Invalid Maimai ID or QQ number.', 403); // 403 Forbidden
                }

                // --- Prepare Updates ---
                const updates: Partial<Member> = {};       // Track changes logically
                const setClauses: string[] = [];       // SQL SET clauses
                const params: (string | number | null)[] = []; // Parameters for SQL query binding
                let newAvatarUrl: string | null | undefined = undefined; // undefined = no change, null = clear, string = new URL
                let oldAvatarUrlToDelete: string | null | undefined = undefined; // Store URL if needs R2 delete

                // Get potential new values from FormData
                const newNickname = formData.get('nickname')?.toString()?.trim();
                const newQqNumber = formData.get('qqNumber')?.toString()?.trim(); // Can update QQ number itself
                const newColor = formData.get('color')?.toString();
                const newJob = formData.get('job')?.toString();
                const newAvatarFile = formData.get('avatarFile');
                const clearAvatar = formData.get('clearAvatar')?.toString() === 'true'; // Flag to remove avatar

                // --- Validate and Add Fields to Update ---
                if (newNickname && newNickname !== existingMember.nickname) {
                    if (newNickname.length === 0 || newNickname.length > 50) {
                        return apiError('Nickname must be between 1 and 50 characters.', 400);
                    }
                    updates.nickname = newNickname;
                    setClauses.push('nickname = ?');
                    params.push(newNickname);
                }
                if (newQqNumber && newQqNumber !== existingMember.qq_number) {
                    if (!/^[1-9][0-9]{4,14}$/.test(newQqNumber)) {
                        return apiError('Invalid format for new QQ number.', 400);
                    }
                    // If QQ number is updated, the next auth request will need the new number
                    updates.qq_number = newQqNumber;
                    setClauses.push('qq_number = ?');
                    params.push(newQqNumber);
                }
                // Check Color Change and Conflict
                if (newColor && newColor !== existingMember.color) {
                    if (!['red', 'green', 'blue'].includes(newColor)) return apiError('Invalid new color selection.', 400);
                    // Check if the new color is taken by *another* member in the *same* team
                    const conflictCheck = await env.DB.prepare(
                            'SELECT 1 FROM members WHERE team_code = ? AND color = ? AND maimai_id != ? LIMIT 1'
                        )
                        .bind(existingMember.team_code, newColor, targetMaimaiId)
                        .first();
                    if (conflictCheck) {
                        return apiError(`The color ' ${newColor}' is already taken by another member in your team.`, 409); // 409 Conflict
                    }
                    updates.color = newColor;
                    setClauses.push('color = ?');
                    params.push(newColor);
                }
               // Check Job Change and Conflict
               if (newJob && newJob !== existingMember.job) {
                    if (!['attacker', 'defender', 'supporter'].includes(newJob)) return apiError('Invalid new job selection.', 400);
                    // Check if the new job is taken by *another* member in the *same* team
                     const conflictCheck = await env.DB.prepare(
                             'SELECT 1 FROM members WHERE team_code = ? AND job = ? AND maimai_id != ? LIMIT 1'
                        )
                        .bind(existingMember.team_code, newJob, targetMaimaiId)
                        .first();
                    if (conflictCheck) {
                        return apiError(`The job ' ${newJob}' is already taken by another member in your team.`, 409); // 409 Conflict
                    }
                    updates.job = newJob;
                    setClauses.push('job = ?');
                    params.push(newJob);
               }

                // --- Handle Avatar Changes (Clear or Upload New) ---
                if (clearAvatar) {
                     // User explicitly requested to remove the avatar
                     newAvatarUrl = null; // Set DB value to NULL
                     updates.avatar_url = null; // Track the change
                     if (existingMember.avatar_url) {
                          // If there was an old avatar, mark it for deletion from R2
                          oldAvatarUrlToDelete = existingMember.avatar_url;
                     }
                } else if (newAvatarFile instanceof File) {
                    // User uploaded a new avatar file
                    console.log(`Processing new avatar file upload for ${targetMaimaiId}`);
                    const uploadedUrl = await uploadAvatar(env, newAvatarFile, targetMaimaiId, existingMember.team_code);
                    if (uploadedUrl === null) {
                        // Avatar upload failed, stop the update process
                        console.error(`Update aborted for ${targetMaimaiId}: New avatar upload failed.`);
                        return apiError('Avatar upload failed. Profile update cancelled.', 500);
                    }
                    // Upload successful
                    newAvatarUrl = uploadedUrl;
                    updates.avatar_url = newAvatarUrl; // Track the change
                    if (existingMember.avatar_url && existingMember.avatar_url !== newAvatarUrl) {
                          // If there was a different old avatar, mark it for deletion
                          oldAvatarUrlToDelete = existingMember.avatar_url;
                    }
                }

                 // Add avatar_url to the update query only if it actually changed (cleared or new URL)
                if (newAvatarUrl !== undefined) { // Checks if it was set to null or a string URL
                    setClauses.push('avatar_url = ?');
                    params.push(newAvatarUrl);
                }

               // --- Execute Update ---
               if (setClauses.length === 0) {
                   // No actual changes were submitted
                   return apiResponse({ message: "No changes detected.", member: existingMember }, 200);
               }

               // Add the updated_at timestamp to every successful update
               const now = Math.floor(Date.now() / 1000);
               setClauses.push('updated_at = ?');
               params.push(now);

               // Finalize the parameter list with the WHERE clause predicate
               params.push(targetMaimaiId); // For `WHERE maimai_id = ?`

               // Construct the final SQL UPDATE statement
               const updateQuery = `UPDATE members SET ${setClauses.join(', ')} WHERE maimai_id = ?`;
               console.log(`Executing update for ${targetMaimaiId}: ${updateQuery} with params: ${JSON.stringify(params.slice(0, -1))}`); // Log query without sensitive ID if needed

               try {
                    // ---- ATOMICITY ATTEMPT ----
                    // Step 1: (Best Effort) Delete the OLD avatar from R2 *before* changing the DB record.
                    // If DB update fails, the old avatar is gone, but the record still points to it (can be fixed manually or ignored).
                    // If R2 delete fails, the DB might still update, leaving an orphaned R2 object (less ideal but common).
                   if (oldAvatarUrlToDelete) {
                        console.log(`Attempting to delete old avatar: ${oldAvatarUrlToDelete}`);
                        await deleteAvatarFromR2(env, oldAvatarUrlToDelete);
                   }

                    // Step 2: Execute the database update
                    const updateResult = await env.DB.prepare(updateQuery).bind(...params).run();

                    // Check if the database update was successful
                    if (!updateResult.success) {
                         console.error(`Update member database operation failed for ${targetMaimaiId}:`, updateResult.error);
                          // It's possible a unique constraint failed during update (e.g., color/job conflict race condition)
                          if (updateResult.error?.includes('UNIQUE constraint failed')) {
                               // Re-check which constraint (less precise than insert error)
                               return apiError(`Update failed due to a conflict (color, job, or Maimai ID). Please refresh and try again.`, 409);
                          }
                         // Generic DB error
                         return apiError('Failed to update member information due to a database issue.', 500);
                    }

                    // Check if any rows were actually affected (should be 1 if successful)
                    if (updateResult.meta.changes === 0) {
                         // This might happen if the record was deleted between the auth check and the update
                        console.warn(`Update query executed for ${targetMaimaiId} but no rows were changed.`);
                        return apiError('Failed to update: Member record may have been modified or deleted.', 404); // Or 409 Conflict
                    }

                    console.log(`Successfully updated member ${targetMaimaiId}. Changes: ${updateResult.meta.changes}`);

                    // Step 3: Fetch the *updated* member data to return to the client
                    // Use the primary key (id) obtained during authorization for reliability
                    const updatedMember = await env.DB.prepare('SELECT * FROM members WHERE id = ?')
                        .bind(existingMember.id)
                        .first<Member>();

                    if (!updatedMember) {
                          // Should not happen if update succeeded, but good failsafe
                          console.error(`Consistency issue: Member ${targetMaimaiId} (ID: ${existingMember.id}) updated but could not be re-fetched.`);
                          return apiError('Update successful, but failed to retrieve updated data.', 500);
                    }

                    // Success! Return the updated member data.
                    return apiResponse({ success: true, message: "Information updated successfully.", member: updatedMember }, 200);

               } catch (updateProcessError) { // Catch errors during R2 delete or DB update
                    console.error(`Error during the member update process for ${targetMaimaiId}:`, updateProcessError);
                    return apiError(
                         `Failed to process update: ${updateProcessError instanceof Error ? updateProcessError.message : 'Unknown error'}`,
                         500,
                         updateProcessError
                    );
               }
           }

           // DELETE /api/members/:maimaiId (Delete Member)
           else if (method === 'DELETE' && pathname.startsWith('/api/members/')) {
               const parts = pathname.split('/');
               if (parts.length !== 4 || !parts[3]) {
                   return apiError('Invalid API path. Use /api/members/:maimaiId', 400);
               }
               const targetMaimaiId = parts[3];

               // Authentication data expected in JSON body for DELETE
               const body = await request.json().catch(() => null);
               if (!body) return apiError('Invalid or missing JSON body for delete request.', 400);
               const providedQqNumberAuth = body?.qqNumberAuth?.toString()?.trim();

                if (!providedQqNumberAuth) {
                    return apiError('Authentication failed: Current QQ number (qqNumberAuth) required in JSON body.', 401);
                }

               // --- Authorize ---
               // Find the member to get their ID and avatar URL before deleting
               const existingMember = await authorizeMemberSimple(env.DB, targetMaimaiId, providedQqNumberAuth);
                if (!existingMember) {
                    // Treat as "Not Found" for idempotency - deleting something non-existent/unauthorized is fine.
                    console.log(`Delete request for non-existent or unauthorized member: ${targetMaimaiId}`);
                    return apiError('Member not found or authorization failed.', 404);
                }

                // --- Execute Delete ---
                try {
                    const teamCode = existingMember.team_code; // Store for potential team check later
                    const avatarUrlToDelete = existingMember.avatar_url; // Store avatar URL

                    // Step 1: Delete the member record from the database
                    console.log(`Attempting to delete member record for ${targetMaimaiId} (ID: ${existingMember.id})`);
                    const deleteResult = await env.DB.prepare('DELETE FROM members WHERE id = ? AND maimai_id = ?') // Use ID and Maimai ID for safety
                        .bind(existingMember.id, targetMaimaiId)
                        .run();

                    if (!deleteResult.success) {
                        console.error(`Delete member database operation failed for ${targetMaimaiId}:`, deleteResult.error);
                        return apiError('Failed to delete member due to a database issue.', 500);
                    }
                    if (deleteResult.meta.changes === 0) {
                         // Should not happen if auth succeeded, but safety check
                         console.warn(`Delete query executed for ${targetMaimaiId} but no rows changed.`);
                         return apiError('Member not found or already deleted.', 404);
                    }
                    console.log(`Successfully deleted member record for ${targetMaimaiId}.`);

                    // Step 2: (Best Effort) Delete the associated avatar from R2
                    if (avatarUrlToDelete) {
                         console.log(`Attempting to delete associated avatar: ${avatarUrlToDelete}`);
                         // Run deletion asynchronously in the background after responding to the client
                         ctx.waitUntil(deleteAvatarFromR2(env, avatarUrlToDelete));
                    }

                   // Step 3: (Optional) Check if the team is now empty and delete it
                   // Run this check asynchronously as well
                   ctx.waitUntil(checkAndDeleteEmptyTeam(env, teamCode));

                   // Return 204 No Content on successful deletion
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

           // GET /api/teams/:code (Fetch Team Details)
           else if (method === 'GET' && pathname.startsWith('/api/teams/')) {
               const parts = pathname.split('/');
                if (parts.length !== 4 || !parts[3]) {
                    return apiError('Invalid API path. Use /api/teams/:teamCode', 400);
                }
                const teamCode = parts[3];

                if (typeof teamCode !== 'string' || teamCode.length !== 4 || isNaN(parseInt(teamCode))) {
                   return apiError('Invalid team code format in URL (must be 4 digits).', 400);
                }

                // Fetch team details and member list in parallel using D1 batch
                const results = await env.DB.batch([
                    env.DB.prepare('SELECT code, name, created_at FROM teams WHERE code = ?').bind(teamCode),
                    // Select all relevant member fields
                    env.DB.prepare(
                       'SELECT id, color, job, maimai_id, nickname, qq_number, avatar_url, joined_at, updated_at FROM members WHERE team_code = ? ORDER BY joined_at ASC' // Order by join time
                    ).bind(teamCode)
                ]);

                const teamResult = results[0]?.results?.[0] as { code: string; name: string; created_at: number } | undefined;

                if (!teamResult) {
                    return apiError(`Team with code ${teamCode} not found.`, 404);
                }

                const membersResult = results[1]?.results as Member[] || []; // Ensure it's an array

                return apiResponse({
                    code: teamResult.code,
                    name: teamResult.name,
                    createdAt: teamResult.created_at, // Send timestamp
                    members: membersResult // Send full member details
                }, 200);
           }

           // --- 404 Catch All ---
           else {
               // If no route matched
               return apiError('Endpoint not found.', 404);
           }

       } catch (globalError) { // Catch any unexpected errors not handled by specific routes
           console.error('Unhandled exception in Worker:', globalError);
           // Return a generic 500 Internal Server Error
           return apiError(
               'An unexpected internal server error occurred.',
               500,
               globalError instanceof Error ? globalError : new Error(JSON.stringify(globalError))
           );
       }
   },
};

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
       // Don't let this error bubble up or affect the main response
   }
}