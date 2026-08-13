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
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      
      {/* ── HEADER BANNER ────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Live Allotment Verification Engine
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-textPrimary tracking-tight flex items-center gap-3">
              IPO Allotment Tracker
              <Sparkles className="w-6 h-6 text-amber-500 hidden sm:inline" />
            </h1>
            <p className="text-sm sm:text-base text-textMuted max-w-2xl">
              Verify application status & allotment records seamlessly across family portfolios.
            </p>
          </div>

          {selectedSymbol && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surfaceHover border border-border self-start md:self-auto">
              <Building2 className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-[10px] uppercase font-bold text-textMuted tracking-wider">Active Offer Selection</p>
                <p className="text-sm font-bold text-textPrimary truncate max-w-[200px]">{selectedSymbol.symbol}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT GRID ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT PANEL: Family Applicants (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface rounded-3xl p-6 border border-border shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-textPrimary">Family Portfolio</h2>
                  <p className="text-xs text-textMuted">{applicants.length}/10 saved applicants</p>
                </div>
              </div>
              
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  showAddForm 
                    ? 'bg-danger/10 text-danger hover:bg-danger/20' 
                    : 'bg-primary/10 text-primary hover:bg-primary/20 hover:scale-105'
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
                  <div className="space-y-3.5 p-4 rounded-2xl bg-surfaceHover border border-border">
                    <p className="text-xs font-bold text-textMuted uppercase tracking-wider">Add New Applicant</p>
                    
                    <div className="relative">
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Applicant Name (e.g., Father)"
                        maxLength={50}
                        className={`w-full pl-3.5 pr-9 py-2.5 bg-background border rounded-xl text-sm text-textPrimary placeholder:text-textMuted focus:outline-none transition-all ${
                          isNameValid ? 'border-success/40 focus:border-success' : 'border-border focus:border-primary/40'
                        }`}
                      />
                      {isNameValid && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-success/20 flex items-center justify-center">
                          <Check className="w-3 h-3 text-success" />
                        </div>
                      )}
                    </div>

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
                        className={`w-full pl-3.5 pr-9 py-2.5 bg-background border rounded-xl text-sm text-textPrimary placeholder:text-textMuted focus:outline-none transition-all font-mono tracking-wider ${
                          isPanValid ? 'border-success/40 focus:border-success' : newPan.length === 10 ? 'border-danger/40' : 'border-border focus:border-primary/40'
                        }`}
                      />
                      {isPanValid ? (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-success/20 flex items-center justify-center">
                          <Check className="w-3 h-3 text-success" />
                        </div>
                      ) : newPan.length > 0 && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-textMuted">
                          {newPan.length}/10
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-textMuted">
                      <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" />
                      <span>AES-256 GCM encrypted before storage</span>
                    </div>

                    <button
                      type="submit"
                      disabled={addingApplicant || !isNameValid || !isPanValid}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primaryHover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      {addingApplicant ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-white" /> : 'Save to Portfolio'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Applicant List */}
            {applicantsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : applicants.length === 0 ? (
              <div className="text-center py-8 px-4 border border-dashed border-border rounded-2xl bg-surfaceHover/50">
                <UserCheck className="w-10 h-10 text-textMuted mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold text-textPrimary">No applicants saved yet</p>
                <p className="text-xs text-textMuted mt-1 max-w-[220px] mx-auto">
                  Add your PAN and family members to verify all bids in bulk with one click.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 scrollbar-hide">
                {applicants.map(app => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-surfaceHover border border-border group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {app.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-textPrimary truncate">{app.name}</p>
                        <p className="text-xs text-textMuted font-mono tracking-wide">{app.maskedPan}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setDeleteConfirm(app)}
                      className="w-8 h-8 rounded-xl text-textMuted hover:text-danger hover:bg-danger/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
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
              <div className="mt-6 pt-4 border-t border-border">
                <button
                  onClick={handleBulkVerify}
                  disabled={bulkVerifying}
                  className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-primary text-white hover:bg-primaryHover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
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
          <form onSubmit={handleVerify} className="bg-surface rounded-3xl p-6 sm:p-7 border border-border shadow-sm space-y-6">
            
            {/* IPO Dropdown Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-textMuted uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  Select IPO Offer
                </label>
                <button
                  type="button"
                  onClick={fetchSymbols}
                  disabled={symbolsLoading}
                  className="text-xs text-primary hover:text-primaryHover flex items-center gap-1 font-semibold transition-all"
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
                      ? 'border-primary/40 bg-primary/5 text-textPrimary'
                      : 'border-border bg-background text-textMuted'
                  } hover:border-primary/50`}
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
                      className="absolute z-30 top-full left-0 right-0 mt-2 bg-surface border border-border rounded-2xl shadow-xl overflow-hidden"
                    >
                      <div className="p-3 border-b border-border">
                        <div className="relative">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                          <input
                            type="text"
                            value={symbolSearch}
                            onChange={e => setSymbolSearch(e.target.value)}
                            placeholder="Search active IPO name..."
                            className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-primary/50"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div className="max-h-56 overflow-y-auto scrollbar-hide divide-y divide-border">
                        {symbolsLoading ? (
                          <div className="flex items-center justify-center py-8 text-textMuted">
                            <Loader2 className="w-5 h-5 animate-spin mr-2 text-primary" />
                            Loading registry offers...
                          </div>
                        ) : filteredSymbols.length === 0 ? (
                          <div className="text-center py-6 text-sm text-textMuted">No matching active offers found</div>
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
                                  ? 'bg-primary/10 text-primary font-bold'
                                  : 'text-textPrimary hover:bg-surfaceHover'
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
                <label className="text-xs font-extrabold text-textMuted uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-primary" />
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
                    className="w-full pl-4 pr-10 py-3.5 bg-background border border-border rounded-2xl text-sm font-mono text-textPrimary tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-textMuted focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                  {PAN_REGEX.test(identifier.trim().toUpperCase()) && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-success/20 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-success" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={verifying || !selectedSymbol || !PAN_REGEX.test(identifier.trim().toUpperCase())}
              className="w-full py-4 rounded-2xl font-bold text-sm bg-primary text-white hover:bg-primaryHover disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
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
                <div className={`bg-surface rounded-3xl p-6 border shadow-sm ${
                  verifyResult.records?.length > 0
                    ? verifyResult.records.some(r => r.allottedShares > 0)
                      ? 'border-success/40'
                      : 'border-primary/30'
                    : 'border-danger/30'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {verifyResult.records?.length > 0 ? (
                        verifyResult.records.some(r => r.allottedShares > 0) ? (
                          <div className="w-12 h-12 rounded-2xl bg-success/10 border border-success/30 flex items-center justify-center text-success shrink-0">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                            <Clock className="w-6 h-6" />
                          </div>
                        )
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-danger/10 border border-danger/30 flex items-center justify-center text-danger shrink-0">
                          <XCircle className="w-6 h-6" />
                        </div>
                      )}
                      
                      <div>
                        <h3 className="text-xl font-extrabold text-textPrimary">
                          {verifyResult.records?.length > 0 
                            ? verifyResult.records.some(r => r.allottedShares > 0)
                              ? 'Congratulations! Shares Allotted'
                              : 'Application Found (Not Allotted)'
                            : 'IPO NOT APPLIED'}
                        </h3>
                        <p className="text-xs text-textMuted font-medium">
                          {selectedSymbol?.symbol} • PAN: <span className="font-mono text-textPrimary">{verifyResult.verification?.maskedIdentifier}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {verifyResult.records?.length === 0 && (
                    <div className="mt-4 p-4 rounded-2xl bg-danger/5 border border-danger/20 text-xs text-danger space-y-1">
                      <p className="font-bold">No active allotment bid record exists for this PAN.</p>
                      <p className="opacity-90">
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
                      <div className="bg-surface rounded-2xl p-5 border border-border shadow-sm space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-textMuted uppercase tracking-wider">
                          <UserCheck className="w-4 h-4 text-primary" />
                          Applicant & Application Info
                        </div>
                        
                        <div className="space-y-3 divide-y divide-border">
                          <div className="flex items-center justify-between text-sm pt-1">
                            <span className="text-textMuted">Applicant Name</span>
                            <span className="font-bold text-textPrimary text-right">{record.applicantName || '—'}</span>
                          </div>
                          
                          <div className="flex items-center justify-between text-sm pt-2">
                            <span className="text-textMuted">PAN</span>
                            <span className="font-mono font-semibold text-textPrimary">{record.maskedPan}</span>
                          </div>

                          <div className="flex items-center justify-between text-sm pt-2">
                            <span className="text-textMuted">Application No</span>
                            <button
                              onClick={() => copyToClipboard(record.applicationNumber, 'Application No')}
                              className="font-mono font-bold text-primary hover:text-primaryHover flex items-center gap-1.5 transition-colors"
                              title="Click to Copy"
                            >
                              {record.applicationNumber || '—'}
                              {record.applicationNumber && <Copy className="w-3.5 h-3.5 opacity-70" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Shares Allotment Breakdown Card */}
                      <div className="bg-surface rounded-2xl p-5 border border-border shadow-sm space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-textMuted uppercase tracking-wider">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          Shares Allotment Breakdown
                        </div>

                        <div className="space-y-3 divide-y divide-border">
                          <div className="flex items-center justify-between text-sm pt-1">
                            <span className="text-textMuted">Applied Quantity</span>
                            <span className="font-bold text-textPrimary">{record.appliedShares != null ? `${record.appliedShares.toLocaleString()} Shares` : '—'}</span>
                          </div>

                          <div className="flex items-center justify-between text-sm pt-2">
                            <span className="text-textMuted">Allotted Quantity</span>
                            <span className={`font-bold ${record.allottedShares > 0 ? 'text-success text-base' : 'text-textPrimary'}`}>
                              {record.allottedShares != null ? `${record.allottedShares.toLocaleString()} Shares` : '—'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm pt-2">
                            <span className="text-textMuted">Final Allotment Status</span>
                            {record.allottedShares > 0 ? (
                              <span className="px-2.5 py-1 rounded-lg bg-success/10 text-success border border-success/20 text-xs font-extrabold">
                                ALLOTTED
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-danger/10 text-danger border border-danger/20 text-xs font-extrabold">
                                NOT ALLOTTED
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* DP / Demat Account Card */}
                      <div className="bg-surface rounded-2xl p-5 border border-border shadow-sm md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-textMuted uppercase tracking-wider">Demat Account / Client ID</p>
                          <p className="text-sm font-mono text-textPrimary">{maskDpId(record.dpClientId)}</p>
                        </div>
                        {record.dpClientId && record.dpClientId !== '—' && (
                          <button
                            onClick={() => copyToClipboard(record.dpClientId, 'Demat Client ID')}
                            className="px-3.5 py-2 rounded-xl bg-surfaceHover border border-border text-xs font-semibold text-textPrimary hover:bg-border transition-all flex items-center gap-1.5 self-start sm:self-auto"
                          >
                            <Copy className="w-3.5 h-3.5 text-textMuted" />
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
                <div className="bg-surface rounded-3xl p-6 border border-border shadow-sm space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-textPrimary">{selectedSymbol?.symbol} — Family Allotment Summary</h3>
                      <p className="text-xs text-textMuted">{totalChecked} applicant bids verified</p>
                    </div>
                  </div>

                  {/* 4 Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-2xl bg-background border border-border text-center">
                      <p className="text-2xl font-black text-textPrimary">{totalChecked}</p>
                      <p className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider mt-1">Total Checked</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 text-center">
                      <p className="text-2xl font-black text-primary">{appliedCount}</p>
                      <p className="text-[10px] font-extrabold text-primary uppercase tracking-wider mt-1">Applied</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-success/5 border border-success/10 text-center">
                      <p className="text-2xl font-black text-success">{allottedCount}</p>
                      <p className="text-[10px] font-extrabold text-success uppercase tracking-wider mt-1">Allotted</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-danger/5 border border-danger/10 text-center">
                      <p className="text-2xl font-black text-danger">{didNotApplyCount}</p>
                      <p className="text-[10px] font-extrabold text-danger uppercase tracking-wider mt-1">Did Not Apply</p>
                    </div>
                  </div>
                </div>

                {/* Family Applicant Cards Stream */}
                <div className="space-y-3.5">
                  {bulkResult.results?.map(result => (
                    <div
                      key={result.applicantId}
                      className={`bg-surface rounded-2xl p-5 border shadow-sm transition-all ${
                        result.status === 'found'
                          ? result.records?.some(r => r.allottedShares > 0)
                            ? 'border-success/40'
                            : 'border-border'
                          : 'border-danger/20 bg-surfaceHover/50'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                            result.status === 'found'
                              ? result.records?.some(r => r.allottedShares > 0)
                                ? 'bg-success/10 text-success border border-success/20'
                                : 'bg-primary/10 text-primary border border-primary/20'
                              : 'bg-danger/10 text-danger border border-danger/20'
                          }`}>
                            {result.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-textPrimary truncate">{result.name}</p>
                            <p className="text-xs text-textMuted font-mono tracking-wider">{result.maskedPan}</p>
                          </div>
                        </div>

                        {/* Status Tag */}
                        <div className="flex-shrink-0 self-start sm:self-center w-full sm:w-auto">
                          {result.status === 'found' ? (
                            result.records?.some(r => r.allottedShares > 0) ? (
                              <div className="px-3 py-1.5 rounded-xl bg-success/10 text-success border border-success/20 text-xs font-black tracking-wide text-center">
                                ALLOTTED
                              </div>
                            ) : (
                              <div className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 text-xs font-bold tracking-wide text-center">
                                APPLIED (NOT ALLOTTED)
                              </div>
                            )
                          ) : (
                            <div className="px-3 py-1.5 rounded-xl bg-danger/10 text-danger border border-danger/20 text-xs font-bold tracking-wide text-center">
                              IPO NOT APPLIED
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Detail Breakdown for Found Bids */}
                      {result.status === 'found' && result.records?.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3.5 border-t border-border">
                          {result.records.map((rec, i) => (
                            <div key={i} className="contents">
                              <div className="p-2.5 rounded-xl bg-background border border-border">
                                <p className="text-[10px] uppercase font-bold text-textMuted">Applied</p>
                                <p className="text-xs font-bold text-textPrimary mt-0.5">{rec.appliedShares != null ? `${rec.appliedShares.toLocaleString()} Shs` : '—'}</p>
                              </div>
                              <div className="p-2.5 rounded-xl bg-background border border-border">
                                <p className="text-[10px] uppercase font-bold text-textMuted">Allotted</p>
                                <p className={`text-xs font-bold mt-0.5 ${rec.allottedShares > 0 ? 'text-success' : 'text-textPrimary'}`}>
                                  {rec.allottedShares != null ? `${rec.allottedShares.toLocaleString()} Shs` : '—'}
                                </p>
                              </div>
                              <div className="p-2.5 rounded-xl bg-background border border-border">
                                <p className="text-[10px] uppercase font-bold text-textMuted">App No</p>
                                <p className="text-xs font-mono font-bold text-textPrimary mt-0.5 truncate">{rec.applicationNumber || '—'}</p>
                              </div>
                              <div className="p-2.5 rounded-xl bg-background border border-border">
                                <p className="text-[10px] uppercase font-bold text-textMuted">Demat ID</p>
                                <p className="text-xs font-mono text-textMuted mt-0.5 truncate">{maskDpId(rec.dpClientId)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {result.status === 'not_found' && (
                        <p className="text-xs text-danger/80 mt-2.5 pt-2 border-t border-border">
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface border border-border rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-textPrimary">Remove {deleteConfirm.name}?</h3>
              </div>
              <p className="text-xs text-textMuted leading-relaxed">
                This will remove the encrypted applicant record from your family portfolio.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-surfaceHover text-textPrimary border border-border hover:bg-border transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteApplicant(deleteConfirm.id)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-danger text-white hover:opacity-90 transition-all"
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
