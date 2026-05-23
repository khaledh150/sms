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

export default i18n;
