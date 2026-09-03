# RAGLens Architecture

RAGLens is a multi-tenant, Clerk-authenticated retrieval-augmented generation (RAG) workspace. Users create or join knowledge bases, upload source documents, ask grounded questions, inspect retrieval traces, and run document-backed agent workflows.

The central design rule is **workspace-scoped grounding**: a request can retrieve only from the selected knowledge base, and every protected operation is checked against the authenticated user and that knowledge base's membership.

## System architecture

```mermaid
flowchart TB
    U[User / Browser]
    UI[Next.js 16 Frontend<br/>React 19 + TypeScript + Tailwind]
    CLERK[Clerk<br/>Sign-in, sign-up, email verification]
    PROXY[Next.js API proxy<br/>same-origin /api/v1]
    API[FastAPI API<br/>auth, KB, documents, chat, agents, analytics]
    AUTH[Auth + access control<br/>JWT verification + KB membership/RBAC]
    DB[(PostgreSQL<br/>users, KBs, members, documents,<br/>chunks, conversations, messages,<br/>pipeline runs, agent runs)]
    FILES[(File storage<br/>local storage or S3-compatible MinIO)]
    QUEUE[(Redis<br/>cache, broker, result backend)]
    WORKER[Celery worker<br/>background ingestion tasks]
    INGEST[Ingestion pipeline<br/>parse, OCR, chunk, embed, index]
    EMBED[Embedding provider<br/>OpenAI with local BGE fallback]
    VECTOR[(Qdrant<br/>KB-scoped vector collections)]
    RERANK[Reranker<br/>cross-encoder or cosine fallback]
    LLM[LLM provider chain<br/>OpenAI / Anthropic / Gemini via LiteLLM]
    WEB[DuckDuckGo / ddgs<br/>optional fact-check verification]
    OBS[Trace + analytics<br/>pipeline stages, citations, metrics]

    U --> UI
    UI -. auth .-> CLERK
    CLERK --> UI
    UI --> PROXY
    PROXY --> API
    API --> AUTH
    AUTH --> DB

    API -->|upload| FILES
    API -->|enqueue / schedule| QUEUE
    QUEUE --> WORKER
    WORKER --> INGEST
    INGEST --> FILES
    INGEST --> EMBED
    INGEST --> VECTOR
    INGEST --> DB

    API -->|chat / agent request| EMBED
    EMBED --> VECTOR
    VECTOR --> RERANK
    RERANK --> API
    API -->|enhanced mode only, matched claims| WEB
    API --> LLM
    LLM -->|SSE tokens + trace| API
    API --> UI
    API --> OBS
    OBS --> DB
```

## Runtime components

### Frontend

The `frontend/` application is a Next.js App Router application:

- `src/app/page.tsx`: public landing page and product entry point.
- `src/app/login` and `src/app/register`: Clerk authentication screens.
- `src/app/dashboard/layout.tsx`: authenticated dashboard shell, responsive navigation, and workspace context.
- `src/app/dashboard/knowledge`: knowledge-base creation, selection, and membership-aware workspace management.
- `src/app/dashboard/documents`: upload, status, document listing, deletion, and source image access.
- `src/app/dashboard/page.tsx`: grounded chat, answer-mode selection, citations, trace inspector, and inline document images.
- `src/app/dashboard/agents`: LangGraph-backed workflow runner and run history.
- `src/app/dashboard/playground`: prompt-template execution against an explicitly selected knowledge base.
- `src/app/dashboard/prompts`: reusable prompt templates with private/public workspace visibility.
- `src/app/dashboard/analytics` and `src/app/dashboard/pipelines`: backend-backed observability views.
- `src/components/common/brand-logo.tsx`: shared uploaded RAGLens logo and mark.
- `src/lib/api-client.ts`: authenticated API client and backend request helpers.

The frontend sends Clerk bearer tokens to FastAPI. In local development, Next.js rewrites or proxies API requests through `/api/v1`; `BACKEND_ORIGIN` controls the backend destination.

### Backend API

The `backend/app/` FastAPI application is divided into API, application, core, and infrastructure layers:

| Area | Responsibility |
| --- | --- |
| `api/v1/routers/auth.py` | Resolve the current user and local authentication endpoints. |
| `api/v1/routers/knowledge_bases.py` | Create, list, update, and delete knowledge bases. |
| `api/v1/routers/members.py` | Add, list, update, and remove knowledge-base members and roles. |
| `api/v1/routers/documents.py` | Upload, list, inspect, delete, and serve document-related resources. |
| `api/v1/routers/chat.py` | Create conversations, retrieve context, stream LLM output, and persist messages. |
| `api/v1/routers/agents.py` | Start and inspect owner-scoped LangGraph agent runs. |
| `api/v1/routers/playground.py` | Execute prompt templates against an authorized knowledge base. |
| `api/v1/routers/prompts.py` | CRUD for private and workspace-shared prompt templates. |
| `api/v1/routers/analytics.py` | Return workspace-scoped aggregate metrics. |
| `api/v1/routers/health.py` | Public service health check. |
| `application/ingestion/` | Document extraction, OCR, chunking, embeddings, and indexing. |
| `application/retrieval/pipeline.py` | Query embedding, vector retrieval, reranking, prompt construction, and image/source selection. |
| `application/agents/` | Agent graph orchestration and quiz generation/retrieval. |
| `core/clerk.py` and `api/v1/deps.py` | JWT verification, user provisioning, and access dependencies. |
| `infrastructure/db/` | Async SQLAlchemy engine, models, and persistence. |
| `infrastructure/vector_stores/` | Qdrant primary store and Chroma compatibility/fallback implementation. |
| `infrastructure/llm/` | Provider selection and LLM fallback chain. |

## Authentication and authorization

```mermaid
sequenceDiagram
    participant B as Browser
    participant C as Clerk
    participant F as Next.js
    participant A as FastAPI
    participant P as PostgreSQL

    B->>C: Sign in / verify email
    C-->>B: Session JWT
    B->>F: Request with bearer token
    F->>A: Forward Authorization header
    A->>C: Verify JWT signature using JWKS
    C-->>A: Verified Clerk subject
    A->>P: Find or provision local user
    A->>P: Check KB membership and role
    P-->>A: owner / editor / viewer decision
    A-->>F: Authorized response or 401/403
    F-->>B: Render protected result
```

Knowledge-base roles are intentionally scoped at the KB level:

- **Owner**: full control, including deleting the KB and managing members.
- **Editor**: can query and modify documents, but cannot delete the KB or manage members.
- **Viewer**: can browse and query, but cannot modify documents or settings.

Every protected route must resolve the authenticated user and validate access to the requested KB. Agent runs also store an owner and KB reference, so a user cannot read or continue another user's run by guessing a thread ID. Workspace-less retrieval uses an intentionally empty collection name rather than a global shared collection.

## Document upload and ingestion

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as FastAPI
    participant D as PostgreSQL
    participant S as File storage
    participant Q as Redis/Celery
    participant I as Ingestion pipeline
    participant E as Embedding provider
    participant V as Qdrant

    U->>F: Select document
    F->>A: Authenticated multipart upload
    A->>D: Create document + pending pipeline run
    A->>S: Store original file in KB-scoped path
    A->>Q: Schedule background processing
    A-->>F: Document ID + processing status
    Q->>I: Process document
    I->>S: Read original file
    I->>I: Parse text/layout, OCR scanned pages, extract tables/images
    I->>I: Chunk content and attach page/document metadata
    I->>E: Generate embeddings
    E-->>I: Vectors + embedding dimensions
    I->>V: Upsert into kb_{id}_dim{dimension}
    I->>D: Persist chunks, image metadata, counts, and stage progress
    I->>D: Mark document and pipeline run ready/failed
    F->>A: Poll document/pipeline status
    A-->>F: Current status and trace
```

Ingestion records the original file separately from derived data. Each chunk keeps document ID, page number, content type, embedding metadata, and optional image paths. PDF handling can use layout-aware parsing and OCR fallback for scanned pages. Extracted images are stored beneath the document's storage area and linked through chunk metadata; the retrieval pipeline ranks assets using relevant page/content terms so a logo is not returned merely because it appears in the PDF.

The vector collection is knowledge-base and dimension scoped. The dimension guard prevents mixing embeddings from incompatible models in the same collection and asks for re-indexing when a mismatch is detected.

## Chat and retrieval architecture

```mermaid
sequenceDiagram
    participant U as User
    participant F as Chat UI
    participant A as Chat API
    participant R as Retrieval pipeline
    participant V as Qdrant
    participant X as Reranker
    participant W as Web verification
    participant L as LLM
    participant D as PostgreSQL

    U->>F: Ask question + selected KB + answer mode
    F->>A: Authenticated request
    A->>D: Validate conversation owner and KB membership
    A->>R: Query, history, KB ID, mode
    R->>R: Rewrite temporal/query terms
    R->>R: Embed query using active model
    R->>V: Search only selected KB collection
    V-->>R: Candidate chunks with scores
    R->>X: Rerank candidates (when enabled)
    X-->>R: Ranked chunks
    R->>R: Apply relevance threshold
    alt Relevant chunks + Fact-check mode
        R->>W: Search rewritten user query
        W-->>R: Web snippets and URLs
    else Document-only mode or no relevant chunks
        R->>R: Skip web search
    end
    R-->>A: Grounded prompt + citations + trace
    A->>L: Stream answer with strict/enhanced system rules
    L-->>A: Token stream
    A-->>F: SSE status, trace, tokens, citations
    A->>D: Persist user/assistant messages and trace
    F-->>U: Answer, sources, trace, and relevant images
```

### Answer modes

The chat request supports two modes:

1. **Document only (`strict`)**
   - Uses only relevant chunks from the selected workspace.
   - Never calls web search.
   - Refuses to guess when no matching document evidence exists.

2. **Fact-check and correct (`enhanced`)**
   - First performs the same workspace retrieval and relevance filtering.
   - Calls `ddgs` only when relevant document evidence exists.
   - Gives the document claim priority, compares it with returned web evidence, and adds a fact-check alert only when the web evidence actually contradicts the claim.
   - Includes clickable web sources in the retrieval trace.
   - If web verification fails or is inconclusive, reports that the claim could not be verified rather than inventing a correction.

No-match requests are deliberately short-circuited: they do not trigger web search and do not receive a general-knowledge answer. This prevents an unrelated web result from being presented as a correction to a document that was never retrieved.

### Streaming response

Chat uses Server-Sent Events (SSE) from `api/v1/routers/chat.py`:

1. A status event tells the UI whether it is searching documents or verifying claims.
2. A trace event contains retrieved/reranked chunks, citations, stages, answer mode, and optional web sources.
3. Token events stream the LLM response progressively.
4. A completion event persists latency/token metadata and closes the stream.

The trace inspector is backed by persisted `pipeline_trace`, `citations`, and `retrieved_chunks` fields on messages, which makes the answer explainable after the original request completes.

## Images and multimodal source handling

Image requests are detected from the current question and recent user turns. When relevant chunks are found, the pipeline:

1. Resolves the source document and retrieved pages.
2. Lists extracted document assets from the document-scoped image directory.
3. Ranks assets using the question, previous user context, page numbers, and page text.
4. Sends safe image metadata with the citations.
5. Lets the authenticated frontend fetch and render the actual image below the answer.

The LLM is instructed not to claim that it cannot provide an image when a source asset is available. The UI displays the original extracted image/diagram rather than a generated replacement or a text-only description.

## Agents, quiz, and playground

- **Agents** use LangGraph-style orchestration with explicit KB and run ownership. Retrieval nodes use the selected KB collection and never fall back to another workspace's vectors.
- **Quiz mode** retrieves KB content, generates multiple-choice questions, keeps options visible for selection, and reveals the answer only after submission.
- **Prompt playground** executes saved templates with extracted `{{variables}}`, requiring an authorized KB when the template is KB-scoped.
- **Prompt sharing** is read-only for other members when `is_public` is enabled; ownership controls update/delete operations.

## Persistence model

The main PostgreSQL entities are:

| Entity | Purpose |
| --- | --- |
| `users` | Local projection of authenticated users. |
| `knowledge_bases` | Workspace metadata, settings, counts, and embedding dimensions. |
| `knowledge_base_members` | User-to-workspace membership and owner/editor/viewer role. |
| `documents` | Original file metadata, processing state, and extracted statistics. |
| `chunks` | Text/table/code/audio chunks with page, position, and embedding metadata. |
| `pipeline_runs` | Ingestion stage status, progress, duration, and errors. |
| `conversations` | User-owned chat sessions associated with a KB. |
| `messages` | User/assistant content, citations, traces, token usage, and feedback. |
| `prompt_templates` | Reusable private or workspace-shared prompts. |
| `agent_runs` | Owner- and KB-scoped workflow thread ownership. |

Qdrant stores the searchable vector representation; PostgreSQL remains the source of truth for ownership, metadata, document state, and explainability records.

## Deployment topology

The supplied `docker-compose.yml` defines the local service topology:

```mermaid
flowchart LR
    Browser[Browser]
    Frontend[frontend :3000<br/>Next.js]
    Backend[backend :8000<br/>FastAPI]
    Worker[worker<br/>Celery]
    Postgres[(postgres :5432)]
    Redis[(redis :6379)]
    MinIO[(minio :9000 / :9001)]
    Qdrant[(qdrant :6333 / :6334)]
    Providers[Clerk + LLM + ddgs]

    Browser --> Frontend
    Frontend --> Backend
    Backend --> Postgres
    Backend --> Redis
    Backend --> MinIO
    Backend --> Qdrant
    Backend --> Providers
    Redis --> Worker
    Worker --> Postgres
    Worker --> MinIO
    Worker --> Qdrant
    Worker --> Providers
```

For a lightweight local run, FastAPI can execute ingestion through its background task path, while the Docker topology provides Redis/Celery for worker-based processing. The configured vector provider is Qdrant; Chroma remains available as a compatibility/fallback implementation and for migration tooling.

## Security boundaries

- Clerk JWTs are verified through Clerk JWKS in non-development environments.
- Protected API routes require an authenticated user; health is the intentional public exception.
- Knowledge-base, conversation, document, prompt, playground, analytics, and agent operations are scope-checked.
- Vector collection names include the knowledge-base ID and embedding dimension.
- File serving validates ownership/membership and uses document-scoped paths.
- Storage path resolution prevents traversal outside the configured storage root.
- Agent run IDs are not treated as authorization; ownership and KB membership are checked from the database.
- Production/staging configuration rejects insecure default secrets.
- API keys remain server-side in environment configuration and are never sent to the browser.

## Observability and failure handling

Each ingestion and retrieval request records stages, durations, counts, errors, and source metadata. The backend logs request IDs and pipeline failures, while the UI exposes trace data through the answer inspector and pipeline/analytics views.

The system degrades explicitly:

- If a vector search fails, the answer is not silently sourced from another workspace.
- If embeddings use a different dimension from the indexed KB, retrieval asks for re-indexing.
- If the reranker is unavailable, cosine-score ordering can be used when configured.
- If web verification is unavailable, enhanced mode reports unavailable/inconclusive verification.
- If no relevant document evidence exists, the assistant asks for the correct workspace or upload instead of guessing.
