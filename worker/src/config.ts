import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config();

function req(name: string, fallback = ""): string {
  const v = process.env[name] ?? fallback;
  return v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").toLowerCase().trim();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return fallback;
}

export interface WorkerConfig {
  host: string;
  port: number;
  token: string;
  javaBin: string;
  kemulatorDir: string;
  kemulatorJar: string;
  /** KEmulator 0.9.8 chay bang main-class, nnx64 chay bang -jar KEmulator.jar */
  kemulatorMainClass: string;
  /** Vi du: "-swt -lwj" (KE 0.9.8). Chuoi rong = khong them. */
  kemulatorExtraArgs: string[];
  runtimeType: string;
  gameJar: string;
  jvmHeapMb: number;
  autoRestartOnCrash: boolean;
  maxRestartAttempts: number;
  restartBackoffMs: number;
  mirrorFps: number;
  mirrorMaxWidth: number;
  healthIntervalMs: number;
  logDir: string;
}

export function loadConfig(): WorkerConfig {
  const kemulatorDir = req("KEMULATOR_DIR", "D:\\Project web game java\\kemulator-javaemulator\\KEmulator_JavaEmulator");
  const gameJar = req("GAME_JAR", "D:\\Project web game java\\DragonBoy250.jar");
  const kemulatorJar = req("KEMULATOR_JAR", path.join(kemulatorDir, "KEmulator.jar"));
  const kemulatorMainClass = req("KEMULATOR_MAIN_CLASS", "emulator.Emulator");
  const kemulatorExtraArgs = req("KEMULATOR_EXTRA_ARGS", "-swt -lwj")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const runtimeType = req("RUNTIME_TYPE", "kemulator-0.9.8");
  return {
    host: req("WORKER_HOST", "127.0.0.1"),
    port: num("WORKER_PORT", 47821),
    token: req("WORKER_TOKEN", ""),
    javaBin: req("JAVA_BIN", path.join(kemulatorDir, "jre", "bin", "javaw.exe")),
    kemulatorDir,
    kemulatorJar,
    kemulatorMainClass,
    kemulatorExtraArgs,
    runtimeType,
    gameJar,
    jvmHeapMb: num("JVM_HEAP_MB", 512),
    autoRestartOnCrash: bool("AUTO_RESTART_ON_CRASH", false),
    maxRestartAttempts: num("MAX_RESTART_ATTEMPTS", 3),
    restartBackoffMs: num("RESTART_BACKOFF_MS", 15000),
    healthIntervalMs: num("HEALTH_INTERVAL_MS", 5000),
    mirrorFps: num("MIRROR_FPS", 20),
    mirrorMaxWidth: num("MIRROR_MAX_WIDTH", 240),
    logDir: path.resolve(process.cwd(), "../runtime/logs"),
  };
}
