import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EmulatorManager } from "./emulator.js";
import type { WorkerConfig } from "./config.js";

function testConfig(over: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    token: "t",
    javaBin: "C:\\nope\\java.exe",
    kemulatorDir: "C:\\nope",
    kemulatorJar: "C:\\nope\\KEmulator.jar",
    kemulatorMainClass: "emulator.Emulator",
    kemulatorExtraArgs: ["-swt", "-lwj"],
    runtimeType: "kemulator-0.9.8",
    gameJar: "C:\\nope\\game.jar",
    jvmHeapMb: 512,
    autoRestartOnCrash: false,
    maxRestartAttempts: 3,
    restartBackoffMs: 15000,
    healthIntervalMs: 5000,
    mirrorFps: 8,
    mirrorMaxWidth: 240,
    logDir: "D:\\Download\\nro-cloud-phone\\runtime\\logs",
    ...over,
  };
}

describe("EmulatorManager safety rules", () => {
  it("mặc định gameConnection=UNKNOWN, không suy đoán online", () => {
    const m = new EmulatorManager(testConfig());
    assert.equal(m.getState().status, "STOPPED");
    assert.equal(m.getState().gameConnection, "UNKNOWN");
  });

  it("từ chối start khi thiếu file, đánh dấu CRASHED kèm lý do", async () => {
    const m = new EmulatorManager(testConfig());
    const s = await m.start();
    assert.equal(s.status, "CRASHED");
    assert.match(s.lastError ?? "", /không tồn tại/);
  });

  it("buildArgs dùng cú pháp KE 0.9.8 (main-class)", () => {
    const m = new EmulatorManager(testConfig({ kemulatorJar: "K/KEmulator.jar", gameJar: "G.jar" }));
    assert.deepEqual(m.buildArgs(), [
      "-cp",
      "K/KEmulator.jar",
      "emulator.Emulator",
      "-jar",
      "G.jar",
      "-swt",
      "-lwj",
    ]);
  });

  it("buildArgs fallback nnx64 khi khong co main-class", () => {
    const m = new EmulatorManager(
      testConfig({ kemulatorDir: "K", kemulatorJar: "K/KEmulator.jar", gameJar: "G.jar", kemulatorMainClass: "" }),
    );
    assert.deepEqual(m.buildArgs(), [
      "-Djava.library.path=K",
      "-Xmx512M",
      "-Dfile.encoding=UTF-8",
      "-jar",
      "K/KEmulator.jar",
      "-jar",
      "G.jar",
    ]);
  });

  it("stop khi chưa chạy vẫn về STOPPED", async () => {
    const m = new EmulatorManager(testConfig());
    const s = await m.stop();
    assert.equal(s.status, "STOPPED");
  });
});
