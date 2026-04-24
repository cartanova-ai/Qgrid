import { type generateText as _aiGenerateText } from "ai";
import { z } from "zod";

import { type OutputDefinition } from "./output";
import { type QgridResponse, type QgridTypedResponse, type QgridUsage } from "./types";

type AiGenerateTextParams = Parameters<typeof _aiGenerateText>[0];
type AiGenerateTextResult = Awaited<ReturnType<typeof _aiGenerateText>>;

export type QgridModel =
  | "anthropic/claude-haiku-4.5"
  | "anthropic/claude-opus-4"
  | "anthropic/claude-opus-4.1"
  | "anthropic/claude-opus-4.5"
  | "anthropic/claude-opus-4.6"
  | "anthropic/claude-sonnet-4"
  | "anthropic/claude-sonnet-4.5"
  | "anthropic/claude-sonnet-4.6";

// "anthropic/claude-sonnet-4.6" → "claude-sonnet-4-6"
function toCliModel(model: QgridModel): string {
  return model.replace(/^anthropic\//, "").replace(/\./g, "-");
}

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
    // `$schema` / `additionalProperties` 같은 (openAPI json spec)메타 필드는 Anthropic `--json-schema` 가
    const raw = z.toJSONSchema(schema) as Record<string, unknown>;
    const { $schema: _s, ...rest } = raw;
    cached = JSON.stringify(rest);
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
  model?: QgridModel;
  projectName?: string;
  returnType?: T;
  timeout?: number;
  serverUrl?: string;
}): Promise<T extends z.ZodType ? QgridTypedResponse<z.infer<T>> : QgridResponse> {
  const { prompt, system, model, projectName, returnType } = params;
  const cliModel = model ? toCliModel(model) : undefined;
  const url = params.serverUrl ?? process.env.QGRID_URL ?? "http://localhost:44900";
  const timeout = params.timeout ?? 300_000;

  // returnType 있으면 CLI 의 --json-schema 를 사용. schema 가 system prompt 에 들어가지 않고
  // Anthropic API 의 structured output (tool) 로 네이티브 전달됨 → prefix cache 절감, 파싱 실패 없음.
  const jsonSchema = returnType ? getJsonSchemaString(returnType) : undefined;

  const res = await fetch(`${url}/api/qgrid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, system, model: cliModel, projectName, jsonSchema }),
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

  // structured output 은 서버가 이미 JSON 문자열로 직렬화해서 넘겨줌. 파싱 + zod 검증만.
  try {
    const parsed = JSON.parse(text);
    return { ...rest, data: z.parse(returnType, parsed) } as any;
  } catch (e) {
    throw new QgridError(
      "PARSE_FAILED",
      200,
      `structured output 파싱/검증 실패: ${(e as Error).message}`,
    );
  }
}

// --- ai-sdk 호환 API (single-turn 전용) ---

function mapUsage(usage: QgridUsage): AiGenerateTextResult["usage"] {
  return {
    inputTokens: usage.input_tokens,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: usage.cache_read_input_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens,
    },
    outputTokens: usage.output_tokens,
    outputTokenDetails: {
      textTokens: usage.output_tokens,
      reasoningTokens: undefined,
    },
    totalTokens: usage.input_tokens + usage.output_tokens,
  };
}

function extractSchema(output: unknown): z.ZodType | undefined {
  if (!output || typeof output !== "object") return undefined;
  if (!("type" in output) || !("schema" in output)) return undefined;
  const def = output as OutputDefinition<unknown>;
  if (def.type === "text" || !def.schema) return undefined;
  return def.schema as z.ZodType;
}

type BaseParams = Omit<
  AiGenerateTextParams,
  "model" | "messages" | "prompt" | "output" | "experimental_output"
> & {
  prompt: string;
  system?: string;
  model?: QgridModel;
  projectName?: string;
  serverUrl?: string;
};

type GenerateTextResponse<T> = {
  text: string;
  usage: AiGenerateTextResult["usage"];
  finishReason: AiGenerateTextResult["finishReason"];
  output: T;
};

// OutputDefinition → T 추론
export async function generateText<T>(
  params: BaseParams & { output: OutputDefinition<T> },
): Promise<GenerateTextResponse<T>>;

// output 없음 → string
export async function generateText(params: BaseParams): Promise<GenerateTextResponse<string>>;

// implementation
export async function generateText(
  params: BaseParams & { output?: OutputDefinition<any> },
): Promise<GenerateTextResponse<any>> {
  const { prompt, system } = params;
  const schema = extractSchema(params.output);
  const rest = {
    model: params.model,
    projectName: params.projectName,
    serverUrl: params.serverUrl,
  };

  if (schema) {
    const result = await queryQgrid({ prompt, system, returnType: schema, ...rest });
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
export type { FinishReason, GenerateTextResult, LanguageModelUsage } from "ai";
