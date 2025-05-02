// composables/useKindeAuth.ts
import { ref, readonly, Ref, ComputedRef, nextTick } from 'vue'; // Import nextTick
import Cookies from 'js-cookie';
import CryptoJS from 'crypto-js';

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
// REMOVED: authStatusChecked flag

// --- Constants for PKCE and State ---
const PKCE_VERIFIER_STORAGE_KEY = 'kinde_pkce_code_verifier';
const STATE_STORAGE_KEY = 'kinde_oauth_state';
const ACCESS_TOKEN_COOKIE_NAME = 'kinde_access_token';
const REFRESH_TOKEN_COOKIE_NAME = 'kinde_refresh_token';


// --- Helper Functions for PKCE ---

function generateRandomString(byteLength: number): string {
    const randomBytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(randomBytes);
    return base64urlencodeUint8Array(randomBytes);
}

function base64urlencodeUint8Array(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = window.btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return base64urlencodeArrayBuffer(hashBuffer);
}

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

// MODIFIED: Removed authStatusChecked flag logic
async function checkAuthStatus(): Promise<void> {
    console.log("Checking Kinde auth status via backend /members/me...");

    // Call the backend endpoint. The browser will automatically send HttpOnly cookies.
    // fetchUserMember will update isAuthenticated, kindeUser, and userMember based on the backend response.
    await fetchUserMember();

    console.log(`Auth status check complete. isAuthenticated: ${isAuthenticated.value}, userMember: ${userMember.value !== null}`);
}

async function fetchUserMember(): Promise<void> {
    console.log("Fetching user member data from backend /members/me...");
    try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/members/me`);

        if (response.ok) {
            const data = await response.json();
            userMember.value = data.member as Member | null;

            isAuthenticated.value = true; // Backend returned 200, means token was valid
            console.log("Backend /members/me returned OK. User is authenticated.");

            // Now fetch Kinde user info using the *valid* access token (backend validated it)
            await fetchKindeUserInfo();

        } else if (response.status === 401) {
            console.warn("Backend /members/me returned 401. User is not authenticated.");
            isAuthenticated.value = false;
            kindeUser.value = null;
            userMember.value = null;
            // Clear cookies client-side (best effort for non-HttpOnly, but good practice)
            Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
            Cookies.remove(REFRESH_TOKEN_COOKIE_NAME);
        }
        else {
            console.error("Failed to fetch user member data:", response.status, await response.text());
            isAuthenticated.value = false; // Treat other errors as unauthenticated for safety
            kindeUser.value = null;
            userMember.value = null;
        }
    } catch (e) {
        console.error("Error fetching user member data:", e);
        isAuthenticated.value = false; // Treat network errors as unauthenticated for safety
        kindeUser.value = null;
        userMember.value = null;
    }
}

async function fetchKindeUserInfo(): Promise<void> {
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
             kindeUser.value = {
                 id: userInfo.sub,
                 email: userInfo.email,
                 name: `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
                 given_name: userInfo.given_name,
                 family_name: userInfo.family_name,
             } as KindeUser;
             console.log("Kinde user info fetched:", kindeUser.value);
         } else {
             // If /userinfo fails (e.g., token expired or 404), authenticatedFetch might have cleared state,
             // or it's a Kinde config issue (like 404). Log and set kindeUser to null.
             console.warn("Failed to fetch Kinde user info. Status:", response.status, await response.text());
             kindeUser.value = null;
         }
     } catch (e) {
         console.error("Error fetching Kinde user info:", e);
         kindeUser.value = null;
     }
}

const OAUTH_STATE_CONTEXT_STORAGE_KEY_PREFIX = 'kinde_oauth_context_';

async function login(prompt: 'login' | 'create' = 'login', context?: { teamCode: string | null, currentStep: number }): Promise<void> {
    if (!kindeConfig.issuerUrl || !kindeConfig.clientId || !kindeConfig.redirectUri) {
        console.error("Kinde configuration missing. Cannot initiate login.");
        alert("认证服务配置错误，请联系管理员。");
        return;
    }

    try {
        const codeVerifier = generateRandomString(96);
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // State can be random bytes, base64url encode is fine
        const state = generateRandomString(32);

        localStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, codeVerifier);
        localStorage.setItem(STATE_STORAGE_KEY, state); // Store the OAuth state itself

        // ADDED: Store the context data associated with this state
        if (context) {
             localStorage.setItem(`${OAUTH_STATE_CONTEXT_STORAGE_KEY_PREFIX}${state}`, JSON.stringify(context));
             console.log("Stored OAuth state context in localStorage:", context);
        }


        console.log("Stored PKCE verifier and state in localStorage.");

        const authUrl = new URL(`${kindeConfig.issuerUrl}/oauth2/auth`);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', kindeConfig.clientId);
        authUrl.searchParams.append('redirect_uri', kindeConfig.redirectUri);
        authUrl.searchParams.append('scope', kindeConfig.scope);
        authUrl.searchParams.append('state', state); // Pass the generated state
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('prompt', prompt);

        console.log("Redirecting to Kinde auth URL:", authUrl.toString());

        window.location.href = authUrl.toString();

    } catch (e) {
        console.error("Error initiating Kinde login flow:", e);
        alert("无法启动认证流程，请稍后再试。");
    }
}

async function handleCallback(code: string, state: string): Promise<{ success: true, user?: KindeUser, context?: { teamCode: string | null, currentStep: number } } | { success: false, error: string }> {
    console.log("Handling Kinde callback...");
    const storedState = localStorage.getItem(STATE_STORAGE_KEY);
    const storedVerifier = localStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);

    // ADDED: Retrieve context before clearing state
    let context: { teamCode: string | null, currentStep: number } | undefined;
    const contextKey = `${OAUTH_STATE_CONTEXT_STORAGE_KEY_PREFIX}${state}`;
    const storedContext = localStorage.getItem(contextKey);
    if (storedContext) {
        try {
            context = JSON.parse(storedContext);
            console.log("Retrieved OAuth state context:", context);
        } catch (e) {
            console.error("Failed to parse stored OAuth state context:", e);
        }
        localStorage.removeItem(contextKey); // Clean up context storage
    }


    if (!state || !storedState || state !== storedState) {
        console.error("State mismatch or missing state. Possible CSRF attack.");
        localStorage.removeItem(STATE_STORAGE_KEY);
        localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
        isAuthenticated.value = false; kindeUser.value = null; userMember.value = null;
        return { success: false, error: "Authentication failed: Invalid state parameter." };
    }
    localStorage.removeItem(STATE_STORAGE_KEY); // Clear the OAuth state itself

    if (!code || !storedVerifier) {
        console.error("Missing authorization code or PKCE verifier.");
         localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
         isAuthenticated.value = false; kindeUser.value = null; userMember.value = null;
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
            isAuthenticated.value = false; kindeUser.value = null; userMember.value = null;
            return { success: false, error: data.error || `Failed to exchange code for tokens (${response.status})` };
        }

        console.log("Token exchange successful via backend. Triggering auth status check...");
        await checkAuthStatus(); // This updates isAuthenticated, kindeUser, userMember

        // MODIFIED: Return the retrieved context along with success
        return { success: true, user: kindeUser.value || undefined, context: context };

    } catch (e: any) {
        console.error("Error during token exchange callback:", e);
        isAuthenticated.value = false; kindeUser.value = null; userMember.value = null;
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

    isAuthenticated.value = false;
    kindeUser.value = null;
    userMember.value = null;
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
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}),
    };

    const response = await fetch(url, {
        ...options,
        headers: headers,
    });

    if (response.status === 401) {
        console.warn(`Received 401 Unauthorized for ${url}. Clearing auth state.`);
        isAuthenticated.value = false;
        kindeUser.value = null;
        userMember.value = null;
        Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
        Cookies.remove(REFRESH_TOKEN_COOKIE_NAME);
        // Optional: Redirect to the login page here if needed
        // router.push('/');
    }

    return response;
}

function updateUserMember(member: Member | null): void {
    userMember.value = member;
}

async function logout(): Promise<void> {
    console.log("Initiating logout via backend...");

    // Clear frontend state immediately for responsiveness
    isAuthenticated.value = false;
    kindeUser.value = null;
    userMember.value = null;
    // Clear non-HttpOnly cookies (best effort)
    Cookies.remove(ACCESS_TOKEN_COOKIE_NAME);
    Cookies.remove(REFRESH_TOKEN_COOKIE_NAME);
    // Clear PKCE/state from localStorage if they somehow linger
    localStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
    localStorage.removeItem(STATE_STORAGE_KEY);
    // Clear any stored context
    // (Need a way to find the key without the state value, maybe iterate or use a known key if only one context is stored)
    // Or simply ignore clearing context here, it will be cleaned up on next login state generation.

    try {
        // Call the backend logout endpoint
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/logout`, {
            method: 'POST', // Or GET, depending on your backend implementation
            mode: 'cors',
            // No body needed usually, backend identifies user via cookie
        });

        // The backend should respond with a redirect (302) to Kinde's logout URL.
        // The browser will follow this redirect automatically.
        // If the backend doesn't redirect (e.g., returns 200 OK),
        // we might need to manually redirect here based on the response.
        // But the preferred way is backend redirect.

        if (response.ok || response.redirected) {
             console.log("Backend logout initiated successfully. Browser should redirect.");
             // Browser handles the redirect sent by the backend.
             // If backend returns OK instead of redirect, uncomment below:
             // window.location.href = kindeConfig.logoutRedirectUri; // Fallback redirect
        } else {
             console.error("Backend logout call failed:", response.status, await response.text());
             // Even if backend fails, attempt Kinde logout directly as fallback? Or show error?
             // For now, let's assume the frontend state clear is enough for user feedback
             alert("退出登录时遇到问题，请稍后再试或手动清除 Cookie。");
        }

    } catch (e) {
        console.error("Error calling backend logout:", e);
        alert("退出登录时连接服务器失败。");
        // Fallback redirect?
        // window.location.href = kindeConfig.logoutRedirectUri;
    }
}
interface UseKindeAuthReturn {
    isAuthenticated: Readonly<Ref<boolean>>;
    kindeUser: Readonly<Ref<KindeUser | null>>;
    userMember: Readonly<Ref<Member | null>>;
    checkAuthStatus: () => Promise<void>;
    // MODIFIED: login now accepts optional context
    login: (prompt?: 'login' | 'create', context?: { teamCode: string | null, currentStep: number }) => Promise<void>;
    logout: () => void;
    // MODIFIED: handleCallback now returns optional context
    handleCallback: (code: string, state: string) => Promise<{ success: true, user?: KindeUser, context?: { teamCode: string | null, currentStep: number } } | { success: false, error: string }>;
    getAccessToken: () => string | undefined;
    authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
    updateUserMember: (member: Member | null) => void;
}

export function useKindeAuth(): UseKindeAuthReturn {
    checkAuthStatus(); // Initial check

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
        updateUserMember,
    };
}
