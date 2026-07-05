import { ExternalLink, FileText, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { getCategoryColor, getExchangeColor, formatRelativeDate } from '../../utils/formatters'
import AiSummaryCard from './AiSummaryCard'

export default function AnnouncementCard({ announcement: a, read = false, onRead }) {
  const navigate = useNavigate()

  // Normalise field names
  const code       = a.scriptCode  || a.scripCode  || a.ltdCode  || ''
  const name       = a.scriptName  || a.companyName || code
  const subject    = a.subject     || a.headline    || a.description || ''
  const dateStr    = a.datetimeIST || a.announcementDate || a.date || ''
  const pdfUrl     = a.pdfUrl
  const sourceLink = a.sourceUrl   || a.url         || a.link    || null
  const exchange   = a.exchange    || 'BSE'
  const isUnread   = !read

  const accentColor = exchange === 'NSE' ? 'bg-orange-400' : 'bg-blue-400'

  function handleCardClick() {
    if (onRead) onRead(a.id)
  }

  function handleCompanyClick(e) {
    e.stopPropagation()
    if (onRead) onRead(a.id)
    if (code) {
      navigate('/company-data', {
        state: { script: { bseCode: code, scripName: name, symbol: a.nseSymbol || '' } }
      })
    }
  }

  return (
    <div
      onClick={handleCardClick}
      className={clsx(
        'bg-surface border border-border rounded-xl p-4 flex gap-3 hover:border-primary/40 transition group cursor-pointer',
        isUnread && 'ring-1 ring-primary/20'
      )}
    >
      {/* Color accent bar */}
      <div className={clsx('w-1 rounded-full flex-shrink-0', accentColor)} style={{ minHeight: 60 }} />

      <div className="flex-1 min-w-0">
        {/* Top row */}
        <div className="flex items-center flex-wrap gap-2 mb-2">
          {isUnread && (
            <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-xs font-bold rounded">NEW</span>
          )}
          <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', getExchangeColor(exchange))}>
            {exchange}
          </span>
          {a.category && (
            <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', getCategoryColor(a.category))}>
              {a.category}
            </span>
          )}
          {a.critical && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 font-semibold">
              CRITICAL
            </span>
          )}
          {a.isWatchlisted && (
            <Star className="w-3.5 h-3.5 text-warning fill-warning flex-shrink-0" />
          )}
        </div>

        {/* Company name + code — clickable to Company Data page */}
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={handleCompanyClick}
            className="text-sm font-medium text-textPrimary hover:text-primary transition text-left"
            title={`View ${name} company data`}
          >
            {name}
          </button>
          {code && (
            <code className="text-xs font-mono text-textMuted bg-background px-1.5 py-0.5 rounded">
              {code}
            </code>
          )}
        </div>

        {/* Subject */}
        <p className="text-sm text-textMuted line-clamp-2 mb-2">{subject}</p>

        {/* AI Summary */}
        {a.aiSummary && <AiSummaryCard summary={a.aiSummary} />}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-textMuted">{formatRelativeDate(dateStr)}</span>
          <div className="flex items-center gap-2">
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="p-1.5 text-textMuted hover:text-primary transition rounded"
                title="View PDF"
              >
                <FileText className="w-3.5 h-3.5" />
              </a>
            )}
            {sourceLink && (
              <a
                href={sourceLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="p-1.5 text-textMuted hover:text-primary transition rounded"
                title="View on BSE"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
