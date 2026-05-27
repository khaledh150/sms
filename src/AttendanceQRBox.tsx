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
  const closingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    closingRef.current = false;
    const scannerId = "qr-reader-" + Date.now();
    containerRef.current.id = scannerId;

    const html5Qr = new Html5Qrcode(scannerId);
    let started = false;

    html5Qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
      (decodedText) => {
        if (closingRef.current) return;
        closingRef.current = true;
        html5Qr.stop().catch(() => {});
        scannerRef.current = null;
        onScan(decodedText);
      },
      () => {}
    ).then(() => {
      started = true;
      scannerRef.current = html5Qr;
    }).catch((err: any) => {
      if (closingRef.current) return;
      const msg = err?.message || err?.toString() || "";
      if (msg.includes("NotAllowedError") || msg.includes("Permission denied")) {
        setError(t("cameraPermissionDenied"));
      } else if (msg.includes("NotFoundError") || msg.includes("Requested device not found")) {
        setError(t("cameraNotFound"));
      } else if (msg.includes("NotReadableError")) {
        setError(t("cameraInUse"));
      } else {
        setError(msg || "Camera error");
      }
    });

    return () => {
      closingRef.current = true;
      if (started && scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [onScan, t]);

  async function handleClose() {
    closingRef.current = true;
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
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
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-4">
              <p className="text-white text-sm">{error}</p>
              <button onClick={handleClose}
                className="px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: POS.primary, color: "#fff", minHeight: "auto" }}>
                {t("close")}
              </button>
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
