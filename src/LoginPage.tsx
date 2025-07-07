import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

export default function LoginPage() {
  const { t } = useTranslation();
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

    const { error } = await supabase.auth.signInWithPassword({
      email: emailClean,
      password: pwClean,
    });

    if (error) {
      setErr(error.message);
    } else {
      navigate("/dashboard");
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 relative">
      {/* Language switcher outside the form */}
      <div className="absolute top-6 right-6 z-10">
        <LanguageSwitcher />
      </div>
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-white p-8 rounded shadow"
      >
        <h2 className="text-2xl font-bold mb-6 text-center">{t("signIn")}</h2>
        <label className="block mb-4">
          <span className="text-sm">{t("email")}</span>
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
          <span className="text-sm">{t("password")}</span>
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
          className="w-full bg-[#6654b3] text-white py-2 rounded hover:bg-[#5542a0] disabled:opacity-50 transition"
        >
          {loading ? t("signingIn") : t("signIn")}
        </button>
        {err && <p className="mt-4 text-red-600 text-center">{err}</p>}
      </form>
    </div>
  );
}
