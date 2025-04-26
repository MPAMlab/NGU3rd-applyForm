import { Router, error, json } from 'itty-router';

// Define the Router
const router = Router();

// Define a type for the D1 database binding (adjust if your binding name is different)
interface Env {
    DB: D1Database;
}

// --- Helper Functions ---

// Standardize JSON response
const apiResponse = (data: any, status = 200) => json(data, { status });

// Standardize error response
const apiError = (message: string, status = 400) => {
    return json({ error: message }, { 
        status,
        headers: {
            // 即使在错误响应中也添加 CORS 头
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
};

// --- API Endpoints ---

// POST /api/teams/check
// Checks if a team code exists and returns basic info
router.post('/api/teams/check', async (request: Request, env: Env) => {
    try {
        // 检查请求体是否存在
        if (!request.body) {
            return apiError('Request body is required', 400);
        }

        let data;
        try {
            data = await request.json();
        } catch (e) {
            return apiError('Invalid JSON in request body', 400);
        }

        const { code } = data;

        if (!code || typeof code !== 'string' || code.length !== 4 || isNaN(parseInt(code))) {
            return apiError('Invalid team code format.', 400);
        }

        // Check if team exists
        const teamResult = await env.DB.prepare('SELECT code, name FROM teams WHERE code = ?')
            .bind(code)
            .first();

        if (!teamResult) {
            // Team does not exist
            return apiResponse({ exists: false, code: code }, 200);
        }

        // Team exists, fetch members
        const membersResult = await env.DB.prepare('SELECT color, job, nickname FROM members WHERE team_code = ?')
            .bind(code)
            .all();

        const team = {
            exists: true,
            code: teamResult.code,
            name: teamResult.name,
            members: membersResult.results || [] // Array of { color, job, nickname }
        };

        return apiResponse(team, 200);

    } catch (e) {
        console.error('Error checking team:', e);
        return apiError('Internal server error.', 500);
    }
});

// POST /api/teams/create
// Creates a new team
router.post('/api/teams/create', async (request: Request, env: Env) => {
    try {
        const { code, name } = await request.json();

        if (!code || typeof code !== 'string' || code.length !== 4 || isNaN(parseInt(code))) {
            return apiError('Invalid team code format.', 400);
        }
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
             return apiError('Invalid team name.', 400);
        }

        // Check if team already exists (should have been checked by frontend, but double check)
         const existingTeam = await env.DB.prepare('SELECT code FROM teams WHERE code = ?')
            .bind(code)
            .first();

        if (existingTeam) {
            return apiError(`Team code ${code} already exists.`, 409); // Conflict
        }

        const now = Math.floor(Date.now() / 1000); // Current Unix timestamp

        // Insert new team into the database
        const insertResult = await env.DB.prepare('INSERT INTO teams (code, name, created_at) VALUES (?, ?, ?)')
            .bind(code, name.trim(), now)
            .run();

        // Check if insertion was successful (optional, D1 might throw on failure)
        if (!insertResult.success) {
             console.error('Insert failed:', insertResult);
             return apiError('Failed to create team.', 500);
        }

        return apiResponse({ success: true, code: code, name: name.trim() }, 201); // Created

    } catch (e: any) {
         // Handle potential unique constraint violation if somehow check failed
         if (e.message && e.message.includes('UNIQUE constraint failed')) {
              return apiError(`Team code ${code} already exists.`, 409);
         }
        console.error('Error creating team:', e);
        return apiError('Internal server error.', 500);
    }
});


// POST /api/teams/join
// Adds a member to an existing team
router.post('/api/teams/join', async (request: Request, env: Env) => {
    try {
        const { teamCode, color, job, maimaiId, nickname, qqNumber } = await request.json();

        // Basic input validation
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


        // Check if team exists
        const teamResult = await env.DB.prepare('SELECT code FROM teams WHERE code = ?')
            .bind(teamCode)
            .first();

        if (!teamResult) {
            return apiError(`Team with code ${teamCode} not found.`, 404); // Not Found
        }

        // Check if team is full (max 3 members)
        const memberCountResult = await env.DB.prepare('SELECT COUNT(*) as count FROM members WHERE team_code = ?')
            .bind(teamCode)
            .first<{ count: number }>(); // Explicitly type the result

        if (memberCountResult && memberCountResult.count >= 3) {
            return apiError(`Team ${teamCode} is already full (3 members).`, 409); // Conflict
        }

        // Check if color or job is already taken in this team
        const existingMember = await env.DB.prepare('SELECT id FROM members WHERE team_code = ? AND (color = ? OR job = ?)')
            .bind(teamCode, color, job)
            .first();

        if (existingMember) {
            // This check is slightly simplified; ideally, you'd check color and job separately
            // to give more specific feedback (e.g., "Color already taken" vs "Job already taken").
            // However, the UNIQUE constraints in the schema handle the strict validation.
             // We'll rely on the UNIQUE constraint error for specific feedback in catch block.
        }

        const now = Math.floor(Date.now() / 1000); // Current Unix timestamp

        // Insert new member into the database
        const insertResult = await env.DB.prepare('INSERT INTO members (team_code, color, job, maimai_id, nickname, qq_number, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(teamCode, color, job, maimaiId.trim(), nickname.trim(), qqNumber.trim(), now)
            .run();

         if (!insertResult.success) {
             console.error('Insert failed:', insertResult);
             return apiError('Failed to add member to team.', 500);
        }

        // Fetch updated team info including the new member for the completion page
         const updatedMembersResult = await env.DB.prepare('SELECT color, job, nickname FROM members WHERE team_code = ?')
            .bind(teamCode)
            .all();

         const updatedTeam = {
            success: true,
            code: teamCode,
            name: (await env.DB.prepare('SELECT name FROM teams WHERE code = ?').bind(teamCode).first<{ name: string }>())?.name, // Fetch team name again
            members: updatedMembersResult.results || []
         };


        return apiResponse(updatedTeam, 201); // Created

    } catch (e: any) {
        // Handle specific D1 errors like unique constraint violations
        if (e.message && e.message.includes('UNIQUE constraint failed: members.team_code, members.color')) {
             return apiError(`Color ${color} is already taken in this team.`, 409);
        }
         if (e.message && e.message.includes('UNIQUE constraint failed: members.team_code, members.job')) {
             return apiError(`Job ${job} is already taken in this team.`, 409);
        }
        console.error('Error joining team:', e);
        return apiError('Internal server error.', 500);
    }
});


// GET /api/teams/:code
// Fetches full details for a specific team
// (Optional endpoint, but useful for sharing links)
router.get('/api/teams/:code', async (request: Request, env: Env) => {
     try {
        const teamCode = request.params.code; // Get code from URL path

        if (!teamCode || typeof teamCode !== 'string' || teamCode.length !== 4 || isNaN(parseInt(teamCode))) {
            return apiError('Invalid team code format.', 400);
        }

        // Check if team exists
        const teamResult = await env.DB.prepare('SELECT code, name, created_at FROM teams WHERE code = ?')
            .bind(teamCode)
            .first();

        if (!teamResult) {
            return apiError(`Team with code ${teamCode} not found.`, 404); // Not Found
        }

        // Fetch all members for the team
        const membersResult = await env.DB.prepare('SELECT color, job, maimai_id, nickname, qq_number, joined_at FROM members WHERE team_code = ?')
            .bind(teamCode)
            .all();

        const teamDetails = {
            code: teamResult.code,
            name: teamResult.name,
            createdAt: teamResult.created_at,
            members: membersResult.results || []
        };

        return apiResponse(teamDetails, 200);

     } catch (e) {
        console.error('Error fetching team details:', e);
        return apiError('Internal server error.', 500);
     }
});


// 404 handler for unmatched routes
router.all('*', () => apiError('Not Found.', 404));

// Entry point for the Worker
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      // 处理 OPTIONS 请求
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
  
      try {
        // 路由请求
        const response = await router.handle(request, env, ctx);
        
        // 添加 CORS 头到响应
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
        
        return response;
      } catch (error) {
        // 错误处理 - 确保错误响应也有 CORS 头
        console.error('Unhandled error:', error);
        
        // 创建错误响应
        const errorResponse = new Response(
          JSON.stringify({ error: 'Internal Server Error' }),
          { 
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type'
            }
          }
        );
        
        return errorResponse;
      }
    },
  };