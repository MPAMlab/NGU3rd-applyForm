// src/types.ts

// Define the structure of a Kinde user object as needed by the frontend
export interface KindeUser {
    id: string; // Kinde user ID (sub claim)
    email: string | null;
    name: string | null; // Full name
    given_name?: string | null; // First name
    family_name?: string | null; // Last name
    // Add any other Kinde user properties you use
}

// Define the structure of a Member object from your backend
export interface Member {
    id: number; // Database ID for the member entry
    kinde_user_id: string; // Kinde user ID associated with this member
    team_code: string; // The 4-digit team code
    color: 'red' | 'green' | 'blue'; // Member's chosen color
    job: 'attacker' | 'defender' | 'supporter'; // Member's chosen job
    maimai_id: string; // Maimai ID
    nickname: string; // Member's nickname
    qq_number: string; // Member's QQ number
    avatar_url: string | null; // URL to the member's avatar (can be null)
    created_at: string; // Timestamp
    updated_at: string; // Timestamp
    // Add any other properties your backend Member object has
}

// You can add other shared types here if needed
