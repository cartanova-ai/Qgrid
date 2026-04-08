#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program.name("qgrid").version("0.1.0").description("Qgrid — LLM subscription token proxy server");

import { execSync } from "node:child_process";

function checkCommand(cmd: string): boolean {
  try {
    execSync(`${cmd} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

program
  .command("init")
  .description("initialize (.env + docker-compose.yml)")
  .action(async () => {
    const { existsSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    // 사전 체크 (파일 생성 전에)
    const nodeVersion = Number.parseInt(process.versions.node.split(".")[0], 10);
    if (nodeVersion < 20) {
      console.log(`⚠ Node.js ${process.versions.node} detected. >= 20 required.`);
    }
    if (!checkCommand("claude")) {
      console.log("⚠ claude CLI not found (install: npm i -g @anthropic-ai/claude-code)");
    }
    if (!checkCommand("docker")) {
      console.log("⚠ Docker not found (optional: you can use an external database instead)");
    }
    console.log("");

    const cwd = process.cwd();

    // .env
    const envPath = join(cwd, ".env");
    if (existsSync(envPath)) {
      console.log("  .env already exists, skipping");
    } else {
      writeFileSync(
        envPath,
        `# Qgrid Server
PORT=44900 # you can change this if needed

# Qgrid Database (used by default, or you can connect to an external DB)
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=db_name
`,
      );
      console.log("✓ .env created");
    }

    // docker-compose.yml
    const composePath = join(cwd, "docker-compose.yml");
    if (existsSync(composePath)) {
      console.log("  docker-compose.yml already exists, skipping");
    } else {
      writeFileSync(
        composePath,
        `services:
  postgres:
    image: postgres:18
    ports:
      - "\${DB_PORT:-5432}:5432"
    environment:
      POSTGRES_USER: \${DB_USER:-postgres}
      POSTGRES_PASSWORD: \${DB_PASSWORD:-postgres}
      POSTGRES_DB: \${DB_NAME:-qgrid}
    volumes:
      - qgrid-data:/var/lib/postgresql/data

volumes:
  qgrid-data:
`,
      );
      console.log("✓ docker-compose.yml created");
    }

    // Next steps
    console.log("");
    console.log("Next steps:");
    console.log("  1. Edit .env if you have an existing database");
    console.log("  2. docker compose up -d");
    console.log("  3. qgrid start");
  });

program
  .command("start")
  .description("start the Qgrid server")
  .option("-p, --port <port>", "server port (overrides .env PORT)")
  .action(async (opts) => {
    const { existsSync, readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    // .env 로드
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
        if (!process.env[key]) {
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

    // bundle 안의 빌드된 서버 실행
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const serverEntry = join(__dirname, "..", "bundle", "dist", "index.js");

    if (!existsSync(serverEntry)) {
      console.error(`Error: Server bundle not found at ${serverEntry}`);
      console.error("Run `pnpm run bundle` first, or reinstall @qgrid/cli.");
      process.exit(1);
    }

    try {
      await import(serverEntry);
    } catch (e) {
      console.error("Failed to start server:", (e as Error).stack ?? (e as Error).message);
      process.exit(1);
    }
  });

program.parse();
