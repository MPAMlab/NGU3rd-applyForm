// composables/useKindeAuth.ts
import { ref, readonly, Ref, ComputedRef } from 'vue';
import Cookies from 'js-cookie';
import CryptoJS from 'crypto-js';
import { Buffer } from 'buffer';

// Import types from your types file
import { Member, KindeUser } from '../types'; // <--- Ensure this path is correct

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
const authStatusChecked: Ref<boolean> = ref(false);

// --- Constants for PKCE and State ---
const PKCE_VERIFIER_STORAGE_KEY = 'kinde_pkce_code_verifier';
const STATE_STORAGE_KEY = 'kinde_oauth_state';
const ACCESS_TOKEN_COOKIE_NAME = 'kinde_access_token';
const REFRESH_TOKEN_COOKIE_NAME = 'kinde_refresh_token';

// --- Helper Functions for PKCE ---

function generateRandomString(length: number): string {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => String.fromCharCode(byte)).join('');
}

function base64urlencode(buffer: ArrayBuffer): string {
    const base64 = Buffer.from(buffer).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return base64urlencode(hashBuffer);
}

// --- Core Authentication Logic ---

async function checkAuthStatus(): Promise<void> {
    if (authStatusChecked.value) {
        return;
    }
    authStatusChecked.value = true;

    console.log("Checking Kinde auth status...");

    const accessToken = Cookies.get(ACCESS_TOKEN_COOKIE_NAME);

    if (accessToken) {
        isAuthenticated.value = true;
        console.log("Access token found. User is authenticated.");

        // Fetch the user's member data from your backend
        // This function will update userMember.value internally
        await fetchUserMember();

        // If userMember is still null after fetch, try fetching Kinde user info directly
        // (This might happen if the user is logged in via Kinde but hasn't registered a member record yet)
        if (!userMember.value) {
             await fetchKindeUserInfo();
        }


    } else {
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null; // Ensure userMember is null if not authenticated
        console.log("No access token found. User is not authenticated.");
    }
}

// ADDED: Function to fetch user member data and update state
async function fetchUserMember(): Promise<void> {
    if (!isAuthenticated.value) {
        userMember.value = null;
        return;
    }

    console.log("Fetching user member data...");
    try {
        const response = await authenticatedFetch(`${import.meta.env.VITE_API_BASE_URL}/members/me`);

        if (response.ok) {
            const data = await response.json();
            userMember.value = data.member as Member | null; // Update state internally
            console.log("User member data fetched:", userMember.value);
             // If member exists, we can potentially get Kinde user info from it
             if (userMember.value && userMember.value.kinde_user_id) {
                  // This is a basic placeholder. Full user info (name, email)
                  // should ideally come from Kinde's ID token or /userinfo endpoint.
                  // For now, we just set the ID.
                  // We should ideally fetch full info if needed, or rely on ID token claims.
                  // Let's fetch full info for consistency.
                  await fetchKindeUserInfo(); // Fetch full Kinde user info
             } else {
                  // User is authenticated but has no member record yet
                  // We still need the Kinde user ID for registration
                  await fetchKindeUserInfo(); // Fetch full Kinde user info
             }
        } else if (response.status === 401) {
             console.warn("Failed to fetch user member data: Authentication failed (401). Clearing auth state.");
             // Clear auth state if token is invalid
             isAuthenticated.value = false;
             kindeUser.value = null;
             userMember.value = null; // Update state internally
             Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
             Cookies.remove(REFRESH_TOKEN_COOKIE_NAME);
             // Optional: Redirect to login or show login prompt
        }
        else {
            console.error("Failed to fetch user member data:", response.status, await response.text());
            userMember.value = null; // Update state internally
        }
    } catch (e) {
        console.error("Error fetching user member data:", e);
        userMember.value = null; // Update state internally
    }
}

// ADDED: Function to fetch Kinde user info and update state
async function fetchKindeUserInfo(): Promise<void> {
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
             kindeUser.value = { // Update state internally
                 id: userInfo.sub,
                 email: userInfo.email,
                 name: `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
                 given_name: userInfo.given_name,
                 family_name: userInfo.family_name,
                 // Add other claims you need
             } as KindeUser;
             console.log("Kinde user info fetched:", kindeUser.value);
         } else if (response.status === 401) {
              console.warn("Failed to fetch Kinde user info: Authentication failed (401). Clearing auth state.");
              // Access token might be expired, need refresh or re-login
              // For simplicity now, just clear auth state
              isAuthenticated.value = false;
              kindeUser.value = null; // Update state internally
              userMember.value = null; // Update state internally
              Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
              Cookies.remove(REFRESH_TOKEN_COOKIE_NAME);
              // Optional: Attempt refresh token flow or redirect to login
         }
         else {
             console.error("Failed to fetch Kinde user info:", response.status, await response.text());
             kindeUser.value = null; // Update state internally
         }
     } catch (e) {
         console.error("Error fetching Kinde user info:", e);
         kindeUser.value = null; // Update state internally
     }
}


async function login(prompt: 'login' | 'create' = 'login'): Promise<void> {
    if (!kindeConfig.issuerUrl || !kindeConfig.clientId || !kindeConfig.redirectUri) {
        console.error("Kinde configuration missing. Cannot initiate login.");
        alert("认证服务配置错误，请联系管理员。");
        return;
    }

    try {
        const codeVerifier = generateRandomString(128);
        const codeChallenge = await generateCodeChallenge(codeVerifier);

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

async function handleCallback(code: string, state: string): Promise<{ success: true, user?: KindeUser } | { success: false, error: string }> {
    console.log("Handling Kinde callback...");
    const storedState = localStorage.getItem(STATE_STORAGE_KEY);
    const storedVerifier = localStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);

    if (!state || !storedState || state !== storedState) {
        console.error("State mismatch or missing state. Possible CSRF attack.");
        localStorage.removeItem(STATE_STORAGE_KEY);
        localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
        return { success: false, error: "Authentication failed: Invalid state parameter." };
    }
    localStorage.removeItem(STATE_STORAGE_KEY);

    if (!code || !storedVerifier) {
        console.error("Missing authorization code or PKCE verifier.");
         localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
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
                code_verifier: storedVerifier,
                redirect_uri: kindeConfig.redirectUri,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Backend token exchange failed:', response.status, data);
            return { success: false, error: data.error || `Failed to exchange code for tokens (${response.status})` };
        }

        console.log("Token exchange successful via backend.");
        // Backend should have set HttpOnly cookies.
        // Now, update frontend state by checking cookies and fetching user data.
        // checkAuthStatus will update isAuthenticated, kindeUser, and userMember internally
        await checkAuthStatus();

        return { success: true, user: kindeUser.value || undefined }; // Return the fetched user if available

    } catch (e: any) {
        console.error("Error during token exchange callback:", e);
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
    Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
    Cookies.remove(REFRESH_TOKEN_COOKIE_NAME);

    const logoutUrl = new URL(`${kindeConfig.issuerUrl}/logout`);
    logoutUrl.searchParams.append('redirect', kindeConfig.logoutRedirectUri);

    window.location.href = logoutUrl.toString();
}

function getAccessToken(): string | undefined {
    return Cookies.get(ACCESS_TOKEN_COOKIE_NAME);
}

async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getAccessToken();
    // MODIFIED: Ensure headers is a mutable object before adding Authorization
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}), // Cast existing headers or use empty object
    };

    if (token) {
        // MODIFIED: Use dot notation or bracket notation with string literal
        headers['Authorization'] = `Bearer ${token}`; // This is fine with Record<string, string>
        // Or: headers.Authorization = `Bearer ${token}`; // Also fine
    } else {
        console.warn(`Attempted to fetch ${url} without an access token.`);
        // The backend will return 401, which is handled below
    }

    const response = await fetch(url, {
        ...options,
        headers: headers,
    });

    if (response.status === 401) {
        console.warn(`Received 401 Unauthorized for ${url}. Token might be expired or invalid. Clearing auth state.`);
        // Access token might be expired, need refresh or re-login
        // For simplicity now, just clear auth state
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null; // Update state internally
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
}


// Define the return type of the composable
interface UseKindeAuthReturn {
    isAuthenticated: Readonly<Ref<boolean>>;
    kindeUser: Readonly<Ref<KindeUser | null>>;
    userMember: Readonly<Ref<Member | null>>;
    checkAuthStatus: () => Promise<void>;
    login: (prompt?: 'login' | 'create') => Promise<void>;
    logout: () => void;
    handleCallback: (code: string, state: string) => Promise<{ success: true, user?: KindeUser } | { success: false, error: string }>;
    getAccessToken: () => string | undefined;
    authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
    // ADDED: Expose the update function
    updateUserMember: (member: Member | null) => void;
}


export function useKindeAuth(): UseKindeAuthReturn {
    // Initial check when the composable is first used
    // This ensures state is populated even if router guard doesn't run immediately
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
