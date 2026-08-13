import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, RefreshCw, Search, Plus, Trash2, X, ChevronDown, Users, AlertCircle, CheckCircle2, XCircle, Clock, Loader2, Info, FileCheck2 } from 'lucide-react'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'

// ── PAN Validation (client-side preview only) ─────────────────────────────────
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

  // ── Fetch IPO Symbols ───────────────────────────────────────────────────────
  const fetchSymbols = useCallback(async () => {
    setSymbolsLoading(true)
    try {
      const data = await apiClient('/api/ipo/symbols')
      setSymbols(data.symbols || [])
    } catch (err) {
      toast.error('Failed to load active IPOs')
      console.error(err)
    } finally {
      setSymbolsLoading(false)
    }
  }, [])

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
      toast.success(`${newName.trim()} added successfully`)
      setNewName('')
      setNewPan('')
      setShowAddForm(false)
      fetchApplicants()
    } catch (err) {
      toast.error(err.message?.includes('already saved') ? 'This PAN is already saved' : err.message?.includes('Maximum') ? 'Maximum 10 applicants allowed' : 'Failed to add applicant')
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
      toast.error('Invalid PAN format')
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
      if (msg.includes('429')) toast.error('Too many requests. Please wait a minute.')
      else toast.error(err.error || 'Verification failed. Please try again.')
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
      if (msg.includes('429')) toast.error('Too many bulk requests. Please wait.')
      else toast.error('Bulk verification failed. Please try again.')
    } finally {
      setBulkVerifying(false)
    }
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-500/20">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">IPO Allotment & Status Check</h1>
          <p className="text-sm text-textMuted">Check IPO application and allotment status using KFintech registrar query service</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: My IPO Applicants */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-panel rounded-2xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-semibold text-textPrimary">My IPO Applicants</h2>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="w-8 h-8 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center transition-all hover:scale-105"
                title="Add Applicant"
              >
                {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>

            {/* Add Applicant Form */}
            <AnimatePresence>
              {showAddForm && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleAddApplicant}
                  className="overflow-hidden mb-4"
                >
                  <div className="space-y-3 p-4 bg-white/[0.03] rounded-xl border border-white/5">
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Name (e.g., Father)"
                      maxLength={50}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-textPrimary placeholder:text-textMuted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                    <input
                      type="text"
                      value={newPan}
                      onChange={e => setNewPan(e.target.value.toUpperCase().slice(0, 10))}
                      placeholder="PAN Number (e.g., ABCDE1234F)"
                      maxLength={10}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-textPrimary placeholder:text-textMuted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono tracking-wider"
                    />
                    <p className="text-[11px] text-textMuted flex items-start gap-1.5">
                      <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-400" />
                      Your PAN is encrypted before storage and never visible in plaintext.
                    </p>
                    <button
                      type="submit"
                      disabled={addingApplicant || !newName.trim() || !newPan.trim()}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {addingApplicant ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Applicant'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Applicant List */}
            {applicantsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-textMuted" />
              </div>
            ) : applicants.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-8 h-8 text-textMuted/30 mx-auto mb-2" />
                <p className="text-sm text-textMuted">No applicants saved yet</p>
                <p className="text-xs text-textMuted/60 mt-1">Add family members to check IPO status in bulk</p>
              </div>
            ) : (
              <div className="space-y-2">
                {applicants.map(app => (
                  <div
                    key={app.id}
                    className="flex items-center gap-3 px-3 py-3 bg-white/[0.03] rounded-xl border border-white/5 group hover:border-white/10 transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary/30 to-blue-400/30 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-textPrimary truncate">{app.name}</p>
                      <p className="text-xs text-textMuted font-mono">{app.maskedPan}</p>
                    </div>
                    <button
                      onClick={() => setDeleteConfirm(app)}
                      className="w-7 h-7 rounded-lg text-textMuted/40 hover:text-red-400 hover:bg-red-400/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-[11px] text-textMuted/50 text-center mt-2">{applicants.length}/10 applicants</p>
              </div>
            )}
          </div>

          {/* Bulk Verify Button */}
          {applicants.length > 0 && selectedSymbol && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleBulkVerify}
              disabled={bulkVerifying}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {bulkVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking All Applicants...
                </>
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4" />
                  Check All Applicants — {selectedSymbol.symbol}
                </>
              )}
            </motion.button>
          )}
        </div>

        {/* RIGHT COLUMN: Verification Form + Results */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleVerify} className="glass-panel rounded-2xl p-6 border border-white/5 space-y-5">
            {/* IPO Symbol Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-textMuted uppercase tracking-wider">Select IPO Issue</label>
                <button
                  type="button"
                  onClick={fetchSymbols}
                  disabled={symbolsLoading}
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-all"
                >
                  <RefreshCw className={`w-3 h-3 ${symbolsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all ${selectedSymbol ? 'border-primary/30 bg-primary/5 text-textPrimary font-semibold' : 'border-white/10 bg-white/5 text-textMuted'} hover:border-white/20`}
                >
                  <span>{selectedSymbol ? selectedSymbol.symbol : 'Select an IPO...'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${symbolDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {symbolDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute z-20 top-full left-0 right-0 mt-2 bg-surface border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                    >
                      <div className="p-2 border-b border-white/5">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                          <input
                            type="text"
                            value={symbolSearch}
                            onChange={e => setSymbolSearch(e.target.value)}
                            placeholder="Search IPO Issue..."
                            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm text-textPrimary placeholder:text-textMuted/50 focus:outline-none focus:border-primary/30"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto scrollbar-hide">
                        {symbolsLoading ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-textMuted" />
                          </div>
                        ) : filteredSymbols.length === 0 ? (
                          <div className="text-center py-6 text-sm text-textMuted">No IPOs available</div>
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
                              className={`w-full text-left px-4 py-2.5 text-sm transition-all ${selectedSymbol?.clientId === s.clientId ? 'bg-primary/10 text-primary font-semibold' : 'text-textPrimary hover:bg-white/5'}`}
                            >
                              {s.symbol}
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Verification Method Label */}
            <div>
              <label className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2 block">Verify Using</label>
              <div className="px-4 py-3 rounded-xl border border-primary/50 bg-primary/10 text-primary text-sm font-semibold w-fit">
                PAN Number
              </div>
            </div>

            {/* PAN Number Input */}
            <div>
              <label className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2 block">PAN Number *</label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="Enter PAN (e.g., ABCDE1234F)"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-textPrimary placeholder:text-textMuted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all font-mono tracking-wider"
              />
              <p className="text-[11px] text-textMuted/60 mt-1.5">Your PAN is used only to query the KFintech allotment registry.</p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={verifying || !selectedSymbol || !identifier.trim()}
              className="w-full py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-primary to-blue-500 text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all flex items-center justify-center gap-2"
            >
              {verifying ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Querying...</>
              ) : (
                <><ShieldCheck className="w-4 h-4" /> Check Allotment</>
              )}
            </button>
          </form>

          {/* SINGLE VERIFICATION RESULT */}
          <AnimatePresence mode="wait">
            {verifyResult && (
              <motion.div
                key="single-result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Summary Panel */}
                <div className={`glass-panel rounded-2xl p-5 border ${verifyResult.records?.length > 0 ? 'border-emerald-500/20' : 'border-amber-500/20'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    {verifyResult.records?.length > 0 ? (
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-amber-400" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-base font-semibold text-textPrimary">
                        {verifyResult.records?.length > 0 ? `${verifyResult.records.length} Application Record${verifyResult.records.length > 1 ? 's' : ''} Found` : 'No Application Found'}
                      </h3>
                      <p className="text-xs text-textMuted">{selectedSymbol?.symbol} • PAN: {verifyResult.verification?.maskedIdentifier}</p>
                    </div>
                  </div>

                  {verifyResult.records?.length === 0 && (
                    <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/10 text-sm text-textMuted space-y-1">
                      <p>KFintech did not return an application associated with this PAN.</p>
                      <p className="text-xs">Please verify: PAN, selected IPO, and whether KFintech is the official registrar for this issue.</p>
                    </div>
                  )}
                </div>

                {/* Detail Cards */}
                {verifyResult.records?.map((record, idx) => (
                  <div key={idx} className="space-y-3">
                    {verifyResult.records.length > 1 && (
                      <h4 className="text-sm font-semibold text-textMuted">Application #{idx + 1}</h4>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Applicant Details */}
                      <div className="glass-panel rounded-xl p-4 border border-white/5">
                        <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-3">Applicant Info</h4>
                        <div className="space-y-2.5">
                          <DetailRow label="Applicant Name" value={record.applicantName} />
                          <DetailRow label="PAN Number" value={record.maskedPan} />
                          <DetailRow label="Application Number" value={record.applicationNumber} />
                        </div>
                      </div>

                      {/* Allotment Status */}
                      <div className="glass-panel rounded-xl p-4 border border-white/5">
                        <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-3">Allotment Status</h4>
                        <div className="space-y-2.5">
                          <DetailRow label="Shares Applied" value={record.appliedShares != null ? record.appliedShares.toLocaleString() : '—'} />
                          <DetailRow label="Shares Allotted" value={record.allottedShares != null ? record.allottedShares.toLocaleString() : '—'} />
                          <DetailRow label="Status" value={
                            record.allottedShares > 0 ? (
                              <span className="text-emerald-400 font-bold">Allotted</span>
                            ) : record.allottedShares === 0 ? (
                              <span className="text-red-400 font-bold">Not Allotted</span>
                            ) : (
                              <span className="text-amber-400 font-bold">Unknown</span>
                            )
                          } />
                        </div>
                      </div>

                      {/* DP Demat Account */}
                      <div className="glass-panel rounded-xl p-4 border border-white/5 md:col-span-2">
                        <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-3">DP / Client Demat Details</h4>
                        <div className="space-y-2.5">
                          <DetailRow label="Demat/DP Client ID" value={maskDpId(record.dpClientId)} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Footer */}
                {verifyResult.records?.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-textMuted/50 px-1">
                    <span>Source: KFintech • Verified: {new Date(verifyResult.verifiedAt).toLocaleString()}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* BULK VERIFICATION DASHBOARD */}
          <AnimatePresence mode="wait">
            {bulkResult && (
              <motion.div
                key="bulk-result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Summary Bar */}
                <div className="glass-panel rounded-2xl p-5 border border-white/5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                      <Users className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-textPrimary">{selectedSymbol?.symbol} — All Applicants Status</h3>
                      <p className="text-xs text-textMuted">{bulkResult.summary?.total} applicants checked</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <StatBadge label="Checked" value={bulkResult.summary?.total} color="blue" />
                    <StatBadge label="Bids Found" value={bulkResult.summary?.found} color="emerald" />
                    <StatBadge label="No Bid" value={bulkResult.summary?.notFound} color="amber" />
                    <StatBadge label="Errors" value={bulkResult.summary?.errors} color="red" />
                  </div>
                </div>

                {/* Per-applicant Cards */}
                <div className="space-y-3">
                  {bulkResult.results?.map(result => (
                    <div
                      key={result.applicantId}
                      className={`glass-panel rounded-xl p-4 border transition-all ${
                        result.status === 'found' ? 'border-emerald-500/20' :
                        result.status === 'error' ? 'border-red-500/20' :
                        'border-amber-500/20'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          result.status === 'found' ? 'bg-emerald-500/20' :
                          result.status === 'error' ? 'bg-red-500/20' :
                          'bg-amber-500/20'
                        }`}>
                          {result.status === 'found' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                           result.status === 'error' ? <XCircle className="w-4 h-4 text-red-400" /> :
                           <Clock className="w-4 h-4 text-amber-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-textPrimary">{result.name}</p>
                          <p className="text-xs text-textMuted font-mono">{result.maskedPan}</p>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                          result.status === 'found' ? 'bg-emerald-500/10 text-emerald-400' :
                          result.status === 'error' ? 'bg-red-500/10 text-red-400' :
                          'bg-amber-500/10 text-amber-400'
                        }`}>
                          {result.status === 'found' ? 'Record Found' : result.status === 'error' ? 'Error' : 'No Record'}
                        </span>
                      </div>

                      {result.status === 'error' && (
                        <p className="text-xs text-red-400/80 bg-red-500/5 rounded-lg px-3 py-2">{result.error}</p>
                      )}

                      {result.status === 'found' && result.records?.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                          {result.records.map((rec, i) => (
                            <div key={i} className="contents">
                              <MiniStat label="Applied" value={rec.appliedShares != null ? `${rec.appliedShares.toLocaleString()}` : '—'} />
                              <MiniStat label="Allotted" value={rec.allottedShares != null ? `${rec.allottedShares.toLocaleString()}` : '—'} />
                              <MiniStat label="Status" value={rec.allotmentStatus} />
                              <MiniStat label="Demat ID" value={maskDpId(rec.dpClientId)} />
                            </div>
                          ))}
                        </div>
                      )}

                      {result.status === 'not_found' && (
                        <p className="text-xs text-textMuted/60">No matching application found. Status may not yet be uploaded by the registrar.</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bulk Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-textMuted/50 px-1">
                  <span>Source: KFintech • Verified: {new Date(bulkResult.verifiedAt).toLocaleString()}</span>
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-base font-semibold text-textPrimary">Remove {deleteConfirm.name}?</h3>
              </div>
              <p className="text-sm text-textMuted">This will permanently remove the saved PAN from your IPO verification list. This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-textMuted hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteApplicant(deleteConfirm.id)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
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

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-textMuted">{label}</span>
      <span className="text-sm font-medium text-textPrimary text-right">
        {value ?? <span className="text-textMuted/40 text-xs italic">—</span>}
      </span>
    </div>
  )
}

function StatBadge({ label, value, color }) {
  const colors = {
    blue: 'bg-blue-500/10 text-blue-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    red: 'bg-red-500/10 text-red-400',
  }
  return (
    <div className={`rounded-xl px-3 py-2.5 text-center ${colors[color]}`}>
      <p className="text-lg font-bold">{value ?? 0}</p>
      <p className="text-[10px] font-medium opacity-70">{label}</p>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-white/[0.03] rounded-lg px-2.5 py-2">
      <p className="text-[10px] text-textMuted uppercase tracking-wider">{label}</p>
      <p className="text-xs font-semibold text-textPrimary mt-0.5">{value}</p>
    </div>
  )
}
