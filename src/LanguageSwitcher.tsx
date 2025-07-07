import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "th" ? "th" : "en";

  function toggleLang() {
    const newLang = lang === "en" ? "th" : "en";
    i18n.changeLanguage(newLang);
    localStorage.setItem("lang", newLang); // persist choice
  }

  return (
    <button
      type="button"
      onClick={toggleLang}
      className="relative w-14 h-8 rounded-full border-2 border-[#6654b3] bg-white flex items-center px-1 transition"
      aria-label="Toggle language"
      style={{ minWidth: 56 }}
    >
      <span
        className={`absolute left-1 top-1 w-6 h-6 rounded-full bg-[#6654b3] text-white flex items-center justify-center font-bold text-xs transition-transform duration-300 ${
          lang === "th" ? "translate-x-6" : "translate-x-0"
        }`}
      >
        {lang === "en" ? "EN" : "TH"}
      </span>
      <span className="w-full flex justify-between text-[#6654b3] font-bold text-xs px-2 select-none">
        <span>EN</span>
        <span>TH</span>
      </span>
    </button>
  );
}
