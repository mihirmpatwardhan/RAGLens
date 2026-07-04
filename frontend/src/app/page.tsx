"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Brain,
  Layers,
  Search,
  MessageSquare,
  BarChart3,
  Shield,
  Zap,
  GitBranch,
  Database,
  Eye,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Play,
  MousePointer2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Data ── */

const PIPELINE_STAGES = [
  { label: "Upload", icon: "📤", color: "#8b5cf6", desc: "Ingest documents", row: 0, col: 0 },
  { label: "Parse", icon: "📄", color: "#a78bfa", desc: "Extract content", row: 0, col: 1 },
  { label: "OCR", icon: "👁️", color: "#c084fc", desc: "Vision analysis", row: 0, col: 2 },
  { label: "Chunk", icon: "✂️", color: "#2dd4bf", desc: "Smart splitting", row: 1, col: 2 },
  { label: "Embed", icon: "🧬", color: "#14b8a6", desc: "Vector encoding", row: 1, col: 1 },
  { label: "Store", icon: "💾", color: "#34d399", desc: "Vector database", row: 1, col: 0 },
  { label: "Index", icon: "📇", color: "#fbbf24", desc: "Fast retrieval", row: 2, col: 0 },
  { label: "Query", icon: "🔍", color: "#f87171", desc: "Semantic search", row: 2, col: 1 },
  { label: "Answer", icon: "💬", color: "#f472b6", desc: "AI generation", row: 2, col: 2 },
];

const FEATURES = [
  {
    icon: Eye,
    title: "Explainable Pipeline",
    description:
      "Every stage of the RAG pipeline is visible and interactive. Click any stage to inspect logs, metrics, and debug data.",
    color: "#8b5cf6",
    gradient: "from-violet-500/20 to-violet-500/0",
  },
  {
    icon: Layers,
    title: "Multimodal Ingestion",
    description:
      "Process PDFs, images, audio, video, code, spreadsheets, and 40+ file formats through intelligent parsing pipelines.",
    color: "#a78bfa",
    gradient: "from-purple-500/20 to-purple-500/0",
  },
  {
    icon: Search,
    title: "Hybrid Search",
    description:
      "Semantic, keyword, BM25, image, and knowledge graph search with cross-encoder reranking and context compression.",
    color: "#2dd4bf",
    gradient: "from-teal-500/20 to-teal-500/0",
  },
  {
    icon: MessageSquare,
    title: "Enterprise Chat",
    description:
      "Streaming responses with inline citations, LaTeX, Mermaid diagrams, interactive tables, and full pipeline tracing.",
    color: "#14b8a6",
    gradient: "from-emerald-500/20 to-emerald-500/0",
  },
  {
    icon: GitBranch,
    title: "Multi-Agent System",
    description:
      "Coordinator, Retriever, Research, Summarizer, Citation, Critic, and Code agents with visible reasoning chains.",
    color: "#34d399",
    gradient: "from-green-500/20 to-green-500/0",
  },
  {
    icon: BarChart3,
    title: "RAG Evaluation",
    description:
      "Built-in RAGAS, DeepEval metrics — faithfulness, groundedness, context precision, recall, and answer relevancy.",
    color: "#fbbf24",
    gradient: "from-amber-500/20 to-amber-500/0",
  },
  {
    icon: Database,
    title: "Vector Explorer",
    description:
      "Interactive UMAP/t-SNE/PCA visualizations, cluster analysis, embedding comparison, and similarity heatmaps.",
    color: "#f87171",
    gradient: "from-red-500/20 to-red-500/0",
  },
  {
    icon: Shield,
    title: "Enterprise Ready",
    description:
      "JWT/OAuth authentication, RBAC, audit logs, rate limiting, Docker/K8s deployment, and full observability stack.",
    color: "#f472b6",
    gradient: "from-pink-500/20 to-pink-500/0",
  },
];

const TECH_BADGES = [
  "Next.js 15",
  "React 19",
  "FastAPI",
  "LangChain",
  "LangGraph",
  "PostgreSQL",
  "Redis",
  "ChromaDB",
  "GPT-4o",
  "Claude",
  "Gemini",
  "Ollama",
  "Docker",
  "TypeScript",
];

const STATS = [
  { label: "File Formats", value: 40, suffix: "+" },
  { label: "Pipeline Stages", value: 16, suffix: "" },
  { label: "LLM Providers", value: 6, suffix: "" },
  { label: "Eval Metrics", value: 12, suffix: "+" },
];

/* ── Animated Counter ── */
function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (hasAnimated) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasAnimated(true);
          let start = 0;
          const duration = 1500;
          const step = (timestamp: number) => {
            if (!start) start = timestamp;
            const progress = Math.min((timestamp - start) / duration, 1);
            setCount(Math.floor(progress * value));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, hasAnimated]);

  return (
    <span ref={ref} className="font-display font-bold text-3xl sm:text-4xl gradient-text">
      {count}
      {suffix}
    </span>
  );
}

/* ── Magnetic Hover Card Component ── */
function MagneticCard({
  children,
  className,
  color,
  gradient,
}: {
  children: React.ReactNode;
  className?: string;
  color: string;
  gradient: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setCoords({ x: x * 0.12, y: y * 0.12 });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setCoords({ x: 0, y: 0 });
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      animate={{ x: coords.x, y: coords.y }}
      transition={{ type: "spring", stiffness: 180, damping: 15 }}
      className={cn("relative overflow-hidden", className)}
    >
      {/* Glow overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
        style={{
          background: `radial-gradient(circle 120px at ${coords.x * 6 + 140}px ${coords.y * 6 + 140}px, ${color}25, transparent)`,
        }}
      />
      <div className={cn("absolute inset-0 bg-gradient-to-b opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0", gradient)} />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

/* ── Motion Variants ── */
const fadeInUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.55, ease: [0.19, 1, 0.22, 1] },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/* ── Text Character Stagger Reveal ── */
function CharacterRevealText({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <motion.span
      className={className}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.1 } },
      }}
      initial="hidden"
      animate="visible"
    >
      {words.map((word, wIdx) => (
        <span key={wIdx} className="inline-block whitespace-nowrap mr-3">
          {word.split("").map((char, cIdx) => (
            <motion.span
              key={cIdx}
              className="inline-block"
              variants={{
                hidden: { opacity: 0, y: 15 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
              }}
            >
              {char}
            </motion.span>
          ))}
        </span>
      ))}
    </motion.span>
  );
}

/* ── Central Orbital Tech Badges ── */
function OrbitalTechStack() {
  const [windowWidth, setWindowWidth] = useState(1024);

  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative w-[320px] h-[320px] sm:w-[420px] sm:h-[420px] mx-auto flex items-center justify-center overflow-visible my-16">
      {/* Central brain icon with pulse */}
      <motion.div
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] flex items-center justify-center glow-brand-strong z-20"
        animate={{ scale: [1, 1.06, 1], rotate: [0, 3, -3, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <Brain className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
      </motion.div>

      {/* Orbit Rings */}
      <div className="absolute w-[200px] h-[200px] sm:w-[260px] sm:h-[260px] border border-dashed border-[var(--color-border)] rounded-full animate-[spin_45s_linear_infinite]" />
      <div className="absolute w-[300px] h-[300px] sm:w-[380px] sm:h-[380px] border border-dashed border-[var(--color-border)] rounded-full animate-[spin_70s_linear_infinite_reverse]" />

      {/* Orbital Badges */}
      {TECH_BADGES.map((tech, idx) => {
        const isOuter = idx % 2 === 0;
        const radius = isOuter ? (windowWidth < 640 ? 140 : 185) : (windowWidth < 640 ? 95 : 125);
        const speed = isOuter ? 32 + idx * 2 : 24 + idx * 3;
        const angle = (idx * 360) / TECH_BADGES.length;

        return (
          <motion.div
            key={tech}
            className="absolute z-10"
            style={{
              width: radius * 2,
              height: radius * 2,
            }}
            animate={{ rotate: angle + 360 }}
            initial={{ rotate: angle }}
            transition={{
              repeat: Infinity,
              duration: speed,
              ease: "linear",
            }}
          >
            <motion.div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl glass border border-[var(--color-border)] text-[10px] sm:text-xs font-semibold text-[var(--color-text-secondary)] hover:text-white transition-colors cursor-default"
              style={{ rotate: -angle }}
              animate={{ rotate: -(angle + 360) }}
              transition={{
                repeat: Infinity,
                duration: speed,
                ease: "linear",
              }}
            >
              {tech}
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Ingestion Pipeline Flow Line ── */
function PipelineFlowSVG() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ transformStyle: "preserve-3d" }}>
      <defs>
        <linearGradient id="pipeline-path-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#2dd4bf" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#f472b6" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* Serpentine Ingest Flow Path */}
      <path
        d="M 16.6% 16.6% H 83.3% V 50% H 16.6% V 83.3% H 83.3%"
        fill="none"
        stroke="url(#pipeline-path-gradient)"
        strokeWidth="2.5"
        strokeDasharray="8 8"
        className="pipeline-connection"
      />
    </svg>
  );
}

/* ── Landing Page Export ── */
export default function LandingPage() {
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.95]);
  const [activePipelineStage, setActivePipelineStage] = useState<number | null>(null);

  // Auto-cycle pipeline stages
  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      setActivePipelineStage(idx);
      idx = (idx + 1) % PIPELINE_STAGES.length;
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-surface-0)] overflow-hidden">
      {/* ── Background Layers ── */}
      <div className="fixed inset-0 bg-dot-grid opacity-30 pointer-events-none" />
      <div className="fixed inset-0 bg-aurora-animated pointer-events-none" />

      {/* Floating Aurora Orbs */}
      <div className="orb orb-violet w-[500px] h-[500px] -top-48 -left-48 opacity-60" />
      <div className="orb orb-teal w-[400px] h-[400px] top-1/3 -right-32 opacity-50 animate-float-slow" />
      <div className="orb orb-rose w-[350px] h-[350px] bottom-32 left-1/4 opacity-40 animate-float" />

      {/* ── Navigation ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] flex items-center justify-center glow-brand"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Brain className="w-5 h-5 text-white" />
            </motion.div>
            <span className="text-lg font-bold tracking-tight font-display">
              <span className="gradient-text">RAGLense</span>{" "}
              <span className="text-[var(--color-text-secondary)]">Studio</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-200"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="btn-primary btn-shimmer px-5 py-2.5 text-sm font-medium rounded-xl flex items-center gap-2"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <motion.section
        className="relative pt-36 pb-20 px-6 overflow-visible"
        style={{ opacity: heroOpacity, scale: heroScale }}
      >
        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
          >
            <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full glass-subtle text-sm text-[var(--color-text-secondary)] mb-8 border border-[var(--color-brand-500)]/20 shadow-md">
              <Sparkles className="w-4 h-4 text-[var(--color-brand-400)] animate-pulse" />
              <span>Enterprise-Grade AI Knowledge Platform</span>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            </div>
          </motion.div>

          {/* Heading with Character Reveal */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] mb-7 font-display">
            <CharacterRevealText text="Explainable AI" className="gradient-text-vivid block mb-2" />
            <span className="text-[var(--color-text-primary)] font-display block">
              Knowledge Intelligence
            </span>
          </h1>

          {/* Subheading */}
          <motion.p
            className="text-lg sm:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-12 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Ingest any data. Process through visual AI pipelines. Chat with
            complete transparency into every stage of retrieval. Every process
            is{" "}
            <span className="text-[var(--color-brand-400)] font-semibold animate-text-glow">
              clickable and explainable
            </span>
            .
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
          >
            <Link
              href="/register"
              className="btn-primary btn-shimmer px-8 py-4 text-base font-semibold rounded-2xl flex items-center gap-2.5 group shadow-lg shadow-brand/20"
            >
              <Play className="w-5 h-5 fill-white" />
              Launch Studio
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/dashboard"
              className="px-8 py-4 text-base font-medium rounded-2xl glass-interactive flex items-center gap-2.5 group"
            >
              <Zap className="w-5 h-5 text-[var(--color-accent-400)]" />
              View Demo
              <MousePointer2 className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)] transition-colors" />
            </Link>
          </motion.div>
        </div>

        {/* ── Morphing Blob Background behind Ingestion Pipeline ── */}
        <div className="absolute top-2/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-[var(--color-brand-500)]/5 to-[var(--color-accent-500)]/5 filter blur-3xl opacity-60 animate-morph pointer-events-none z-0" />

        {/* ── 3D Perspective Serpentine Ingestion Pipeline ── */}
        <motion.div
          className="max-w-4xl mx-auto mt-28 relative p-10 rounded-3xl glass shadow-2xl border border-[var(--color-border)]/50"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{
            transform: "perspective(1200px) rotateX(15deg) rotateY(-4deg)",
            transformStyle: "preserve-3d",
          }}
        >
          {/* Animated Connecting SVG Path */}
          <PipelineFlowSVG />

          {/* Grid of Nodes */}
          <div className="relative z-10 grid grid-cols-3 gap-y-16 gap-x-8 md:gap-x-16">
            {PIPELINE_STAGES.map((stage, i) => {
              // Determine active border logic
              const isActive = activePipelineStage === i;
              return (
                <motion.div
                  key={stage.label}
                  className="flex items-center justify-center"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <motion.div
                    className={cn(
                      "w-full max-w-[200px] glass rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer border relative select-none",
                      isActive
                        ? "border-[var(--color-brand-400)] shadow-lg glow-brand"
                        : "border-[var(--color-border)]"
                    )}
                    animate={
                      isActive
                        ? {
                            scale: 1.05,
                            z: 20,
                            borderColor: stage.color,
                            boxShadow: `0 10px 30px rgba(0,0,0,0.4), 0 0 18px ${stage.color}40`,
                          }
                        : { scale: 1, z: 0, borderColor: "rgba(255, 255, 255, 0.05)" }
                    }
                    whileHover={{ scale: 1.08, z: 25 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  >
                    {/* Glowing point overlay */}
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 opacity-10 rounded-2xl"
                        style={{
                          background: `radial-gradient(circle at center, ${stage.color}, transparent 75%)`,
                        }}
                      />
                    )}

                    <span className="text-2xl mb-2 block">{stage.icon}</span>
                    <span className="text-xs sm:text-sm font-semibold text-[var(--color-text-primary)] block font-display">
                      {stage.label}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] mt-1 hidden md:block leading-snug">
                      {stage.desc}
                    </span>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </motion.section>

      {/* ── Stats Row ── */}
      <section className="relative py-14 px-6 border-t border-b border-[var(--color-border)]/50 bg-[var(--color-surface-50)]/30 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-4 gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                custom={i}
                variants={fadeInUp}
                className="text-center glass-subtle rounded-2xl p-6 border border-[var(--color-border)]"
              >
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                <p className="text-sm text-[var(--color-text-secondary)] mt-1.5 font-display font-medium">
                  {stat.label}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="relative py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-5 font-display">
              <span className="gradient-text">Everything Visible.</span>{" "}
              Everything Interactive.
            </h2>
            <p className="text-[var(--color-text-secondary)] text-lg max-w-2xl mx-auto leading-relaxed">
              Unlike black-box RAG systems, RAGLense makes every internal
              process transparent, interactive, and debuggable.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {FEATURES.map((feature, i) => (
              <MagneticCard
                key={feature.title}
                color={feature.color}
                gradient={feature.gradient}
                className="glass-card rounded-2xl p-6 cursor-pointer group border border-[var(--color-border)]"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm"
                  style={{
                    background: `${feature.color}15`,
                  }}
                >
                  <feature.icon
                    className="w-6 h-6 transition-all duration-300"
                    style={{ color: feature.color }}
                  />
                </div>
                <h3 className="text-base font-bold mb-2.5 text-[var(--color-text-primary)] group-hover:text-white transition-colors font-display">
                  {feature.title}
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {feature.description}
                </p>
              </MagneticCard>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Orbital Tech Stack ── */}
      <section className="relative py-20 px-6 border-t border-[var(--color-border)]/50">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-2xl font-bold mb-4 text-[var(--color-text-secondary)] font-display">
              Built With Modern Technologies
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto mb-8 leading-normal">
              Fully decoupled architectures powered by state-of-the-art framework foundations.
            </p>

            {/* Orbit animation */}
            <OrbitalTechStack />
          </motion.div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-28 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
            className="glass-card rounded-3xl p-14 relative overflow-hidden"
          >
            {/* Animated border glow */}
            <div className="absolute inset-0 rounded-3xl gradient-border-animated" />

            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold mb-5 gradient-text-vivid font-display">
                Ready to Transform Your Knowledge?
              </h2>
              <p className="text-[var(--color-text-secondary)] mb-10 text-lg max-w-md mx-auto">
                Start building your AI-powered knowledge base in minutes. No credit card required.
              </p>
              <Link
                href="/register"
                className="btn-primary btn-shimmer inline-flex items-center gap-2.5 px-8 py-4 text-base font-semibold rounded-2xl group shadow-lg shadow-brand/20"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--color-border)] py-8 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Brain className="w-5 h-5 text-[var(--color-brand-400)]" />
            <span className="text-sm text-[var(--color-text-tertiary)] font-display">
              RAGLense · Enterprise AI Knowledge Platform
            </span>
          </div>
          <span className="text-sm text-[var(--color-text-muted)] font-mono">
            v0.1.0
          </span>
        </div>
      </footer>
    </div>
  );
}
