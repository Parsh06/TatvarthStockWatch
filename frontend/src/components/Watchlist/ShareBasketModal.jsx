import React, { useState } from 'react'
import { X, Share2, Copy, Check, MessageCircle, Twitter, Send, ExternalLink, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '../../services/apiClient'

const PRESET_CATEGORIES = [
  'SmallCap',
  'Defence',
  'EV & Auto',
  'Green Energy',
  'Technology',
  'High Dividend',
  'Value',
  'Growth',
  'General',
]

export default function ShareBasketModal({ isOpen, onClose, watchlist = [] }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('SmallCap')
  const [customSlug, setCustomSlug] = useState('')
  const [selectedScripts, setSelectedScripts] = useState(() => new Set(watchlist.map(s => s.id || s.ltdCode || s.symbol)))
  const [submitting, setSubmitting] = useState(false)
  const [generatedBasket, setGeneratedBasket] = useState(null)
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  function toggleScript(id) {
    setSelectedScripts(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedScripts(new Set(watchlist.map(s => s.id || s.ltdCode || s.symbol)))
  }

  function deselectAll() {
    setSelectedScripts(new Set())
  }

  async function handleCreateBasket(e) {
    e.preventDefault()
    if (!title.trim() || title.trim().length < 3) {
      toast.error('Please enter a basket title (at least 3 characters)')
      return
    }

    const scriptsToInclude = watchlist.filter(s => selectedScripts.has(s.id || s.ltdCode || s.symbol)).map(s => ({
      bseCode: s.ltdCode || s.bseCode || '',
      symbol: s.symbol || s.nseSymbol || '',
      scriptName: s.scriptName || s.name || s.symbol || s.ltdCode,
      exchange: s.exchange || 'BOTH',
      notes: s.notes || '',
    }))

    if (scriptsToInclude.length === 0) {
      toast.error('Please select at least 1 script to include in the basket')
      return
    }

    setSubmitting(true)
    try {
      const res = await apiClient.post('/api/baskets', {
        title: title.trim(),
        description: description.trim(),
        category,
        slug: customSlug.trim() || undefined,
        scripts: scriptsToInclude,
      })

      if (res?.success) {
        setGeneratedBasket(res)
        toast.success('Curated basket published successfully!')
      } else {
        toast.error(res?.error || 'Failed to create basket')
      }
    } catch (err) {
      toast.error(err.message || 'Error publishing basket')
    } finally {
      setSubmitting(false)
    }
  }

  const shareUrl = generatedBasket ? `${window.location.origin}/basket/${generatedBasket.slug}` : ''

  function copyToClipboard() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    toast.success('Link copied to clipboard!')
    setTimeout(() => setCopied(false), 2500)
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(`📊 Check out my curated stock basket "${title || generatedBasket?.basket?.title}" on StockWatch:\n${shareUrl}\n\nView live announcements, financial results, and import in 1-tap!`)
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank')
  }

  function shareTwitter() {
    const text = encodeURIComponent(`Check out my curated stock basket "${title || generatedBasket?.basket?.title}" on @StockWatch!\n\nLive corporate filings & 1-tap import 👇\n`)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`, '_blank')
  }

  function shareTelegram() {
    const text = encodeURIComponent(`📊 Curated Stock Basket: "${title || generatedBasket?.basket?.title}"\nLive corporate announcements & 1-tap import`)
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${text}`, '_blank')
  }

  function handleReset() {
    setGeneratedBasket(null)
    setTitle('')
    setDescription('')
    setCustomSlug('')
    selectAll()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl p-6 text-textPrimary flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-textPrimary flex items-center gap-2">
                Share Curated Watchlist Basket
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h2>
              <p className="text-xs text-textMuted">Generate a public link with live filings & 1-tap import for WhatsApp/X/Telegram</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-surfaceHover transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
          {generatedBasket ? (
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-emerald-400">
                  <Check className="w-5 h-5" />
                  <span>Basket Published & Ready to Share!</span>
                </div>
                <p className="text-xs text-emerald-200/80">
                  Anyone with this link can inspect live filings, financial results, and import these stocks into their own watchlist in 1 tap.
                </p>
              </div>

              {/* Share link input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-textMuted uppercase tracking-wider">Public Share Link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-xl text-textPrimary font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-xl transition shadow-sm"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* 1-Click Social Viral Buttons */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-textMuted uppercase tracking-wider">Share Instantly To Communities</label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    onClick={shareWhatsApp}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#25D366] text-xs font-semibold transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    onClick={shareTwitter}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 text-xs font-semibold transition"
                  >
                    <Twitter className="w-4 h-4" />
                    <span>X / Twitter</span>
                  </button>
                  <button
                    onClick={shareTelegram}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#0088cc]/15 hover:bg-[#0088cc]/25 border border-[#0088cc]/30 text-[#0088cc] text-xs font-semibold transition"
                  >
                    <Send className="w-4 h-4" />
                    <span>Telegram</span>
                  </button>
                </div>
              </div>

              {/* View page link */}
              <div className="pt-2 flex items-center justify-between border-t border-border">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Preview Public Basket Page</span>
                </a>
                <button
                  onClick={handleReset}
                  className="text-xs text-textMuted hover:text-textPrimary transition"
                >
                  Create Another Basket
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateBasket} className="space-y-4">
              {/* Basket Title */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-textMuted">Basket Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Defence & Drone Leaders, EV Value Picks"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-textPrimary placeholder:text-textMuted/50 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Category & Slug in 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-textMuted">Theme / Category</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-textPrimary focus:outline-none focus:border-primary"
                  >
                    {PRESET_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-textMuted">Custom Link Slug (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. defence-smallcaps"
                    value={customSlug}
                    onChange={e => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-textPrimary placeholder:text-textMuted/50 focus:outline-none focus:border-primary font-mono text-xs"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-textMuted">Thesis / Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Short thesis for investors (order books, Capex cycle, high dividend yield...)"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-textPrimary placeholder:text-textMuted/50 focus:outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Script Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-textMuted">
                    Select Stocks to Include ({selectedScripts.size}/{watchlist.length})
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button type="button" onClick={selectAll} className="text-primary hover:underline">Select All</button>
                    <span className="text-border">|</span>
                    <button type="button" onClick={deselectAll} className="text-textMuted hover:text-textPrimary">Clear</button>
                  </div>
                </div>

                <div className="max-h-44 overflow-y-auto border border-border rounded-xl divide-y divide-border/60 bg-background/50 p-1">
                  {watchlist.map(s => {
                    const id = s.id || s.ltdCode || s.symbol
                    const isChecked = selectedScripts.has(id)
                    return (
                      <label
                        key={id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface transition cursor-pointer select-none text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleScript(id)}
                            className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                          />
                          <div>
                            <span className="font-semibold text-textPrimary">{s.scriptName || s.symbol || s.ltdCode}</span>
                            <span className="ml-2 font-mono text-textMuted">{s.symbol || s.ltdCode}</span>
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface border border-border text-textMuted">
                          {s.exchange || 'BSE'}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Submit CTA */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-textMuted hover:text-textPrimary hover:bg-surfaceHover transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedScripts.size === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition disabled:opacity-50 shadow-md shadow-primary/20"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      <span>Publish Public Basket</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
