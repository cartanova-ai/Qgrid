#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

const program = new Command();
program.name("qgrid").version("0.1.0").description("Qgrid — LLM subscription token proxy server");

function checkCommand(cmd: string): boolean {
  try {
    execSync(`${cmd} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

program
  .command("start")
  .description("Start Qgrid server")
  .option("-p, --port <port>", "server port (overrides .env)")
  .action(async (opts) => {
    const __dirname = dirname(fileURLToPath(import.meta.url));

    // .env에서 QGRID_ prefix 환경변수만 로드
    const envPath = join(process.cwd(), ".env");
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key.startsWith("QGRID_") && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    // CLI 옵션이 .env보다 우선
    if (opts.port) {
      process.env.PORT = opts.port;
    }

    // claude CLI 사전 체크
    if (!checkCommand("claude")) {
      console.error("Error: claude CLI not found.");
      console.error("Install: npm i -g @anthropic-ai/claude-code");
      process.exit(1);
    }

    // Sonamu가 bundle/을 프로젝트 루트로 인식하도록 설정
    process.env.LR = "remote";
    const bundlePath = join(__dirname, "..", "bundle");
    const serverEntry = join(bundlePath, "dist", "index.js");
    if (!existsSync(serverEntry)) {
      console.error(`Error: Server bundle not found at ${serverEntry}`);
      console.error("Run `pnpm run bundle` first, or reinstall @qgrid/cli.");
      process.exit(1);
    }

    process.env.INIT_CWD = bundlePath;

    try {
      await import(serverEntry);
    } catch (e) {
      console.error("Failed to start server:", (e as Error).stack ?? (e as Error).message);
      process.exit(1);
    }
  });

program.parse();
