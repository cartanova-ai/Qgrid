# @cartanova/qgrid-sdk

Qgrid 서버의 HTTP 클라이언트. LLM 호출을 한 줄로.

## 설치

```bash
pnpm add @cartanova/qgrid-sdk
```

## 사용법

### 단순 텍스트 응답 — 논문 요약

```typescript
import { queryQgrid } from "@cartanova/qgrid-sdk";

const { data } = await queryQgrid({
  system: `당신은 학술 논문 요약가입니다.
- 입력은 논문 본문입니다.
- 핵심 내용을 한 단락(3~5문장)으로 요약해주세요.
- 전문용어는 유지하되 문장은 평이하게 써주세요.`,
  prompt: paperText,
  model: "anthropic/claude-haiku-4.5",
  projectName: "paper-digest",
});

console.log(data);
// "이 연구는 ... 를 다룹니다. 저자들은 ... 를 제안하며 ..."
```

호출 팁:
- **`system` 에 task / 출력 형식 / 제약을 명시**, **`prompt` 에 실제 입력 데이터** 만 두세요. 모델이 system 을 안정적으로 따라갑니다.
- `projectName` 은 `request_logs.project_name` 에 기록되어 웹 UI 에서 프로젝트별로 필터링 가능합니다.

### 구조화 응답 (Zod 스키마) — 논문 메타데이터 추출

```typescript
import { queryQgrid } from "@cartanova/qgrid-sdk";
import { z } from "zod";

const PaperSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  problem: z.string(),
  contribution: z.string(),
  keyFindings: z.array(z.string()),
  limitations: z.array(z.string()),
});

const { data } = await queryQgrid({
  system: `당신은 논문 분석가입니다.
- 입력 본문에서 메타데이터와 핵심 내용을 추출해주세요.
- title, authors 는 본문에 명시된 그대로 옮겨주세요.
- problem 은 저자가 다룬 문제, contribution 은 새로 제안한 것을 각각 한 문장씩 작성해주세요.
- keyFindings 는 결과 섹션에서 가장 중요한 3~5개를 골라주세요.
- limitations 는 저자가 직접 언급한 한계만 포함하고, 추측은 하지 말아주세요.`,
  prompt: paperText,
  model: "anthropic/claude-sonnet-4.6",
  projectName: "paper-digest",
  returnType: PaperSchema,
});

console.log(data.title, "—", data.authors.join(", "));
console.log("핵심 발견:", data.keyFindings);
```

Zod 스키마는 CLI 의 `--json-schema` 로 Anthropic API 의 **structured output tool** 에 네이티브 전달됩니다. 모델이 API 레벨에서 강제받아 **파싱 실패 0** (이전 버전처럼 retry 로직 불필요).

`z.enum`, `z.array`, `z.number`, `z.string`, `z.boolean` 같이 top-level 이 object 가 아닌 스키마도 SDK 가 내부에서 자동 wrap/unwrap 해주므로 그대로 사용 가능합니다:

```typescript
// top-level enum — 자동 wrap
const { data } = await queryQgrid({
  system: "이 논문이 머신러닝 분야인지 아닌지 판단해주세요. ML 또는 OTHER 로만 답해주세요.",
  prompt: paperAbstract,
  returnType: z.enum(["ML", "OTHER"]),
  model: "anthropic/claude-haiku-4.5",
});
const isML = data === "ML";

// top-level array — 자동 wrap
const { data } = await queryQgrid({
  system: "논문 본문에서 인용된 reference 리스트만 추출해주세요.",
  prompt: paperText,
  returnType: z.object({ authors: z.string(), title: z.string(), year: z.number() }).array(),
  model: "anthropic/claude-sonnet-4.6",
});
// data: { authors: string; title: string; year: number }[]
```

### `generateText` — ai-sdk 스타일

```typescript
import { generateText, Output } from "@cartanova/qgrid-sdk";

const result = await generateText({
  system: "당신은 학술 논문 요약가입니다. 한 단락으로 요약해주세요.",
  prompt: paperText,
  model: "anthropic/claude-sonnet-4.6",
  projectName: "paper-digest",
  output: Output.object({
    schema: z.object({
      summary: z.string(),
      tags: z.array(z.string()),
    }),
  }),
});

console.log(result.output.summary, result.output.tags);
console.log(`tokens: in=${result.usage.inputTokens}, out=${result.usage.outputTokens}`);
```

## 옵션

```typescript
queryQgrid({
  prompt: string;          // 필수
  system?: string;         // 시스템 프롬프트
  model?: QgridModel;      // "anthropic/claude-sonnet-4.6" 등. 자동완성 지원
  projectName?: string;    // request_logs.project_name 에 저장. 웹 UI 에서 필터 가능
  returnType?: z.ZodType;  // Zod 스키마 → --json-schema 로 네이티브 전달 + zod 검증
  timeout?: number;        // 타임아웃 ms (기본: 300000)
  serverUrl?: string;      // 서버 URL (기본: QGRID_URL 환경변수 또는 http://localhost:44900)
})
```

### 지원 모델 (`QgridModel`)

```typescript
type QgridModel =
  | "anthropic/claude-haiku-4.5"
  | "anthropic/claude-opus-4"
  | "anthropic/claude-opus-4.1"
  | "anthropic/claude-opus-4.5"
  | "anthropic/claude-opus-4.6"
  | "anthropic/claude-sonnet-4"
  | "anthropic/claude-sonnet-4.5"
  | "anthropic/claude-sonnet-4.6";
```

SDK 내부에서 CLI 형식 (`claude-sonnet-4-6`) 으로 변환되어 서버로 전송됨.

## 응답

```typescript
{
  data: string | T;          // 텍스트 또는 zod 검증 완료된 객체
  tokenName?: string;        // 실제 사용된 OAuth 토큰 이름 (race-free 로깅용)
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  durationMs: number;
  costUsd: number;
}
```

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `QGRID_URL` | Qgrid 서버 주소 | `http://localhost:44900` |

## 에러

```typescript
import { QgridError } from "@cartanova/qgrid-sdk";

try {
  await queryQgrid({ prompt: "..." });
} catch (e) {
  if (e instanceof QgridError) {
    e.code;    // "QUOTA_EXHAUSTED" | "SERVER_UNAVAILABLE" | "REQUEST_FAILED" | "PARSE_FAILED"
    e.status;  // HTTP status code
  }
}
```

## 제약

- **Single-turn 전용** — `messages` 배열/multi-turn 은 지원 안 함. 대화 히스토리는 prompt 문자열에 직접 embed.
- **Anthropic (Claude) 모델만** — OpenAI 등 타 프로바이더는 qgrid 범위 밖.

## 요구사항

- Node.js >= 20
- `zod` ^3.23.0 || ^4.0.0 (peer dependency)
- `ai` ^5.0.0 || ^6.0.0 (peer dependency, `generateText` 사용 시 타입 의존)
