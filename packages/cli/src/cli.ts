#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

const program = new Command();
program
  .name("qgrid")
  .version("1.1.0")
  .description("Qgrid — LLM subscription token proxy server")
  .option("--db <url>", "PostgreSQL connection URL (e.g. postgres://user:pw@host:port/dbname)")
  .option("-p, --port <port>", "server port")
  .action(async (opts) => {
    const __dirname = dirname(fileURLToPath(import.meta.url));

    // --db URL 파싱 → QGRID_DB_* 환경변수로 변환
    if (opts.db) {
      const m = opts.db.match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)$/);
      if (!m) {
        console.error("Invalid DB URL format. Expected: postgres://user:password@host:port/dbname");
        process.exit(1);
      }
      const [, user, password, host, port, dbName] = m;
      process.env.QGRID_DB_HOST = host;
      process.env.QGRID_DB_PORT = port;
      process.env.QGRID_DB_USER = user;
      process.env.QGRID_DB_PASSWORD = password;
      process.env.QGRID_DB_NAME = dbName;
    }
    if (opts.port) {
      process.env.PORT = opts.port;
    }

    // claude CLI 사전 체크
    try {
      execSync("claude --version", { stdio: "ignore" });
    } catch {
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
      console.error("Reinstall: npm i -g @cartanova/qgrid-cli");
      process.exit(1);
    }

    process.env.INIT_CWD = bundlePath;

    // DB 연결 사전 체크
    const dbHost = process.env.QGRID_DB_HOST ?? "localhost";
    const dbPort = process.env.QGRID_DB_PORT ?? "44901";
    const dbName = process.env.QGRID_DB_NAME ?? "qgrid";
    try {
      const pg = await import("pg");
      const client = new pg.default.Client({
        host: dbHost,
        port: Number(dbPort),
        user: process.env.QGRID_DB_USER ?? "postgres",
        password: process.env.QGRID_DB_PASSWORD ?? "postgres",
        database: dbName,
        connectionTimeoutMillis: 5000,
      });
      await client.connect();
      await client.end();
    } catch (e) {
      console.error(`Error: Cannot connect to PostgreSQL at ${dbHost}:${dbPort}/${dbName}`);
      console.error(`  ${(e as Error).message}`);
      console.error(`\nProvide DB connection via --db flag or QGRID_DB_* env vars:`);
      console.error(`  qgrid --db postgres://user:password@host:port/dbname`);
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
