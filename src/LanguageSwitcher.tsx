import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "th" ? "th" : "en";

  function toggleLang() {
    const newLang = lang === "en" ? "th" : "en";
    i18n.changeLanguage(newLang);
    localStorage.setItem("lang", newLang);
  }

  return (
    <button
      type="button"
      onClick={toggleLang}
      className="relative w-14 h-8 rounded-full border-2 border-[#6654b3] bg-white flex items-center transition overflow-hidden"
      aria-label="Toggle language"
      style={{ minWidth: 56, minHeight: 32 }}
    >
      <span className="w-full flex justify-between font-bold text-[10px] px-2 select-none" style={{ color: "#6654b3" }}>
        <span>EN</span>
        <span>TH</span>
      </span>
      <span
        className="absolute w-[26px] h-[26px] rounded-full bg-[#6654b3] text-white flex items-center justify-center font-bold text-[10px] transition-all duration-300 shadow-sm"
        style={{ top: "50%", transform: `translateY(-50%) translateX(${lang === "th" ? "26px" : "0px"})`, left: 1 }}
      >
        {lang === "en" ? "EN" : "TH"}
      </span>
    </button>
  );
}
