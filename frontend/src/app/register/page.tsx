"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, ArrowRight, ShieldAlert } from "lucide-react";
import { BrandLogo } from "@/components/common/brand-logo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient, getErrorMessage } from "@/lib/api-client";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuthStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("/auth/register", {
        email,
        password,
        full_name: fullName,
        organization: organization || null,
      });

      const { data } = await apiClient.post("/auth/login", { email, password });
      localStorage.setItem("raglens_token", data.access_token);
      setUser(data.user);
      toast.success("Welcome to RAGLens!");
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-[1fr_500px] bg-[var(--color-surface-0)] relative overflow-hidden">
      <div className="absolute inset-0 bg-dot-grid opacity-15 pointer-events-none z-0" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full bg-[var(--color-accent-500)]/5 filter blur-3xl pointer-events-none z-0 animate-float" />

      {/* Left panel */}
      <section className="hidden lg:flex flex-col justify-between p-12 border-r border-[var(--color-border)] bg-[var(--color-surface-50)]/50 backdrop-blur-md relative z-10">
        <Link href="/" className="flex w-fit items-center gap-3">
          <BrandLogo className="h-14 w-48" />
        </Link>

        <div className="max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-4 font-display">
            Start Clean
          </p>
          <h1 className="font-display text-5xl leading-tight font-bold mb-5 font-display">
            Verify your email and upload your first file.
          </h1>
          <div className="space-y-4 mt-8">
            {[
              "Private knowledge bases per user",
              "Drag-and-drop document upload",
              "Trace logs and pipeline runs visualization",
            ].map((item) => (
              <p key={item} className="flex items-center gap-3 text-[var(--color-text-secondary)] text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5 text-[var(--color-success)] flex-shrink-0" />
                {item}
              </p>
            ))}
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-muted)]">
          Already registered?{" "}
          <Link href="/login" className="text-[var(--color-brand-600)] font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </section>

      {/* Right panel / Form */}
      <section className="flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <BrandLogo className="h-16 w-64" />
          </div>

            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-50)]/90 backdrop-blur-xl p-8 shadow-2xl space-y-6">
              <div>
                <h2 className="font-display text-2xl font-bold">Create an Account</h2>
                <p className="mt-1.5 text-xs text-[var(--color-text-muted)] leading-5">
                  Sign up to configure your private knowledge study workspace.
                </p>
              </div>

              {error && (
                <div className="flex gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-semibold text-red-600">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] font-display mb-1.5">
                      Full name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-brand-500)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] font-display mb-1.5">
                      Organization
                    </label>
                    <input
                      type="text"
                      placeholder="Optional"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-brand-500)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] font-display mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="jane@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-brand-500)]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] font-display mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-brand-500)]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] font-display mb-1.5">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-brand-500)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-700)] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="text-center pt-2">
                <p className="text-xs text-[var(--color-text-muted)] font-medium">
                  Already have an account?{" "}
                  <Link href="/login" className="text-[var(--color-brand-600)] font-semibold hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
        </div>
      </section>
    </main>
  );
}
