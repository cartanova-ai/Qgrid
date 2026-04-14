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
3. 서버 시작 (API + 대시보드 웹 UI)
4. 토큰별 Worker Pool 생성 (`claude -p` 프로세스)

Docker 불필요. Node.js + Claude CLI + PostgreSQL만 있으면 됨.
