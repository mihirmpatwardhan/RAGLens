"use client";

import { useState, useCallback, type CSSProperties } from "react";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiClient, getErrorMessage } from "@/lib/api-client";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Difficulty = "easy" | "medium" | "hard" | "mixed";

type QuizItem = {
  question: string;
  options: string[];
  correct_option: number;
  answer: string;
  source: string;
  difficulty: "easy" | "medium" | "hard" | string;
};

type QuizResult = {
  quiz_items: QuizItem[];
  chunks_used: number;
  logs: string[];
  topic: string;
  kb_id: string | null;
};

type UserAnswer = {
  revealed: boolean;
  selectedOption: number | null;
  correct: boolean | null; // null = not marked yet
};

type RunResult = {
  content: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  estimated_cost_usd: number;
};

const RUNNER_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "claude-3-5-sonnet-20241022",
  "claude-3-haiku-20240307",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
];

const runLabelStyle: CSSProperties = {
  display: "block",
  marginBottom: "6px",
  color: "var(--color-text-secondary)",
  fontSize: "12px",
  fontWeight: 600,
};

const runInputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  background: "var(--color-surface-0)",
  color: "var(--color-text-primary)",
  fontSize: "14px",
  boxSizing: "border-box",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const DIFFICULTY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; ring: string }
> = {
  easy: {
    label: "Easy",
    color: "var(--color-success)",
    bg: "#537a5a18",
    ring: "#537a5a40",
  },
  medium: {
    label: "Medium",
    color: "var(--color-warning)",
    bg: "#c2883c18",
    ring: "#c2883c40",
  },
  hard: {
    label: "Hard",
    color: "var(--color-error)",
    bg: "#b54a4a18",
    ring: "#b54a4a40",
  },
  mixed: {
    label: "Mixed",
    color: "var(--color-brand-600)",
    bg: "var(--color-brand-100)",
    ring: "var(--color-brand-300)",
  },
  "N/A": {
    label: "N/A",
    color: "var(--color-text-muted)",
    bg: "var(--color-surface-100)",
    ring: "var(--color-border)",
  },
};

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG["mixed"];
  return (
    <span
      style={{
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.ring}`,
        borderRadius: "var(--radius-full)",
        padding: "2px 10px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {cfg.label}
    </span>
  );
}

// ─── Quiz Card Component ────────────────────────────────────────────────────────

function QuizCard({
  item,
  index,
  userAnswer,
  onReveal,
  onSelect,
  onSubmit,
  onMark,
}: {
  item: QuizItem;
  index: number;
  userAnswer: UserAnswer;
  onReveal: () => void;
  onSelect: (option: number) => void;
  onSubmit: (option: number) => void;
  onMark: (correct: boolean) => void;
}) {
  const options = Array.isArray(item.options) ? item.options : [];

  return (
    <div
      style={{
        background: "var(--color-surface-0)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        transition: "box-shadow 0.2s ease",
        boxShadow: userAnswer.revealed ? "var(--glass-shadow)" : "none",
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          background: userAnswer.correct === true
            ? "#537a5a08"
            : userAnswer.correct === false
            ? "#b54a4a08"
            : "transparent",
          borderBottom: userAnswer.revealed ? "1px solid var(--color-border)" : "none",
        }}
      >
        {/* Question number */}
        <span
          style={{
            flexShrink: 0,
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-brand-100)",
            color: "var(--color-brand-700)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 700,
            marginTop: "1px",
          }}
        >
          {index + 1}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              color: "var(--color-text-primary)",
              fontSize: "15px",
              fontWeight: 500,
              lineHeight: 1.55,
            }}
          >
            {item.question}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "8px",
            }}
          >
            <DifficultyBadge difficulty={item.difficulty} />
            <span
              style={{
                color: "var(--color-text-muted)",
                fontSize: "11px",
              }}
            >
              {item.source}
            </span>
          </div>
        </div>

        {/* Status icon */}
        {userAnswer.correct === true && (
          <CheckCircle2
            size={18}
            style={{ color: "var(--color-success)", flexShrink: 0 }}
          />
        )}
        {userAnswer.correct === false && (
          <XCircle
            size={18}
            style={{ color: "var(--color-error)", flexShrink: 0 }}
          />
        )}
      </div>

      {/* Multiple-choice interaction */}
      {options.length >= 2 ? (
        <div style={{ padding: "16px 20px" }}>
          <p
            style={{
              margin: "0 0 10px",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--color-text-muted)",
            }}
          >
            Choose one answer
          </p>
          <div role="radiogroup" aria-label={`Options for question ${index + 1}`} style={{ display: "grid", gap: "8px" }}>
            {options.map((option, optionIndex) => {
              const selected = userAnswer.selectedOption === optionIndex;
              const isCorrect = userAnswer.revealed && item.correct_option === optionIndex;
              const isWrongSelection = userAnswer.revealed && selected && !isCorrect;
              return (
                <button
                  key={`${optionIndex}-${option}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={userAnswer.revealed}
                  onClick={() => onSelect(optionIndex)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    width: "100%",
                    padding: "11px 12px",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${isCorrect ? "#537a5a80" : isWrongSelection ? "#b54a4a80" : selected ? "var(--color-brand-500)" : "var(--color-border)"}`,
                    background: isCorrect ? "#537a5a12" : isWrongSelection ? "#b54a4a12" : selected ? "var(--color-brand-100)" : "var(--color-surface-0)",
                    color: "var(--color-text-secondary)",
                    fontSize: "13px",
                    lineHeight: 1.45,
                    textAlign: "left",
                    cursor: userAnswer.revealed ? "default" : "pointer",
                    opacity: userAnswer.revealed && !isCorrect && !isWrongSelection ? 0.72 : 1,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      width: "22px",
                      height: "22px",
                      borderRadius: "var(--radius-full)",
                      border: `1px solid ${isCorrect ? "var(--color-success)" : isWrongSelection ? "var(--color-error)" : selected ? "var(--color-brand-600)" : "var(--color-border)"}`,
                      color: isCorrect ? "var(--color-success)" : isWrongSelection ? "var(--color-error)" : selected ? "var(--color-brand-700)" : "var(--color-text-muted)",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>

          {!userAnswer.revealed ? (
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "14px" }}>
              <button
                id={`quiz-check-${index}`}
                type="button"
                onClick={() => userAnswer.selectedOption !== null && onSubmit(userAnswer.selectedOption)}
                disabled={userAnswer.selectedOption === null}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: userAnswer.selectedOption === null ? "var(--color-surface-300)" : "var(--color-brand-600)",
                  color: userAnswer.selectedOption === null ? "var(--color-text-muted)" : "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: userAnswer.selectedOption === null ? "not-allowed" : "pointer",
                }}
              >
                Check answer
              </button>
              <button
                id={`quiz-reveal-${index}`}
                type="button"
                onClick={onReveal}
                style={{
                  color: "var(--color-brand-600)",
                  fontSize: "13px",
                  fontWeight: 500,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Reveal answer
              </button>
            </div>
          ) : (
            <div style={{ marginTop: "16px" }}>
              <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 700, color: userAnswer.correct === true ? "var(--color-success)" : userAnswer.correct === false ? "var(--color-error)" : "var(--color-text-secondary)" }}>
                {userAnswer.correct === true ? "Correct!" : userAnswer.correct === false ? "Not quite" : "Answer revealed"}
              </p>
              <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "14px", lineHeight: 1.65 }}>
                {item.answer}
              </p>
            </div>
          )}
        </div>
      ) : userAnswer.revealed ? (
        <div style={{ padding: "16px 20px" }}>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--color-text-muted)",
            }}
          >
            Answer
          </p>
          <p
            style={{
              margin: "0 0 16px",
              color: "var(--color-text-secondary)",
              fontSize: "14px",
              lineHeight: 1.65,
            }}
          >
            {item.answer}
          </p>

          {/* Mark correct/incorrect */}
          {userAnswer.correct === null && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                id={`quiz-correct-${index}`}
                onClick={() => onMark(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid #537a5a60",
                  background: "#537a5a10",
                  color: "var(--color-success)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#537a5a20";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#537a5a10";
                }}
              >
                <CheckCircle2 size={14} />
                Got it right
              </button>
              <button
                id={`quiz-incorrect-${index}`}
                onClick={() => onMark(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid #b54a4a60",
                  background: "#b54a4a10",
                  color: "var(--color-error)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#b54a4a20";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#b54a4a10";
                }}
              >
                <XCircle size={14} />
                Got it wrong
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "12px 20px" }}>
          <button
            id={`quiz-reveal-${index}`}
            onClick={onReveal}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--color-brand-600)",
              fontSize: "13px",
              fontWeight: 500,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              transition: "color 0.15s ease",
            }}
          >
            <ChevronDown size={14} />
            Reveal answer
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Score Summary ──────────────────────────────────────────────────────────────

function ScoreSummary({
  total,
  answered,
  correct,
}: {
  total: number;
  answered: number;
  correct: number;
}) {
  const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const color =
    pct >= 80 ? "var(--color-success)" : pct >= 50 ? "var(--color-warning)" : "var(--color-error)";

  return (
    <div
      style={{
        background: "var(--color-surface-50)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Trophy
          size={18}
          style={{ color: "var(--color-brand-600)", flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          Your Score
        </span>
      </div>
      <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color,
              lineHeight: 1,
            }}
          >
            {pct}%
          </div>
          <div
            style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}
          >
            accuracy
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--color-success)",
              lineHeight: 1,
            }}
          >
            {correct}
          </div>
          <div
            style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}
          >
            correct
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--color-text-secondary)",
              lineHeight: 1,
            }}
          >
            {answered}
          </div>
          <div
            style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}
          >
            answered
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--color-text-muted)",
              lineHeight: 1,
            }}
          >
            {total}
          </div>
          <div
            style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}
          >
            total
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PlaygroundPage() {
  // Form state
  const [topic, setTopic] = useState("");
  const [kbId, setKbId] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");

  // Tab
  const [activeTab, setActiveTab] = useState<"quiz" | "runner">("runner");

  // Prompt Runner state
  const [runPrompt, setRunPrompt] = useState("");
  const [runSystemPrompt, setRunSystemPrompt] = useState(
    "You are a helpful AI assistant."
  );
  const [runModel, setRunModel] = useState("gpt-4o");
  const [runTemperature, setRunTemperature] = useState(0.1);
  const [runMaxTokens, setRunMaxTokens] = useState(2048);
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  // Quiz state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Derived score
  const answered = userAnswers.filter((a) => a.correct !== null).length;
  const correct = userAnswers.filter((a) => a.correct === true).length;

  const generateQuiz = useCallback(async () => {
    if (!topic.trim()) {
      toast.error("Please enter a topic for the quiz.");
      return;
    }

    setLoading(true);
    setResult(null);
    setUserAnswers([]);

    try {
      const payload: Record<string, unknown> = {
        topic: topic.trim(),
        num_questions: numQuestions,
        difficulty,
      };
      if (kbId.trim()) {
        payload.kb_id = kbId.trim();
      }

      const response = await apiClient.post<QuizResult>("/playground/quiz", payload);
      setResult(response.data);
      setUserAnswers(
        response.data.quiz_items.map(() => ({ revealed: false, selectedOption: null, correct: null }))
      );
      toast.success(
        `Generated ${response.data.quiz_items.length} questions from ${response.data.chunks_used} context chunks`
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [topic, kbId, numQuestions, difficulty]);

  const executePrompt = useCallback(async () => {
    if (!runPrompt.trim()) {
      toast.error("Please enter a prompt.");
      return;
    }
    setRunLoading(true);
    setRunResult(null);
    try {
      const response = await apiClient.post<RunResult>("/playground/run", {
        prompt: runPrompt.trim(),
        system_prompt: runSystemPrompt.trim() || "You are a helpful AI assistant.",
        model: runModel,
        temperature: runTemperature,
        max_tokens: runMaxTokens,
      });
      setRunResult(response.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRunLoading(false);
    }
  }, [runPrompt, runSystemPrompt, runModel, runTemperature, runMaxTokens]);

  const revealAll = () => {
    setUserAnswers((prev) => prev.map((a) => ({ ...a, revealed: true })));
  };

  const exportQuiz = () => {
    if (!result) return;
    const text = result.quiz_items
      .map(
        (item, i) =>
          `Q${i + 1} [${item.difficulty}]: ${item.question}\nA: ${item.answer}\nSource: ${item.source}\n`
      )
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quiz-${result.topic.slice(0, 30).replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Quiz exported as text file");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-surface-0)",
        padding: "32px 28px",
        maxWidth: "860px",
        margin: "0 auto",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-brand-100)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={18} style={{ color: "var(--color-brand-700)" }} />
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              Prompt Playground
            </h1>
            <div style={{ marginBottom: "6px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "var(--color-text-muted)",
            }}
          >
            {activeTab === "runner"
              ? "Execute prompts against configurable models and inspect token metrics"
              : "Generate quiz questions from your knowledge base"}
          </p>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: "inline-flex",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface-50)",
            padding: "3px",
            gap: "2px",
          }}
        >
          {(["runner", "quiz"] as const).map((tab) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "7px 16px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background:
                  activeTab === tab
                    ? "var(--color-surface-0)"
                    : "transparent",
                color:
                  activeTab === tab
                    ? "var(--color-text-primary)"
                    : "var(--color-text-muted)",
                fontSize: "13px",
                fontWeight: activeTab === tab ? 600 : 400,
                cursor: "pointer",
                boxShadow:
                  activeTab === tab ? "var(--glass-shadow)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {tab === "runner" ? "⚡ Prompt Runner" : "🧠 Quiz Generator"}
            </button>
          ))}
        </div>
        </div>
      </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── Prompt Runner Tab ──────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === "runner" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* ── Config panel ── */}
          <div
            style={{
              background: "var(--color-surface-50)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xl)",
              padding: "24px",
            }}
          >
            <div style={{ display: "grid", gap: "14px" }}>

              {/* Model + Temperature + Max Tokens row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "end" }}>
                <div>
                  <label htmlFor="runner-model" style={runLabelStyle}>Model</label>
                  <select
                    id="runner-model"
                    value={runModel}
                    onChange={(e) => setRunModel(e.target.value)}
                    style={runInputStyle}
                  >
                    {RUNNER_MODELS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="runner-temp" style={runLabelStyle}>Temp ({runTemperature.toFixed(1)})</label>
                  <input
                    id="runner-temp"
                    type="range"
                    min={0} max={2} step={0.1}
                    value={runTemperature}
                    onChange={(e) => setRunTemperature(parseFloat(e.target.value))}
                    style={{ display: "block", width: "110px", marginTop: "8px", accentColor: "var(--color-brand-600)" }}
                  />
                </div>
                <div>
                  <label htmlFor="runner-max-tokens" style={runLabelStyle}>Max tokens</label>
                  <input
                    id="runner-max-tokens"
                    type="number"
                    min={64} max={16384}
                    value={runMaxTokens}
                    onChange={(e) => setRunMaxTokens(parseInt(e.target.value, 10) || 2048)}
                    style={{ ...runInputStyle, width: "100px" }}
                  />
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label htmlFor="runner-system" style={runLabelStyle}>
                  System Prompt
                </label>
                <textarea
                  id="runner-system"
                  value={runSystemPrompt}
                  onChange={(e) => setRunSystemPrompt(e.target.value)}
                  rows={2}
                  style={{
                    ...runInputStyle,
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* User Prompt */}
              <div>
                <label htmlFor="runner-prompt" style={runLabelStyle}>User Prompt</label>
                <textarea
                  id="runner-prompt"
                  value={runPrompt}
                  onChange={(e) => setRunPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      void executePrompt();
                    }
                  }}
                  rows={5}
                  placeholder="Enter your prompt here… (Ctrl+Enter to run)"
                  style={{
                    ...runInputStyle,
                    fontFamily: "var(--font-mono)",
                    fontSize: "13px",
                    resize: "vertical",
                    minHeight: "100px",
                  }}
                />
              </div>

              {/* Run button */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  id="runner-run-btn"
                  onClick={() => void executePrompt()}
                  disabled={runLoading || !runPrompt.trim()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "10px 22px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: runLoading || !runPrompt.trim()
                      ? "var(--color-surface-300)"
                      : "var(--color-brand-600)",
                    color: runLoading || !runPrompt.trim()
                      ? "var(--color-text-muted)"
                      : "#fff",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: runLoading || !runPrompt.trim() ? "not-allowed" : "pointer",
                    transition: "opacity 0.15s ease",
                  }}
                >
                  {runLoading ? (
                    <><Loader2 size={15} className="animate-spin" /> Running...</>
                  ) : (
                    <>⚡ Run Prompt</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ── Output panel ── */}
          {runResult && (
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xl)",
                overflow: "hidden",
              }}
            >
              {/* Metrics bar */}
              <div
                style={{
                  display: "flex",
                  gap: "0",
                  borderBottom: "1px solid var(--color-border)",
                  background: "var(--color-surface-50)",
                  flexWrap: "wrap",
                }}
              >
                {[
                  { label: "Model", value: runResult.model },
                  { label: "Prompt tokens", value: runResult.prompt_tokens.toLocaleString() },
                  { label: "Completion tokens", value: runResult.completion_tokens.toLocaleString() },
                  { label: "Total tokens", value: runResult.total_tokens.toLocaleString() },
                  { label: "Latency", value: `${runResult.latency_ms} ms` },
                  { label: "Est. cost", value: `$${runResult.estimated_cost_usd.toFixed(5)}` },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      padding: "10px 18px",
                      borderRight: "1px solid var(--color-border)",
                      minWidth: "100px",
                    }}
                  >
                    <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)", marginTop: "3px", fontFamily: typeof value === "string" && value.startsWith("gpt") ? "inherit" : "var(--font-mono)" }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Response content */}
              <div
                style={{
                  padding: "20px 24px",
                  background: "var(--color-surface-0)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  lineHeight: 1.75,
                  color: "var(--color-text-primary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: "500px",
                  overflowY: "auto",
                }}
              >
                {runResult.content}
              </div>

              {/* Copy button */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "10px 16px",
                  borderTop: "1px solid var(--color-border)",
                  background: "var(--color-surface-50)",
                }}
              >
                <button
                  id="runner-copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(runResult.content);
                    toast.success("Copied to clipboard");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface-0)",
                    color: "var(--color-text-secondary)",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  📋 Copy response
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!runResult && !runLoading && (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                border: "1px dashed var(--color-border)",
                borderRadius: "var(--radius-xl)",
                color: "var(--color-text-muted)",
              }}
            >
              <Sparkles size={32} style={{ marginBottom: "12px", opacity: 0.3, color: "var(--color-brand-600)" }} />
              <p style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                Ready to run a prompt
              </p>
              <p style={{ margin: 0, fontSize: "13px" }}>
                Enter a prompt above and click <strong style={{ color: "var(--color-brand-600)" }}>Run Prompt</strong> (or Ctrl+Enter)
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── Quiz Generator Tab ─────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === "quiz" && (
        <>
          <div
            style={{
          background: "var(--color-surface-50)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xl)",
          padding: "24px",
          marginBottom: "28px",
        }}
      >
        <div style={{ display: "grid", gap: "16px" }}>
          {/* Topic */}
          <div>
            <label
              htmlFor="quiz-topic"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                marginBottom: "6px",
              }}
            >
              Topic / Subject
            </label>
            <input
              id="quiz-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generateQuiz()}
              placeholder="e.g. machine learning fundamentals, chapter 3 summary..."
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface-0)",
                color: "var(--color-text-primary)",
                fontSize: "14px",
                outline: "none",
                transition: "border-color 0.15s ease",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-brand-400)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
              }}
            />
          </div>

          {/* KB ID + Question count row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <div>
              <label
                htmlFor="quiz-kb-id"
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Knowledge Base ID{" "}
                <span
                  style={{ color: "var(--color-text-muted)", fontWeight: 400 }}
                >
                  (optional — leave blank for global search)
                </span>
              </label>
              <input
                id="quiz-kb-id"
                type="text"
                value={kbId}
                onChange={(e) => setKbId(e.target.value)}
                placeholder="uuid..."
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-0)",
                  color: "var(--color-text-primary)",
                  fontSize: "14px",
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                  transition: "border-color 0.15s ease",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-brand-400)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                }}
              />
            </div>

            {/* Number of questions */}
            <div>
              <label
                htmlFor="quiz-num"
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Questions
              </label>
              <select
                id="quiz-num"
                value={numQuestions}
                onChange={(e) => setNumQuestions(Number(e.target.value))}
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-0)",
                  color: "var(--color-text-primary)",
                  fontSize: "14px",
                  outline: "none",
                  cursor: "pointer",
                  minWidth: "90px",
                }}
              >
                {[3, 5, 8, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {/* Difficulty */}
            <div>
              <label
                htmlFor="quiz-difficulty"
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Difficulty
              </label>
              <select
                id="quiz-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-0)",
                  color: "var(--color-text-primary)",
                  fontSize: "14px",
                  outline: "none",
                  cursor: "pointer",
                  minWidth: "110px",
                }}
              >
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Generate button */}
          <button
            id="quiz-generate-btn"
            onClick={generateQuiz}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "11px 24px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: loading
                ? "var(--color-surface-300)"
                : "var(--color-brand-600)",
              color: loading ? "var(--color-text-muted)" : "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              alignSelf: "flex-end",
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating quiz...
              </>
            ) : (
              <>
                <Brain size={16} />
                Generate Quiz
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Results ───────────────────────────────────────────────── */}
      {result && result.quiz_items.length > 0 && (
        <div>
          {/* Toolbar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <BookOpen size={16} style={{ color: "var(--color-brand-600)" }} />
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                {result.quiz_items.length} Questions — {result.topic}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-brand-100)",
                  color: "var(--color-brand-700)",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {result.chunks_used} sources
              </span>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                id="quiz-reveal-all-btn"
                onClick={revealAll}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-50)",
                  color: "var(--color-text-secondary)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <ChevronDown size={14} />
                Reveal all
              </button>
              <button
                id="quiz-export-btn"
                onClick={exportQuiz}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-50)",
                  color: "var(--color-text-secondary)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <Download size={14} />
                Export
              </button>
              <button
                id="quiz-regenerate-btn"
                onClick={generateQuiz}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-50)",
                  color: "var(--color-text-secondary)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <RefreshCw size={14} />
                Regenerate
              </button>
            </div>
          </div>

          {/* Score summary (shows after any answer is revealed) */}
          {userAnswers.some((a) => a.revealed) && (
            <div style={{ marginBottom: "16px" }}>
              <ScoreSummary
                total={result.quiz_items.length}
                answered={answered}
                correct={correct}
              />
            </div>
          )}

          {/* Quiz cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {result.quiz_items.map((item, index) => (
              <QuizCard
                key={index}
                item={item}
                index={index}
                userAnswer={userAnswers[index] ?? { revealed: false, selectedOption: null, correct: null }}
                onSelect={(option) =>
                  setUserAnswers((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], selectedOption: option };
                    return next;
                  })
                }
                onReveal={() =>
                  setUserAnswers((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], revealed: true };
                    return next;
                  })
                }
                onSubmit={(option) =>
                  setUserAnswers((prev) => {
                    const next = [...prev];
                    next[index] = {
                      ...next[index],
                      selectedOption: option,
                      revealed: true,
                      correct: option === item.correct_option,
                    };
                    return next;
                  })
                }
                onMark={(isCorrect) =>
                  setUserAnswers((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], correct: isCorrect };
                    return next;
                  })
                }
              />
            ))}
          </div>

          {/* Agent logs (collapsed by default) */}
          <div style={{ marginTop: "20px" }}>
            <button
              id="quiz-logs-toggle"
              onClick={() => setShowLogs((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "var(--color-text-muted)",
                fontSize: "12px",
                fontWeight: 500,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <Layers size={13} />
              Agent logs
              {showLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {showLogs && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-surface-100)",
                  border: "1px solid var(--color-border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--color-text-tertiary)",
                  lineHeight: 1.7,
                }}
              >
                {result.logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state after generation with no items */}
      {result && result.quiz_items.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "var(--color-text-muted)",
          }}
        >
          <Brain
            size={36}
            style={{ marginBottom: "12px", opacity: 0.4 }}
          />
          <p style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 500 }}>
            No questions generated
          </p>
          <p style={{ margin: 0, fontSize: "13px" }}>
            Try uploading more documents to the knowledge base, or broaden your topic.
          </p>
        </div>
      )}

      {/* Initial empty state */}
      {!result && !loading && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            color: "var(--color-text-muted)",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--radius-xl)",
          }}
        >
          <Sparkles
            size={36}
            style={{
              marginBottom: "16px",
              opacity: 0.35,
              color: "var(--color-brand-600)",
            }}
          />
          <p
            style={{
              margin: "0 0 6px",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
            }}
          >
            Ready to generate a quiz
          </p>
          <p style={{ margin: 0, fontSize: "13px" }}>
            Enter a topic above and click{" "}
            <strong style={{ color: "var(--color-brand-600)" }}>Generate Quiz</strong>{" "}
            to produce AI-generated questions from your knowledge base.
          </p>
        </div>
      )}
        </>
      )}
    </div>
  );
}
