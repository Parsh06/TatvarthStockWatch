import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}) {
  const [isConfirming, setIsConfirming] = useState(false)
  const dialogRef = useRef(null)
  const cancelBtnRef = useRef(null)
  const confirmBtnRef = useRef(null)

  // Reset local loading state whenever the dialog is reopened
  useEffect(() => {
    if (isOpen) setIsConfirming(false)
  }, [isOpen])

  // Escape to close + Tab focus trap, so keyboard users can't tab out to the page behind
  useEffect(() => {
    function handleKey(e) {
      if (!isOpen) return
      if (e.key === 'Escape' && !isConfirming) {
        onCancel()
        return
      }
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll('button:not(:disabled)')
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, isConfirming, onCancel])

  // Lock body scroll while open, and focus a sensible default button
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const target = danger ? cancelBtnRef.current : confirmBtnRef.current
    const t = setTimeout(() => target?.focus(), 10)
    return () => {
      document.body.style.overflow = prevOverflow
      clearTimeout(t)
    }
  }, [isOpen, danger])

  if (!isOpen) return null

  async function handleConfirm() {
    if (isConfirming) return
    // Support both sync and async onConfirm handlers without extra setup at call sites
    const result = onConfirm?.()
    if (result && typeof result.then === 'function') {
      setIsConfirming(true)
      try {
        await result
      } finally {
        setIsConfirming(false)
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <style>{`
        @keyframes tswDialogBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tswDialogIn {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tswIconRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.25); }
          50%      { box-shadow: 0 0 0 6px rgba(244,63,94,0); }
        }
      `}</style>

      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        style={{ animation: 'tswDialogBackdrop 0.18s ease-out' }}
        onClick={() => !isConfirming && onCancel()}
      />

      <div
        ref={dialogRef}
        style={{ animation: 'tswDialogIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}
        className="relative bg-surface border border-border rounded-2xl p-5 sm:p-6 w-full max-w-sm
                   shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start gap-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              danger ? 'bg-danger/15' : 'bg-warning/15'
            }`}
            style={danger ? { animation: 'tswIconRing 2s ease-in-out infinite' } : undefined}
          >
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-danger' : 'text-warning'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-dialog-title" className="font-semibold text-textPrimary mb-1 leading-snug">
              {title}
            </h3>
            <p id="confirm-dialog-message" className="text-sm text-textMuted leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {/* Stacks full-width on very small screens so buttons never get cramped or clipped */}
        <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 mt-6 sm:justify-end">
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            disabled={isConfirming}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm font-medium text-textMuted hover:text-textPrimary
                       border border-border hover:border-textMuted rounded-lg transition-all duration-150
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={handleConfirm}
            disabled={isConfirming}
            className={`w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm font-medium text-white rounded-lg
                        transition-all duration-150 flex items-center justify-center gap-2
                        disabled:opacity-70 disabled:cursor-not-allowed
                        ${danger
                          ? 'bg-danger hover:bg-danger/90 shadow-lg shadow-danger/20 hover:shadow-danger/25'
                          : 'bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/25'}
                        ${!isConfirming ? 'hover:-translate-y-0.5' : ''}`}
          >
            {isConfirming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isConfirming ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}