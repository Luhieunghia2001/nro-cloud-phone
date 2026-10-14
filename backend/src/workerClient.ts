import type { BackendConfig } from "./config.js";

async function callWorker(cfg: BackendConfig, path: string, method: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${cfg.workerBaseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.workerToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) throw new Error(`worker ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

export const workerClient = {
  state: (cfg: BackendConfig) => callWorker(cfg, "/state", "GET") as Promise<{ ok: boolean; state: WorkerEmulatorState }>,
  diagnostics: (cfg: BackendConfig) => callWorker(cfg, "/diagnostics", "GET") as Promise<{ ok: boolean; diagnostics: unknown }>,
  start: (cfg: BackendConfig) => callWorker(cfg, "/start", "POST") as Promise<{ ok: boolean; state: WorkerEmulatorState }>,
  stop: (cfg: BackendConfig) => callWorker(cfg, "/stop", "POST") as Promise<{ ok: boolean; state: WorkerEmulatorState }>,
};

export interface WorkerEmulatorState {
  status: "STOPPED" | "STARTING" | "RUNNING" | "DEGRADED" | "STOPPING" | "CRASHED" | "UNKNOWN";
  pid: number | null;
  startedAt: string | null;
  lastError: string | null;
  gameConnection: "UNKNOWN" | "UNVERIFIED" | "VERIFIED";
  gameConnectionNote: string;
  restarts: number;
  commandLine: string | null;
}
