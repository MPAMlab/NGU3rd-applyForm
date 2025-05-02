// composables/useKindeAuth.ts
import { ref, readonly, Ref, ComputedRef } from 'vue';
import Cookies from 'js-cookie';
import CryptoJS from 'crypto-js';
// import { Buffer } from 'buffer'; // Buffer is not needed for base64urlencodeUint8Array

// Import types from your types file
import { Member, KindeUser } from '../types';

// --- Kinde Configuration (Get from Environment Variables) ---
const kindeConfig = {
    issuerUrl: import.meta.env.VITE_KINDE_ISSUER_URL as string,
    clientId: import.meta.env.VITE_KINDE_CLIENT_ID as string,
    redirectUri: import.meta.env.VITE_KINDE_REDIRECT_URI as string,
    logoutRedirectUri: (import.meta.env.VITE_KINDE_LOGOUT_REDIRECT_URI || import.meta.env.VITE_WEBSITE_LINK || window.location.origin) as string,
    // audience: import.meta.env.VITE_KINDE_AUDIENCE as string | undefined,
    scope: 'openid profile email offline',
};

// --- Reactive State ---
const isAuthenticated: Ref<boolean> = ref(false);
const kindeUser: Ref<KindeUser | null> = ref(null);
const userMember: Ref<Member | null> = ref(null);
const authStatusChecked: Ref<boolean> = ref(false); // Flag to ensure checkAuthStatus runs only once per page load

// --- Constants for PKCE and State ---
const PKCE_VERIFIER_STORAGE_KEY = 'kinde_pkce_code_verifier';
const STATE_STORAGE_KEY = 'kinde_oauth_state';
// We still define these names, but frontend JS won't read HttpOnly cookies directly
const ACCESS_TOKEN_COOKIE_NAME = 'kinde_access_token';
const REFRESH_TOKEN_COOKIE_NAME = 'kinde_refresh_token';


// --- Helper Functions for PKCE ---

// MODIFIED: Generate random bytes and base64url encode them
// Use byteLength to control the randomness source size
function generateRandomString(byteLength: number): string {
    const randomBytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(randomBytes);
    return base64urlencodeUint8Array(randomBytes);
}

// ADDED: Helper to base64url encode a Uint8Array
function base64urlencodeUint8Array(bytes: Uint8Array): string {
    // Convert Uint8Array to a binary string
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    // Base64 encode the binary string
    const base64 = window.btoa(binary);
    // Convert base64 to base64url
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}


// This function seems correct, it uses the base64urlencode helper
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    // Ensure this base64urlencode is the one that handles ArrayBuffer correctly
    // Re-adding a browser-compatible base64urlencode for ArrayBuffer
     return base64urlencodeArrayBuffer(hashBuffer);
}

// ADDED: Helper to base64url encode an ArrayBuffer (for the challenge)
function base64urlencodeArrayBuffer(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = window.btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}


// --- Core Authentication Logic ---

// MODIFIED: checkAuthStatus now relies on fetchUserMember to determine auth state
async function checkAuthStatus(): Promise<void> {
    // Prevent running multiple times on the same page load unless explicitly needed
    if (authStatusChecked.value) {
        return;
    }
    authStatusChecked.value = true;

    console.log("Checking Kinde auth status via backend /members/me...");

    // Call the backend endpoint. The browser will automatically send HttpOnly cookies.
    // fetchUserMember will update isAuthenticated, kindeUser, and userMember based on the backend response.
    await fetchUserMember();

    console.log(`Auth status check complete. isAuthenticated: ${isAuthenticated.value}, userMember: ${userMember.value !== null}`);
}

// MODIFIED: fetchUserMember now determines isAuthenticated state based on backend response
async function fetchUserMember(): Promise<void> {
    console.log("Fetching user member data from backend /members/me...");
    try {
        // Use standard fetch. The browser automatically includes HttpOnly cookies for the domain.
        // We don't need authenticatedFetch here because this is the function that *sets* the auth state.
        // authenticatedFetch relies on isAuthenticated being set already.
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/members/me`);

        if (response.ok) {
            const data = await response.json();
            // Backend returns { member: Member | null }
            userMember.value = data.member as Member | null; // Update state internally

            // If the backend returned 200, it means it successfully validated the token (cookie)
            // and determined the user's status (whether they have a member record or not).
            // So, the user is authenticated via Kinde.
            isAuthenticated.value = true;
            console.log("Backend /members/me returned OK. User is authenticated.");

            // Now fetch Kinde user info using the *valid* access token (backend validated it)
            // This is still needed to get name/email for kindeUser state
            await fetchKindeUserInfo(); // This will update kindeUser.value

        } else if (response.status === 401) {
            console.warn("Backend /members/me returned 401. User is not authenticated.");
            // Backend determined token is invalid or missing
            isAuthenticated.value = false;
            kindeUser.value = null;
            userMember.value = null;
            // Clear cookies client-side (best effort for non-HttpOnly, but good practice)
            Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
            Cookies.remove(REFRESH_TOKEN_COOKIE_NAME);
            // Optional: Redirect to login or show login prompt
        }
        else {
            console.error("Failed to fetch user member data:", response.status, await response.text());
            // Treat other errors as unauthenticated for safety
            isAuthenticated.value = false;
            kindeUser.value = null;
            userMember.value = null;
        }
    } catch (e) {
        console.error("Error fetching user member data:", e);
        // Treat network errors as unauthenticated for safety
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null;
    }
}

// ADDED: Function to fetch Kinde user info and update state
async function fetchKindeUserInfo(): Promise<void> {
     // Only fetch if isAuthenticated is true (confirmed by fetchUserMember)
     if (!isAuthenticated.value) {
         kindeUser.value = null;
         return;
     }
     console.log("Fetching Kinde user info from /userinfo endpoint...");
     try {
         // Use authenticatedFetch - browser sends HttpOnly cookie, backend validates
         // authenticatedFetch will handle 401 by clearing state if token is expired
         const response = await authenticatedFetch(`${kindeConfig.issuerUrl}/userinfo`);

         if (response.ok) {
             const userInfo = await response.json();
             // Kinde /userinfo typically returns { sub: '...', email: '...', given_name: '...', family_name: '...' }
             kindeUser.value = { // Update state internally
                 id: userInfo.sub,
                 email: userInfo.email,
                 name: `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
                 given_name: userInfo.given_name,
                 family_name: userInfo.family_name,
                 // Add other claims you need
             } as KindeUser;
             console.log("Kinde user info fetched:", kindeUser.value);
         } else {
             // If /userinfo fails (e.g., token expired), authenticatedFetch already cleared state
             console.warn("Failed to fetch Kinde user info. State should be cleared by authenticatedFetch.");
             kindeUser.value = null;
         }
     } catch (e) {
         console.error("Error fetching Kinde user info:", e);
         kindeUser.value = null;
     }
}


async function login(prompt: 'login' | 'create' = 'login'): Promise<void> {
    if (!kindeConfig.issuerUrl || !kindeConfig.clientId || !kindeConfig.redirectUri) {
        console.error("Kinde configuration missing. Cannot initiate login.");
        alert("认证服务配置错误，请联系管理员。");
        return;
    }

    try {
        // MODIFIED: Generate 96 bytes for the verifier, which results in a 128-character base64url string
        const codeVerifier = generateRandomString(96); // 96 bytes -> 128 char base64url string
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // State can be random bytes, base64url encode is fine
        const state = generateRandomString(32);

        localStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, codeVerifier);
        localStorage.setItem(STATE_STORAGE_KEY, state);
        console.log("Stored PKCE verifier and state in localStorage.");

        const authUrl = new URL(`${kindeConfig.issuerUrl}/oauth2/auth`);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', kindeConfig.clientId);
        authUrl.searchParams.append('redirect_uri', kindeConfig.redirectUri);
        authUrl.searchParams.append('scope', kindeConfig.scope);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('prompt', prompt);

        // Optional: Add audience if configured
        // if (kindeConfig.audience) {
        //     authUrl.searchParams.append('audience', kindeConfig.audience);
        // }

        console.log("Redirecting to Kinde auth URL:", authUrl.toString());

        window.location.href = authUrl.toString();

    } catch (e) {
        console.error("Error initiating Kinde login flow:", e);
        alert("无法启动认证流程，请稍后再试。");
    }
}

// MODIFIED: handleCallback now triggers checkAuthStatus after successful backend call
async function handleCallback(code: string, state: string): Promise<{ success: true, user?: KindeUser } | { success: false, error: string }> {
    console.log("Handling Kinde callback...");
    const storedState = localStorage.getItem(STATE_STORAGE_KEY);
    const storedVerifier = localStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);

    if (!state || !storedState || state !== storedState) {
        console.error("State mismatch or missing state. Possible CSRF attack.");
        localStorage.removeItem(STATE_STORAGE_KEY);
        localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
        // Clear auth state on potential attack
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null;
        return { success: false, error: "Authentication failed: Invalid state parameter." };
    }
    localStorage.removeItem(STATE_STORAGE_KEY);

    if (!code || !storedVerifier) {
        console.error("Missing authorization code or PKCE verifier.");
         localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
         // Clear auth state on missing params
         isAuthenticated.value = false;
         kindeUser.value = null;
         userMember.value = null;
        return { success: false, error: "Authentication failed: Missing code or verifier." };
    }
    localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);


    console.log("Exchanging code for tokens via backend...");
    try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/kinde/callback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                code_verifier: storedVerifier, // Send the stored verifier to the backend
                redirect_uri: kindeConfig.redirectUri, // Send the redirect_uri to the backend
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Backend token exchange failed:', response.status, data);
            // Clear auth state on backend error
            isAuthenticated.value = false;
            kindeUser.value = null;
            userMember.value = null;
            // MODIFIED: Return the actual error from the backend
            return { success: false, error: data.error || `Failed to exchange code for tokens (${response.status})` };
        }

        console.log("Token exchange successful via backend. Triggering auth status check...");
        // Backend set HttpOnly cookies. Now, trigger frontend state update by checking auth status via backend.
        // This will call /members/me and update isAuthenticated, kindeUser, and userMember
        await checkAuthStatus();

        // Return success. The user state is now in the composable's reactive refs.
        return { success: true, user: kindeUser.value || undefined }; // Return the fetched user if available

    } catch (e: any) {
        console.error("Error during token exchange callback:", e);
        // Clear state on error
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null; // Update state internally
        return { success: false, error: e.message || 'Authentication processing failed.' };
    }
}

function logout(): void {
    if (!kindeConfig.issuerUrl || !kindeConfig.logoutRedirectUri) {
        console.error("Kinde logout configuration missing. Cannot initiate logout.");
        alert("认证服务配置错误，请联系管理员。");
        return;
    }

    console.log("Initiating Kinde logout...");

    // Clear frontend state and cookies immediately (best effort)
    isAuthenticated.value = false;
    kindeUser.value = null;
    userMember.value = null; // Update state internally
    Cookies.remove(ACCESS_TOKEN_COOKIE_NAME); // Best effort for non-HttpOnly
    Cookies.remove(REFRESH_TOKEN_COOKIE_NAME); // Best effort for non-HttpOnly

    const logoutUrl = new URL(`${kindeConfig.issuerUrl}/logout`);
    logoutUrl.searchParams.append('redirect', kindeConfig.logoutRedirectUri);

    window.location.href = logoutUrl.toString();
}

// getAccessToken is now less useful for HttpOnly cookies, but kept for potential future use or debugging
function getAccessToken(): string | undefined {
    // This will return undefined for HttpOnly cookies, which is expected.
    return Cookies.get(ACCESS_TOKEN_COOKIE_NAME);
}

// MODIFIED: authenticatedFetch relies on browser sending HttpOnly cookies and handles 401
async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    // For HttpOnly cookies, the browser automatically includes them with the request
    // to the correct domain. We do NOT need to manually add the Authorization header
    // if we are relying solely on HttpOnly cookies.
    // However, keeping the 401 handling is crucial for any authenticated endpoint.

    // Ensure headers is a mutable object before adding Authorization (optional for HttpOnly)
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}), // Cast existing headers or use empty object
    };

    // If you were using non-HttpOnly cookies or other auth methods, you'd add the header here:
    // const token = getAccessToken();
    // if (token) {
    //     headers['Authorization'] = `Bearer ${token}`;
    // }

    const response = await fetch(url, {
        ...options,
        headers: headers, // Include merged headers (e.g., Content-Type)
    });

    if (response.status === 401) {
        console.warn(`Received 401 Unauthorized for ${url}. Clearing auth state.`);
        // Backend determined token (from HttpOnly cookie) is invalid or missing
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null;
        // Clear cookies client-side (best effort)
        Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
        Cookies.remove(REFRESH_TOKEN_COOKIE_NAME);
        // Optional: Redirect to the login page here
        // router.push('/'); // Requires importing router
    }

    return response;
}

// ADDED: Function to update userMember state from outside (e.g., after successful join/update)
// This allows Index.vue to trigger state updates managed by the composable
function updateUserMember(member: Member | null): void {
    userMember.value = member;
    // When userMember is updated, re-check isAuthenticated based on whether userMember is null
    // This is a simplified approach. A more robust way might be to rely solely on checkAuthStatus
    // or have a separate state for "isRegistered". For now, let's link isAuthenticated to userMember presence.
    // However, isAuthenticated should really mean "logged in via Kinde", not "has a member record".
    // Let's keep isAuthenticated tied to the backend /members/me check result.
    // The presence of userMember indicates registration status.
}


// Define the return type of the composable
interface UseKindeAuthReturn {
    isAuthenticated: Readonly<Ref<boolean>>; // Is logged in via Kinde
    kindeUser: Readonly<Ref<KindeUser | null>>; // Kinde user info if logged in
    userMember: Readonly<Ref<Member | null>>; // Member record if registered
    checkAuthStatus: () => Promise<void>; // Function to check auth status via backend
    login: (prompt?: 'login' | 'create') => Promise<void>;
    logout: () => void;
    handleCallback: (code: string, state: string) => Promise<{ success: true, user?: KindeUser } | { success: false, error: string }>;
    getAccessToken: () => string | undefined; // Still exists, but won't get HttpOnly value
    authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>; // Helper for authenticated API calls
    // ADDED: Expose the update function
    updateUserMember: (member: Member | null) => void; // For components to update state after join/patch
}


export function useKindeAuth(): UseKindeAuthReturn {
    // Initial check when the composable is first used in any component.
    // This ensures state is populated via the backend call on page load.
    if (!authStatusChecked.value) {
        checkAuthStatus();
    }

    return {
        isAuthenticated: readonly(isAuthenticated),
        kindeUser: readonly(kindeUser),
        userMember: readonly(userMember),
        checkAuthStatus,
        login,
        logout,
        handleCallback,
        getAccessToken,
        authenticatedFetch,
        updateUserMember, // Expose the update function
    };
}
