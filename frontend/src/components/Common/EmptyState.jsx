export default function EmptyState({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 bg-surface border border-border rounded-2xl flex items-center justify-center mb-4">
        {Icon ? (
          <Icon className="w-8 h-8 text-textMuted" />
        ) : (
          <svg className="w-8 h-8 text-textMuted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>
      <h3 className="text-base font-semibold text-textPrimary mb-1">{title}</h3>
      {subtitle && <p className="text-sm text-textMuted max-w-xs mb-4">{subtitle}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
