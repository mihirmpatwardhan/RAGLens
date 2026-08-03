"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Brain, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await apiClient.post("/auth/login", { email, password });
      localStorage.setItem("raglens_token", data.access_token);
      setUser(data.user);
      toast.success("Welcome back!");
      // Honour returnTo param set by the 401 interceptor
      const returnTo = searchParams.get("returnTo");
      router.push(returnTo ? decodeURIComponent(returnTo) : "/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className={cn(
        "flex min-h-screen items-center justify-center",
        "bg-[var(--color-surface-0)] relative overflow-hidden p-4",
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Subtle background */}
      <div className="absolute inset-0 bg-dot-grid opacity-15 pointer-events-none z-0" />
      <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-[var(--color-brand-500)]/5 filter blur-3xl pointer-events-none z-0" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="w-10 h-10 rounded-xl bg-[var(--color-brand-600)] text-white flex items-center justify-center shadow-md">
            <Brain className="w-5 h-5" />
          </span>
          <span className="font-display text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
            RAGLens
          </span>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)]/90 backdrop-blur-xl p-8 shadow-xl space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold font-display text-[var(--color-text-primary)]">
              Welcome Back
            </h1>
            <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
              Sign in to access your knowledge bases and chat.
            </p>
          </div>

          {error && (
            <div className="flex gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-semibold text-red-600">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] font-display mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="jane@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/15 placeholder:text-[var(--color-text-muted)]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] font-display mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 pr-12 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/15 placeholder:text-[var(--color-text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white transition-colors h-12 font-semibold text-sm rounded-xl"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="text-center text-sm text-[var(--color-text-muted)]">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] hover:underline font-semibold transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Wrap in Suspense because useSearchParams() requires it in Next.js App Router
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-0)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-brand-600)]" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
