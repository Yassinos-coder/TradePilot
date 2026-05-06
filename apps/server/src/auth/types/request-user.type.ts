export interface RequestUser {
  userId: string;
  authUserId: string;
  email: string;
  accessToken: string;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}
