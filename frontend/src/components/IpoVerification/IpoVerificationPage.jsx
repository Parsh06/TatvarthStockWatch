import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ShieldCheck, RefreshCw, Search, Plus, Trash2, X, ChevronDown, 
  Users, AlertCircle, CheckCircle2, XCircle, Clock, Loader2, 
  Info, FileCheck2, Check, Copy, Sparkles, Building2, UserCheck, CreditCard
} from 'lucide-react'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'

// ── PAN Validation Regex ──────────────────────────────────────────────────────
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export default function IpoVerificationPage() {
  // ── State ───────────────────────────────────────────────────────────────────
  const [symbols, setSymbols] = useState([])
  const [symbolsLoading, setSymbolsLoading] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState(null) // holds { clientId, symbol }
  const [symbolSearch, setSymbolSearch] = useState('')
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false)

  const [identifier, setIdentifier] = useState('')

  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)

  const [applicants, setApplicants] = useState([])
  const [applicantsLoading, setApplicantsLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPan, setNewPan] = useState('')
  const [addingApplicant, setAddingApplicant] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const [bulkVerifying, setBulkVerifying] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [copiedField, setCopiedField] = useState(null)

  // ── Fetch IPO Symbols ───────────────────────────────────────────────────────
  const fetchSymbols = useCallback(async () => {
    setSymbolsLoading(true)
    try {
      const data = await apiClient('/api/ipo/symbols')
      const fetched = data.symbols || []
      setSymbols(fetched)
      // Auto-select first symbol if none selected
      if (fetched.length > 0 && !selectedSymbol) {
        setSelectedSymbol(fetched[0])
      }
    } catch (err) {
      toast.error('Failed to load active IPO issues')
      console.error(err)
    } finally {
      setSymbolsLoading(false)
    }
  }, [selectedSymbol])

  useEffect(() => { fetchSymbols() }, [fetchSymbols])

  // ── Fetch Family Applicants ─────────────────────────────────────────────────
  const fetchApplicants = useCallback(async () => {
    setApplicantsLoading(true)
    try {
      const data = await apiClient('/api/ipo/applicants')
      setApplicants(data.applicants || [])
    } catch (err) {
      console.error(err)
    } finally {
      setApplicantsLoading(false)
    }
  }, [])

  useEffect(() => { fetchApplicants() }, [fetchApplicants])

  // ── Add Applicant ───────────────────────────────────────────────────────────
  async function handleAddApplicant(e) {
    e.preventDefault()
    if (!newName.trim() || !newPan.trim()) return
    const cleanPan = newPan.trim().toUpperCase()
    if (!PAN_REGEX.test(cleanPan)) {
      toast.error('Invalid PAN format (e.g., ABCDE1234F)')
      return
    }
    setAddingApplicant(true)
    try {
      await apiClient('/api/ipo/applicants', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), pan: cleanPan }),
      })
      toast.success(`${newName.trim()} saved to portfolio`)
      setNewName('')
      setNewPan('')
      setShowAddForm(false)
      fetchApplicants()
    } catch (err) {
      toast.error(err.message?.includes('already saved') ? 'This PAN is already in your portfolio' : err.message?.includes('Maximum') ? 'Maximum 10 family applicants allowed' : 'Failed to save applicant')
    } finally {
      setAddingApplicant(false)
    }
  }

  // ── Delete Applicant ────────────────────────────────────────────────────────
  async function handleDeleteApplicant(id) {
    try {
      await apiClient(`/api/ipo/applicants/${id}`, { method: 'DELETE' })
      toast.success('Applicant removed')
      setDeleteConfirm(null)
      fetchApplicants()
    } catch {
      toast.error('Failed to remove applicant')
    }
  }

  // ── Single Verification ─────────────────────────────────────────────────────
  async function handleVerify(e) {
    e.preventDefault()
    if (!selectedSymbol || !identifier.trim()) return
    const cleanId = identifier.trim().toUpperCase()
    if (!PAN_REGEX.test(cleanId)) {
      toast.error('Please enter a valid 10-character PAN number')
      return
    }
    setVerifying(true)
    setVerifyResult(null)
    setBulkResult(null)
    try {
      const data = await apiClient('/api/ipo/verify', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol.clientId,
          verificationType: 'pan',
          identifier: cleanId
        }),
      })
      setVerifyResult(data)
    } catch (err) {
      const msg = err.message || 'Verification failed'
      if (msg.includes('429')) toast.error('Rate limit reached. Please wait a minute.')
      else toast.error(err.error || 'Verification query failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  // ── Bulk Verification ───────────────────────────────────────────────────────
  async function handleBulkVerify() {
    if (!selectedSymbol || applicants.length === 0) return
    setBulkVerifying(true)
    setBulkResult(null)
    setVerifyResult(null)
    try {
      const data = await apiClient('/api/ipo/verify-bulk', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol.clientId,
          applicantIds: applicants.map(a => a.id),
        }),
      })
      setBulkResult(data)
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('429')) toast.error('Rate limit reached. Please wait.')
      else toast.error('Bulk verification query failed. Please try again.')
    } finally {
      setBulkVerifying(false)
    }
  }

  // ── Helper to Copy Text ─────────────────────────────────────────────────────
  function copyToClipboard(text, fieldName) {
    if (!text || text === '—') return
    navigator.clipboard.writeText(text)
    setCopiedField(fieldName)
    toast.success(`Copied ${fieldName}!`)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // Helper to mask demat client ID
  function maskDpId(id) {
    if (!id || id.length < 4) return '—'
    return '*'.repeat(id.length - 4) + id.slice(-4)
  }

  // Filtered symbols
  const filteredSymbols = symbols.filter(s =>
    s.symbol.toLowerCase().includes(symbolSearch.toLowerCase())
  )

  // Validation flags
  const isNameValid = newName.trim().length > 0
  const isPanValid = PAN_REGEX.test(newPan.trim().toUpperCase())

  // Bulk stats calculations
  const totalChecked = bulkResult?.results?.length || 0
  const appliedCount = bulkResult?.results?.filter(r => r.status === 'found').length || 0
  const allottedCount = bulkResult?.results?.filter(r => r.status === 'found' && r.records?.some(rec => rec.allottedShares > 0)).length || 0
  const didNotApplyCount = bulkResult?.results?.filter(r => r.status === 'not_found').length || 0

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 py-4">
      {/* ── HERO HEADER ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/20 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Allotment Verification Engine
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
              IPO Allotment Tracker
              <Sparkles className="w-6 h-6 text-amber-400 hidden sm:inline" />
            </h1>
            <p className="text-sm sm:text-base text-slate-300 max-w-2xl">
              Instant allotment verification & portfolio bid tracking for equity, SME, and debt public offerings.
            </p>
          </div>

          {selectedSymbol && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md self-start md:self-auto">
              <Building2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Offer Selection</p>
                <p className="text-sm font-bold text-white truncate max-w-[200px]">{selectedSymbol.symbol}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT GRID ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT PANEL: Family Applicants (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel rounded-3xl p-6 border border-white/10 shadow-xl bg-slate-900/60 backdrop-blur-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Family Portfolio</h2>
                  <p className="text-xs text-slate-400">{applicants.length}/10 saved applicants</p>
                </div>
              </div>
              
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  showAddForm 
                    ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' 
                    : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:scale-105'
                }`}
                title={showAddForm ? 'Cancel' : 'Add Family Member'}
              >
                {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>

            {/* Add Applicant Drawer */}
            <AnimatePresence>
              {showAddForm && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={handleAddApplicant}
                  className="overflow-hidden mb-5"
                >
                  <div className="space-y-3.5 p-4 rounded-2xl bg-slate-800/40 border border-white/10 shadow-inner">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Add New Applicant</p>
                    
                    {/* Name Input */}
                    <div className="relative">
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Applicant Name (e.g., Father)"
                        maxLength={50}
                        className={`w-full pl-3.5 pr-9 py-2.5 bg-slate-900/80 border rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none transition-all ${
                          isNameValid ? 'border-emerald-500/40 focus:border-emerald-400' : 'border-white/10 focus:border-blue-500/40'
                        }`}
                      />
                      {isNameValid && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Check className="w-3 h-3 text-emerald-400" />
                        </div>
                      )}
                    </div>

                    {/* PAN Input */}
                    <div className="relative">
                      <input
                        type="text"
                        value={newPan}
                        onChange={e => {
                          const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10)
                          setNewPan(val)
                        }}
                        placeholder="PAN Number (10 characters)"
                        maxLength={10}
                        className={`w-full pl-3.5 pr-9 py-2.5 bg-slate-900/80 border rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none transition-all font-mono tracking-wider ${
                          isPanValid ? 'border-emerald-500/40 focus:border-emerald-400' : newPan.length === 10 ? 'border-rose-500/40' : 'border-white/10 focus:border-blue-500/40'
                        }`}
                      />
                      {isPanValid ? (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Check className="w-3 h-3 text-emerald-400" />
                        </div>
                      ) : newPan.length > 0 && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">
                          {newPan.length}/10
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>AES-256 GCM encrypted before storage</span>
                    </div>

                    <button
                      type="submit"
                      disabled={addingApplicant || !isNameValid || !isPanValid}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-500/10"
                    >
                      {addingApplicant ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-slate-950" /> : 'Save to Portfolio'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Applicant List */}
            {applicantsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            ) : applicants.length === 0 ? (
              <div className="text-center py-8 px-4 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                <UserCheck className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-300">No applicants saved yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[220px] mx-auto">
                  Add your PAN and family members to verify all bids in bulk with one click.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 scrollbar-hide">
                {applicants.map(app => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">
                        {app.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{app.name}</p>
                        <p className="text-xs text-slate-400 font-mono tracking-wide">{app.maskedPan}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setDeleteConfirm(app)}
                      className="w-8 h-8 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Bulk Verification Trigger */}
            {applicants.length > 0 && selectedSymbol && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <button
                  onClick={handleBulkVerify}
                  disabled={bulkVerifying}
                  className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {bulkVerifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Querying {applicants.length} Bids...
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4" />
                      Check All Family Bids ({applicants.length})
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Search & Verification Output (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* IPO Query Form */}
          <form onSubmit={handleVerify} className="glass-panel rounded-3xl p-6 sm:p-7 border border-white/10 shadow-xl bg-slate-900/60 backdrop-blur-xl space-y-6">
            
            {/* IPO Dropdown Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  Select IPO Offer
                </label>
                <button
                  type="button"
                  onClick={fetchSymbols}
                  disabled={symbolsLoading}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold transition-all"
                >
                  <RefreshCw className={`w-3 h-3 ${symbolsLoading ? 'animate-spin' : ''}`} />
                  Refresh List
                </button>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border text-sm font-semibold transition-all ${
                    selectedSymbol
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-white shadow-inner'
                      : 'border-white/10 bg-slate-800/50 text-slate-400'
                  } hover:border-emerald-500/50`}
                >
                  <span className="truncate">{selectedSymbol ? selectedSymbol.symbol : 'Select an IPO Offer...'}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${symbolDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {symbolDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute z-30 top-full left-0 right-0 mt-2 bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-2xl"
                    >
                      <div className="p-3 border-b border-white/10">
                        <div className="relative">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={symbolSearch}
                            onChange={e => setSymbolSearch(e.target.value)}
                            placeholder="Search active IPO name..."
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div className="max-h-56 overflow-y-auto scrollbar-hide divide-y divide-white/5">
                        {symbolsLoading ? (
                          <div className="flex items-center justify-center py-8 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin mr-2 text-emerald-400" />
                            Loading registry offers...
                          </div>
                        ) : filteredSymbols.length === 0 ? (
                          <div className="text-center py-6 text-sm text-slate-400">No matching active offers found</div>
                        ) : (
                          filteredSymbols.map(s => (
                            <button
                              key={s.clientId}
                              type="button"
                              onClick={() => {
                                setSelectedSymbol(s)
                                setSymbolDropdownOpen(false)
                                setSymbolSearch('')
                                setVerifyResult(null)
                                setBulkResult(null)
                              }}
                              className={`w-full text-left px-4 py-3 text-sm transition-all flex items-center justify-between ${
                                selectedSymbol?.clientId === s.clientId
                                  ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                                  : 'text-slate-200 hover:bg-white/5'
                              }`}
                            >
                              <span className="truncate">{s.symbol}</span>
                              {selectedSymbol?.clientId === s.clientId && <Check className="w-4 h-4 shrink-0" />}
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Input Method & PAN Field */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              <div className="sm:col-span-12 space-y-2">
                <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                  PAN Number *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={identifier}
                    onChange={e => {
                      const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10)
                      setIdentifier(val)
                    }}
                    placeholder="Enter 10-digit PAN (e.g., ABCDE1234F)"
                    className="w-full pl-4 pr-10 py-3.5 bg-slate-800/50 border border-white/10 rounded-2xl text-sm font-mono text-white tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                  {PAN_REGEX.test(identifier.trim().toUpperCase()) && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={verifying || !selectedSymbol || !PAN_REGEX.test(identifier.trim().toUpperCase())}
              className="w-full py-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 text-white shadow-xl shadow-blue-600/20 hover:shadow-blue-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  Querying Allotment Registry...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Check Allotment Status
                </>
              )}
            </button>
          </form>

          {/* ── SINGLE VERIFICATION RESULT VIEW ───────────────────────────────── */}
          <AnimatePresence mode="wait">
            {verifyResult && (
              <motion.div
                key="single-result"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Result Status Header */}
                <div className={`glass-panel rounded-3xl p-6 border shadow-2xl backdrop-blur-xl ${
                  verifyResult.records?.length > 0
                    ? verifyResult.records.some(r => r.allottedShares > 0)
                      ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900'
                      : 'border-blue-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-900'
                    : 'border-rose-500/30 bg-gradient-to-br from-rose-950/30 via-slate-900 to-slate-900'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {verifyResult.records?.length > 0 ? (
                        verifyResult.records.some(r => r.allottedShares > 0) ? (
                          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                            <Clock className="w-6 h-6" />
                          </div>
                        )
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                          <XCircle className="w-6 h-6" />
                        </div>
                      )}
                      
                      <div>
                        <h3 className="text-xl font-extrabold text-white">
                          {verifyResult.records?.length > 0 
                            ? verifyResult.records.some(r => r.allottedShares > 0)
                              ? 'Congratulations! Shares Allotted'
                              : 'Application Found (Not Allotted)'
                            : 'IPO NOT APPLIED'}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                          {selectedSymbol?.symbol} • PAN: <span className="font-mono text-slate-300">{verifyResult.verification?.maskedIdentifier}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {verifyResult.records?.length === 0 && (
                    <div className="mt-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-1">
                      <p className="font-bold">No active allotment bid record exists for this PAN.</p>
                      <p className="text-slate-400">
                        This indicates that the applicant did not submit an application for this IPO offer, or the bid was not submitted through an eligible intermediary.
                      </p>
                    </div>
                  )}
                </div>

                {/* Record Detail Cards */}
                {verifyResult.records?.map((record, idx) => (
                  <div key={idx} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Applicant & App No Card */}
                      <div className="glass-panel rounded-2xl p-5 border border-white/10 bg-slate-900/60 backdrop-blur-xl space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          <UserCheck className="w-4 h-4 text-emerald-400" />
                          Applicant & Application Info
                        </div>
                        
                        <div className="space-y-3 divide-y divide-white/5">
                          <div className="flex items-center justify-between text-sm pt-1">
                            <span className="text-slate-400">Applicant Name</span>
                            <span className="font-bold text-white text-right">{record.applicantName || '—'}</span>
                          </div>
                          
                          <div className="flex items-center justify-between text-sm pt-2">
                            <span className="text-slate-400">PAN</span>
                            <span className="font-mono font-semibold text-slate-200">{record.maskedPan}</span>
                          </div>

                          <div className="flex items-center justify-between text-sm pt-2">
                            <span className="text-slate-400">Application No</span>
                            <button
                              onClick={() => copyToClipboard(record.applicationNumber, 'Application No')}
                              className="font-mono font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors"
                              title="Click to Copy"
                            >
                              {record.applicationNumber || '—'}
                              {record.applicationNumber && <Copy className="w-3.5 h-3.5 opacity-70" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Shares Allotment Breakdown Card */}
                      <div className="glass-panel rounded-2xl p-5 border border-white/10 bg-slate-900/60 backdrop-blur-xl space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                          Shares Allotment Breakdown
                        </div>

                        <div className="space-y-3 divide-y divide-white/5">
                          <div className="flex items-center justify-between text-sm pt-1">
                            <span className="text-slate-400">Applied Quantity</span>
                            <span className="font-bold text-white">{record.appliedShares != null ? `${record.appliedShares.toLocaleString()} Shares` : '—'}</span>
                          </div>

                          <div className="flex items-center justify-between text-sm pt-2">
                            <span className="text-slate-400">Allotted Quantity</span>
                            <span className={`font-bold ${record.allottedShares > 0 ? 'text-emerald-400 text-base' : 'text-slate-300'}`}>
                              {record.allottedShares != null ? `${record.allottedShares.toLocaleString()} Shares` : '—'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm pt-2">
                            <span className="text-slate-400">Final Allotment Status</span>
                            {record.allottedShares > 0 ? (
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-extrabold">
                                ALLOTTED
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-extrabold">
                                NOT ALLOTTED
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* DP / Demat Account Card */}
                      <div className="glass-panel rounded-2xl p-5 border border-white/10 bg-slate-900/60 backdrop-blur-xl md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Demat Account / Client ID</p>
                          <p className="text-sm font-mono text-slate-300">{maskDpId(record.dpClientId)}</p>
                        </div>
                        {record.dpClientId && record.dpClientId !== '—' && (
                          <button
                            onClick={() => copyToClipboard(record.dpClientId, 'Demat Client ID')}
                            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-all flex items-center gap-1.5 self-start sm:self-auto"
                          >
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            Copy Client ID
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── BULK DASHBOARD RESULTS VIEW ───────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {bulkResult && (
              <motion.div
                key="bulk-result"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Metrics Header Grid */}
                <div className="glass-panel rounded-3xl p-6 border border-white/10 bg-slate-900/60 backdrop-blur-xl space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{selectedSymbol?.symbol} — Family Allotment Summary</h3>
                      <p className="text-xs text-slate-400">{totalChecked} applicant bids verified</p>
                    </div>
                  </div>

                  {/* 4 Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center">
                      <p className="text-2xl font-black text-blue-400">{totalChecked}</p>
                      <p className="text-[10px] font-extrabold text-blue-300 uppercase tracking-wider mt-1">Total Checked</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-center">
                      <p className="text-2xl font-black text-teal-400">{appliedCount}</p>
                      <p className="text-[10px] font-extrabold text-teal-300 uppercase tracking-wider mt-1">Applied</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-center">
                      <p className="text-2xl font-black text-emerald-400">{allottedCount}</p>
                      <p className="text-[10px] font-extrabold text-emerald-300 uppercase tracking-wider mt-1">Allotted</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">
                      <p className="text-2xl font-black text-rose-400">{didNotApplyCount}</p>
                      <p className="text-[10px] font-extrabold text-rose-300 uppercase tracking-wider mt-1">Did Not Apply</p>
                    </div>
                  </div>
                </div>

                {/* Family Applicant Cards Stream */}
                <div className="space-y-3.5">
                  {bulkResult.results?.map(result => (
                    <div
                      key={result.applicantId}
                      className={`glass-panel rounded-2xl p-5 border transition-all ${
                        result.status === 'found'
                          ? result.records?.some(r => r.allottedShares > 0)
                            ? 'border-emerald-500/40 bg-slate-900/80 shadow-lg shadow-emerald-500/5'
                            : 'border-white/10 bg-slate-900/60'
                          : 'border-rose-500/20 bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                            result.status === 'found'
                              ? result.records?.some(r => r.allottedShares > 0)
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}>
                            {result.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{result.name}</p>
                            <p className="text-xs text-slate-400 font-mono tracking-wider">{result.maskedPan}</p>
                          </div>
                        </div>

                        {/* Status Tag */}
                        <div>
                          {result.status === 'found' ? (
                            result.records?.some(r => r.allottedShares > 0) ? (
                              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black tracking-wide">
                                ALLOTTED
                              </span>
                            ) : (
                              <span className="px-3 py-1.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-extrabold tracking-wide">
                                APPLIED (NOT ALLOTTED)
                              </span>
                            )
                          ) : (
                            <span className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-extrabold tracking-wide">
                              IPO NOT APPLIED
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Detail Breakdown for Found Bids */}
                      {result.status === 'found' && result.records?.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3.5 border-t border-white/5">
                          {result.records.map((rec, i) => (
                            <div key={i} className="contents">
                              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                                <p className="text-[10px] uppercase font-bold text-slate-500">Applied</p>
                                <p className="text-xs font-bold text-white mt-0.5">{rec.appliedShares != null ? `${rec.appliedShares.toLocaleString()} Shs` : '—'}</p>
                              </div>
                              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                                <p className="text-[10px] uppercase font-bold text-slate-500">Allotted</p>
                                <p className={`text-xs font-bold mt-0.5 ${rec.allottedShares > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                  {rec.allottedShares != null ? `${rec.allottedShares.toLocaleString()} Shs` : '—'}
                                </p>
                              </div>
                              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                                <p className="text-[10px] uppercase font-bold text-slate-500">App No</p>
                                <p className="text-xs font-mono font-bold text-slate-200 mt-0.5 truncate">{rec.applicationNumber || '—'}</p>
                              </div>
                              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                                <p className="text-[10px] uppercase font-bold text-slate-500">Demat ID</p>
                                <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">{maskDpId(rec.dpClientId)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {result.status === 'not_found' && (
                        <p className="text-xs text-rose-400/70 mt-2.5 pt-2 border-t border-white/5">
                          No active application bid was recorded for this applicant under {selectedSymbol?.symbol}.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-slate-900 border border-white/15 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Remove {deleteConfirm.name}?</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                This will remove the encrypted applicant record from your family portfolio.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-white/5 text-slate-300 hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteApplicant(deleteConfirm.id)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-all"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
