/**
 * RAGLense — TypeScript Type Definitions
 * Core domain types shared across the application.
 */

// ──────────────────────────────────────────────
// Auth & User
// ──────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  role: string;
  organization?: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthResponse {
  user: User;
  tokens: TokenPair;
}

// ──────────────────────────────────────────────
// Knowledge Base
// ──────────────────────────────────────────────

export interface KBSettings {
  chunking_strategy: string;
  chunk_size: number;
  chunk_overlap: number;
  embedding_model: string;
  embedding_provider: string;
  vector_db: string;
  llm_model: string;
  llm_provider: string;
  search_type: string;
  top_k: number;
  temperature: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string | null;
  icon: string;
  color: string;
  settings: KBSettings;
  document_count: number;
  chunk_count: number;
  total_tokens: number;
  storage_bytes: number;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────
// Documents
// ──────────────────────────────────────────────

export type DocumentStatus = "uploaded" | "processing" | "ready" | "error";

export interface Document {
  id: string;
  knowledge_base_id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  status: DocumentStatus;
  error_message?: string | null;
  page_count?: number | null;
  language?: string | null;
  title?: string | null;
  author?: string | null;
  summary?: string | null;
  chunk_count: number;
  token_count: number;
  image_count: number;
  table_count: number;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────
// Chunks
// ──────────────────────────────────────────────

export interface Chunk {
  id: string;
  document_id: string;
  content: string;
  content_hash: string;
  chunk_index: number;
  page_number?: number | null;
  section_title?: string | null;
  embedding_model?: string | null;
  embedding_dimension?: number | null;
  token_count: number;
  char_count: number;
  metadata_json: Record<string, unknown>;
  keywords: string[];
  entities: string[];
  summary?: string | null;
  created_at: string;
}

// ──────────────────────────────────────────────
// Pipeline
// ──────────────────────────────────────────────

export type PipelineStageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface PipelineStage {
  name: string;
  label: string;
  status: PipelineStageStatus;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  progress: number;
  logs: string[];
  error?: string | null;
  metrics: Record<string, unknown>;
}

export interface PipelineRun {
  id: string;
  document_id: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  current_stage?: string | null;
  progress: number;
  stages: Record<string, PipelineStage>;
  total_chunks: number;
  total_embeddings: number;
  total_tokens: number;
  error_message?: string | null;
  created_at: string;
}

// ──────────────────────────────────────────────
// Chat & Conversations
// ──────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  knowledge_base_id?: string | null;
  model: string;
  message_count: number;
  total_tokens: number;
  total_cost: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  page_number?: number;
  score: number;
}

export interface RetrievalTrace {
  query_original: string;
  query_rewritten?: string;
  intent?: string;
  search_type: string;
  retrieved_chunks: Array<{
    chunk_id: string;
    content: string;
    score: number;
    document_name: string;
    page_number?: number;
  }>;
  reranked_chunks?: Array<{
    chunk_id: string;
    score: number;
  }>;
  context_compressed?: string;
  prompt_tokens: number;
  total_latency_ms: number;
  stages: Record<string, {
    name: string;
    duration_ms: number;
    details: Record<string, unknown>;
  }>;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  cost: number;
  latency_ms?: number | null;
  pipeline_trace: RetrievalTrace;
  citations: Citation[];
  retrieved_chunks: Chunk[];
  rating?: number | null;
  created_at: string;
}

// ──────────────────────────────────────────────
// Analytics
// ──────────────────────────────────────────────

export interface AnalyticsOverview {
  total_knowledge_bases: number;
  total_documents: number;
  total_chunks: number;
  total_vectors: number;
  total_conversations: number;
  total_messages: number;
  storage_used_bytes: number;
  total_tokens_used: number;
  total_cost: number;
  avg_query_latency_ms: number;
  success_rate: number;
  queries_today: number;
  queries_this_week: number;
}

// ──────────────────────────────────────────────
// Pagination
// ──────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ──────────────────────────────────────────────
// Navigation
// ──────────────────────────────────────────────

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  disabled?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}
