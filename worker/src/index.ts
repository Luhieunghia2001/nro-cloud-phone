import { loadConfig } from "./config.js";
import { EmulatorManager } from "./emulator.js";
import { createServer } from "./server.js";

const cfg = loadConfig();
const mgr = new EmulatorManager(cfg);
const server = createServer(cfg, mgr);

server.listen(cfg.port, cfg.host, () => {
  console.log(`[worker] listening on http://${cfg.host}:${cfg.port}`);
  console.log(`[worker] java=${cfg.javaBin}`);
  console.log(`[worker] game=${cfg.gameJar}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`[worker] ${signal} — stopping emulator...`);
  void mgr.stop().finally(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
