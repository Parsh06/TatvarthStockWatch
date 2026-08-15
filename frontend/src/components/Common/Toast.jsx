import toast, { Toaster } from 'react-hot-toast'

export { toast }

/* ------------------------------------------------------------------ */
/* Icons — small inline SVGs so this file has zero extra dependencies  */
/* ------------------------------------------------------------------ */
const icons = {
  success: (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <path d="M4 10.5 8 14.5 16 5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 9v4.5M10 6.5v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
}

/* ------------------------------------------------------------------ */
/* Global styles: 3D pop-in/out keyframes + hover lift for custom cards */
/* Injected once; safe to render alongside the Toaster.                 */
/* ------------------------------------------------------------------ */
function ToastStyles() {
  return (
    <style>{`
      @keyframes tswPopIn {
        0%   { opacity: 0; transform: perspective(600px) translateY(-14px) scale(0.92) rotateX(-10deg); }
        60%  { opacity: 1; transform: perspective(600px) translateY(1px) scale(1.01) rotateX(1deg); }
        100% { opacity: 1; transform: perspective(600px) translateY(0) scale(1) rotateX(0deg); }
      }
      @keyframes tswPopOut {
        0%   { opacity: 1; transform: perspective(600px) translateX(0) scale(1) rotateX(0deg); }
        100% { opacity: 0; transform: perspective(600px) translateX(24px) scale(0.94) rotateX(6deg); }
      }
      @keyframes tswProgress {
        from { width: 100%; }
        to   { width: 0%; }
      }
      .tsw-toast { transition: transform 0.18s ease, box-shadow 0.18s ease; }
      .tsw-toast:hover {
        transform: translateY(-2px);
        box-shadow:
          0 2px 2px rgba(0,0,0,0.45),
          0 16px 28px -6px rgba(0,0,0,0.55),
          0 0 0 1px rgba(255,255,255,0.08) inset,
          0 1px 0 0 rgba(255,255,255,0.1) inset;
      }
    `}</style>
  )
}

/* ------------------------------------------------------------------ */
/* Toaster — upgraded default styling                                  */
/* Works immediately with existing toast.success()/toast.error() calls */
/* ------------------------------------------------------------------ */
const baseShadow =
  '0 1px 1px rgba(0,0,0,0.4), 0 12px 24px -6px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 1px 0 0 rgba(255,255,255,0.08) inset'

export function TatvarthStockWatchToaster() {
  return (
    <>
      <ToastStyles />
      <Toaster
        position="top-right"
        gutter={10}
        toastOptions={{
          duration: 4000,
          className: 'tsw-toast',
          style: {
            background: 'linear-gradient(160deg, rgba(30,41,59,0.92), rgba(15,23,42,0.96))',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            color: '#F1F5F9',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontSize: '14px',
            padding: '12px 14px',
            boxShadow: baseShadow,
          },
          success: {
            iconTheme: { primary: '#38E1C6', secondary: '#0F172A' },
            style: { boxShadow: `${baseShadow}, 0 0 0 1px rgba(56,225,198,0.15)`, borderLeft: '3px solid #38E1C6' },
          },
          error: {
            iconTheme: { primary: '#F43F5E', secondary: '#0F172A' },
            style: { boxShadow: `${baseShadow}, 0 0 0 1px rgba(244,63,94,0.15)`, borderLeft: '3px solid #F43F5E' },
          },
          loading: {
            iconTheme: { primary: '#0EA5E9', secondary: '#0F172A' },
            style: { borderLeft: '3px solid #0EA5E9' },
          },
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Optional: richer custom cards with icon badge + live countdown bar  */
/* Use these where you want the full effect; toast.success()/.error()  */
/* elsewhere in the app keep working unchanged with the styling above. */
/* ------------------------------------------------------------------ */
const accents = {
  success: { ring: '#38E1C6', glow: 'rgba(56,225,198,0.18)' },
  error: { ring: '#F43F5E', glow: 'rgba(244,63,94,0.18)' },
  info: { ring: '#F5B942', glow: 'rgba(245,185,66,0.18)' },
}

function ToastCard({ t, type, title, description }) {
  const accent = accents[type]
  return (
    <div
      className="tsw-toast"
      style={{
        animation: `${t.visible ? 'tswPopIn' : 'tswPopOut'} 0.32s cubic-bezier(0.16,1,0.3,1) forwards`,
        background: 'linear-gradient(160deg, rgba(30,41,59,0.94), rgba(15,23,42,0.97))',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        boxShadow: `${baseShadow}, 0 0 24px ${accent.glow}`,
        width: 320,
        maxWidth: '90vw',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
          style={{ background: `${accent.ring}1A`, color: accent.ring, boxShadow: `0 0 0 1px ${accent.ring}33` }}
        >
          {icons[type]}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-[#F1F5F9] leading-tight">{title}</p>
          {description && <p className="text-xs text-[#94A3B8] mt-1 leading-snug">{description}</p>}
        </div>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="text-[#64748B] hover:text-[#F1F5F9] transition-colors shrink-0 mt-0.5"
          aria-label="Dismiss notification"
        >
          <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {/* Live duration countdown — a small but genuinely useful 3D-card detail */}
      <div className="h-0.5 w-full bg-white/[0.04]">
        <div
          style={{
            height: '100%',
            background: accent.ring,
            animation: t.visible ? `tswProgress ${t.duration || 4000}ms linear forwards` : 'none',
          }}
        />
      </div>
    </div>
  )
}

export const notify = {
  success: (title, description) => toast.custom((t) => <ToastCard t={t} type="success" title={title} description={description} />),
  error: (title, description) => toast.custom((t) => <ToastCard t={t} type="error" title={title} description={description} />),
  info: (title, description) => toast.custom((t) => <ToastCard t={t} type="info" title={title} description={description} />),
}