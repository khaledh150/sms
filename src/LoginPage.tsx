import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "./supabaseClient";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { POS } from "./theme";
import Lottie from "lottie-react";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lottieData, setLottieData] = useState<any>(null);

  // Fetch a cute, soft Lottie animation
  useEffect(() => {
    fetch("https://lottie.host/933d6ea6-29a3-487b-bb66-3d7122eefcc2/x5xItQe6D2.json")
      .then(r => r.json()).then(data => setLottieData(data)).catch(e => console.error(e));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password: pw.trim(),
    });
    if (error) setErr(error.message);
    else {
      navigate("/dashboard");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen relative overflow-hidden" style={{ background: "#F4F7FE" }}>
      {/* Interactive Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full floating-blob blue-blob" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full floating-blob pink-blob" style={{ animationDelay: "2s" }} />

      {/* Left Side - Hero Area */}
      <div className="hidden lg:flex flex-col justify-center items-center w-1/2 relative overflow-hidden" style={{ background: POS.primaryGradient }}>
        <div className="z-10 text-center text-white px-10 flex flex-col items-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
            <div className="w-56 h-56 mx-auto mb-8 drop-shadow-2xl">
              {lottieData ? <Lottie animationData={lottieData} loop={true} /> : <div className="w-full h-full bg-white/20 rounded-full animate-pulse" />}
            </div>
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
      <div className="flex-1 flex flex-col justify-center items-center relative z-10 glass">
        <div className="absolute top-6 right-6 z-10"><LanguageSwitcher /></div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-sm px-6">
          <div className="text-center mb-10 lg:hidden">
            <div className="w-32 h-32 mx-auto mb-4 drop-shadow-xl">
              {lottieData ? <Lottie animationData={lottieData} loop={true} /> : <div className="w-full h-full bg-white/20 rounded-full animate-pulse" />}
            </div>
            <h1 className="text-4xl font-bouncy" style={{ color: POS.primary }}>Wonder Kids</h1>
          </div>

          <div className="bg-white/90 p-10 backdrop-blur-xl border border-white shadow-2xl" style={{ borderRadius: "2.5rem" }}>
            <h2 className="text-3xl font-bouncy text-center mb-8" style={{ color: POS.textPrimary }}>{t("signIn")}</h2>

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-bold mb-2 ml-3" style={{ color: POS.textSecondary }}>{t("email")}</label>
                <input type="email" className="w-full bg-[#f8f9fc] border-[3px] border-transparent px-6 py-4 font-bold text-lg focus:outline-none transition-all shadow-inner"
                  style={{ borderRadius: "1.5rem" }}
                  onFocus={e => { e.target.style.borderColor = POS.primaryLight; e.target.style.background = "#fff"; }}
                  onBlur={e => { e.target.style.borderColor = "transparent"; e.target.style.background = "#f8f9fc"; }}
                  placeholder={t("emailPlaceholder")} value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2 ml-3" style={{ color: POS.textSecondary }}>{t("password")}</label>
                <input type="password" className="w-full bg-[#f8f9fc] border-[3px] border-transparent px-6 py-4 font-bold text-lg focus:outline-none transition-all shadow-inner"
                  style={{ borderRadius: "1.5rem" }}
                  onFocus={e => { e.target.style.borderColor = POS.primaryLight; e.target.style.background = "#fff"; }}
                  onBlur={e => { e.target.style.borderColor = "transparent"; e.target.style.background = "#f8f9fc"; }}
                  placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)} required />
              </div>

              <button type="submit" disabled={loading}
                className="btn-gummy w-full text-white py-5 mt-6 font-bouncy text-2xl disabled:opacity-50 tracking-wide"
                style={{ background: POS.primaryGradient, borderRadius: "1.5rem" }}>
                {loading ? t("signingIn") : t("signInBtn")}
              </button>

              {err && (
                <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-center text-sm font-bold p-3" style={{ color: POS.danger, background: POS.dangerLight, borderRadius: POS.radiusSm }}>
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
