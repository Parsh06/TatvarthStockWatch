import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ShieldCheck, RefreshCw, Search, Plus, Trash2, X, ChevronDown, 
  Users, CheckCircle2, XCircle, Clock, 
  FileCheck2, Check, Copy, Sparkles, Building2, UserCheck, CreditCard,
  Download, PauseCircle, PlayCircle, StopCircle, Filter, FileSpreadsheet,
  AlertTriangle
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { apiClient } from '../../services/apiClient'
import toast from 'react-hot-toast'
import Loader, { Spinner } from '../Common/Loader'

// ── PAN Validation Regex ──────────────────────────────────────────────────────
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export default function IpoVerificationPage() {
  // ── State ───────────────────────────────────────────────────────────────────
  const [symbols, setSymbols] = useState([])
  const [symbolsLoading, setSymbolsLoading] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState(null) // holds { clientId, symbol, registrar, isLatest }
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

  // ── 500+ Streaming State ───────────────────────────────────────────────────
  const [bulkVerifying, setBulkVerifying] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [copiedField, setCopiedField] = useState(null)

  const [streamProgress, setStreamProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0,
    startTime: null,
    etaSeconds: null,
  })
  const [streamFilter, setStreamFilter] = useState('all') // 'all' | 'allotted' | 'not_allotted' | 'did_not_apply' | 'error'
  const [streamSearch, setStreamSearch] = useState('')
  const abortControllerRef = useRef(null)

  // ── Fetch Master Unified IPO Symbols ────────────────────────────────────────
  const fetchSymbols = useCallback(async () => {
    setSymbolsLoading(true)
    try {
      const data = await apiClient('/api/ipo/symbols?registrar=ALL')
      const fetched = (data.symbols || []).map(s => ({
        ...s,
        registrar: s.registrar || s.source || 'KFINTECH',
      }))
      setSymbols(fetched)
      if (fetched.length > 0) {
        setSelectedSymbol(fetched[0])
      } else {
        setSelectedSymbol(null)
      }
    } catch (err) {
      toast.error('Failed to load active IPO offerings')
      console.error(err)
      setSymbols([])
      setSelectedSymbol(null)
    } finally {
      setSymbolsLoading(false)
    }
  }, [])

  useEffect(() => { 
    fetchSymbols() 
  }, [fetchSymbols])

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
      toast.error(err.message?.includes('already saved') ? 'This PAN is already in your portfolio' : 'Failed to save applicant')
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
          symbol: selectedSymbol.clientId || selectedSymbol.symbol,
          verificationType: 'pan',
          identifier: cleanId,
          registrar: selectedSymbol.registrar || selectedSymbol.source || 'KFINTECH',
        }),
      })
      setVerifyResult(data)
    } catch (err) {
      const msg = err.message || 'Verification failed'
      if (msg.includes('429')) toast.error('Rate limit reached. Please wait a moment.')
      else toast.error(err.error || msg.replace(/^API.*?failed \(\d+\): /i, '') || 'Verification query failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  // ── Dynamic Live ETA Countdown Timer ────────────────────────────────────────
  useEffect(() => {
    if (!bulkVerifying) return
    const interval = setInterval(() => {
      setStreamProgress(prev => {
        if (!prev || prev.etaSeconds <= 0) return prev
        return {
          ...prev,
          etaSeconds: Math.max(0, prev.etaSeconds - 1),
        }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [bulkVerifying])

  // ── 500+ Streaming Chunk Verification Pipeline ──────────────────────────────
  const CHUNK_SIZE = 8
  const CONCURRENT_CHUNKS = 2

  async function handleBulkVerify() {
    if (!selectedSymbol || applicants.length === 0) return

    setBulkVerifying(true)
    setVerifyResult(null)
    setStreamFilter('all')
    setStreamSearch('')

    const totalApplicants = applicants.length
    const startTime = Date.now()

    // Initialize clean streaming state with realistic ETA baseline
    setStreamProgress({
      current: 0,
      total: totalApplicants,
      percentage: 0,
      startTime,
      etaSeconds: Math.max(4, Math.ceil(totalApplicants * 1.5)),
    })

    const initialResult = {
      symbol: selectedSymbol.symbol,
      provider: selectedSymbol.registrar || 'UNIFIED',
      results: [],
      verifiedAt: new Date().toISOString(),
    }
    setBulkResult(initialResult)

    // Setup abort controller
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      // 1. Slice applicants into batches of 8
      const chunks = []
      for (let i = 0; i < applicants.length; i += CHUNK_SIZE) {
        chunks.push(applicants.slice(i, i + CHUNK_SIZE))
      }

      let completedCount = 0
      let chunkIdx = 0

      // Worker pipeline for concurrent chunk dispatch with per-chunk timeout
      async function chunkWorker() {
        while (chunkIdx < chunks.length) {
          if (controller.signal.aborted) break

          const currentChunk = chunks[chunkIdx++]
          if (!currentChunk) break

          const chunkController = new AbortController()
          const timeoutId = setTimeout(() => chunkController.abort('Chunk timeout (20s)'), 20000)
          const onParentAbort = () => chunkController.abort('Cancelled')
          controller.signal.addEventListener('abort', onParentAbort)

          try {
            const data = await apiClient('/api/ipo/verify-bulk', {
              method: 'POST',
              body: JSON.stringify({
                symbol: selectedSymbol.clientId || selectedSymbol.symbol,
                applicantIds: currentChunk.map(a => a.id),
                registrar: selectedSymbol.registrar || selectedSymbol.source || 'KFINTECH',
              }),
              signal: chunkController.signal,
            })

            clearTimeout(timeoutId)
            controller.signal.removeEventListener('abort', onParentAbort)

            const chunkResults = Array.isArray(data.results) ? data.results : []
            completedCount += currentChunk.length

            // Incrementally stream results into state
            setBulkResult(prev => {
              const prevResults = prev?.results || []
              const updated = [...prevResults, ...chunkResults]
              return {
                ...(prev || initialResult),
                results: updated,
                summary: {
                  total: updated.length,
                  found: updated.filter(r => r.status === 'found').length,
                  notFound: updated.filter(r => r.status === 'not_found').length,
                  errors: updated.filter(r => r.status === 'error').length,
                },
              }
            })

            // Update live progress & ETA based on real velocity
            const elapsedMs = Date.now() - startTime
            const pct = Math.min(100, Math.round((completedCount / totalApplicants) * 100))
            const ratePerMs = completedCount / Math.max(elapsedMs, 100)
            const remainingCount = totalApplicants - completedCount
            const etaSec = ratePerMs > 0 ? Math.ceil((remainingCount / ratePerMs) / 1000) : 0

            setStreamProgress({
              current: Math.min(completedCount, totalApplicants),
              total: totalApplicants,
              percentage: pct,
              startTime,
              etaSeconds: etaSec,
            })
          } catch (chunkErr) {
            clearTimeout(timeoutId)
            controller.signal.removeEventListener('abort', onParentAbort)
            if (controller.signal.aborted) break
            console.error('[Bulk Chunk Error]', chunkErr)
            
            // Mark entire chunk with informative message
            const fallbackErrors = currentChunk.map(app => ({
              applicantId: app.id,
              name: app.name,
              maskedPan: app.maskedPan || app.panLast4 || 'XXXX',
              status: 'error',
              error: chunkErr.message || 'Transient query timeout (retry)',
              records: [],
            }))

            completedCount += currentChunk.length
            setBulkResult(prev => {
              const prevResults = prev?.results || []
              const updated = [...prevResults, ...fallbackErrors]
              return {
                ...(prev || initialResult),
                results: updated,
                summary: {
                  total: updated.length,
                  found: updated.filter(r => r.status === 'found').length,
                  notFound: updated.filter(r => r.status === 'not_found').length,
                  errors: updated.filter(r => r.status === 'error').length,
                },
              }
            })
          }
        }
      }

      // Launch 2 parallel chunk workers
      const workers = []
      for (let w = 0; w < Math.min(CONCURRENT_CHUNKS, chunks.length); w++) {
        workers.push(chunkWorker())
      }
      await Promise.all(workers)

      if (controller.signal.aborted) {
        toast('Verification cancelled', { icon: '⏸️' })
      } else {
        toast.success(`Verification complete across ${totalApplicants} applicants!`)
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        toast.error('Bulk verification query encountered an issue. Please try again.')
      }
    } finally {
      setBulkVerifying(false)
      abortControllerRef.current = null
    }
  }

  // ── Stop / Cancel Verification ──────────────────────────────────────────────
  function handleStopVerification() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setBulkVerifying(false)
    }
  }

  // ── Retry Single Applicant ──────────────────────────────────────────────────
  async function handleRetrySingleApplicant(applicantId) {
    if (!selectedSymbol || !bulkResult || !applicantId) return

    setBulkVerifying(true)
    try {
      const data = await apiClient('/api/ipo/verify-bulk', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol.clientId || selectedSymbol.symbol,
          applicantIds: [applicantId],
          registrar: selectedSymbol.registrar || selectedSymbol.source || 'KFINTECH',
        }),
      })

      const retriedResults = Array.isArray(data.results) ? data.results : []
      if (retriedResults.length > 0) {
        const retried = retriedResults[0]
        setBulkResult(prev => {
          if (!prev) return prev
          const updated = (prev.results || []).map(r => r.applicantId === applicantId ? retried : r)
          return {
            ...prev,
            results: updated,
            summary: {
              total: updated.length,
              found: updated.filter(r => r.status === 'found').length,
              notFound: updated.filter(r => r.status === 'not_found').length,
              errors: updated.filter(r => r.status === 'error').length,
            },
          }
        })
        if (retried.status !== 'error') {
          toast.success(`Updated ${retried.name}!`)
        } else {
          toast.error(retried.error || 'Retry did not succeed. Please try again.')
        }
      }
    } catch (err) {
      toast.error('Retry query failed: ' + err.message)
    } finally {
      setBulkVerifying(false)
    }
  }

  // ── Retry Failed Applicants ─────────────────────────────────────────────────
  async function handleRetryFailedApplicants() {
    if (!selectedSymbol || !bulkResult) return
    const failedApplicantIds = (bulkResult.results || [])
      .filter(r => r.status === 'error')
      .map(r => r.applicantId)

    if (failedApplicantIds.length === 0) return

    setBulkVerifying(true)
    try {
      const data = await apiClient('/api/ipo/verify-bulk', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol.clientId || selectedSymbol.symbol,
          applicantIds: failedApplicantIds,
          registrar: selectedSymbol.registrar || selectedSymbol.source || 'KFINTECH',
        }),
      })

      const retriedResults = Array.isArray(data.results) ? data.results : []
      setBulkResult(prev => {
        if (!prev) return prev
        const retriedMap = new Map(retriedResults.map(r => [r.applicantId, r]))
        const updated = (prev.results || []).map(r => retriedMap.get(r.applicantId) || r)
        return {
          ...prev,
          results: updated,
          summary: {
            total: updated.length,
            found: updated.filter(r => r.status === 'found').length,
            notFound: updated.filter(r => r.status === 'not_found').length,
            errors: updated.filter(r => r.status === 'error').length,
          },
        }
      })
      toast.success('Retried failed applicants successfully')
    } catch (err) {
      toast.error('Retry query encountered an issue. Please check connection.')
    } finally {
      setBulkVerifying(false)
    }
  }

  // ── Export Results to Excel (.xlsx) ─────────────────────────────────────────
  function handleExportExcel() {
    if (!bulkResult?.results || bulkResult.results.length === 0) {
      toast.error('No verification results to export')
      return
    }

    try {
      const rows = bulkResult.results.map((r, index) => {
        const record = r.records?.[0] || {}
        const isAllotted = r.records?.some(rec => rec.allottedShares > 0)
        const isApplied = r.status === 'found'
        
        let statusLabel = 'NOT APPLIED'
        if (isAllotted) statusLabel = 'ALLOTTED'
        else if (isApplied) statusLabel = 'APPLIED (NOT ALLOTTED)'
        else if (r.status === 'error') statusLabel = 'ERROR / RETRY NEEDED'

        return {
          'S.No': index + 1,
          'IPO Symbol': selectedSymbol?.symbol || '—',
          'Applicant Name': r.name || '—',
          'Masked PAN': r.maskedPan || '—',
          'Allotment Status': statusLabel,
          'Applied Shares': record.appliedShares != null ? record.appliedShares : (isApplied ? 'Applied' : 0),
          'Allotted Shares': record.allottedShares != null ? record.allottedShares : (isAllotted ? 'Allotted' : 0),
          'Application Number': record.applicationNumber || '—',
          'DP / Client ID': record.dpClientId || '—',
          'Registrar': selectedSymbol?.registrar || '—',
          'Verification Date': new Date().toLocaleString(),
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Allotment Results')

      // Auto-size columns
      const maxColWidths = rows.reduce((acc, row) => {
        Object.keys(row).forEach((key, colIdx) => {
          const valLen = String(row[key] || '').length
          acc[colIdx] = Math.max(acc[colIdx] || key.length, valLen)
        })
        return acc
      }, [])
      worksheet['!cols'] = maxColWidths.map(w => ({ wch: Math.min(w + 3, 40) }))

      const safeSym = (selectedSymbol?.symbol || 'IPO').replace(/[^a-zA-Z0-9]/g, '_')
      XLSX.writeFile(workbook, `${safeSym}_Allotment_Report.xlsx`)
      toast.success('Excel report downloaded successfully!')
    } catch (err) {
      console.error('[Excel Export Error]', err)
      toast.error('Failed to export Excel report')
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

  // ── Derived Streaming Telemetry & Filtered Results ─────────────────────────
  const rawResults = bulkResult?.results || []
  const totalChecked = rawResults.length
  const allottedCount = rawResults.filter(r => r.records?.some(rec => rec.allottedShares > 0)).length
  const appliedCount = rawResults.filter(r => r.status === 'found').length
  const appliedNotAllottedCount = Math.max(0, appliedCount - allottedCount)
  const didNotApplyCount = rawResults.filter(r => r.status === 'not_found').length
  const errorCount = rawResults.filter(r => r.status === 'error').length

  const filteredResults = useMemo(() => {
    return rawResults.filter(r => {
      // 1. Status Filter Tab
      if (streamFilter === 'allotted') {
        if (!r.records?.some(rec => rec.allottedShares > 0)) return false
      } else if (streamFilter === 'not_allotted') {
        if (r.status !== 'found' || r.records?.some(rec => rec.allottedShares > 0)) return false
      } else if (streamFilter === 'did_not_apply') {
        if (r.status !== 'not_found') return false
      } else if (streamFilter === 'error') {
        if (r.status !== 'error') return false
      }

      // 2. Search Query (Name or Masked PAN)
      if (streamSearch.trim()) {
        const q = streamSearch.trim().toLowerCase()
        const nameMatch = (r.name || '').toLowerCase().includes(q)
        const panMatch = (r.maskedPan || '').toLowerCase().includes(q)
        if (!nameMatch && !panMatch) return false
      }

      return true
    })
  }, [rawResults, streamFilter, streamSearch])

  const isNameValid = newName.trim().length >= 2
  const isPanValid = PAN_REGEX.test(newPan.trim().toUpperCase())

  const filteredSymbols = useMemo(() => {
    if (!symbolSearch.trim()) return symbols
    const q = symbolSearch.trim().toLowerCase()
    return symbols.filter(s => (s.symbol || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q))
  }, [symbols, symbolSearch])

  return (
    <div className="space-y-8 pb-12">
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-textPrimary tracking-tight">IPO Allotment Verification</h1>
              <p className="text-xs text-textMuted mt-0.5">
                Verify allotment status across BSE, NSE, KFintech, Link Intime & BigShare for 500+ family PANs
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT PANEL: Family PAN Manager (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-surface rounded-3xl p-6 border border-border shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-extrabold text-textPrimary uppercase tracking-wider">Family Portfolio</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="text-xs text-primary hover:text-primaryHover flex items-center gap-1 font-bold transition-all"
              >
                {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showAddForm ? 'Cancel' : 'Add Member'}
              </button>
            </div>

            {/* Add Applicant Drawer Form */}
            <AnimatePresence>
              {showAddForm && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onSubmit={handleAddApplicant}
                  className="overflow-hidden"
                >
                  <div className="p-4 rounded-2xl bg-background border border-border space-y-3">
                    <input
                      type="text"
                      placeholder="Applicant Name (e.g., Jane Doe)"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-primary/50"
                    />

                    <input
                      type="text"
                      placeholder="PAN Number (e.g., ABCDE1234F)"
                      value={newPan}
                      onChange={e => setNewPan(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-textPrimary placeholder:font-sans placeholder:text-textMuted focus:outline-none focus:border-primary/50 uppercase"
                    />

                    <div className="flex items-center gap-1 text-[11px] text-textMuted">
                      <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" />
                      <span>AES-256 GCM encrypted before storage</span>
                    </div>

                    <button
                      type="submit"
                      disabled={addingApplicant || !isNameValid || !isPanValid}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primaryHover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      {addingApplicant ? <Spinner size="sm" className="mx-auto" /> : 'Save to Portfolio'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Applicant List */}
            {applicantsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size="md" />
              </div>
            ) : applicants.length === 0 ? (
              <div className="text-center py-8 px-4 border border-dashed border-border rounded-2xl bg-surfaceHover/50">
                <UserCheck className="w-10 h-10 text-textMuted mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold text-textPrimary">No applicants saved yet</p>
                <p className="text-xs text-textMuted mt-1 max-w-[220px] mx-auto">
                  Add your PAN and family members to verify all bids in bulk across active IPOs.
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
              <div className="mt-6 pt-4 border-t border-border space-y-2">
                <button
                  onClick={handleBulkVerify}
                  disabled={bulkVerifying}
                  className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-primary text-white hover:bg-primaryHover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {bulkVerifying ? (
                    <>
                      <Spinner size="sm" className="scale-75" />
                      Checking {streamProgress.current} / {applicants.length}...
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4" />
                      Check All Family Bids ({applicants.length})
                    </>
                  )}
                </button>

                {bulkVerifying && (
                  <button
                    type="button"
                    onClick={handleStopVerification}
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-danger border border-danger/20 hover:bg-danger/10 transition-all flex items-center justify-center gap-1.5"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    Stop / Cancel Stream
                  </button>
                )}
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
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{selectedSymbol ? selectedSymbol.symbol : 'Select an active IPO offer...'}</span>
                    {selectedSymbol?.isLatest && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-extrabold uppercase tracking-wide shrink-0">
                        Latest
                      </span>
                    )}
                  </div>
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

                      <div className="max-h-64 overflow-y-auto scrollbar-hide divide-y divide-border">
                        {symbolsLoading ? (
                          <div className="flex items-center justify-center py-8 text-textMuted gap-2">
                            <Spinner size="sm" />
                            Loading active offerings...
                          </div>
                        ) : filteredSymbols.length === 0 ? (
                          <div className="text-center py-6 text-sm text-textMuted">No matching active offers found</div>
                        ) : (
                          filteredSymbols.map((s, idx) => (
                            <button
                              key={`${s.clientId}_${s.registrar}_${idx}`}
                              type="button"
                              onClick={() => {
                                setSelectedSymbol(s)
                                setSymbolDropdownOpen(false)
                                setSymbolSearch('')
                                setVerifyResult(null)
                                setBulkResult(null)
                              }}
                              className={`w-full text-left px-4 py-3 text-sm transition-all flex items-center justify-between gap-2 ${
                                selectedSymbol?.clientId === s.clientId && selectedSymbol?.registrar === s.registrar
                                  ? 'bg-primary/10 text-primary font-bold'
                                  : 'text-textPrimary hover:bg-surfaceHover'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="truncate">{s.symbol}</span>
                                {s.isLatest && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-extrabold uppercase tracking-wide shrink-0">
                                    Latest Allotment
                                  </span>
                                )}
                              </div>
                              {selectedSymbol?.clientId === s.clientId && selectedSymbol?.registrar === s.registrar && (
                                <Check className="w-4 h-4 shrink-0" />
                              )}
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
                  PAN Number (Single Check) *
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
                  <Spinner size="sm" className="scale-75" />
                  Querying Allotment Status...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Check Individual PAN Allotment
                </>
              )}
            </button>
          </form>

          {/* ── SINGLE LOADER VIEW ────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {verifying && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-surface rounded-3xl border border-border shadow-sm min-h-[300px] flex items-center justify-center"
              >
                <Loader />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── 500+ LIVE STREAMING PROGRESS HUD ──────────────────────────────── */}
          <AnimatePresence>
            {bulkVerifying && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-surface rounded-3xl p-6 border border-primary/30 shadow-lg space-y-4 relative overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-textPrimary flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                      </span>
                      Streaming Bulk Allotment Check
                    </h3>
                    <p className="text-xs text-textMuted mt-0.5">
                      {streamProgress.current} of {streamProgress.total} applicants verified ({streamProgress.percentage}%) • {selectedSymbol?.symbol}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {streamProgress.etaSeconds != null && (
                      <span className="px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-mono font-bold text-textPrimary">
                        ETA: ~{streamProgress.etaSeconds}s
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleStopVerification}
                      className="px-3 py-1.5 rounded-xl bg-danger/10 text-danger border border-danger/20 text-xs font-bold hover:bg-danger/20 transition-all flex items-center gap-1"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      Stop Stream
                    </button>
                  </div>
                </div>

                {/* Animated Glowing Progress Bar */}
                <div className="w-full bg-background rounded-full h-3.5 overflow-hidden border border-border p-0.5">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-emerald-400 to-teal-300"
                    initial={{ width: 0 }}
                    animate={{ width: `${streamProgress.percentage}%` }}
                    transition={{ ease: 'easeOut', duration: 0.3 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── SINGLE VERIFICATION RESULT VIEW ───────────────────────────────── */}
          <AnimatePresence mode="wait">
            {verifyResult && !verifying && !bulkVerifying && (
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
                        This indicates that the applicant did not submit an application for this IPO offer under {selectedSymbol?.symbol}, or the bid was not submitted through an eligible intermediary.
                      </p>
                    </div>
                  )}
                </div>

                {/* Allotment Details Cards */}
                {verifyResult.records?.map((record, index) => (
                  <div
                    key={index}
                    className="bg-surface rounded-3xl p-6 border border-border shadow-sm space-y-6"
                  >
                    <div className="flex items-center justify-between pb-4 border-b border-border">
                      <div>
                        <p className="text-xs font-extrabold text-textMuted uppercase tracking-wider">Applicant Name</p>
                        <p className="text-lg font-bold text-textPrimary">{record.applicantName || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {record.allottedShares > 0 ? (
                          <div className="px-3 py-1.5 rounded-full bg-success/10 text-success border border-success/20 text-xs font-black tracking-wide">
                            ALLOTTED
                          </div>
                        ) : (
                          <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold tracking-wide">
                            NOT ALLOTTED
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-4 rounded-2xl bg-background border border-border">
                        <p className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider">Applied Quantity</p>
                        <p className="text-lg font-black text-textPrimary mt-1">
                          {record.appliedShares != null ? `${record.appliedShares.toLocaleString()} Shs` : '—'}
                        </p>
                      </div>

                      <div className={`p-4 rounded-2xl border ${
                        record.allottedShares > 0 ? 'bg-success/5 border-success/20' : 'bg-background border-border'
                      }`}>
                        <p className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider">Allotted Quantity</p>
                        <p className={`text-lg font-black mt-1 ${record.allottedShares > 0 ? 'text-success' : 'text-textPrimary'}`}>
                          {record.allottedShares != null ? `${record.allottedShares.toLocaleString()} Shs` : '—'}
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-background border border-border">
                        <p className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider">Application No</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-sm font-bold font-mono text-textPrimary truncate">{record.applicationNumber || '—'}</p>
                          {record.applicationNumber && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(record.applicationNumber, 'Application No')}
                              className="text-textMuted hover:text-primary transition-all ml-1 shrink-0"
                            >
                              {copiedField === 'Application No' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-background border border-border">
                        <p className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider">Demat Client ID</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-sm font-bold font-mono text-textPrimary truncate">
                            {record.dpClientId ? (record.dpClientId.length > 4 ? `************${record.dpClientId.slice(-4)}` : record.dpClientId) : '—'}
                          </p>
                          {record.dpClientId && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(record.dpClientId, 'Demat Client ID')}
                              className="text-textMuted hover:text-primary transition-all ml-1 shrink-0"
                            >
                              {copiedField === 'Demat Client ID' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── BULK FAMILY VERIFICATION RESULT STREAM (500+ HIGH CAPACITY) ─────── */}
          <AnimatePresence mode="wait">
            {bulkResult && rawResults.length > 0 && !verifying && (
              <motion.div
                key="bulk-result"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Summary Header Card */}
                <div className="bg-surface rounded-3xl p-6 sm:p-7 border border-border shadow-sm space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-textPrimary">{selectedSymbol?.symbol} — Family Allotment Summary</h3>
                      <p className="text-xs text-textMuted">
                        {totalChecked} applicant bids verified across portfolio
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap self-start sm:self-center">
                      {errorCount > 0 && (
                        <button
                          type="button"
                          onClick={handleRetryFailedApplicants}
                          disabled={bulkVerifying}
                          className="px-4 py-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-50 text-xs font-bold transition-all flex items-center gap-2 shrink-0"
                        >
                          <RefreshCw className={`w-4 h-4 ${bulkVerifying ? 'animate-spin' : ''}`} />
                          Retry Failed ({errorCount})
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleExportExcel}
                        className="px-4 py-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 text-xs font-bold transition-all flex items-center gap-2 shrink-0"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Export Excel Report (.xlsx)
                      </button>
                    </div>
                  </div>

                  {/* Metric Cards */}
                  <div className={`grid grid-cols-2 ${errorCount > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3`}>
                    <div className="p-4 rounded-2xl bg-background border border-border text-center">
                      <p className="text-2xl font-black text-textPrimary">{totalChecked}</p>
                      <p className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider mt-1">Total Checked</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-success/5 border border-success/15 text-center">
                      <p className="text-2xl font-black text-success">{allottedCount}</p>
                      <p className="text-[10px] font-extrabold text-success uppercase tracking-wider mt-1">Allotted 🎉</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 text-center">
                      <p className="text-2xl font-black text-primary">{appliedNotAllottedCount}</p>
                      <p className="text-[10px] font-extrabold text-primary uppercase tracking-wider mt-1">Not Allotted</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-danger/5 border border-danger/10 text-center">
                      <p className="text-2xl font-black text-danger">{didNotApplyCount}</p>
                      <p className="text-[10px] font-extrabold text-danger uppercase tracking-wider mt-1">Did Not Apply</p>
                    </div>

                    {errorCount > 0 && (
                      <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-center col-span-2 sm:col-span-1">
                        <p className="text-2xl font-black text-amber-500">{errorCount}</p>
                        <p className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider mt-1">Retry Needed</p>
                      </div>
                    )}
                  </div>

                  {/* Search & Filter Toolbar */}
                  <div className="pt-2 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    
                    {/* Status Filter Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setStreamFilter('all')}
                        className={`px-3 py-1.5 rounded-xl transition-all ${
                          streamFilter === 'all'
                            ? 'bg-primary text-white'
                            : 'bg-background text-textMuted hover:text-textPrimary border border-border'
                        }`}
                      >
                        All ({totalChecked})
                      </button>

                      <button
                        type="button"
                        onClick={() => setStreamFilter('allotted')}
                        className={`px-3 py-1.5 rounded-xl transition-all ${
                          streamFilter === 'allotted'
                            ? 'bg-success text-white'
                            : 'bg-background text-textMuted hover:text-textPrimary border border-border'
                        }`}
                      >
                        Allotted ({allottedCount})
                      </button>

                      <button
                        type="button"
                        onClick={() => setStreamFilter('not_allotted')}
                        className={`px-3 py-1.5 rounded-xl transition-all ${
                          streamFilter === 'not_allotted'
                            ? 'bg-primary text-white'
                            : 'bg-background text-textMuted hover:text-textPrimary border border-border'
                        }`}
                      >
                        Not Allotted ({appliedNotAllottedCount})
                      </button>

                      <button
                        type="button"
                        onClick={() => setStreamFilter('did_not_apply')}
                        className={`px-3 py-1.5 rounded-xl transition-all ${
                          streamFilter === 'did_not_apply'
                            ? 'bg-danger text-white'
                            : 'bg-background text-textMuted hover:text-textPrimary border border-border'
                        }`}
                      >
                        Not Applied ({didNotApplyCount})
                      </button>

                      {errorCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setStreamFilter('error')}
                          className={`px-3 py-1.5 rounded-xl transition-all ${
                            streamFilter === 'error'
                              ? 'bg-amber-500 text-white'
                              : 'bg-background text-textMuted hover:text-textPrimary border border-border'
                          }`}
                        >
                          Errors ({errorCount})
                        </button>
                      )}
                    </div>

                    {/* Search Field */}
                    <div className="relative min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted" />
                      <input
                        type="text"
                        value={streamSearch}
                        onChange={e => setStreamSearch(e.target.value)}
                        placeholder="Search Name / PAN..."
                        className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-xl text-xs text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-primary/50"
                      />
                      {streamSearch && (
                        <button
                          type="button"
                          onClick={() => setStreamSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Streamed Results Cards List */}
                {filteredResults.length === 0 ? (
                  <div className="text-center py-10 bg-surface rounded-3xl border border-dashed border-border p-6 text-sm text-textMuted">
                    No results match your active filter / search query.
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {filteredResults.map(result => (
                      <div
                        key={result.applicantId}
                        className={`bg-surface rounded-2xl p-5 border shadow-sm transition-all ${
                          result.status === 'found'
                            ? result.records?.some(r => r.allottedShares > 0)
                              ? 'border-success/40'
                              : 'border-border'
                            : result.status === 'error'
                              ? 'border-amber-500/30 bg-amber-500/5'
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
                                : result.status === 'error'
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
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
                                  ALLOTTED 🎉
                                </div>
                              ) : (
                                <div className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 text-xs font-bold tracking-wide text-center">
                                  APPLIED (NOT ALLOTTED)
                                </div>
                              )
                            ) : result.status === 'error' ? (
                              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-bold tracking-wide text-center">
                                RETRY NEEDED
                              </div>
                            ) : (
                              <div className="px-3 py-1.5 rounded-xl bg-danger/10 text-danger border border-danger/20 text-xs font-bold tracking-wide text-center">
                                IPO NOT APPLIED
                              </div>
                            )}
                          </div>
                        </div>

                        {result.status === 'error' && (
                          <div className="mt-3 pt-2.5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-xs text-amber-500 flex items-center gap-1.5 min-w-0">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{result.error || 'Verification query timed out. Please retry.'}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRetrySingleApplicant(result.applicantId)}
                              disabled={bulkVerifying}
                              className="px-3 py-1 rounded-xl bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 self-start sm:self-center"
                            >
                              <RefreshCw className={`w-3 h-3 ${bulkVerifying ? 'animate-spin' : ''}`} />
                              Retry Applicant
                            </button>
                          </div>
                        )}

                        {/* Detail Breakdown for Found Bids */}
                        {result.status === 'found' && result.records?.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3.5 border-t border-border">
                            {result.records.map((rec, i) => (
                              <div key={i} className="contents">
                                <div className="p-2.5 rounded-xl bg-background border border-border">
                                  <p className="text-[10px] uppercase font-bold text-textMuted">Applied</p>
                                  <p className="text-xs font-bold text-textPrimary mt-0.5">{rec.appliedShares != null ? `${rec.appliedShares.toLocaleString()} Shs` : '—'}</p>
                                </div>

                                <div className={`p-2.5 rounded-xl border ${rec.allottedShares > 0 ? 'bg-success/5 border-success/20' : 'bg-background border-border'}`}>
                                  <p className="text-[10px] uppercase font-bold text-textMuted">Allotted</p>
                                  <p className={`text-xs font-bold mt-0.5 ${rec.allottedShares > 0 ? 'text-success' : 'text-textPrimary'}`}>
                                    {rec.allottedShares != null ? `${rec.allottedShares.toLocaleString()} Shs` : '—'}
                                  </p>
                                </div>

                                <div className="p-2.5 rounded-xl bg-background border border-border">
                                  <p className="text-[10px] uppercase font-bold text-textMuted">App No</p>
                                  <p className="text-xs font-bold font-mono text-textPrimary mt-0.5 truncate">{rec.applicationNumber || '—'}</p>
                                </div>

                                <div className="p-2.5 rounded-xl bg-background border border-border">
                                  <p className="text-[10px] uppercase font-bold text-textMuted">Demat ID</p>
                                  <p className="text-xs font-bold font-mono text-textPrimary mt-0.5 truncate">
                                    {rec.dpClientId ? (rec.dpClientId.length > 4 ? `************${rec.dpClientId.slice(-4)}` : rec.dpClientId) : '—'}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {result.status === 'not_found' && (
                          <p className="text-xs text-textMuted mt-3 pt-2.5 border-t border-border">
                            No active application bid was recorded for this applicant under {selectedSymbol?.symbol}.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── DELETE CONFIRMATION MODAL ────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface rounded-3xl p-6 border border-border shadow-2xl max-w-sm w-full space-y-4"
            >
              <h3 className="text-lg font-bold text-textPrimary">Remove Family Member</h3>
              <p className="text-sm text-textMuted">
                Are you sure you want to remove <span className="font-bold text-textPrimary">{deleteConfirm.name}</span> ({deleteConfirm.maskedPan}) from your portfolio?
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-textMuted hover:bg-surfaceHover transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteApplicant(deleteConfirm.id)}
                  className="flex-1 py-2.5 rounded-xl bg-danger text-white text-sm font-semibold hover:bg-danger/90 transition-all"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
