export type UserRole = "admin" | "user";

export type EmulatorStatus =
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "DEGRADED"
  | "STOPPING"
  | "CRASHED"
  | "UNKNOWN";

export type GameConnectionStatus = "UNKNOWN" | "UNVERIFIED" | "VERIFIED";

export interface PublicUser {
  id: number;
  username: string;
  role: UserRole;
}

export interface SessionEventView {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface CloudSessionView {
  id: string;
  name: string;
  ownerId: number;
  status: EmulatorStatus;
  processId: number | null;
  runtimeType: string;
  startedAt: string | null;
  lastHealthCheck: string | null;
  lastError: string | null;
  gameConnection: GameConnectionStatus;
  gameConnectionNote: string;
  uptimeMs: number | null;
  recentEvents: SessionEventView[];
}

export interface ConnectionTicket {
  wsPath: string;
  token: string;
  expiresAt: string;
  protocol: "vnc";
}

export function gameConnectionLabel(s: GameConnectionStatus): string {
  if (s === "VERIFIED") return "Đã xác minh game online";
  if (s === "UNVERIFIED") return "Chưa xác minh kết nối game";
  return "Không rõ trạng thái game";
}
