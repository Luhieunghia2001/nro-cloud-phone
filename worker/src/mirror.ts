import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { WebSocket } from "ws";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOOP = path.resolve(HERE, "native/capture-loop.ps1");
const INPUT = path.resolve(HERE, "native/send-input.ps1");

export interface MirrorConfig {
  processId: number;
  fps: number;
  maxWidth: number;
  frameWidth: number;
  frameHeight: number;
}

interface ClientState {
  lastSeq: number;
}
type MirrorClient = WebSocket & { _mirror?: ClientState };

/** Quan ly 1 vong mirror cho 1 PID: 1 tien trinh PowerShell ben vung stream frame,
 *  broadcast cho moi client dang xem; nhan lenh input tu client. */
export class ScreenMirror {
  private clients = new Set<MirrorClient>();
  private child: ChildProcess | null = null;
  private stdoutBuf: Buffer = Buffer.alloc(0);
  private metaSent = false;
  private restartCount = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private stderrTail = "";
  private lastFrameAt = 0;

  constructor(private readonly cfg: MirrorConfig) {}

  addClient(ws: WebSocket): void {
    const c = ws as MirrorClient;
    c._mirror = { lastSeq: 0 };
    this.clients.add(c);
    ws.on("message", (raw) => void this.onMessage(c, raw.toString()));
    ws.on("close", () => {
      this.clients.delete(c);
      if (this.clients.size === 0) this.stopLoop();
    });
    this.startLoop();
  }

  get clientCount(): number {
    return this.clients.size;
  }

  private startLoop(): void {
    if (this.child) return;
    this.metaSent = false;
    this.stdoutBuf = Buffer.alloc(0);
    const args = [
      "-ExecutionPolicy", "Bypass", "-File", LOOP,
      "-ProcessId", String(this.cfg.processId),
      "-Fps", String(this.cfg.fps),
    ];
    if (this.cfg.maxWidth > 0) args.push("-MaxWidth", String(this.cfg.maxWidth));
    const p = spawn("powershell", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    this.child = p;
    p.stdout?.on("data", (chunk) => this.onStdout(chunk as Buffer));
    p.stderr?.on("data", (d) => {
      this.stderrTail = (this.stderrTail + String(d)).slice(-500);
    });
    p.on("error", () => this.handleChildDown());
    p.on("close", () => this.handleChildDown());
  }

  /** Tien trinh capture chet giua chung hoac game tat: bao client biet + tu khoi dong lai. */
  private handleChildDown(): void {
    this.child = null;
    if (this.restartTimer) return;
    if (this.clients.size === 0) return;
    if (this.restartCount >= 5) {
      this.broadcastText(JSON.stringify({ type: "stream-error", message: "capture loop chet lien tuc (" + this.stderrTail.slice(-200) + "). Vui long tat/bat lai Xem." }));
      return;
    }
    this.restartCount++;
    const backoff = Math.min(2000, 300 * this.restartCount);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startLoop();
    }, backoff);
    this.broadcastText(JSON.stringify({ type: "stream-retry", attempt: this.restartCount }));
  }
  /** Parse binary stream: [1B type][len][payload]. type 1=meta(2B len), 2=jpeg(4B len). */
  private onStdout(chunk: Buffer): void {
    this.stdoutBuf = this.stdoutBuf.length ? Buffer.concat([this.stdoutBuf, chunk]) : chunk;
    for (;;) {
      const buf = this.stdoutBuf;
      if (buf.length < 3) return;
      const type = buf[0];
      if (type === 1) {
        if (buf.length < 3) return;
        const len = buf.readUInt16LE(1);
        if (buf.length < 3 + len) return;
        const json = buf.subarray(3, 3 + len).toString("utf8");
        this.stdoutBuf = buf.subarray(3 + len);
        try {
          const m = JSON.parse(json) as { w?: number; h?: number };
          this.broadcastText(JSON.stringify({ type: "meta", w: m.w ?? this.cfg.frameWidth, h: m.h ?? this.cfg.frameHeight, pid: this.cfg.processId }));
          this.metaSent = true;
        } catch { /* ignore */ }
      } else if (type === 2) {
        if (buf.length < 5) return;
        const len = buf.readUInt32LE(1);
        if (len > 8 * 1024 * 1024) {
          // Frame vo ly -> coi nhu mat dong bo, drop ve 0 va doi chunk tiep theo.
          this.stdoutBuf = Buffer.alloc(0);
          return;
        }
        if (buf.length < 5 + len) return;
        const jpeg = Buffer.from(buf.subarray(5, 5 + len));
        this.stdoutBuf = buf.subarray(5 + len);
        this.lastFrameAt = Date.now();
        this.broadcastBinary(jpeg);
      } else {
        // Unknown type byte — skip 1 to resync.
        this.stdoutBuf = buf.subarray(1);
      }
    }
  }

  private broadcastBinary(buf: Buffer): void {
    for (const c of this.clients) {
      if (c.readyState === 1) c.send(buf, { binary: true });
    }
  }

  private broadcastText(text: string): void {
    for (const c of this.clients) {
      if (c.readyState === 1) c.send(text);
    }
  }

  private stopLoop(): void {
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    this.restartCount = 0;
    if (this.child && !this.child.killed) {
      try { this.child.kill(); } catch { /* ignore */ }
    }
    this.child = null;
  }

  private async onMessage(ws: MirrorClient, raw: string): Promise<void> {
    let msg: { type?: string; x?: number; y?: number; button?: string; action?: string; vk?: number; keyAction?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
    if (msg.type === "mouse") {
      await this.runInput([
        "-Kind", "mouse",
        "-X", String(Math.round(msg.x ?? 0)),
        "-Y", String(Math.round(msg.y ?? 0)),
        "-Button", msg.button ?? "left",
        "-Action", msg.action ?? "click",
      ]);
      return;
    }
    if (msg.type === "key") {
      await this.runInput([
        "-Kind", "key",
        "-Vk", String(msg.vk ?? 0),
        "-KeyAction", msg.keyAction ?? "press",
      ]);
      return;
    }
  }

  private runInput(extra: string[]): Promise<void> {
    return new Promise((resolve) => {
      const args = ["-ExecutionPolicy", "Bypass", "-File", INPUT, "-ProcessId", String(this.cfg.processId), ...extra];
      const p = spawn("powershell", args, { windowsHide: true });
      p.stderr.resume();
      p.on("error", () => resolve());
      p.on("close", () => resolve());
    });
  }

  dispose(): void {
    this.stopLoop();
    for (const c of this.clients) c.close();
    this.clients.clear();
  }
}


