/**
 * ByCC Frame — Sonamu HTTP API 엔드포인트.
 *
 * POST   /api/bycc/query       — LLM 쿼리 (system?, prompt)
 * GET    /api/bycc/stats       — 토큰별 상태
 * POST   /api/bycc/addToken    — 토큰 추가 (수동)
 * POST   /api/bycc/updateToken — 토큰 수정
 * POST   /api/bycc/removeToken — 토큰 제거
 * POST   /api/bycc/oauthLogin  — OAuth 로그인 (브라우저)
 * GET    /api/bycc/usage       — 쿼터 사용률 (Anthropic API)
 * GET    /api/bycc/health      — 헬스체크
 */
import { exec } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { api, BaseFrameClass } from "sonamu";
import { RequestLogModel } from "../request-log/request-log.model";
import type {
  CliResult,
  HealthResponse,
  OAuthLoginResult,
  TokenStats,
  UsageResponse,
} from "./bycc.types";
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  fetchUsage,
  generatePKCE,
  refreshAccessToken,
} from "./oauth.functions";
import { pool } from "./pool.functions";
import {
  addTokenToFile,
  getTokenFilePath,
  loadTokens,
  removeTokenFromFile,
  updateTokenInFile,
} from "./tokens.functions";

class ByccFrameClass extends BaseFrameClass {
  constructor() {
    super("Bycc");
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async query(prompt: string, system?: string, timeout?: number): Promise<CliResult> {
    const result = await pool.query({ system, prompt }, timeout);

    // 로그 기록 실패해도 쿼리 결과는 반환
    const tokenEntry = loadTokens().find((e) => e.token === pool.lastUsedToken);
    RequestLogModel.save([
      {
        token_name: tokenEntry?.name ?? "Unknown",
        query: system ? `[System]\n${system}\n\n[User]\n${prompt}` : prompt,
        response: result.text,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_read_tokens: result.usage.cache_read_input_tokens,
        cache_creation_tokens: result.usage.cache_creation_input_tokens,
        duration_ms: result.durationMs,
      },
    ]).catch((e) => console.error("requestLog save failed:", e));

    return result;
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async stats(): Promise<TokenStats[]> {
    return pool.getStats();
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async addToken(token: string, name?: string): Promise<{ added: boolean }> {
    pool.addToken(token, name);
    return { added: true };
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async updateToken(
    token: string,
    name?: string,
    newToken?: string,
  ): Promise<{ updated: boolean }> {
    const entry = updateTokenInFile(token, { name, token: newToken || undefined });
    if (!entry) return { updated: false };

    if (newToken) {
      pool.destroyWorkers(token);
      pool.createWorkers(newToken);
    }
    return { updated: true };
  }

  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async removeToken(token: string): Promise<{ removed: boolean }> {
    const removed = pool.removeToken(token);
    return { removed };
  }

  // OAuth 로그인 — 임시 콜백 서버를 띄우고 auth URL 반환
  @api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
  async oauthLogin(name: string): Promise<OAuthLoginResult> {
    const { codeVerifier, codeChallenge, state } = generatePKCE();

    // 임시 콜백 서버
    const { port, code } = await new Promise<{ port: number; code: string }>((resolve, reject) => {
      let listenPort = 0;
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "", `http://localhost`);
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end();
          return;
        }

        const authCode = url.searchParams.get("code");
        const receivedState = url.searchParams.get("state");

        if (!authCode || receivedState !== state) {
          res.writeHead(400);
          res.end("Invalid callback");
          reject(new Error("Invalid OAuth callback"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Login successful!</h1><p>You can close this tab and return to ByCC.</p>");
        resolve({ port: listenPort, code: authCode });
        server.close();
      });

      server.listen(0, "localhost", () => {
        const addrInfo = server.address() as AddressInfo;
        listenPort = addrInfo.port;
        const authUrl = buildAuthUrl(codeChallenge, state, listenPort);

        exec(`open "${authUrl}"`);
      });

      // 5분 타임아웃
      setTimeout(() => {
        server.close();
        reject(new Error("OAuth login timed out"));
      }, 300_000);
    });

    // code → token 교환
    const tokens = await exchangeCodeForTokens(code, codeVerifier, state, port);

    // 같은 계정의 이전 토큰이 있으면 교체
    if (tokens.accountUuid) {
      const entries = loadTokens();
      entries
        .filter((e) => e.accountUuid === tokens.accountUuid)
        .forEach((old) => {
          pool.destroyWorkers(old.token);
          removeTokenFromFile(old.token);
        });
    }

    // 새 토큰 저장 + pool에 등록
    addTokenToFile(tokens.accessToken, name);
    updateTokenInFile(tokens.accessToken, {
      name,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      accountUuid: tokens.accountUuid,
    });
    pool.addToken(tokens.accessToken, name);

    return { token: tokens.accessToken, name };
  }

  // 토큰 사용량 조회 (OAuth usage API)
  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async usage(tokenName?: string): Promise<UsageResponse> {
    const entries = loadTokens();
    const entry = tokenName
      ? entries.find((e) => e.name === tokenName && e.refreshToken)
      : entries.findLast((e) => e.active && e.refreshToken);

    if (!entry) return {} as UsageResponse;

    // 토큰 만료 체크 + refresh
    let accessToken = entry.token;
    if (entry.expiresAt && entry.expiresAt < Date.now() && entry.refreshToken) {
      const refreshed = await refreshAccessToken(entry.refreshToken);
      // 토큰 업데이트
      updateTokenInFile(entry.token, {
        token: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
      });
      // pool 워커도 업데이트
      pool.destroyWorkers(entry.token);
      pool.createWorkers(refreshed.accessToken);
      accessToken = refreshed.accessToken;
    }

    const result = await fetchUsage(accessToken);
    return result ?? ({} as UsageResponse);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"] })
  async health(): Promise<HealthResponse> {
    return {
      status: "ok",
      workers: [...pool.workers.values()].flat().length,
      activeTokens: pool.workers.size - pool.quotaExhausted.size,
      tokenDir: getTokenFilePath(),
    };
  }
}

export const ByccFrame = new ByccFrameClass();
