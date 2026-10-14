import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { WorkerConfig } from "./config.js";

export type EmulatorStatus =
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "DEGRADED"
  | "STOPPING"
  | "CRASHED"
  | "UNKNOWN";

export type GameConnectionStatus = "UNKNOWN" | "UNVERIFIED" | "VERIFIED";

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

export interface EmulatorState {
  status: EmulatorStatus;
  pid: number | null;
  startedAt: string | null;
  lastError: string | null;
  gameConnection: GameConnectionStatus;
  gameConnectionNote: string;
  restarts: number;
  commandLine: string | null;
}

const INITIAL_STATE: EmulatorState = {
  status: "STOPPED",
  pid: null,
  startedAt: null,
  lastError: null,
  gameConnection: "UNKNOWN",
  gameConnectionNote: "Chưa xác minh kết nối game (mặc định theo hợp đồng API).",
  restarts: 0,
  commandLine: null,
};

export class EmulatorManager {
  private proc: ChildProcess | null = null;
  private state: EmulatorState = { ...INITIAL_STATE };
  private crashTimer: NodeJS.Timeout | null = null;
  private logStream: fs.WriteStream | null = null;
  private starting = false;

  constructor(private readonly cfg: WorkerConfig) {}

  getState(): EmulatorState {
    return { ...this.state };
  }

  setState(patch: Partial<EmulatorState>): EmulatorState {
    this.state = { ...this.state, ...patch };
    return this.getState();
  }

  buildArgs(): string[] {
    // KE 0.9.8: java -cp KEmulator.jar emulator.Emulator -jar GAME_JAR -swt -lwj
    // (khac nnx64: java -jar KEmulator.jar -jar GAME_JAR)
    if (this.cfg.kemulatorMainClass) {
      return [
        "-cp",
        this.cfg.kemulatorJar,
        this.cfg.kemulatorMainClass,
        "-jar",
        this.cfg.gameJar,
        ...this.cfg.kemulatorExtraArgs,
      ];
    }
    return [
      `-Djava.library.path=${this.cfg.kemulatorDir}`,
      `-Xmx${this.cfg.jvmHeapMb}M`,
      "-Dfile.encoding=UTF-8",
      "-jar",
      this.cfg.kemulatorJar,
      "-jar",
      this.cfg.gameJar,
    ];
  }

  validatePaths(): string | null {
    if (!fs.existsSync(this.cfg.javaBin)) return `JAVA_BIN không tồn tại: ${this.cfg.javaBin}`;
    if (!fs.existsSync(this.cfg.kemulatorJar)) return `KEmulator.jar không tồn tại: ${this.cfg.kemulatorJar}`;
    if (!fs.existsSync(this.cfg.gameJar)) return `GAME_JAR không tồn tại: ${this.cfg.gameJar}`;
    return null;
  }

  async start(): Promise<EmulatorState> {
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      return this.setState({ lastError: "duplicateDetected: tiến trình đã chạy, từ chối start trùng." });
    }
    if (this.starting) return this.setState({ lastError: "Đang khởi động, vui lòng đợi." });
    const missing = this.validatePaths();
    if (missing) return this.setState({ status: "CRASHED", lastError: missing });
    this.starting = true;
    this.setState({ status: "STARTING", lastError: null, pid: null, startedAt: null, commandLine: null });
    fs.mkdirSync(this.cfg.logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.logStream = fs.createWriteStream(path.join(this.cfg.logDir, `worker-${stamp}.stdout.log`), { flags: "a" });
    const args = this.buildArgs();
    const cmdLine = `"${this.cfg.javaBin}" ${args.join(" ")}`;
    try {
      const child = spawn(this.cfg.javaBin, args, { cwd: this.cfg.kemulatorDir, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout?.pipe(this.logStream, { end: false });
      child.stderr?.pipe(this.logStream, { end: false });
      this.proc = child;
      child.on("exit", (code, signal) => this.onExit(code, signal));
      child.on("error", (err) => {
        this.setState({ status: "CRASHED", lastError: `Không khởi động được: ${err.message}` });
      });
      return this.setState({
        status: "RUNNING",
        pid: child.pid ?? null,
        startedAt: new Date().toISOString(),
        commandLine: cmdLine,
        gameConnection: "UNVERIFIED",
        gameConnectionNote: "Tiến trình đang chạy (RUNNING) — chưa xác minh nhân vật game online.",
      });
    } catch (err) {
      return this.setState({ status: "CRASHED", lastError: err instanceof Error ? err.message : String(err) });
    } finally {
      this.starting = false;
    }
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.proc = null;
    this.logStream?.end();
    this.logStream = null;
    if (code === 0 || code === null) {
      this.setState({ status: "STOPPED", pid: null, lastError: null });
      return;
    }
    const lastError = `Tiến trình thoát bất thường (code=${code}, signal=${signal}).`;
    if (this.cfg.autoRestartOnCrash && this.state.restarts < this.cfg.maxRestartAttempts) {
      const restarts = this.state.restarts + 1;
      this.setState({ status: "DEGRADED", pid: null, restarts, lastError: `${lastError} Restart sau ${this.cfg.restartBackoffMs}ms.` });
      if (this.crashTimer) clearTimeout(this.crashTimer);
      this.crashTimer = setTimeout(() => void this.start(), this.cfg.restartBackoffMs);
    } else {
      this.setState({ status: "CRASHED", pid: null, lastError });
    }
  }

  async stop(): Promise<EmulatorState> {
    if (this.crashTimer) { clearTimeout(this.crashTimer); this.crashTimer = null; }
    const child = this.proc;
    if (!child || child.killed || child.exitCode !== null) {
      this.proc = null;
      return this.setState({ status: "STOPPED", pid: null });
    }
    this.setState({ status: "STOPPING" });
    return new Promise((resolve) => {
      const forceKill = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* dead */ } }, 8000);
      child.once("exit", () => {
        clearTimeout(forceKill);
        this.proc = null;
        this.logStream?.end();
        this.logStream = null;
        resolve(this.setState({ status: "STOPPED", pid: null, lastError: null }));
      });
      try { child.kill(); } catch (err) {
        clearTimeout(forceKill);
        resolve(this.setState({ status: "STOPPED", pid: null, lastError: err instanceof Error ? err.message : String(err) }));
      }
    });
  }

  health(): { alive: boolean; desktopSession: string | null } {
    const alive = !!this.proc && !this.proc.killed && this.proc.exitCode === null;
    return { alive, desktopSession: process.env.SESSIONNAME ?? null };
  }

  diagnostics(): WorkerDiagnostics {
    const h = this.health();
    return {
      pid: this.state.pid,
      status: this.state.status,
      commandLine: this.state.commandLine,
      windowTitle: null,
      responding: null,
      duplicateDetected: false,
      desktopSession: h.desktopSession,
      lastError: this.state.lastError,
      gameConnection: this.state.gameConnection,
    };
  }

  setGameConnection(status: GameConnectionStatus, note: string): EmulatorState {
    return this.setState({ gameConnection: status, gameConnectionNote: note });
  }
}
