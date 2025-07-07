import { useTranslation } from "react-i18next";
import i18n from "./i18n"; // Make sure to import your i18n instance

export default function BillingPage() {
  const { t } = useTranslation();
  return (
    <div key={i18n.language} className="text-2xl font-bold">
      {t("billingComingSoon")}
    </div>
  );
}
