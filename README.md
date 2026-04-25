# Qgrid (Quota Grid)

Claude 구독 크레딧을 HTTP API로 사용할 수 있게 해주는 **single-turn LLM 프록시 서버**.

Anthropic API 키(토큰 과금) 대신 **구독 정액제 크레딧**으로 LLM을 호출. N개 계정의 쿼터를 풀링하여 분산 요청.

---

## 아키텍처

```
팀원 A 로컬                             팀원 B 로컬
┌─────────────────────────┐           ┌─────────────────────────┐
│ qgrid (:44900)          │           │ qgrid (:44900)          │
│ ├─ QgridDispatcher      │           │ ├─ QgridDispatcher      │
│ │  └─ claude -p (spawn) │           │ │  └─ claude -p (spawn) │
│ ├─ 대시보드 웹 UI         │           │ ├─ 대시보드 웹 UI         │
│ └─ OAuth / Usage API    │           │ └─ OAuth / Usage API    │
└───────────┬─────────────┘           └───────────┬─────────────┘
            │                                     │
            └──────────┐  ┌───────────────────────┘
                       ▼  ▼
               ┌──────────────────┐
               │ PostgreSQL (공유) │
               │ ├─ tokens        │
               │ └─ request_logs  │
               └──────────────────┘
```

- **Fresh spawn** — 매 요청마다 `claude -p` 프로세스 1개 spawn 후 종료. persistent worker 없음.
- **멀티 토큰 풀링** — N개 구독 계정 등록, least-used round-robin + 병렬 요청 선반영으로 1:1 분산
- **Structured Output** — Zod 스키마를 `--json-schema` 로 네이티브 전달 (Anthropic API 레벨 강제)
- **Project settings 격리** — `/tmp/qgrid/.claude/settings.json` 자동 생성으로 user scope 영향 차단
- **Project-scoped 로깅** — 요청별 `projectName` 필드로 프로젝트별 필터/집계
- **OAuth 로그인** — Claude 계정으로 원클릭 토큰 발급/갱신
- **Usage API** — Anthropic 서버에서 실시간 쿼터 사용률 조회
- **Request Log** — 매 요청의 토큰 사용량/캐시 히트율/비용 DB 기록 (경량 subset P + 상세 subset A)

---

## 빠른 시작

### 사전 요구사항

- Node.js >= 20
- [Claude CLI](https://www.npmjs.com/package/@anthropic-ai/claude-code) (`npm i -g @anthropic-ai/claude-code`)
- 접속 가능한 PostgreSQL (팀 공유 DB 또는 로컬)

### 서버 실행

```bash
npm i -g @cartanova/qgrid-cli

# DB URL로 실행
qgrid --db postgres://user:password@host:port/dbname

# 또는 쉘 환경변수로 설정해두면 플래그 없이 실행
export QGRID_DB_HOST=dev.example.com
export QGRID_DB_PORT=5432
export QGRID_DB_USER=postgres
export QGRID_DB_PASSWORD=postgres
export QGRID_DB_NAME=qgrid
qgrid
```

서버가 뜨면 `http://localhost:44900`에서 대시보드 접속 → **Login with Claude**로 토큰 등록.

Ctrl+C로 종료.

### SDK 사용

```bash
pnpm add @cartanova/qgrid-sdk
```

**단순 텍스트 응답** — 논문 한 단락 요약:

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

**구조화 응답 (Zod 스키마)** — 논문 메타데이터 추출:

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

스키마는 CLI 의 `--json-schema` 로 Anthropic API structured output tool 에 네이티브 전달 → **파싱 실패 0**.
`z.enum`, `z.array` 같이 top-level 이 object 가 아닌 스키마도 SDK 가 자동 wrap/unwrap.

환경변수 `QGRID_URL` 로 서버 주소 설정 (기본: `http://localhost:44900`).
자세한 옵션은 [`packages/sdk/README.md`](./packages/sdk/README.md) 참조.

---

## CLI 옵션

```
qgrid [options]

  --db <url>         PostgreSQL 연결 URL (postgres://user:pw@host:port/dbname)
  -p, --port <port>  서버 포트 (기본: 44900)
```

`--db`를 생략하면 `QGRID_DB_*` 환경변수에서 읽음. 환경변수도 없으면 기본값(`localhost:44901`)으로 시도.

---

## 팀 사용 (공유 DB)

팀원들이 같은 DB를 공유하면 토큰 풀을 함께 사용할 수 있음:

```bash
# 각 팀원 로컬에서 (같은 DB를 바라봄)
qgrid --db postgres://user:pw@dev.example.com:5432/qgrid

# 각 팀원 프로젝트에서
QGRID_URL=http://localhost:44900
```

---

## 개발

```bash
git clone https://github.com/cartanova-ai/Qgrid.git
cd Qgrid
pnpm install
cp packages/api/.env.example packages/api/.env  # DB 설정 수정
pnpm -C packages/api sonamu dev
```

### 패키지 구조

```
packages/
├── api/   ← Sonamu 서버 (개발용, HMR)
├── web/   ← 대시보드 React 앱 (TanStack Router + Query)
├── sdk/   ← @cartanova/qgrid-sdk (npm 패키지)
└── cli/   ← @cartanova/qgrid-cli (npm 패키지, 서버 번들 포함)
```

---

## 주의사항

- **Claude CLI 필수** — Qgrid 서버가 요청마다 `claude -p`를 spawn. 호스트 머신에 설치 필요.
- **Single-turn 전용** — `messages` 배열/multi-turn/`--resume` 은 지원 안 함. 대화 히스토리가 필요하면 prompt 문자열에 직접 embed.
- **쿼터 관리** — Claude 5시간 rolling window. 소진된 토큰은 사용자가 **UI 의 토글로 수동 비활성화**. 자동 failover 는 제거됨 (quota 회복 자동 감지 불가한 제품이라 operator-in-the-loop 방식이 더 안전).
- **OAuth 토큰** — 자동 refresh. Usage API 조회에는 OAuth 토큰 필요.
- **setup-token 방식 중단** — 2026-04-04부로 Anthropic이 서드파티의 구독 토큰 사용을 차단. OAuth 로그인만 지원.
- **Haiku 자동 호출** — Claude Code CLI 가 auto-mode safety classifier 로 sonnet/opus 호출 전에 haiku 를 한 번 돌림. 비용에 소량 포함되며 플래그로 끌 수 없음.
- **Project settings 자동 관리** — `/tmp/qgrid/.claude/settings.json` 은 qgrid 가 매 기동마다 덮어씀. 수동 편집해도 재시작 시 복원됨.
