// composables/useKindeAuth.js
import { ref, readonly } from 'vue';
import Cookies from 'js-cookie'; // For reading cookies
import CryptoJS from 'crypto-js'; // For PKCE SHA256 hash
import { Buffer } from 'buffer'; // For base64url encoding (Node.js Buffer polyfill)

// Polyfill Buffer for base64url encoding in browser environments
// This might require a build tool configuration (like Vite/Webpack)
// Vite typically handles this, but you might need to install `buffer`
// npm install buffer
// import { Buffer } from 'buffer'; // Already imported above

// --- Kinde Configuration (Get from Environment Variables) ---
// Ensure these are set in your .env file (e.g., .env.local)
// VITE_KINDE_ISSUER_URL=https://your_kinde_subdomain.kinde.com
// VITE_KINDE_CLIENT_ID=your_kinde_client_id
// VITE_KINDE_REDIRECT_URI=https://signup.ngu3rd.mpam-lab.xyz/callback
// VITE_KINDE_LOGOUT_REDIRECT_URI=https://signup.ngu3rd.mpam-lab.xyz/
const kindeConfig = {
    issuerUrl: import.meta.env.VITE_KINDE_ISSUER_URL,
    clientId: import.meta.env.VITE_KINDE_CLIENT_ID,
    redirectUri: import.meta.env.VITE_KINDE_REDIRECT_URI,
    logoutRedirectUri: import.meta.env.VITE_KINDE_LOGOUT_REDIRECT_URI || import.meta.env.VITE_WEBSITE_LINK || window.location.origin, // Default to website link or origin
    // audience: 'your_api_audience', // Optional: If you configured an API audience
    scope: 'openid profile email offline', // Standard scopes + offline for refresh token
};

// --- Reactive State ---
const isAuthenticated = ref(false);
const kindeUser = ref(null); // Stores basic user info from ID token payload (sub, email, name etc.)
const userMember = ref(null); // Stores the member record from your DB linked to kindeUser.id
const authStatusChecked = ref(false); // Flag to ensure checkAuthStatus runs at least once

// --- Constants for PKCE and State ---
const PKCE_VERIFIER_STORAGE_KEY = 'kinde_pkce_code_verifier';
const STATE_STORAGE_KEY = 'kinde_oauth_state';
const ACCESS_TOKEN_COOKIE_NAME = 'kinde_access_token';
const REFRESH_TOKEN_COOKIE_NAME = 'kinde_refresh_token'; // Assuming backend sets this

// --- Helper Functions for PKCE ---

// Generate a random string for code_verifier and state
function generateRandomString(length) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => String.fromCharCode(byte)).join('');
}

// Base64url encode a string or ArrayBuffer
function base64urlencode(str) {
    // Convert string to ArrayBuffer
    const encoder = new TextEncoder();
    const data = encoder.encode(str);

    // Use Buffer for base64 encoding, then replace characters for base64url
    // Ensure Buffer polyfill is available if not in Node.js env
    const base64 = Buffer.from(data).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Generate code_challenge from code_verifier using SHA256
async function generateCodeChallenge(codeVerifier) {
    // Use Web Crypto API for SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);

    // Convert ArrayBuffer to base64url string
    return base64urlencode(hashBuffer);
}

// --- Core Authentication Logic ---

// Check authentication status from cookies and fetch user data
async function checkAuthStatus() {
    if (authStatusChecked.value) {
        // Avoid re-checking if already done (e.g., by router guard)
        // Unless you want to periodically refresh status
        return;
    }
    authStatusChecked.value = true;

    console.log("Checking Kinde auth status...");

    const accessToken = Cookies.get(ACCESS_TOKEN_COOKIE_NAME);

    if (accessToken) {
        // We have an access token cookie
        isAuthenticated.value = true;
        console.log("Access token found. User is authenticated.");

        // Optional: Decode ID token from cookie or fetch user info from Kinde's /userinfo endpoint
        // For simplicity, let's rely on fetching our own member data which includes Kinde ID
        // If you need full Kinde user profile (email, name etc.) immediately,
        // you might need to call Kinde's /userinfo endpoint with the access token.
        // Example: fetch(`${kindeConfig.issuerUrl}/userinfo`, { headers: { 'Authorization': `Bearer ${accessToken}` } })

        // Fetch the user's member data from your backend
        await fetchUserMember();

    } else {
        // No access token cookie
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null;
        console.log("No access token found. User is not authenticated.");
    }
}

// Fetch the logged-in user's member data from your backend
async function fetchUserMember() {
    if (!isAuthenticated.value) {
        userMember.value = null;
        return;
    }

    console.log("Fetching user member data...");
    try {
        // Use the authenticatedFetch wrapper
        const response = await authenticatedFetch('/api/members/me');

        if (response.ok) {
            const data = await response.json();
            // Backend returns { member: Member | null }
            userMember.value = data.member || null;
            // If member exists, we can potentially get Kinde user info from it
            if (userMember.value && userMember.value.kinde_user_id) {
                 // This is a basic placeholder. Full user info (name, email)
                 // should ideally come from Kinde's ID token or /userinfo endpoint.
                 // For now, we just set the ID.
                 kindeUser.value = { id: userMember.value.kinde_user_id };
            } else {
                 // User is authenticated but has no member record yet
                 // We still need the Kinde user ID for registration
                 // This requires decoding the access token or calling /userinfo
                 // Let's add a call to /userinfo for full Kinde user data
                 await fetchKindeUserInfo();
            }
            console.log("User member data fetched:", userMember.value);
        } else if (response.status === 401) {
             // Token expired or invalid during fetchUserMember
             console.warn("Failed to fetch user member data: Authentication failed (401).");
             // Clear auth state if token is invalid
             isAuthenticated.value = false;
             kindeUser.value = null;
             userMember.value = null;
             // Optional: Redirect to login or show login prompt
        }
        else {
            console.error("Failed to fetch user member data:", response.status, await response.text());
            userMember.value = null;
        }
    } catch (e) {
        console.error("Error fetching user member data:", e);
        userMember.value = null;
    }
}

// Fetch basic user info from Kinde's /userinfo endpoint
async function fetchKindeUserInfo() {
     if (!isAuthenticated.value) {
         kindeUser.value = null;
         return;
     }
     console.log("Fetching Kinde user info...");
     try {
         const accessToken = Cookies.get(ACCESS_TOKEN_COOKIE_NAME);
         if (!accessToken) {
             console.warn("Cannot fetch Kinde user info: No access token.");
             kindeUser.value = null;
             return;
         }
         const response = await fetch(`${kindeConfig.issuerUrl}/userinfo`, {
             headers: {
                 'Authorization': `Bearer ${accessToken}`,
                 'Content-Type': 'application/json',
             },
         });

         if (response.ok) {
             const userInfo = await response.json();
             // Kinde /userinfo typically returns { sub: '...', email: '...', given_name: '...', family_name: '...' }
             kindeUser.value = {
                 id: userInfo.sub,
                 email: userInfo.email,
                 name: `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
                 // Add other claims you need
             };
             console.log("Kinde user info fetched:", kindeUser.value);
         } else if (response.status === 401) {
              console.warn("Failed to fetch Kinde user info: Authentication failed (401).");
              // Access token might be expired, need refresh or re-login
              // For simplicity now, just clear auth state
              isAuthenticated.value = false;
              kindeUser.value = null;
              userMember.value = null;
              // Optional: Attempt refresh token flow or redirect to login
         }
         else {
             console.error("Failed to fetch Kinde user info:", response.status, await response.text());
             kindeUser.value = null;
         }
     } catch (e) {
         console.error("Error fetching Kinde user info:", e);
         kindeUser.value = null;
     }
}


// Initiate the Kinde login/register redirect flow
async function login(prompt = 'login') { // prompt can be 'login' or 'create'
    if (!kindeConfig.issuerUrl || !kindeConfig.clientId || !kindeConfig.redirectUri) {
        console.error("Kinde configuration missing. Cannot initiate login.");
        alert("认证服务配置错误，请联系管理员。");
        return;
    }

    try {
        // 1. Generate PKCE code_verifier and code_challenge
        const codeVerifier = generateRandomString(128); // Recommended length
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // 2. Generate state parameter
        const state = generateRandomString(32); // Random state for CSRF protection

        // 3. Store verifier and state in localStorage for later use in callback
        localStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, codeVerifier);
        localStorage.setItem(STATE_STORAGE_KEY, state);
        console.log("Stored PKCE verifier and state in localStorage.");

        // 4. Construct the authorization URL
        const authUrl = new URL(`${kindeConfig.issuerUrl}/oauth2/auth`);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', kindeConfig.clientId);
        authUrl.searchParams.append('redirect_uri', kindeConfig.redirectUri);
        authUrl.searchParams.append('scope', kindeConfig.scope);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('prompt', prompt); // 'login' or 'create'

        // Optional: Add audience if configured
        // if (kindeConfig.audience) {
        //     authUrl.searchParams.append('audience', kindeConfig.audience);
        // }

        console.log("Redirecting to Kinde auth URL:", authUrl.toString());

        // 5. Redirect the user to Kinde
        window.location.href = authUrl.toString();

    } catch (e) {
        console.error("Error initiating Kinde login flow:", e);
        alert("无法启动认证流程，请稍后再试。");
    }
}

// Handle the redirect callback from Kinde (called by KindeCallback.vue)
async function handleCallback(code, state) {
    console.log("Handling Kinde callback...");
    const storedState = localStorage.getItem(STATE_STORAGE_KEY);
    const storedVerifier = localStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);

    // 1. Validate state parameter
    if (!state || !storedState || state !== storedState) {
        console.error("State mismatch or missing state. Possible CSRF attack.");
        // Clear storage to prevent reuse
        localStorage.removeItem(STATE_STORAGE_KEY);
        localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
        throw new Error("Authentication failed: Invalid state parameter.");
    }
    // Clear state from storage after validation
    localStorage.removeItem(STATE_STORAGE_KEY);

    // 2. Check for code and verifier
    if (!code || !storedVerifier) {
        console.error("Missing authorization code or PKCE verifier.");
         localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY); // Clear verifier too
        throw new Error("Authentication failed: Missing code or verifier.");
    }
    // Clear verifier from storage after retrieval
    localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);


    // 3. Exchange code for tokens via your backend endpoint
    console.log("Exchanging code for tokens via backend...");
    try {
        // Your backend endpoint handles the secure token exchange with Kinde
        const response = await fetch('/api/kinde/callback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                code_verifier: storedVerifier, // Send verifier to backend
                redirect_uri: kindeConfig.redirectUri, // Send redirect_uri to backend
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Backend token exchange failed:', response.status, data);
            throw new Error(data.error || `Failed to exchange code for tokens (${response.status})`);
        }

        console.log("Token exchange successful via backend.");
        // Backend should have set HttpOnly cookies.
        // Now, update frontend state by checking cookies and fetching user data.
        await checkAuthStatus(); // This will read the new cookies and fetch user member data

        return { success: true, user: data.user }; // Backend might return basic user info

    } catch (e) {
        console.error("Error during token exchange callback:", e);
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null;
        throw new Error(`Authentication failed: ${e.message}`);
    }
}

// Initiate Kinde logout redirect flow
function logout() {
    if (!kindeConfig.issuerUrl || !kindeConfig.logoutRedirectUri) {
        console.error("Kinde logout configuration missing. Cannot initiate logout.");
        alert("认证服务配置错误，请联系管理员。");
        return;
    }

    console.log("Initiating Kinde logout...");

    // Clear frontend state and cookies immediately (best effort)
    isAuthenticated.value = false;
    kindeUser.value = null;
    userMember.value = null;
    Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
    Cookies.remove(REFRESH_TOKEN_COOKIE_NAME); // Assuming you use refresh tokens

    // Redirect to Kinde logout endpoint
    const logoutUrl = new URL(`${kindeConfig.issuerUrl}/logout`);
    logoutUrl.searchParams.append('redirect', kindeConfig.logoutRedirectUri);

    window.location.href = logoutUrl.toString();
}

// Helper to get the access token for API calls
function getAccessToken() {
    return Cookies.get(ACCESS_TOKEN_COOKIE_NAME);
}

// Wrapper around fetch to include the Authorization header
async function authenticatedFetch(url, options = {}) {
    const token = getAccessToken();
    const headers = {
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else {
        // If no token, and it's a protected route, the backend will return 401
        // You might want to handle this on the frontend too, e.g., redirect to login
        console.warn(`Attempted to fetch ${url} without an access token.`);
        // Optional: Trigger re-authentication flow here if needed
    }

    const response = await fetch(url, {
        ...options,
        headers: headers,
    });

    // Optional: Handle 401 responses globally
    if (response.status === 401) {
        console.warn(`Received 401 Unauthorized for ${url}. Token might be expired or invalid.`);
        // Clear auth state and potentially redirect to login
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null;
        Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
        Cookies.remove(REFRESH_TOKEN_COOKIE_NAME);
        // You might want to redirect to the login page here
        // router.push('/'); // Or your dedicated login route
    }

    return response;
}


// --- Export Composable State and Functions ---
export function useKindeAuth() {
    return {
        // State (readonly to prevent direct modification outside composable)
        isAuthenticated: readonly(isAuthenticated),
        kindeUser: readonly(kindeUser),
        userMember: readonly(userMember),

        // Methods
        checkAuthStatus,
        login,
        logout,
        handleCallback,
        getAccessToken, // Expose if needed, though authenticatedFetch is preferred
        authenticatedFetch, // Expose the wrapped fetch
    };
}

// Initial check when the module is imported (e.g., when app starts)
// This helps populate the state early, before router guards or components run.
// However, relying on the router guard's checkAuthStatus might be sufficient
// depending on your app's initialization flow.
// checkAuthStatus(); // Optional: uncomment if you need state populated immediately on module load
