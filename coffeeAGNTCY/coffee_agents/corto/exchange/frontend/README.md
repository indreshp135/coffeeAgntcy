# Corto Recruitment UI

Modern UI for the Corto multi-agent recruitment system: resume upload (with text extraction), job description in Markdown, and chat with the Exchange.

## Requirements

- **Node.js 18+** (Vite 5 and tooling require Node 18; Node 16 will fail at build)

## Setup

```bash
npm install
```

## Run (dev)

```bash
npm run dev
```

Runs at [http://localhost:3000](http://localhost:3000). API requests are proxied to `http://localhost:8000` (start the Exchange backend first).

## Build

```bash
npm run build
npm run preview   # serve production build
```

## Features

- **Resume upload**: Drag & drop or click to upload PDF or DOCX. Text is extracted via `/agent/extract-resume`; you can view it and click **Ingest this resume** to store it in Resume Mastermind.
- **Job description**: Markdown editor with Edit / Preview tabs. Use this text for “Best match” and “Prepare interview questions” in chat.
- **Chat**: Send prompts; quick actions use the JD from the editor (e.g. “Best match for this JD”, “Best candidates + interview questions”).
