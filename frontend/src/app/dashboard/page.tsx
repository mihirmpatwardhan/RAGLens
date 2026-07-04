"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Paperclip,
  Brain,
  Sparkles,
  RotateCcw,
  Copy,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  Database,
  Zap,
  Clock,
  Hash,
  FileText,
  Settings2,
  Mic,
  Bot,
} from "lucide-react";
import { cn, formatBytes, formatNumber } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";
import { useAuthStore } from "@/stores/auth-store";
import { PipelineInspector } from "@/components/chat/pipeline-inspector";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

interface DemoMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  latency_ms?: number;
  tokens?: number;
  citations?: Array<{
    document: string;
    page: number;
    snippet: string;
    score: number;
  }>;
}

const DEMO_MESSAGES: DemoMessage[] = [
  {
    id: "1",
    role: "user",
    content: "What are the key architectural patterns used in microservices?",
  },
  {
    id: "2",
    role: "assistant",
    content: `Based on your knowledge base, here are the **key architectural patterns** used in microservices:

## 1. API Gateway Pattern
The API Gateway serves as a single entry point for all client requests. It handles:
- **Request routing** to appropriate microservices
- **Authentication & authorization**
- **Rate limiting** and throttling
- **Response aggregation** from multiple services

## 2. Service Discovery
Services register themselves with a discovery service (e.g., Consul, Eureka) and look up other services dynamically rather than using hardcoded addresses.

## 3. Circuit Breaker Pattern
Prevents cascade failures by wrapping calls to external services. When failures exceed a threshold, the circuit "opens" and returns fallback responses.

\`\`\`python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=30)
def call_external_service():
    return requests.get("http://service-b/api/data")
\`\`\`

## 4. Event-Driven Architecture
Services communicate asynchronously through events/messages using message brokers like **Kafka**, **RabbitMQ**, or **Redis Streams**.

## 5. CQRS (Command Query Responsibility Segregation)
Separates read and write operations into different models, optimizing each for their specific workload.

> 📚 **Sources**: Found in 3 documents across your "System Design" knowledge base.`,
    model: "GPT-4o",
    latency_ms: 1847,
    tokens: 312,
    citations: [
      { document: "system-design-patterns.pdf", page: 14, snippet: "API Gateway serves as...", score: 0.94 },
      { document: "microservices-guide.pdf", page: 8, snippet: "Circuit breaker prevents...", score: 0.91 },
      { document: "distributed-systems.pdf", page: 22, snippet: "Event-driven architecture enables...", score: 0.87 },
    ],
  },
];

const SUGGESTIONS = [
  { text: "Summarize my documents", icon: "📝" },
  { text: "Compare architectures", icon: "🏗️" },
  { text: "Find related concepts", icon: "🔗" },
  { text: "Generate insights", icon: "💡" },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<DemoMessage[]>(DEMO_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { rightPanelOpen } = useThemeStore();
  const { user } = useAuthStore();
  const [selectedTrace, setSelectedTrace] = useState<any>(null);
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const assistantMsg = messages.find((m) => m.role === "assistant");
    if (assistantMsg) {
      setSelectedTrace({
        query_original: "What are the key architectural patterns used in microservices?",
        query_rewritten: "What are the key architectural patterns used in microservices details and patterns",
        intent: "technical_query",
        search_type: "hybrid",
        prompt_tokens: 312,
        total_latency_ms: assistantMsg.latency_ms || 1847,
        stages: {
          query_rewrite: { name: "Query Rewrite", duration_ms: 120, details: { rewritten: "What are the key architectural patterns used in microservices details and patterns" } },
          intent_detection: { name: "Intent Detection", duration_ms: 80, details: { intent: "technical_query" } },
          dense_search: { name: "Dense Search", duration_ms: 450, details: { matches: 3 } },
          reranking: { name: "Reranking", duration_ms: 320, details: { input_count: 3 } },
          prompt_builder: { name: "Prompt Builder", duration_ms: 110, details: { prompt_characters: 1250 } },
        },
        retrieved_chunks: (assistantMsg.citations || []).map((c, i) => ({
          chunk_id: `chunk-${i}`,
          content: c.snippet,
          score: c.score,
          document_name: c.document,
          page_number: c.page,
        })),
      });
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!inputValue.trim()) return;

    const userMessage: DemoMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: DemoMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `I found relevant information in your knowledge base about **"${inputValue.slice(0, 50)}"**.\n\nThis is a demo response. Connect your LLM API keys in Settings to enable real AI responses with RAG pipeline tracing.`,
        model: "GPT-4o",
        latency_ms: Math.floor(Math.random() * 2000) + 500,
        tokens: Math.floor(Math.random() * 200) + 50,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const toggleCitations = (msgId: string) => {
    setExpandedCitations(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  return (
    <div className="h-full flex">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            /* Empty State */
            <div className="h-full flex items-center justify-center p-6">
              <div className="text-center max-w-lg animate-fade-in relative">
                {/* SVG floating brain network nodes */}
                <div className="absolute inset-x-0 -top-16 flex justify-center pointer-events-none">
                  <svg className="w-40 h-40 opacity-40 animate-float-slow" viewBox="0 0 100 100">
                    <motion.circle cx="50" cy="50" r="10" fill="none" stroke="var(--color-brand-500)" strokeWidth="1.5"
                                   animate={{ r: [10, 16, 10], opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 4 }} />
                    <line x1="50" y1="50" x2="25" y2="25" stroke="var(--color-brand-500)" strokeWidth="0.8" strokeDasharray="3 3" />
                    <line x1="50" y1="50" x2="75" y2="25" stroke="var(--color-accent-400)" strokeWidth="0.8" strokeDasharray="3 3" />
                    <line x1="50" y1="50" x2="50" y2="80" stroke="var(--color-rose-400)" strokeWidth="0.8" strokeDasharray="3 3" />
                    <circle cx="25" cy="25" r="4" fill="var(--color-brand-400)" />
                    <circle cx="75" cy="25" r="4" fill="var(--color-accent-400)" />
                    <circle cx="50" cy="80" r="4" fill="var(--color-rose-400)" />
                  </svg>
                </div>

                <motion.div
                  className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] flex items-center justify-center mx-auto mb-8 glow-brand-strong relative z-10"
                  animate={{ y: [0, -8, 0], rotate: [0, 3, -3, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Brain className="w-10 h-10 text-white" />
                </motion.div>
                <h2 className="text-2xl font-bold mb-3 font-display">Start a Conversation</h2>
                <p className="text-[var(--color-text-secondary)] text-sm mb-8 max-w-sm mx-auto leading-relaxed">
                  Ask anything about your knowledge bases. Every response includes
                  transparent pipeline tracing.
                </p>
                <div className="grid grid-cols-2 gap-3 relative z-10">
                  {SUGGESTIONS.map((suggestion, i) => (
                    <motion.button
                      key={suggestion.text}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.08 }}
                      onClick={() => setInputValue(suggestion.text)}
                      whileHover={{ scale: 1.03, y: -2, boxShadow: "0 0 15px rgba(124,58,237,0.12)" }}
                      className="px-4 py-3.5 rounded-xl glass-card-hover text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-left flex items-center gap-2.5 border border-[var(--color-border)]"
                    >
                      <span className="text-lg">{suggestion.icon}</span>
                      <span className="font-display font-medium">{suggestion.text}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              <AnimatePresence>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
                    className={cn(
                      "flex gap-3",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {/* Bot Avatar */}
                    {message.role === "assistant" && (
                      <div className="relative flex-shrink-0 mt-1">
                        <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] opacity-60 animate-pulse" />
                        <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] flex items-center justify-center glow-brand text-white">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-5 py-4 border relative overflow-hidden",
                        message.role === "user"
                          ? "bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-brand-500)] text-white border-[var(--color-brand-500)]/20 shadow-lg glow-brand"
                          : "glass-card border-[var(--color-border)]"
                      )}
                    >
                      {/* Message Content with Markdown & Syntax Highlighter */}
                      {message.role === "user" ? (
                        <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                          {message.content}
                        </div>
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ node, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || "");
                              return match ? (
                                <div className="relative my-4 rounded-xl border border-[var(--color-brand-500)]/30 overflow-hidden glow-brand">
                                  <div className="absolute top-2 right-3 text-[9px] text-[var(--color-text-muted)] font-mono font-bold uppercase tracking-wider select-none z-10">
                                    {match[1]}
                                  </div>
                                  <SyntaxHighlighter
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{
                                      margin: 0,
                                      background: "rgba(10, 10, 18, 0.8)",
                                      padding: "16px",
                                      fontSize: "12px",
                                      lineHeight: "1.5",
                                    }}
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, "")}
                                  </SyntaxHighlighter>
                                </div>
                              ) : (
                                <code className="px-1.5 py-0.5 rounded bg-[var(--color-surface-300)] text-xs font-mono text-[var(--color-brand-300)]" {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                          className="text-sm leading-relaxed whitespace-pre-wrap markdown-content"
                        >
                          {message.content}
                        </ReactMarkdown>
                      )}

                      {/* Metadata bar for assistant messages */}
                      {message.role === "assistant" && (
                        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
                          <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                            {message.model && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md glass-subtle">
                                <Zap className="w-3 h-3 text-[var(--color-accent-400)]" />
                                {message.model}
                              </span>
                            )}
                            {message.latency_ms && (
                              <span className="flex items-center gap-1 font-mono">
                                <Clock className="w-3 h-3" />
                                {message.latency_ms}ms
                              </span>
                            )}
                            {message.tokens && (
                              <span className="flex items-center gap-1 font-mono">
                                <Hash className="w-3 h-3" />
                                {message.tokens} tokens
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {[Copy, RotateCcw, ThumbsUp, ThumbsDown].map((Icon, i) => (
                              <motion.button
                                key={i}
                                whileHover={{ scale: 1.15 }}
                                whileTap={{ scale: 0.9 }}
                                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-300)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </motion.button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expandable Citations with Color-coded Relevance Scores */}
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-4 space-y-1.5 border-t border-[var(--color-border)]/50 pt-3">
                          <button
                            onClick={() => toggleCitations(message.id)}
                            className="flex items-center justify-between w-full text-[9px] font-bold text-[var(--color-text-secondary)] hover:text-white uppercase tracking-widest transition-colors font-display"
                          >
                            <span>Sources ({message.citations.length})</span>
                            <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", expandedCitations[message.id] && "rotate-180")} />
                          </button>
                          <AnimatePresence>
                            {expandedCitations[message.id] && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                className="overflow-hidden space-y-2 mt-1.5"
                              >
                                {message.citations.map((citation, i) => {
                                  const scoreColor = citation.score >= 0.9 
                                    ? "text-emerald-400" 
                                    : citation.score >= 0.8 
                                    ? "text-amber-400" 
                                    : "text-rose-400";
                                  return (
                                    <div
                                      key={i}
                                      className="p-3 rounded-xl bg-[var(--color-surface-200)]/60 hover:bg-[var(--color-surface-300)] transition-all border border-transparent hover:border-[var(--color-brand-500)]/20 flex flex-col gap-1.5 shadow-sm"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold truncate flex items-center gap-1.5 text-[var(--color-text-primary)] font-display">
                                          <FileText className="w-3.5 h-3.5 text-[var(--color-brand-400)]" />
                                          {citation.document}
                                        </span>
                                        <span className={cn("text-[10px] font-bold font-mono", scoreColor)}>
                                          {(citation.score * 100).toFixed(0)}% Match
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-[var(--color-text-muted)] italic leading-relaxed px-2 border-l border-[var(--color-border)] py-0.5 font-sans">
                                        &ldquo;{citation.snippet}&rdquo;
                                      </p>
                                    </div>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>

                    {/* User Avatar */}
                    {message.role === "user" && (
                      <div className="relative flex-shrink-0 mt-1">
                        <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] opacity-40" />
                        <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-accent-500)] flex items-center justify-center text-white text-xs font-bold font-display shadow-md">
                          {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Neural-Network Typing Indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 animate-fade-in"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] flex items-center justify-center flex-shrink-0 glow-brand">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="glass-card rounded-2xl px-5 py-3.5 flex items-center gap-3 border border-[var(--color-border)] shadow-sm">
                    <svg className="w-12 h-6" viewBox="0 0 50 20">
                      {/* Animated connecting flow paths */}
                      <motion.line x1="10" y1="10" x2="25" y2="10" stroke="var(--color-brand-400)" strokeWidth="1.5"
                                   animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.1 }} />
                      <motion.line x1="25" y1="10" x2="40" y2="10" stroke="var(--color-accent-400)" strokeWidth="1.5"
                                   animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }} />
                      {/* Nodes */}
                      <motion.circle cx="10" cy="10" r="3" fill="var(--color-brand-500)"
                                     animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} />
                      <motion.circle cx="25" cy="10" r="3" fill="var(--color-accent-400)"
                                     animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} />
                      <motion.circle cx="40" cy="10" r="3" fill="var(--color-rose-400)"
                                     animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }} />
                    </svg>
                    <span className="text-xs text-[var(--color-text-muted)] font-display font-semibold">Neural mapping...</span>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area with Expanding & Underline Border */}
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-50)]/60 backdrop-blur-2xl p-4 relative z-10">
          <div className="max-w-3xl mx-auto">
            <motion.div
              className={cn(
                "glass-card rounded-2xl overflow-hidden transition-all duration-300 border",
                inputFocused ? "border-[var(--color-brand-500)]/40 glow-brand" : "border-[var(--color-border)]"
              )}
              animate={inputFocused ? { boxShadow: "0 0 24px rgba(124, 58, 237, 0.12), 0 8px 40px rgba(0, 0, 0, 0.35)" } : {}}
            >
              {/* Input Row */}
              <div className="flex items-end gap-2 p-3.5">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-brand-400)] hover:bg-[var(--color-surface-300)] transition-all flex-shrink-0"
                >
                  <Paperclip className="w-[18px] h-[18px]" />
                </motion.button>
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder="Ask anything about your knowledge base..."
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none resize-none min-h-[36px] max-h-[120px] py-2 font-sans"
                />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-brand-400)] hover:bg-[var(--color-surface-300)] transition-all flex-shrink-0"
                  animate={isTyping ? { scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Mic className="w-[18px] h-[18px]" />
                </motion.button>
                <motion.button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  whileHover={inputValue.trim() ? { scale: 1.05 } : {}}
                  whileTap={inputValue.trim() ? { scale: 0.95 } : {}}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0",
                    inputValue.trim()
                      ? "btn-primary glow-brand"
                      : "text-[var(--color-text-muted)] bg-[var(--color-surface-300)]"
                  )}
                >
                  <Send className="w-[18px] h-[18px]" />
                </motion.button>
              </div>

              {/* Bottom Bar */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-surface-100)]/50">
                <div className="flex items-center gap-3">
                  <button className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors font-display font-medium">
                    <Database className="w-3 h-3" />
                    All Knowledge Bases
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <span className="text-[var(--color-border)]">|</span>
                  <button className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors font-display font-medium">
                    <Zap className="w-3 h-3 text-[var(--color-accent-400)]" />
                    GPT-4o
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <button className="p-1.5 rounded-lg hover:bg-[var(--color-surface-300)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]">
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Right Observability Panel */}
      <AnimatePresence>
        {rightPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
            className="border-l border-[var(--color-border)] flex-shrink-0 hidden md:block overflow-hidden bg-[var(--color-surface-50)]"
          >
            <PipelineInspector trace={selectedTrace} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
