"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Beaker, Zap, Clock, Hash, DollarSign, Send, ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const MODELS = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", color: "#14b8a6" },
  { id: "claude-3.5", name: "Claude 3.5 Sonnet", provider: "Anthropic", color: "#8b5cf6" },
  { id: "gemini-pro", name: "Gemini Pro", provider: "Google", color: "#2dd4bf" },
  { id: "deepseek-v2", name: "DeepSeek V2", provider: "DeepSeek", color: "#f472b6" },
];

interface ModelResult {
  model: string;
  provider: string;
  color: string;
  content: string;
  latency_ms: number;
  tokens: number;
  cost: number;
}

const DEMO_RESULTS: ModelResult[] = [
  {
    model: "GPT-4o",
    provider: "OpenAI",
    color: "#14b8a6",
    content: "**Retrieval-Augmented Generation (RAG)** combines the power of large language models with external knowledge retrieval. The key components are:\n\n1. **Document Ingestion** — Parse, chunk, and embed documents\n2. **Vector Storage** — Store embeddings in a vector database\n3. **Retrieval** — Find relevant chunks using similarity search\n4. **Augmentation** — Inject retrieved context into the LLM prompt\n5. **Generation** — LLM generates answers grounded in the context",
    latency_ms: 1243,
    tokens: 187,
    cost: 0.0028,
  },
  {
    model: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    color: "#8b5cf6",
    content: "RAG (Retrieval-Augmented Generation) is an architectural pattern that enhances LLM outputs by providing relevant external context. Here's the breakdown:\n\n- **Indexing Phase**: Documents → Chunking → Embedding → Vector DB\n- **Query Phase**: User Query → Retrieval → Reranking → Prompt Construction → LLM → Response\n\nKey advantages include reduced hallucination, real-time knowledge, and source attribution.",
    latency_ms: 987,
    tokens: 156,
    cost: 0.0023,
  },
  {
    model: "Gemini Pro",
    provider: "Google",
    color: "#2dd4bf",
    content: "RAG stands for Retrieval-Augmented Generation. It's a technique that gives LLMs access to external knowledge bases.\n\n**How it works:**\n1. Documents are split into chunks and converted to vector embeddings\n2. When a user asks a question, the system finds the most relevant chunks\n3. Those chunks are added to the prompt as context\n4. The LLM generates a response based on both its training and the retrieved context",
    latency_ms: 1567,
    tokens: 198,
    cost: 0.0019,
  },
];

export default function PlaygroundPage() {
  const [prompt, setPrompt] = useState("Explain RAG (Retrieval-Augmented Generation) architecture");
  const [results, setResults] = useState<ModelResult[]>(DEMO_RESULTS);
  const [selectedModels, setSelectedModels] = useState(["gpt-4o", "claude-3.5", "gemini-pro"]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Model Arena</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Compare LLM outputs side-by-side with latency, cost, and quality metrics
          </p>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] mb-2.5 block">
              Sandbox Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              className="w-full bg-[var(--color-surface-200)]/70 border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)] outline-none resize-none input-glow transition-all"
            />
          </div>
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3.5 rounded-xl btn-primary btn-shimmer text-sm font-semibold flex items-center gap-2 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
            Compare Models
          </motion.button>
        </div>

        {/* Model Selector */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-text-muted)] font-medium">Active Arena:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {MODELS.map((model) => {
              const active = selectedModels.includes(model.id);
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModels((prev) =>
                      prev.includes(model.id)
                        ? prev.filter((m) => m !== model.id)
                        : [...prev, model.id]
                    );
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 border",
                    active
                      ? "text-white border-transparent"
                      : "text-[var(--color-text-muted)] bg-[var(--color-surface-200)] border-[var(--color-border)] hover:bg-[var(--color-surface-300)]"
                  )}
                  style={active ? { backgroundColor: model.color, boxShadow: `0 0 10px ${model.color}40` } : {}}
                >
                  {model.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <AnimatePresence>
          {results.map((result, i) => (
            <motion.div
              key={result.model}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: i * 0.08, duration: 0.45, ease: [0.19, 1, 0.22, 1] }}
              className="glass-card rounded-xl overflow-hidden flex flex-col hover:border-[var(--color-brand-500)]/20 transition-all group"
            >
              {/* Model Header */}
              <div className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface-100)]/50">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: result.color, boxShadow: `0 0 8px ${result.color}` }}
                  />
                  <span className="text-sm font-semibold font-display">{result.model}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono font-medium">
                    {result.provider}
                  </span>
                </div>
                <button className="p-1.5 rounded-lg hover:bg-[var(--color-surface-300)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 text-sm leading-relaxed text-[var(--color-text-secondary)] flex-1 select-all selection:bg-[var(--color-brand-500)]/20 max-h-80 overflow-y-auto whitespace-pre-wrap font-sans">
                {result.content}
              </div>

              {/* Metrics */}
              <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface-50)]/50">
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3.5 h-3.5 text-[var(--color-brand-400)]" />
                  {result.latency_ms}ms
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <Hash className="w-3.5 h-3.5 text-[var(--color-accent-400)]" />
                  {result.tokens} tokens
                </span>
                <span className="flex items-center gap-0.5 font-mono font-bold text-emerald-400">
                  ${result.cost.toFixed(4)}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
