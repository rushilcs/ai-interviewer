declare namespace Express {
  export interface Request {
    authUser?: {
      id: string;
      email: string;
      role: "OPS_ADMIN" | "OPS_REVIEWER";
    };
    invite?: {
      id: string;
      role_id: string;
      token: string;
      expires_at: string | null;
      max_starts: number;
      starts_used: number;
      revoked_at: string | null;
    };
    talentInterview?: {
      id: string;
      invite_id: string | null;
      status: string;
      schema_version: string;
    };
  }
}
