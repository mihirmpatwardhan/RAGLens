# RAGLense

RAGLense is a Clerk-authenticated RAG workspace with a real FastAPI backend, document ingestion, grounded chat, pipeline visibility, and live workspace analytics.

## What is live

- Clerk sign-in, sign-up, and email verification
- Knowledge base creation and deletion
- Real document upload to FastAPI with progress
- Background ingestion and recent pipeline run tracking
- Grounded chat with retrieval trace inspection
- Workspace analytics backed by database totals
- LangGraph multi-agent runner against the backend

## What is intentionally not faked

- Model comparison, prompt editing, evaluation, experiments, and global settings no longer show demo numbers or mock outputs
- Those pages stay as honest placeholders until the backend persists real data for them

## Stack

- `frontend/`: Next.js 16, React 19, TypeScript, Tailwind, Clerk
- `backend/`: FastAPI, SQLAlchemy async, Celery
- Storage: PostgreSQL, Redis, local/S3-compatible file storage, ChromaDB

## Quick start

1. Copy `.env.example` to `.env`
2. Fill in Clerk keys and at least one provider key such as `OPENAI_API_KEY`
3. Start backend dependencies and the app

### Local backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

### Local frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## Environment notes

- The root `.env` is loaded for both local backend and frontend commands.
- `BACKEND_ORIGIN` controls Next.js server-side rewrites to FastAPI
- Leave `NEXT_PUBLIC_API_URL` empty to use same-origin `/api/v1` proxying from Next.js
- `CLERK_JWKS_URL` is required for secure Clerk token verification outside local development
- Docker Compose passes the root `.env` to the backend and worker; it also supplies the public Clerk key while building the frontend.

## Validation

```bash
cd frontend
npm run type-check
npm run build
```

```bash
python -m compileall backend/app
```

## Architecture

See `ARCHITECTURE.md` for the cleaned product and runtime layout.
