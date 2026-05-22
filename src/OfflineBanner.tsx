import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiIcon } from "@heroicons/react/24/solid";
import { POS } from "./theme";
import { useTranslation } from "react-i18next";

export default function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-14 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 px-4 text-sm font-semibold"
          style={{ background: POS.warning, color: "#fff" }}
        >
          <WifiIcon className="w-4 h-4" />
          {t("offlineWarning")}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
