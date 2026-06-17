# Nova Translate · Workbench

A small Next.js tool for eyeballing English → multilingual translations
from **Amazon Nova Lite** on Bedrock. Type English on the left, watch the
translation stream in on the right. Supports `es`, `ru`, `zh-hans`, `sw`,
`pt-br`, `ar` (right-to-left), and `fr`.

```
┌───────────── from: English ─────────────┐    ┌──────────── to: Español ────────────┐
│  type or paste English text…            │ ⇄  │  …translation streams in here        │
└──────────────────────────────────────────┘    └──────────────────────────────────────┘
```

## How it works

The browser **never** sees your AWS credentials. Next.js route handlers call the
Bedrock **Converse** API server-side, streaming the result back to the page.

## Prerequisites

1. **Node.js 18+**
2. An **AWS account with Bedrock access to Amazon Nova Lite**. In the Bedrock
   console → *Model access*, request access to *Amazon Nova Lite* in your
   region (for this project, `eu-west-1`).
3. AWS credentials available locally (access keys, an `aws configure` profile,
   or an IAM role).

## Setup

```bash
npm install
# create .env with region / credentials
npm run dev
```

Open the URL Next.js prints (default http://localhost:3000).

## Configuration

All config lives in `.env`:

| Variable         | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `AWS_REGION`     | Bedrock region, e.g. `eu-west-1`                     |
| `NOVA_MODEL_ID`  | Model base id or CRIS model id                       |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | optional explicit keys  |
| `AWS_PROFILE`    | optional named profile instead of keys               |
| `JUDGE_MODEL_ID` | Optional judge model for evals                       |

> **Model id note:** Nova Lite is invoked through a cross-region inference
> profile. With `AWS_REGION=eu-west-1` and
> `NOVA_MODEL_ID=amazon.nova-lite-v1:0`, the app invokes
> `eu.amazon.nova-lite-v1:0`. A wrong prefix surfaces as a
> `ValidationException`; missing model access surfaces as `AccessDeniedException`.

## Adding a language

Add one entry to `LANGUAGE_NAMES` in `lib/prompt.js` and update the UI language
options in `app/page.jsx`.

## Scripts

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `npm run dev`    | Next.js dev server                        |
| `npm run build`  | Production build                          |
| `npm run start`  | Production server                         |
