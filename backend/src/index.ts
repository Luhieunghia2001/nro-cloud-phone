import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { createApp } from "./routes.js";

const cfg = loadConfig();
const store = new Store(cfg.dbPath);
const app = createApp(cfg, store);

app.listen(cfg.port, cfg.host, () => {
  console.log(`[backend] listening on http://${cfg.host}:${cfg.port}`);
  console.log(`[backend] worker=${cfg.workerBaseUrl}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`[backend] ${signal} — closing...`);
  app.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
