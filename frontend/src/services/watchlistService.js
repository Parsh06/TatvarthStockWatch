import { apiClient } from './apiClient'

// Normalize any incoming script object to the canonical shape
function normalizeScript(data) {
  const ltdCode    = String(data.ltdCode  || data.bseCode || data.scripCode || data.scriptCode || '').trim()
  const symbol     = String(data.symbol   || data.nseSymbol || '').trim().toUpperCase()
  const scriptName = String(data.scriptName || data.name || ltdCode || symbol).trim()
  const exchange   = String(data.exchange || 'BOTH').trim().toUpperCase()
  const notes      = String(data.notes || '').trim()
  const isin       = String(data.isin || '').trim()
  const group      = String(data.group || '').trim()
  return { ltdCode, symbol, scriptName, exchange, notes, isin, group }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getWatchlist(uid) {
  const data = await apiClient('/api/watchlist')
  return data.scripts || []
}

// ── Add ───────────────────────────────────────────────────────────────────────

export async function addScript(uid, scriptData) {
  const { ltdCode, symbol, scriptName, exchange, notes, isin, group } = normalizeScript(scriptData)
  if (!ltdCode) throw new Error('scriptData must include an LTD Code')

  const res = await apiClient('/api/watchlist', {
    method: 'POST',
    body:   JSON.stringify({ ltdCode, symbol, scriptName, exchange, notes, isin, group }),
  })
  
  // Call catch-up logic
  apiClient('/api/watchlist/catchup', {
    method: 'POST',
    body: JSON.stringify({ scriptCode: ltdCode })
  }).catch(e => console.error('[Watchlist Catchup]', e))
  
  return res
}

// ── Remove ────────────────────────────────────────────────────────────────────

export async function removeScript(uid, docId) {
  await apiClient(`/api/watchlist/${encodeURIComponent(docId)}`, { method: 'DELETE' })
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateScript(uid, docId, data) {
  await apiClient(`/api/watchlist/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    body:   JSON.stringify(data),
  })
}

export async function updateAlertSettings(uid, docId, data) {
  await apiClient(`/api/watchlist/${encodeURIComponent(docId)}/alert`, {
    method: 'PATCH',
    body:   JSON.stringify(data),
  })
}

// ── Bulk add ──────────────────────────────────────────────────────────────────

export async function bulkAddScripts(uid, scripts) {
  const toAdd = scripts.map(normalizeScript).filter(s => s.ltdCode && s.scriptName)
  
  const res = await apiClient('/api/watchlist/bulk', {
    method: 'POST',
    body:   JSON.stringify({ scripts: toAdd }),
  })

  // Trigger email catch-up for today's announcements in the background for all added codes
  for (const item of toAdd) {
    apiClient('/api/watchlist/catchup', {
      method: 'POST',
      body: JSON.stringify({ scriptCode: item.ltdCode })
    }).catch(e => console.error('[Watchlist Catchup Bulk]', e))
  }

  return res
}

// ── Clear ─────────────────────────────────────────────────────────────────────

export async function clearWatchlist(uid) {
  await apiClient('/api/watchlist/all', { method: 'DELETE' })
}
