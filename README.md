# Nova Translate · Workbench

A small Vite + React tool for eyeballing English → multilingual translations
from **Amazon Nova 2 Lite** on Bedrock. Type English on the left, watch the
translation stream in on the right. Supports `es`, `ru`, `zh-hans`, `sw`,
`pt-br`, `ar` (right-to-left), and `fr`.

```
┌───────────── from: English ─────────────┐    ┌──────────── to: Español ────────────┐
│  type or paste English text…            │ ⇄  │  …translation streams in here        │
└──────────────────────────────────────────┘    └──────────────────────────────────────┘
```

## How it works

The browser **never** sees your AWS credentials. A tiny Express server
(`server.js`) holds them and calls the Bedrock **Converse** API, streaming the
result back to the page. Vite proxies `/api` → the Express server in dev.

## Prerequisites

1. **Node.js 18+**
2. An **AWS account with Bedrock access to Nova 2 Lite**. In the Bedrock
   console → *Model access*, request access to *Amazon Nova 2 Lite* in your
   region (e.g. `us-east-1`).
3. AWS credentials available locally (access keys, an `aws configure` profile,
   or an IAM role).

## Setup

```bash
npm install
cp .env.example .env      # then fill in region / credentials
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).
`npm run dev` starts both the Vite frontend and the Express API together.

## Configuration

All config lives in `.env` (see `.env.example`):

| Variable         | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `AWS_REGION`     | Bedrock region, e.g. `us-east-1`                     |
| `NOVA_MODEL_ID`  | CRIS model id — `us.`, `eu.`, or `global.` prefix    |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | optional explicit keys  |
| `AWS_PROFILE`    | optional named profile instead of keys               |
| `PORT`           | Express port (default `3001`)                        |

> **Model id note:** Nova 2 Lite is only reachable through a cross-region
> inference profile. Use `us.amazon.nova-2-lite-v1:0` in US regions,
> `eu.amazon.nova-2-lite-v1:0` in EU, or `global.amazon.nova-2-lite-v1:0`.
> A wrong prefix surfaces as a `ValidationException`.

## Adding a language

Add one entry to `src/languages.js` (set `rtl: true` for right-to-left
scripts) and the matching display name to `LANGUAGE_NAMES` in `server.js`.

## Scripts

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `npm run dev`    | Vite + Express together (recommended)     |
| `npm run client` | Vite frontend only                        |
| `npm run server` | Express API only                          |
| `npm run build`  | Production build of the frontend          |
