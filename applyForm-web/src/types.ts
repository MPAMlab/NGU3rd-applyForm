// types.ts

export interface Member {
    id: number;
    team_code: string;
    color: 'red' | 'green' | 'blue';
    job: 'attacker' | 'defender' | 'supporter';
    maimai_id: string;
    nickname: string;
    qq_number: string;
    avatar_url: string | null;
    joined_at: number; // Unix timestamp
    updated_at: number; // Unix timestamp
    kinde_user_id: string | null; // Kinde user ID
    is_admin: number; // ADDED: 0 or 1
}

export interface Team {
    code: string;
    name: string;
    created_at: number; // Unix timestamp
}

// Basic Kinde User info (can be extended based on scopes)
export interface KindeUser {
    id: string; // Kinde user ID (sub claim)
    email: string;
    name: string; // Full name
    given_name?: string;
    family_name?: string;
    // Add other claims you request (e.g., picture, etc.)
}