"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(data.error ?? "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <p className="text-xs font-bold tracking-[0.25em] uppercase text-[#e8ff47] mb-1">
            blablabuild
          </p>
          <p className="text-neutral-600 text-xs tracking-widest uppercase">
            Revenue ops
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500 uppercase tracking-widest">
              Email address
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@blablabuild.com"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-700 outline-none focus:border-neutral-600 transition-colors font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500 uppercase tracking-widest">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-700 outline-none focus:border-neutral-600 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#e8ff47] hover:bg-[#d4eb30] disabled:opacity-50 text-neutral-950 font-semibold py-3 rounded-lg text-sm transition-colors mt-2"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-700 mt-8">
          Talk less. Build more.
        </p>
      </div>
    </div>
  );
}
