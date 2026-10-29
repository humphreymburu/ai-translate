# Nova Translate · Workbench

A small Next.js tool for eyeballing English → multilingual translations from
**Amazon Nova** on Bedrock **or Qwen** on Alibaba DashScope. Type English on the
left, watch the translations stream in on the right. Supports `es`, `ru`,
`zh-hans`, `sw`, `pt-br`, `ar` (right-to-left), and `fr`.

```
┌───────────── from: English ─────────────┐    ┌──────────── to: Español ────────────┐
│  type or paste English text…            │ ⇄  │  …translation streams in here        │
└──────────────────────────────────────────┘    └──────────────────────────────────────┘
```

## How it works

The browser **never** sees provider credentials. Next.js route handlers call the
selected provider server-side (Bedrock **Converse**, or DashScope's
OpenAI-compatible **chat/completions**) and stream the result back to the page.
Providers are wired in `lib/providers.js`; the model registry in
`lib/models.js` says which provider serves each model.

## Prerequisites

1. **Node.js 18+**
2. Access to **at least one** provider:
   - **Bedrock** — an AWS account with model access to Amazon Nova in your
     region (Bedrock console → *Model access*), plus credentials (access keys,
     an `aws configure` profile, an IAM role, or a Bedrock API key).
   - **Qwen** — an Alibaba Model Studio / DashScope API key
     (`QWEN_API_KEY`), no AWS account required.

## Setup

```bash
npm install
# create .env with region / credentials
npm run dev
```

Open the URL Next.js prints (default http://localhost:3000).

## Configuration

All config lives in `.env`:

| Variable                      | Purpose                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `DEFAULT_MODEL_ID`            | Model the workbench opens with (default: `qwen-plus`)        |
| `NOVA_MODEL_ID`               | Legacy name for the default model; still honoured            |
| `AWS_REGION`                  | Bedrock region, e.g. `eu-west-1`                             |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | optional explicit keys                       |
| `AWS_PROFILE`                 | optional named profile instead of keys                       |
| `AWS_BEARER_TOKEN_BEDROCK`    | optional Bedrock API key (expires ~12h)                      |
| `QWEN_API_KEY`                | Alibaba DashScope / Model Studio key                         |
| `QWEN_BASE_URL`               | DashScope endpoint; defaults to the international one        |
| `JUDGE_MODEL_ID`              | Optional judge model for evals (Bedrock, Qwen, or OpenRouter) |
| `OPENROUTER_API_KEY`          | Required only when the judge is an OpenRouter slug            |

> **Model id note:** Nova models are invoked through a cross-region inference
> profile. With `AWS_REGION=eu-west-1` and
> `NOVA_MODEL_ID=amazon.nova-pro-v1:0`, the app invokes
> `eu.amazon.nova-pro-v1:0`. A wrong prefix surfaces as a
> `ValidationException`; missing model access surfaces as `AccessDeniedException`.
> Qwen ids are sent as-is. Nova Lite is no longer in the registry; an unknown or
> retired id in `DEFAULT_MODEL_ID`/`NOVA_MODEL_ID` falls back to `qwen-plus`.

> **Qwen key scoping:** DashScope keys are region-scoped. An international key
> only works against `https://dashscope-intl.aliyuncs.com` (Singapore); a China
> key only against `https://dashscope.aliyuncs.com`. A mismatch shows up as
> `401 invalid_api_key` — point `QWEN_BASE_URL` at the right endpoint.

`GET /api/health` reports the active provider/model and which provider
credentials the server can see, which is the quickest way to tell that a key has
lapsed.

> **Judge bias:** the eval page flags it when `JUDGE_MODEL_ID` belongs to the same
> family as a selected candidate (e.g. Qwen scoring Qwen) — those scores inflate.
> Prefer a different family (Claude, or Gemma via OpenRouter) for a fair ranking.

## Adding a model

Add an entry to `MODELS` in `lib/models.js` with its `provider` (`bedrock` or
`qwen`) and the flags that provider needs (`cris: false` for a bare Bedrock id,
`modelId` when the wire id differs from the registry key). The UI picks it up
from `/api/models` automatically.

## Adding a language

Add one entry to `LANGUAGE_NAMES` in `lib/prompt.js` and update the UI language
options in `app/page.jsx`.

## Scripts

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `npm run dev`    | Next.js dev server                        |
| `npm run build`  | Production build                          |
| `npm run start`  | Production server                         |
