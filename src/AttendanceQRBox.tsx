// src/AttendanceQRBox.tsx
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Html5QrcodeScanner } from "html5-qrcode";

interface Props {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function AttendanceQRBox({ onScan, onClose }: Props) {
  const divId = useRef(`qr-reader-${Math.random().toString(36).substr(2, 9)}`);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    setScanned(false);

    const config = {
      fps: 10,
      qrbox: 250,
      rememberLastUsedCamera: true,
    };

    const scanner = new Html5QrcodeScanner(divId.current, config, false);
    scannerRef.current = scanner;

    const onDecode = (decoded: string) => {
      if (scanned) return;
      setScanned(true);
      scanner
        .clear() // stop camera
        .catch(() => {})
        .finally(() => {
          onScan(decoded);
        });
    };

    const onError = (err: any) => {
      const msg = `${err}`;
      if (!msg.includes("No MultiFormat Readers")) {
        console.error("QR scan error:", err);
      }
    };

    scanner.render(onDecode, onError);

    return () => {
      scannerRef.current?.clear().catch(() => {});
    };
  }, [onScan, scanned]);

  const restart = () => {
    setScanned(false);
    scannerRef.current
      ?.clear()
      .catch(() => {})
      .then(() => {
        // re-render with same callbacks
        if (!scannerRef.current) return;
        scannerRef.current.render(
          (decoded: string) => {
            if (scanned) return;
            setScanned(true);
            scannerRef.current!
              .clear()
              .catch(() => {})
              .finally(() => onScan(decoded));
          },
          (err: any) => {
            const msg = `${err}`;
            if (!msg.includes("No MultiFormat Readers")) {
              console.error("QR scan error:", err);
            }
          }
        );
      });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", damping: 20 }}
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
    >
      <motion.div
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        exit={{ y: 20 }}
        className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm"
      >
        {/* header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Scan Student QR</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            ✕
          </button>
        </div>

        {/* fixed-size preview */}
        <div
          id={divId.current}
          style={{ width: "100%", height: "300px" }}
          className="mb-4 bg-gray-50"
        />

        {/* controls */}
        <div className="flex justify-between gap-2">
          {scanned && (
            <button
              onClick={restart}
              className="flex-1 px-4 py-2 bg-blue-100 hover:bg-blue-200 rounded-lg"
            >
              Scan another
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
