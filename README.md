# RAGLense — Enterprise Multimodal RAG Platform

RAGLense is a world-class, production-ready, enterprise-grade, multimodal RAG (Retrieval-Augmented Generation) platform. Unlike standard RAG implementations, RAGLense provides complete transparency into the RAG lifecycle through an interactive, visual pipeline inspector and playground.

Every step of ingestion, search, reranking, and generation is explainable, clickable, and observable.

---

## 🚀 Key Features

- **Visual Ingestion Pipeline**: Live animated React Flow pipeline tracking validation, OCR, layout detection, metadata extraction, chunking, and embedding.
- **Advanced Chunking Playground**: Side-by-side comparison of Recursive, Semantic, Sentence, Header-based, and Sliding Window strategies with costs and metrics.
- **RAG Observability & Trace**: Interactive retrieval trace highlighting original/rewritten queries, intent, hybrid fusion scores, rerank ranks, and context window compression.
- **Model Arena**: Compare outputs from GPT, Claude, Gemini, DeepSeek, and local Ollama models side-by-side.
- **Multi-Agent Orchestration**: Collaborative agents (Coordinator, Retriever, Critic, Code, Web, SQL) exposing reasoning logs and token counts.
- **Vector Space Visualizer**: 3D and 2D projections (UMAP/t-SNE/PCA) of chunk embeddings.
- **RAG Evaluation**: Integrated RAGAS/DeepEval suites tracking faithfulness, answer relevancy, and context recall.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS, Framer Motion, Zustand, React Flow, Recharts, Monaco Editor.
- **Backend**: FastAPI (Python 3.12+), SQLAlchemy (async), Celery, Alembic.
- **Storage & Ingestion**: PostgreSQL, Redis, MinIO (S3-compatible), ChromaDB (Vector Store), FAISS.
- **AI/LLM Integrations**: LangChain, LangGraph, OpenAI, Anthropic, Google Gemini, Ollama.

---

## 📂 Project Structure

```text
RAGLense-studio/
├── frontend/             # Next.js 15 App Router Application
│   ├── src/
│   │   ├── app/          # Navigation and Routing pages
│   │   ├── components/   # UI components (shadcn/ui + custom panels)
│   │   ├── features/     # Domain-specific features (chat, playground)
│   │   ├── stores/       # Zustand state management
│   │   └── lib/          # Utilities, Axios API Client
├── backend/              # FastAPI Python Web Framework
│   ├── app/
│   │   ├── api/          # Routers and Schemas
│   │   ├── domain/       # Core Business Logic and Repositories
│   │   ├── application/  # Use cases (ingestion, retrieval, agents)
│   │   └── infrastructure/# DB models, Vector DB, LLM Router, Workers
├── docker/               # Dockerfiles and Nginx Configs
├── docker-compose.yml    # Main composition for dev & dependencies
└── README.md             # Project documentation
```

---

## ⚡ Quick Start

### 1. Configure Environment
Clone `.env.example` to `.env` in the root:
```bash
cp .env.example .env
```
Fill in your API keys (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

### 2. Start Services (via Docker Compose)
To start PostgreSQL, Redis, MinIO, the FastAPI backend, Celery worker, and the Next.js frontend:
```bash
docker-compose up --build
```
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **FastAPI API & Interactive Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Local Development (Alternative)

**Backend**:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Testing

```bash
# Run backend tests
cd backend
pytest

# Run frontend type-check & lint
cd frontend
npm run type-check
npm run lint
```
