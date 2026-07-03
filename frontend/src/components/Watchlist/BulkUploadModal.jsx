import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { X, Upload, Download, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { parseCSV, parseExcel, downloadCSVTemplate } from '../../utils/csvParser'
import { checkDuplicates } from '../../utils/duplicateChecker'
import { useWatchlist } from '../../contexts/WatchlistContext'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  valid: { label: 'Valid', class: 'text-success', icon: CheckCircle },
  intra: { label: 'Intra-file duplicate', class: 'text-warning', icon: AlertTriangle },
  cross: { label: 'Already in watchlist', class: 'text-orange-400', icon: AlertTriangle },
  error: { label: 'Error', class: 'text-danger', icon: XCircle },
}

export default function BulkUploadModal({ isOpen, onClose }) {
  const { watchlist, bulkAdd } = useWatchlist()
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [result, setResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (isOpen) { setStep(1); setFile(null); setRows([]); setResult(null); setImportResult(null) }
  }, [isOpen])

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const onDrop = useCallback(async (accepted) => {
    if (!accepted.length) return
    const f = accepted[0]
    setFile(f)
    let parsed
    if (f.name.endsWith('.csv')) parsed = await parseCSV(f)
    else parsed = await parseExcel(f)
    const checked = checkDuplicates(parsed.data, watchlist)
    const allRows = [
      ...checked.valid.map((r) => ({ ...r, _status: 'valid' })),
      ...checked.intraFileDuplicates.map((r) => ({ ...r, _status: 'intra' })),
      ...checked.crossFileDuplicates.map((r) => ({ ...r, _status: 'cross' })),
      ...checked.errors.map((r) => ({ ...r, _status: 'error' })),
    ].sort((a, b) => a._index - b._index)
    setRows(allRows)
    setResult(checked)
    setStep(2)
  }, [watchlist])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    maxFiles: 1,
  })

  async function handleImport() {
    if (!result?.valid.length) return
    setImporting(true)
    setProgress(0)
    const interval = setInterval(() => setProgress((p) => Math.min(p + 15, 85)), 200)
    try {
      const res = await bulkAdd(result.valid)
      clearInterval(interval)
      setProgress(100)
      setImportResult(res)
      setStep(3)
      toast.success(`${res.added} scripts imported!`)
    } catch {
      clearInterval(interval)
      toast.error('Import failed')
    } finally {
      setImporting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-2xl w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-textPrimary">Bulk Upload Scripts</h2>
            <p className="text-xs text-textMuted mt-0.5">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-textPrimary transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex px-6 pt-4 gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className={clsx('h-1 flex-1 rounded-full transition-all', s <= step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-textMuted">Upload a CSV or Excel file with your scripts.</p>
                <button
                  onClick={downloadCSVTemplate}
                  className="flex items-center gap-2 px-3 py-1.5 border border-border text-textMuted hover:text-textPrimary hover:border-primary/50 rounded-lg text-xs transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Template
                </button>
              </div>
              <div
                {...getRootProps()}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition',
                  isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                )}
              >
                <input {...getInputProps()} />
                <Upload className="w-10 h-10 text-textMuted mx-auto mb-3" />
                {isDragActive ? (
                  <p className="text-sm text-primary">Drop it here!</p>
                ) : (
                  <>
                    <p className="text-sm text-textPrimary font-medium">Drag & drop your file here</p>
                    <p className="text-xs text-textMuted mt-1">or click to browse — CSV, XLSX, XLS</p>
                  </>
                )}
              </div>
              <div className="bg-background rounded-lg p-4 text-xs text-textMuted space-y-1">
                <p className="font-medium text-textPrimary">Required columns:</p>
                <p>• <code className="font-mono text-primary">Script Name</code> — Company name</p>
                <p>• <code className="font-mono text-primary">LTD Code</code> — BSE numeric code (e.g. <span className="text-textPrimary">500325</span>) — used for BSE announcements</p>
                <p>• <code className="font-mono text-primary">Symbol</code> — NSE trading symbol (e.g. <span className="text-textPrimary">INFY</span>) — used for NSE announcements</p>
                <p className="text-textMuted/60 mt-1">Both columns optional but at least one is needed. Announcements fetched from both BSE &amp; NSE automatically.</p>
              </div>
            </div>
          )}

          {step === 2 && result && (
            <div className="space-y-4">
              {/* Stats bar */}
              <div className="flex gap-3 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-success/15 text-success font-medium">{result.valid.length} valid</span>
                <span className="px-2.5 py-1 rounded-full bg-warning/15 text-warning font-medium">{result.intraFileDuplicates.length + result.crossFileDuplicates.length} duplicates</span>
                <span className="px-2.5 py-1 rounded-full bg-danger/15 text-danger font-medium">{result.errors.length} errors</span>
              </div>

              {/* Preview table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-y-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-background sticky top-0">
                      <tr className="text-textMuted">
                        <th className="px-3 py-2 text-left w-8">#</th>
                        <th className="px-3 py-2 text-left">Script Name</th>
                        <th className="px-3 py-2 text-left">LTD Code</th>
                        <th className="px-3 py-2 text-left">Symbol</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((row, i) => {
                        const cfg = STATUS_CONFIG[row._status]
                        const StatusIcon = cfg.icon
                        return (
                          <tr key={i} className="hover:bg-white/5">
                            <td className="px-3 py-2 text-textMuted">{row._index + 1}</td>
                            <td className="px-3 py-2 text-textPrimary truncate max-w-[140px]">{row.scriptName || '—'}</td>
                            <td className="px-3 py-2 font-mono text-textMuted">{row.ltdCode || '—'}</td>
                            <td className="px-3 py-2 font-mono text-orange-400">{row.symbol || '—'}</td>
                            <td className="px-3 py-2">
                              <div className={clsx('flex items-center gap-1', cfg.class)}>
                                <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>{row._status === 'error' ? `Error: ${row._reason}` : cfg.label}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-border text-textMuted hover:text-textPrimary rounded-lg text-sm transition"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={!result.valid.length || importing}
                  className="flex-1 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                >
                  {importing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {importing ? 'Importing...' : `Import ${result.valid.length} Valid Scripts`}
                </button>
              </div>
            </div>
          )}

          {step === 3 && importResult && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 bg-success/15 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-textPrimary text-lg">Import Complete!</h3>
                <p className="text-textMuted text-sm mt-1">
                  {importResult.added} scripts added successfully
                  {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}.
                </p>
              </div>
              <div className="w-full bg-background rounded-full h-2">
                <div className="bg-success h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
