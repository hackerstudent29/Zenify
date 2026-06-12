"use client";

import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConfirmModal() {
 const { confirmModal, closeConfirmModal } = useUIStore();
 const { isOpen, title, message, onConfirm, confirmText, cancelText, type } = confirmModal;

 if (!isOpen) return null;

 const handleConfirm = () => {
 onConfirm();
 closeConfirmModal();
 };

 return (
 <AnimatePresence>
 {isOpen && (
 <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6">
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={closeConfirmModal}
 className="absolute inset-0 bg-black/60 backdrop-blur-sm"
 />

 <motion.div
 initial={{ opacity: 0, scale: 0.95, y: 10 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, y: 10 }}
 transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
 className="relative w-full max-w-[320px] bg-[#1c1c1e] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
 >
 <div className="p-6 space-y-6">
 {/* Header Icon & Title */}
 <div className="flex flex-col items-center text-center space-y-4">
 <div className={cn(
 "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
 type === 'danger' ? "bg-red-500/10 text-red-500" : "bg-brand/10 text-brand"
 )}>
 {type === 'danger' ? <AlertCircle size={24} /> : <Info size={24} />}
 </div>
 <div className="space-y-1">
 <h2 className="text-lg font-bold text-white tracking-tight leading-tight">
 {title}
 </h2>
 <p className="text-[13px] font-medium text-white/40 leading-relaxed px-2">
 {message}
 </p>
 </div>
 </div>

 {/* Action Area */}
 <div className="flex flex-col gap-2 pt-2">
 <motion.button
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 onClick={handleConfirm}
 className={cn(
  "w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-[11px] tracking-widest uppercase transition-all shadow-lg border",
  type === 'danger' ? "bg-black hover:bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-zinc-900 hover:bg-zinc-900 text-brand shadow-brand/10 border-transparent"
  )}
 >
 {confirmText || 'Confirm'}
 </motion.button>
 <button
 onClick={closeConfirmModal}
 className="w-full py-3 text-[11px] font-bold text-white/30 hover:text-white/60 uppercase tracking-widest transition-all bg-white/5 rounded-xl border border-white/5"
 >
 {cancelText || 'Cancel'}
 </button>
 </div>
 </div>
 </motion.div>
 </div>
 )}
 </AnimatePresence>
 );
}
