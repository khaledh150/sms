import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import th from "./locales/th.json";

// Try to get language from localStorage, else default to "en"
const savedLng = typeof window !== "undefined" && localStorage.getItem("lang");
const fallbackLng = "en";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      th: { translation: th },
    },
    lng: savedLng || fallbackLng,
    fallbackLng,
    interpolation: {
      escapeValue: false,
    },
  });

// Add this block to extend the window type
declare global {
  interface Window {
    i18n: typeof i18n;
  }
}

if (typeof window !== "undefined") {
  window.i18n = i18n;
}

export default i18n;
