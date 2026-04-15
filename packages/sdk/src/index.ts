import { type FinishReason, type LanguageModelUsage, type ModelMessage, type Prompt } from "ai";
/**
 * @cartanova/qgrid-sdk — Qgrid HTTP 클라이언트.
 * QGRID_URL 환경변수로 서버 주소 설정 (기본: http://localhost:44900)
 */
import { z } from "zod";

import { type OutputDefinition } from "./output";
import { type QgridResponse, type QgridTypedResponse, type QgridUsage } from "./types";

export class QgridError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "QgridError";
  }
}

const jsonSchemaCache = new WeakMap<z.ZodType, string>();
function getJsonSchemaString(schema: z.ZodType): string {
  let cached = jsonSchemaCache.get(schema);
  if (!cached) {
    cached = JSON.stringify(z.toJSONSchema(schema));
    jsonSchemaCache.set(schema, cached);
  }
  return cached;
}

/**
 * 기존 qgrid 전용 API.
 * 단순한 prompt/system 기반 호출 + Zod returnType 검증.
 */
export async function queryQgrid<T extends z.ZodType | undefined = undefined>(params: {
  prompt: string;
  system?: string;
  returnType?: T;
  timeout?: number;
  serverUrl?: string;
  maxAttempts?: number;
}): Promise<T extends z.ZodType ? QgridTypedResponse<z.infer<T>> : QgridResponse> {
  const { prompt, system, returnType } = params;
  const url = params.serverUrl ?? process.env.QGRID_URL ?? "http://localhost:44900";
  const timeout = params.timeout ?? 300_000;
  const maxAttempts = params.maxAttempts ?? 3;

  const systemWithSchema = returnType
    ? `${system ?? ""}\n\n반드시 다음 JSON Schema에 맞게 JSON으로만 응답하세요. 다른 텍스트 없이:\n${getJsonSchemaString(returnType)}`
    : system;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${url}/api/qgrid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, system: systemWithSchema }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const message = err.error ?? err.message ?? res.statusText;
      if (res.status === 429) throw new QgridError("QUOTA_EXHAUSTED", 429, message);
      if (res.status === 503) throw new QgridError("SERVER_UNAVAILABLE", 503, message);
      throw new QgridError("REQUEST_FAILED", res.status, message);
    }

    const { text, ...rest } = await res.json();
    if (!returnType) {
      return { ...rest, data: text } as any;
    }

    try {
      return { ...rest, data: z.parse(returnType, JSON.parse(text)) } as any;
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxAttempts) {
        console.warn(`[qgrid] JSON 파싱 실패 (attempt ${attempt}/${maxAttempts}), 재시도...`);
      }
    }
  }

  throw new QgridError(
    "PARSE_FAILED",
    200,
    `JSON 파싱/검증 실패 (${maxAttempts}회 시도): ${lastError?.message}`,
  );
}

// --- ai-sdk 호환 API ---

function convertMessages(messages: ModelMessage[]): { prompt: string; system?: string } {
  const systemMsgs = messages
    .filter((m): m is Extract<ModelMessage, { role: "system" }> => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)));
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  if (nonSystemMsgs.length === 1 && nonSystemMsgs[0].role === "user") {
    const content = nonSystemMsgs[0].content;
    return {
      prompt: typeof content === "string" ? content : JSON.stringify(content),
      ...(systemMsgs.length > 0 && { system: systemMsgs.join("\n") }),
    };
  }

  const prompt = nonSystemMsgs
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${m.role}]: ${content}`;
    })
    .join("\n\n");
  return {
    prompt,
    ...(systemMsgs.length > 0 && { system: systemMsgs.join("\n") }),
  };
}

function mapUsage(usage: QgridUsage): LanguageModelUsage {
  return {
    inputTokens: usage.input_tokens,
    inputTokenDetails: {
      cacheReadTokens: usage.cache_read_input_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens,
    },
    outputTokens: usage.output_tokens,
    outputTokenDetails: undefined,
    totalTokens: usage.input_tokens + usage.output_tokens,
  };
}

/**
 * ai-sdk 호환 generateText.
 * import 경로만 바꾸면 기존 ai-sdk 코드와 동일하게 사용 가능.
 */
export async function generateText(
  params: Prompt & {
    model?: unknown;
    providerOptions?: Record<string, unknown>;
    output?: OutputDefinition<unknown>;
    timeout?: number;
    serverUrl?: string;
    maxAttempts?: number;
  },
): Promise<{
  text: string;
  usage: LanguageModelUsage;
  finishReason: FinishReason;
  output: unknown;
}> {
  const {
    system: directSystem,
    output,
    timeout,
    serverUrl,
    maxAttempts,
    model: _model,
    providerOptions: _providerOptions,
    ...inputParams
  } = params;

  let prompt: string;
  let system: string | undefined;

  if ("messages" in inputParams && inputParams.messages) {
    const converted = convertMessages(inputParams.messages);
    prompt = converted.prompt;
    system = directSystem
      ? typeof directSystem === "string"
        ? directSystem
        : JSON.stringify(directSystem)
      : converted.system;
  } else if ("prompt" in inputParams && inputParams.prompt) {
    const p = inputParams.prompt;
    prompt = typeof p === "string" ? p : JSON.stringify(p);
    system = directSystem
      ? typeof directSystem === "string"
        ? directSystem
        : JSON.stringify(directSystem)
      : undefined;
  } else {
    throw new QgridError("INVALID_INPUT", 400, "prompt 또는 messages 중 하나는 필수입니다.");
  }

  const rest = { timeout, serverUrl, maxAttempts };
  if (output) {
    const result = await queryQgrid({
      prompt,
      system,
      returnType: output.schema as z.ZodType,
      ...rest,
    });
    return {
      text: JSON.stringify(result.data),
      usage: mapUsage(result.usage),
      finishReason: "stop",
      output: result.data,
    };
  }

  const result = await queryQgrid({ prompt, system, ...rest });
  return {
    text: result.data,
    usage: mapUsage(result.usage),
    finishReason: "stop",
    output: result.data,
  };
}

export { Output } from "./output";
export type { OutputDefinition } from "./output";
export type { QgridBase, QgridResponse, QgridTypedResponse, QgridUsage } from "./types";
export type {
  FinishReason,
  GenerateTextResult,
  LanguageModelUsage,
  ModelMessage,
  Prompt,
} from "ai";
