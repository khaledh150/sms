import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { POS } from "./theme";


export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    let loginEmail = email.trim().toLowerCase();
    if (!loginEmail.includes("@")) loginEmail += "@school.local";
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail, password: pw.trim(),
    });
    if (error) setErr(error.message);
    setLoading(false);
  }

  return (
    <div className="flex h-[100dvh] relative overflow-hidden" style={{ background: "#F4F7FE" }}>
      {/* Interactive Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full floating-blob blue-blob" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full floating-blob pink-blob" style={{ animationDelay: "2s" }} />

      {/* Left Side - Hero Area */}
      <div className="hidden lg:flex flex-col justify-center items-center w-1/2 relative overflow-hidden" style={{ background: POS.primaryGradient }}>
        <div className="z-10 text-center text-white px-10 flex flex-col items-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
            <img src="/logo.webp" alt="Wonder Kids" className="w-72 h-72 mx-auto mb-6 drop-shadow-2xl object-contain" />
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-6xl font-bouncy mb-4 drop-shadow-lg">
            Wonder Kids
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-2xl font-bold max-w-sm mx-auto opacity-90 drop-shadow-md">
            {t("schoolTagline")}
          </motion.p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex flex-col justify-start lg:justify-center items-center relative z-10 glass overflow-y-auto pt-4 sm:pt-8 lg:pt-0">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10"><LanguageSwitcher /></div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-sm px-4 sm:px-6">
          <div className="text-center mb-4 sm:mb-6 lg:hidden">
            <img src="/logo.webp" alt="Wonder Kids" className="w-36 h-36 sm:w-44 sm:h-44 mx-auto mb-2 sm:mb-3 drop-shadow-xl object-contain" />
            <h1 className="text-3xl sm:text-4xl font-bouncy" style={{ color: POS.primary }}>Wonder Kids</h1>
            <p className="text-xs sm:text-sm font-bold mt-1" style={{ color: POS.textMuted }}>{t("schoolTagline")}</p>
          </div>

          <div className="bg-white/90 p-6 sm:p-10 backdrop-blur-xl border border-white shadow-2xl" style={{ borderRadius: "2rem" }}>
            <h2 className="text-2xl sm:text-3xl font-bouncy text-center mb-5 sm:mb-8" style={{ color: POS.textPrimary }}>{t("signIn")}</h2>

            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
              <div>
                <label className="block text-sm font-bold mb-1.5 sm:mb-2 ml-3" style={{ color: POS.textSecondary }}>{t("username")}</label>
                <input type="text" className="w-full bg-[#f8f9fc] border-[3px] border-transparent px-5 py-3 sm:px-6 sm:py-4 font-bold text-base sm:text-lg focus:outline-none transition-all shadow-inner"
                  style={{ borderRadius: "1.25rem" }}
                  onFocus={e => { e.target.style.borderColor = POS.primaryLight; e.target.style.background = "#fff"; }}
                  onBlur={e => { e.target.style.borderColor = "transparent"; e.target.style.background = "#f8f9fc"; }}
                  placeholder={t("usernamePlaceholder")} value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1.5 sm:mb-2 ml-3" style={{ color: POS.textSecondary }}>{t("password")}</label>
                <input type="password" className="w-full bg-[#f8f9fc] border-[3px] border-transparent px-5 py-3 sm:px-6 sm:py-4 font-bold text-base sm:text-lg focus:outline-none transition-all shadow-inner"
                  style={{ borderRadius: "1.25rem" }}
                  onFocus={e => { e.target.style.borderColor = POS.primaryLight; e.target.style.background = "#fff"; }}
                  onBlur={e => { e.target.style.borderColor = "transparent"; e.target.style.background = "#f8f9fc"; }}
                  placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)} required />
              </div>

              <button type="submit" disabled={loading}
                className="btn-gummy w-full text-white py-4 sm:py-5 mt-4 sm:mt-6 font-bouncy text-xl sm:text-2xl disabled:opacity-50 tracking-wide"
                style={{ background: POS.primaryGradient, borderRadius: "1.25rem" }}>
                {loading ? t("signingIn") : t("signInBtn")}
              </button>

              {err && (
                <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-center text-sm font-bold p-3" style={{ color: POS.danger, background: POS.dangerLight, borderRadius: POS.radiusSm }}>
                  {err}
                </motion.p>
              )}
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
