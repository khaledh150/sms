import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, InformationCircleIcon } from "@heroicons/react/24/solid";

type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: number; message: string; type: ToastType }

const ToastCtx = createContext<{
  toast: (msg: string, type?: ToastType) => void;
}>({ toast: () => {} });

export function useToast() { return useContext(ToastCtx); }

let nextId = 0;

const ICONS = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon,
};
const COLORS = {
  success: { bg: "#F0FFF4", border: "#38A169", text: "#276749", icon: "#38A169" },
  error: { bg: "#FFF5F5", border: "#E53E3E", text: "#9B2C2C", icon: "#E53E3E" },
  warning: { bg: "#FFFFF0", border: "#D69E2E", text: "#744210", icon: "#D69E2E" },
  info: { bg: "#EBF8FF", border: "#3182CE", text: "#2A4365", icon: "#3182CE" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[90%] max-w-md pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => {
            const Icon = ICONS[t.type];
            const c = COLORS[t.type];
            return (
              <motion.div key={t.id}
                initial={{ y: 40, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 40, opacity: 0, scale: 0.95 }}
                className="pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl border-2 backdrop-blur-sm"
                style={{ background: c.bg, borderColor: c.border, color: c.text }}
              >
                <Icon className="w-6 h-6 shrink-0" style={{ color: c.icon }} />
                <span className="flex-1 font-bold text-sm">{t.message}</span>
                <button onClick={() => dismiss(t.id)} className="text-lg font-bold opacity-50 hover:opacity-100 shrink-0" aria-label="Dismiss">×</button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
