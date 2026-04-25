# @cartanova/qgrid-cli

Qgrid 서버를 한 줄로 실행. Claude 구독 크레딧을 HTTP API로 제공하는 LLM 프록시.

## 설치

```bash
npm i -g @cartanova/qgrid-cli
```

## 사용법

```bash
# DB URL로 실행
qgrid --db postgres://user:password@host:port/dbname

# 포트 지정
qgrid --db postgres://... -p 3000

# 환경변수로 DB 설정 (플래그 생략 가능)
export QGRID_DB_HOST=dev0.example.com
export QGRID_DB_PORT=5432
export QGRID_DB_USER=postgres
export QGRID_DB_PASSWORD=postgres
export QGRID_DB_NAME=qgrid
qgrid
```

서버가 뜨면 `http://localhost:44900`에서 대시보드 접속.

Ctrl+C로 종료.

## 옵션

```
qgrid [options]

  --db <url>         PostgreSQL 연결 URL
  -p, --port <port>  서버 포트 (기본: 44900)
  -V, --version      버전 출력
  -h, --help         도움말
```

## 환경변수

`--db` 플래그가 없으면 아래 환경변수에서 DB 접속 정보를 읽음:

| 변수 | 기본값 |
|------|--------|
| `QGRID_DB_HOST` | `localhost` |
| `QGRID_DB_PORT` | `44901` |
| `QGRID_DB_USER` | `postgres` |
| `QGRID_DB_PASSWORD` | `postgres` |
| `QGRID_DB_NAME` | `qgrid` |

## 사전 요구사항

- Node.js >= 20
- [Claude CLI](https://www.npmjs.com/package/@anthropic-ai/claude-code) — `npm i -g @anthropic-ai/claude-code`
- 접속 가능한 PostgreSQL

## 동작 방식

CLI는 Sonamu 기반 서버를 내장 번들로 포함하고 있음. 실행 시:

1. DB 연결 확인
2. Claude CLI 존재 확인
3. `/tmp/qgrid/.claude/settings.json` 자동 생성 (thinking / git 가이드 off, session cleanup)
4. 서버 시작 (API + 대시보드 웹 UI)
5. `QgridDispatcher` 싱글턴이 DB 의 active 토큰을 로드
6. 요청 도착 시 `claude -p` 프로세스를 새로 spawn → 응답 받고 종료 (fresh spawn 모델)

Docker 불필요. Node.js + Claude CLI + PostgreSQL만 있으면 됨.

## End-to-end 예시

서버를 띄운 뒤 SDK 또는 curl 로 호출:

### 1) 단순 텍스트 응답 — 논문 요약

```typescript
import { queryQgrid } from "@cartanova/qgrid-sdk";

const { data } = await queryQgrid({
  system: `당신은 학술 논문 요약가입니다.
- 입력은 논문 본문입니다.
- 핵심 내용을 한 단락(3~5문장)으로 요약해주세요.`,
  prompt: paperText,
  model: "anthropic/claude-haiku-4.5",
  projectName: "paper-digest",
});
// data: "이 연구는 ... 를 다룹니다. 저자들은 ... 를 제안하며 ..."
```

### 2) 구조화 응답 (Zod 스키마) — 논문 메타데이터 추출

```typescript
import { queryQgrid } from "@cartanova/qgrid-sdk";
import { z } from "zod";

const { data } = await queryQgrid({
  system: `당신은 논문 분석가입니다.
- 입력 본문에서 메타데이터와 핵심 내용을 추출해주세요.
- title, authors 는 본문에 명시된 그대로 옮겨주세요.
- keyFindings 는 결과 섹션에서 가장 중요한 3~5개를 골라주세요.`,
  prompt: paperText,
  model: "anthropic/claude-sonnet-4.6",
  projectName: "paper-digest",
  returnType: z.object({
    title: z.string(),
    authors: z.array(z.string()),
    keyFindings: z.array(z.string()),
  }),
});

console.log(data.title, "—", data.authors.join(", "));
console.log("핵심 발견:", data.keyFindings);
```

스키마가 CLI 의 `--json-schema` 로 Anthropic API structured output tool 에 네이티브 전달 → **파싱 실패 0**.

### 3) curl 로 직접 호출

```bash
curl -sS -X POST http://localhost:44900/api/qgrid/query \
  -H "Content-Type: application/json" \
  -d '{
    "system": "논문 abstract 를 한 문장으로 요약해주세요.",
    "prompt": "We propose a novel attention mechanism ...",
    "model": "claude-haiku-4-5"
  }'
```

> 서버 직접 호출 시 model 은 CLI 형식 (`claude-haiku-4-5`) 사용. SDK 는 `anthropic/claude-haiku-4.5` 형식을 자동 변환.

자세한 SDK 옵션은 [`@cartanova/qgrid-sdk` README](https://www.npmjs.com/package/@cartanova/qgrid-sdk) 참조.
