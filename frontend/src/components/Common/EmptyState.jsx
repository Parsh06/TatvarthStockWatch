export default function EmptyState({ title, subtitle, action, secondaryAction, icon: Icon }) {
  return (
    <div className="relative flex flex-col items-center justify-center py-16 px-4 text-center overflow-hidden">
      {/* Ambient glow — quiet echo of the preloader, ties this into the same visual system */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-52 h-52 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative mb-5">
        {/* Faint dashed ring, slowly rotating — reads as "watching / waiting for data" 
            rather than a static "nothing here" box, fitting for a stock-watch app. */}
        <div
          className="absolute -inset-3 rounded-full border border-dashed border-primary/15"
          style={{ animation: 'spin 14s linear infinite' }}
        />
        <div
          className="absolute -inset-6 rounded-full border border-dashed border-primary/[0.07]"
          style={{ animation: 'spin 22s linear infinite reverse' }}
        />

        <div className="relative w-16 h-16 bg-gradient-to-br from-surface to-surface/60 border border-border rounded-2xl flex items-center justify-center shadow-lg shadow-black/20">
          {Icon ? (
            <Icon className="w-7 h-7 text-primary/70" strokeWidth={1.5} />
          ) : (
            <svg className="w-7 h-7 text-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          )}
        </div>
      </div>

      <h3 className="text-base font-semibold text-textPrimary mb-1.5">{title}</h3>
      {subtitle && <p className="text-sm text-textMuted max-w-xs mb-6 leading-relaxed">{subtitle}</p>}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className="group flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg
                         shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5
                         transition-all duration-200 ease-out"
            >
              {action.label}
              <svg
                className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 text-textMuted hover:text-textPrimary text-sm font-medium rounded-lg
                         border border-transparent hover:border-border transition-all duration-200"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}