"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Brain,
  Zap,
  Database,
  Scissors,
  Search,
  Eye,
  Globe,
  Key,
  Shield,
  ChevronRight,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "llm", label: "LLM Provider", icon: Brain, description: "Configure language model" },
  { id: "embedding", label: "Embedding Model", icon: Zap, description: "Choose embedding engine" },
  { id: "vectordb", label: "Vector Database", icon: Database, description: "Select vector store" },
  { id: "chunking", label: "Chunking Strategy", icon: Scissors, description: "Document chunking" },
  { id: "retrieval", label: "Retrieval Settings", icon: Search, description: "Search configuration" },
  { id: "ocr", label: "OCR Engine", icon: Eye, description: "Image text extraction" },
  { id: "language", label: "Language", icon: Globe, description: "Default language" },
  { id: "api-keys", label: "API Keys", icon: Key, description: "Provider credentials" },
  { id: "security", label: "Security", icon: Shield, description: "Auth & permissions" },
];

const LLM_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", color: "#10a37f" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", color: "#10a37f" },
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", color: "#d97706" },
  { id: "claude-3-opus", name: "Claude 3 Opus", provider: "Anthropic", color: "#d97706" },
  { id: "gemini-pro", name: "Gemini 1.5 Pro", provider: "Google", color: "#4285f4" },
  { id: "deepseek-v2", name: "DeepSeek V2", provider: "DeepSeek", color: "#6366f1" },
  { id: "llama-3.1-70b", name: "Llama 3.1 70B", provider: "Ollama (Local)", color: "#a78bfa" },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("llm");
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState(0.1);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [topK, setTopK] = useState(5);

  return (
    <div className="h-full flex animate-fade-in">
      {/* Settings Nav */}
      <div className="w-64 border-r border-[var(--color-border)] bg-[var(--color-surface-50)] p-4 space-y-1 overflow-y-auto flex-shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] px-3 mb-3">
          Configuration
        </h3>
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
              activeSection === section.id
                ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-200)]"
            )}
          >
            <section.icon className="w-4 h-4 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{section.label}</p>
              <p className="text-[10px] text-[var(--color-text-muted)] truncate">{section.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeSection === "llm" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-2xl"
          >
            <div>
              <h3 className="text-lg font-bold mb-1">Language Model</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Select the default LLM for chat and processing tasks
              </p>
            </div>

            {/* Model Cards */}
            <div className="space-y-2">
              {LLM_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left",
                    selectedModel === model.id
                      ? "glass-card border-[var(--color-brand-500)]/50"
                      : "bg-[var(--color-surface-100)] hover:bg-[var(--color-surface-200)] border border-transparent"
                  )}
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: model.color }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{model.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{model.provider}</p>
                  </div>
                  {selectedModel === model.id && (
                    <Check className="w-4 h-4 text-[var(--color-brand-400)]" />
                  )}
                </button>
              ))}
            </div>

            {/* Sliders */}
            <div className="space-y-5 pt-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <label className="font-medium">Temperature</label>
                  <span className="font-mono text-[var(--color-brand-400)]">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-[var(--color-brand-500)]"
                />
                <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] mt-1">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <label className="font-medium">Max Tokens</label>
                  <span className="font-mono text-[var(--color-brand-400)]">{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="256"
                  max="16384"
                  step="256"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full accent-[var(--color-brand-500)]"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <label className="font-medium">Top K (Retrieval)</label>
                  <span className="font-mono text-[var(--color-brand-400)]">{topK}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value))}
                  className="w-full accent-[var(--color-brand-500)]"
                />
              </div>
            </div>

            {/* Save */}
            <button className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[var(--color-brand-600)] to-[var(--color-brand-500)] text-white text-sm font-medium glow-brand">
              Save Changes
            </button>
          </motion.div>
        )}

        {activeSection !== "llm" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center h-64"
          >
            <div className="text-center">
              <Settings className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-3" />
              <p className="text-sm text-[var(--color-text-secondary)]">
                {SECTIONS.find((s) => s.id === activeSection)?.label} settings
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Configure your {SECTIONS.find((s) => s.id === activeSection)?.description.toLowerCase()}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
