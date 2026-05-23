import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { POS } from "./theme";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { Html5Qrcode } from "html5-qrcode";

interface Props {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function AttendanceQRBox({ onScan, onClose }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const scannerId = "qr-reader-" + Date.now();
    containerRef.current.id = scannerId;

    const html5Qr = new Html5Qrcode(scannerId);
    scannerRef.current = html5Qr;

    html5Qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
      (decodedText) => {
        html5Qr.stop().catch(() => {});
        scannerRef.current = null;
        onScan(decodedText);
      },
      () => {}
    ).catch((err: any) => {
      setError(err?.message || err?.toString() || "Camera access denied");
    });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [onScan]);

  function handleClose() {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)" }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="text-lg font-bouncy" style={{ color: POS.primary }}>{t("scanStudentQr")}</h3>
          <button onClick={handleClose}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: POS.bgSurface, minHeight: "auto" }}>
            <XMarkIcon className="w-5 h-5" style={{ color: POS.textMuted }} />
          </button>
        </div>

        <div className="relative bg-black" style={{ aspectRatio: "1/1" }}>
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-white text-sm">{error}</p>
            </div>
          ) : (
            <div ref={containerRef} className="w-full h-full" />
          )}
        </div>

        <div className="px-5 py-4">
          <button onClick={handleClose}
            className="w-full py-3 rounded-xl border font-bold text-sm"
            style={{ borderColor: POS.border, color: POS.textSecondary }}>
            {t("cancel")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
