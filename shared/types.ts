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

export interface SessionEventView {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface ConnectionTicket {
  wsPath: string;
  expiresAt: string;
  protocol: "vnc";
}

export interface WorkerDiagnostics {
  pid: number | null;
  status: EmulatorStatus;
  commandLine: string | null;
  windowTitle: string | null;
  responding: boolean | null;
  duplicateDetected: boolean;
  desktopSession: string | null;
  lastError: string | null;
  gameConnection: GameConnectionStatus;
}
