# ByCC (By Claude Code)

Claude 구독 크레딧(Max/Team)을 HTTP API로 사용할 수 있게 해주는 서비스.

Anthropic API 키(토큰 과금) 대신 **구독 정액제 크레딧**으로 LLM을 호출합니다.

---

## 사용 예시

`packages/api/src/sdk/bycc.ts`를 프로젝트에 복사해서 사용합니다. (의존성: `zod`)

```typescript
import { generateByCC } from "./bycc";

// 텍스트 응답
const { text } = await generateByCC({
  prompt: "Hello",
  system: "Reply briefly.",
});

// 구조화 응답 (Zod 스키마 → JSON Schema 자동 포함 + 파싱/검증)
const { json } = await generateByCC({
  prompt: "질문 5개 생성해줘",
  system: "질문 생성 전문가입니다.",
  returnType: z.object({ questions: z.array(z.string()) }),
});
json.questions // string[]
```

---

## 시작하기

### 1. 클론 + 설치

```bash
git clone git@github.com:CartaNova-AI/ByCC.git
cd ByCC
pnpm install
```

### 2. 토큰 발급

각 팀원이 자기 Claude Max/Team 계정에서 long-lived 토큰 발급:

```bash
claude setup-token
```

### 3. DB 준비

ByCC는 데이터베이스를 사용하지 않지만, Sonamu 프레임워크가 시작 시 DB 연결을 필수로 요구합니다.
팀 공용 또는 로컬 PostgreSQL에 빈 DB를 만들어주세요:

```bash
createdb -h localhost -p 5444 -U postgres bycc
```

### 4. 서버 시작

```bash
# Docker (권장)
docker compose up -d --build

# 개발 모드 (Docker 없이)
pnpm -C packages/api sonamu dev
```

### 5. 토큰 등록

브라우저에서 `http://localhost:44900` 접속 → Tokens 페이지에서 추가.

또는 API로:

```bash
curl -X POST http://localhost:44900/api/bycc/addToken \
  -H 'Content-Type: application/json' \
  -d '{"token": "sk-ant-oat01-..."}'
```

---

## 어떻게 동작하는가

```
팀원 프로젝트 (Node.js / Python / 뭐든)
  → POST http://bycc:44900/api/bycc/query
  ← { text, usage, durationMs, costUsd }

ByCC 서버 (Docker 컨테이너)
  └── ClaudePool (멀티 토큰 프로세스 풀)
        ├── Worker A-0 (token=계정A) → claude CLI 프로세스
        ├── Worker A-1 (token=계정A) → claude CLI 프로세스
        ├── Worker B-0 (token=계정B) → claude CLI 프로세스
        └── Worker B-1 (token=계정B) → claude CLI 프로세스
```

- N개 계정 토큰을 등록하면 쿼터를 풀링
- 가장 여유있는 워커에 요청을 배정 (least-queue-depth)
- 한 토큰이 쿼터 소진되면 자동으로 다른 토큰으로 failover (호출자는 모름)
- 프로세스당 500콜 후 자동 재시작 (1M 컨텍스트 한계 방지)

---

## 배포

앱의 docker-compose에 bycc 서비스를 추가:

```yaml
services:
  api:
    environment:
      BYCC_URL: http://bycc:44900

  bycc:
    build: ./ByCC
    volumes:
      - ~/.bycc:/root/.bycc:ro
    environment:
      DB_HOST: your-postgres-host
      DB_PASSWORD: your-password
      DB_NAME: bycc
```

---

## 주의사항

- **쿼터 리셋**: Claude Max 5시간 rolling window. 소진된 토큰은 웹 UI에서 수동 재활성화
- **PostgreSQL 필수**: ByCC는 DB를 사용하지 않지만 Sonamu가 시작 시 연결을 요구합니다. 빈 DB만 있으면 됩니다.
- **macOS Docker**: `DB_HOST`가 기본 `host.docker.internal` (호스트 머신의 localhost를 가리킴). Linux에서는 `network_mode: host` 사용
