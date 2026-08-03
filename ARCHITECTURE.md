# RAGLense Architecture

## Product shape

RAGLense is organized around one real workflow:

1. Authenticate with Clerk
2. Create a knowledge base
3. Upload documents to FastAPI
4. Let ingestion build chunks and embeddings
5. Ask grounded questions in chat
6. Inspect traces, analytics, and pipeline runs

## Frontend

- `frontend/src/app/page.tsx`: landing page
- `frontend/src/app/login` and `frontend/src/app/register`: Clerk auth screens
- `frontend/src/app/dashboard/knowledge`: knowledge-base management
- `frontend/src/app/dashboard/documents`: real upload and document status
- `frontend/src/app/dashboard/page.tsx`: grounded chat
- `frontend/src/app/dashboard/pipelines`: recent pipeline runs from backend
- `frontend/src/app/dashboard/analytics`: live workspace metrics
- `frontend/src/app/dashboard/agents`: real multi-agent runner
- Remaining dashboard pages: honest placeholders until backend persistence exists

## Backend

- `backend/app/api/v1/routers/auth.py`: current authenticated user
- `backend/app/api/v1/routers/knowledge_bases.py`: knowledge-base CRUD
- `backend/app/api/v1/routers/documents.py`: upload, list, delete, pipeline summaries
- `backend/app/api/v1/routers/chat.py`: conversation creation and SSE streaming
- `backend/app/api/v1/routers/analytics.py`: live aggregate metrics
- `backend/app/api/v1/routers/agents.py`: LangGraph workflow execution
- `backend/app/application/ingestion`: extraction, chunking, embedding, indexing
- `backend/app/application/retrieval/pipeline.py`: retrieval plus answer generation

## Auth flow

- Next.js uses Clerk for sign-in and email verification
- `frontend/src/components/auth/clerk-api-bridge.tsx` injects the current Clerk bearer token into the shared API client
- FastAPI verifies Clerk JWTs through `backend/app/core/clerk.py`
- Verified Clerk users are auto-provisioned into the local `users` table on first API access

## Request flow

### Upload

1. User uploads a file in the frontend
2. Next.js forwards `/api/v1/...` to `BACKEND_ORIGIN`
3. FastAPI stores the file and creates a `documents` row
4. A background ingestion job updates `pipeline_runs`, chunks, and vector storage

### Chat

1. User sends a message from the chat composer
2. Frontend posts to FastAPI with Clerk bearer token
3. Retrieval pipeline embeds the query and searches the selected knowledge base
4. LLM response is streamed back over SSE
5. Trace data is shown in the right-side inspector

## Clean product boundary

Some UI areas used to show hardcoded numbers or mock model outputs. Those are now placeholders until the backend owns real persistence, execution, and observability for them.
