"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Mail, Lock, User, Building2, ArrowRight, Github, Chrome, Eye, EyeOff, Sparkles, Shield, Zap } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    organization: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  function updateField(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await apiClient.post("/auth/register", formData);
      setAuth(data.user, data.tokens);
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-[var(--color-surface-0)]">
      {/* ── Background ── */}
      <div className="fixed inset-0 bg-dot-grid opacity-20 pointer-events-none" />
      <div className="fixed inset-0 bg-aurora-animated pointer-events-none" />

      {/* Floating Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-[var(--color-accent-400)]/20"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -40, 0],
              opacity: [0.2, 0.7, 0.2],
            }}
            transition={{
              duration: 5 + Math.random() * 5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* ── Left Side — Branding ── */}
      <div className="hidden lg:flex lg:flex-1 items-center justify-center relative">
        <div className="orb orb-teal w-[400px] h-[400px] top-10 -left-20" />
        <div className="orb orb-violet w-[350px] h-[350px] bottom-20 right-10" />
        <div className="orb orb-rose w-[250px] h-[250px] top-1/2 left-1/3" />

        <motion.div
          className="relative z-10 text-center max-w-md px-12"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}
        >
          <motion.div
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--color-accent-400)] to-[var(--color-brand-500)] flex items-center justify-center mx-auto mb-8 glow-accent cursor-default"
            animate={{ rotate: [0, -5, 5, 0], y: [0, -8, 0], scale: [1, 1.05, 1] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <Brain className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-3xl font-bold font-display mb-4 gradient-text-vivid">
            Join RAGLense
          </h2>
          <p className="text-[var(--color-text-secondary)] text-base leading-relaxed font-display">
            Create your account and start building intelligent knowledge systems in minutes.
          </p>

          {/* Benefits */}
          <div className="mt-10 space-y-3">
            {[
              { icon: Zap, text: "Process 40+ file formats" },
              { icon: Shield, text: "Enterprise-grade security" },
              { icon: Sparkles, text: "Free tier — no credit card" },
            ].map((item, i) => (
              <motion.div
                key={item.text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.15 }}
                className="flex items-center gap-3 glass-subtle rounded-xl px-4 py-3 text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)] shadow-sm"
              >
                <item.icon className="w-4 h-4 text-[var(--color-accent-400)]" />
                {item.text}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Right Side — Form ── */}
      <div className="flex-1 flex items-center justify-center px-6 lg:px-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
          className="w-full max-w-md"
        >
          {/* Logo (mobile) */}
          <div className="text-center mb-8 lg:text-left">
            <Link href="/" className="inline-flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-accent-400)] flex items-center justify-center glow-brand">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight font-display">
                <span className="gradient-text font-display">RAGLense</span>{" "}
                <span className="text-[var(--color-text-secondary)] font-display">Studio</span>
              </span>
            </Link>
            <h1 className="text-2xl font-bold mb-1 font-display">Create your account</h1>
            <p className="text-[var(--color-text-secondary)] text-sm font-display">
              Start building your knowledge intelligence platform
            </p>
          </div>

          <div className="glass-card rounded-2xl p-8 border border-[var(--color-border)] shadow-2xl relative overflow-hidden">
            <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
              <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl glass-interactive text-sm font-medium group border border-[var(--color-border)]">
                <Chrome className="w-4 h-4 group-hover:text-[var(--color-brand-400)] transition-colors" /> Google
              </button>
              <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl glass-interactive text-sm font-medium group border border-[var(--color-border)]">
                <Github className="w-4 h-4 group-hover:text-[var(--color-text-primary)] transition-colors" /> GitHub
              </button>
            </div>

            <div className="relative my-6 relative z-10">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--color-border)]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-[var(--color-surface-100)] text-[var(--color-text-muted)] rounded-full">
                  or continue with email
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-display"
                >
                  {error}
                </motion.div>
              )}

              {/* Full Name Input */}
              <div className="relative">
                <input
                  id="fullname-input"
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField(null)}
                  required
                  placeholder=" "
                  className="peer w-full pl-11 pr-4 pt-6 pb-2 rounded-xl bg-[var(--color-surface-200)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-transparent input-glow transition-all text-sm outline-none"
                />
                <label
                  htmlFor="fullname-input"
                  className={cn(
                    "absolute left-11 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)] transition-all duration-200 pointer-events-none font-display",
                    (focusedField === "name" || formData.full_name) && "top-3.5 text-[10px] text-[var(--color-brand-400)] -translate-y-0"
                  )}
                >
                  Full Name
                </label>
                <User className={cn(
                  "absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors duration-200",
                  (focusedField === "name" || formData.full_name) ? "text-[var(--color-brand-400)]" : "text-[var(--color-text-muted)]"
                )} />
                {/* Underline glow */}
                <div className={cn(
                  "absolute bottom-0 inset-x-4 h-0.5 bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-400)] scale-x-0 transition-transform duration-300",
                  focusedField === "name" && "scale-x-100"
                )} />
              </div>

              {/* Email Input */}
              <div className="relative">
                <input
                  id="email-input"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  required
                  placeholder=" "
                  className="peer w-full pl-11 pr-4 pt-6 pb-2 rounded-xl bg-[var(--color-surface-200)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-transparent input-glow transition-all text-sm outline-none"
                />
                <label
                  htmlFor="email-input"
                  className={cn(
                    "absolute left-11 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)] transition-all duration-200 pointer-events-none font-display",
                    (focusedField === "email" || formData.email) && "top-3.5 text-[10px] text-[var(--color-brand-400)] -translate-y-0"
                  )}
                >
                  Email Address
                </label>
                <Mail className={cn(
                  "absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors duration-200",
                  (focusedField === "email" || formData.email) ? "text-[var(--color-brand-400)]" : "text-[var(--color-text-muted)]"
                )} />
                {/* Underline glow */}
                <div className={cn(
                  "absolute bottom-0 inset-x-4 h-0.5 bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-400)] scale-x-0 transition-transform duration-300",
                  focusedField === "email" && "scale-x-100"
                )} />
              </div>

              {/* Password Input */}
              <div className="relative">
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  required
                  minLength={8}
                  placeholder=" "
                  className="peer w-full pl-11 pr-11 pt-6 pb-2 rounded-xl bg-[var(--color-surface-200)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-transparent input-glow transition-all text-sm outline-none"
                />
                <label
                  htmlFor="password-input"
                  className={cn(
                    "absolute left-11 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)] transition-all duration-200 pointer-events-none font-display",
                    (focusedField === "password" || formData.password) && "top-3.5 text-[10px] text-[var(--color-brand-400)] -translate-y-0"
                  )}
                >
                  Password
                </label>
                <Lock className={cn(
                  "absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors duration-200",
                  (focusedField === "password" || formData.password) ? "text-[var(--color-brand-400)]" : "text-[var(--color-text-muted)]"
                )} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {/* Underline glow */}
                <div className={cn(
                  "absolute bottom-0 inset-x-4 h-0.5 bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-400)] scale-x-0 transition-transform duration-300",
                  focusedField === "password" && "scale-x-100"
                )} />
              </div>

              {/* Organization Input */}
              <div className="relative">
                <input
                  id="org-input"
                  type="text"
                  value={formData.organization}
                  onChange={(e) => updateField("organization", e.target.value)}
                  onFocus={() => setFocusedField("org")}
                  onBlur={() => setFocusedField(null)}
                  placeholder=" "
                  className="peer w-full pl-11 pr-4 pt-6 pb-2 rounded-xl bg-[var(--color-surface-200)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-transparent input-glow transition-all text-sm outline-none"
                />
                <label
                  htmlFor="org-input"
                  className={cn(
                    "absolute left-11 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)] transition-all duration-200 pointer-events-none font-display",
                    (focusedField === "org" || formData.organization) && "top-3.5 text-[10px] text-[var(--color-brand-400)] -translate-y-0"
                  )}
                >
                  Organization (optional)
                </label>
                <Building2 className={cn(
                  "absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors duration-200",
                  (focusedField === "org" || formData.organization) ? "text-[var(--color-brand-400)]" : "text-[var(--color-text-muted)]"
                )} />
                {/* Underline glow */}
                <div className={cn(
                  "absolute bottom-0 inset-x-4 h-0.5 bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-accent-400)] scale-x-0 transition-transform duration-300",
                  focusedField === "org" && "scale-x-100"
                )} />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl btn-primary btn-shimmer flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-50 mt-2 shadow-lg shadow-brand/20"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <> Create Account <ArrowRight className="w-4 h-4" /> </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-[var(--color-text-muted)] mt-6 font-display">
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] font-semibold transition-colors">Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
