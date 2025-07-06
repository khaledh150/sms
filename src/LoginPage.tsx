// src/LoginPage.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    const emailClean = email.trim().toLowerCase();
    const pwClean = pw.trim();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailClean,
      password: pwClean,
    });

    if (error) {
      setErr(error.message);
    } else {
      // on successful sign in, AuthContext picks up session & profile
      navigate("/dashboard");
    }

    setLoading(false);
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-white p-8 rounded shadow"
      >
        <h2 className="text-2xl font-bold mb-6 text-center">Sign In</h2>
        <label className="block mb-4">
          <span className="text-sm">Email</span>
          <input
            type="email"
            className="mt-1 block w-full border rounded px-3 py-2"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="block mb-6">
          <span className="text-sm">Password</span>
          <input
            type="password"
            className="mt-1 block w-full border rounded px-3 py-2"
            placeholder="••••••••"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Signing In…" : "Sign In"}
        </button>
        {err && <p className="mt-4 text-red-600 text-center">{err}</p>}
      </form>
    </div>
  );
}
