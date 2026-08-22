/**
 * Normalizes raw BSE gainers/losers row into a canonical object structure.
 * Headers: Security Code | Security Name | Group | LTP | Chg | % Chg
 */
export function normalizeBseData(row) {
  if (!row) return null
  const vol = row.trd_vol ?? row.volume ?? row.trade_volume ?? row.trd_volume ?? 0
  return {
    securityCode: row.scrip_cd || row.securityCode || '—',
    securityName: row.LONG_NAME || row.scripname || row.securityName || '—',
    group: row.scrip_grp || row.group || 'A',
    ltp: typeof row.ltradert === 'number' ? row.ltradert : (parseFloat(row.ltradert) || 0),
    change: typeof row.change_val === 'number' ? row.change_val : (parseFloat(row.change_val) || 0),
    percentChange: typeof row.change_percent === 'number' ? row.change_percent : (parseFloat(row.change_percent) || 0),
    volume: typeof vol === 'number' ? vol : (parseInt(vol, 10) || 0),
    rawUrl: row.URL || '',
  }
}

/**
 * Normalizes raw NSE gainers/losers row into a canonical object structure.
 * Headers: Symbol | Open | High | Low | Prev. Close | LTP | %chng | Volume (Shares) | Value (₹ Lakhs) | CA
 */
export function normalizeNseData(row) {
  if (!row) return null

  const openPrice = row.open_price ?? row.openPrice ?? 0
  const highPrice = row.high_price ?? row.highPrice ?? 0
  const lowPrice = row.low_price ?? row.lowPrice ?? 0
  const prevPrice = row.prev_price ?? row.prevPrice ?? 0
  const ltpVal = row.ltp ?? 0
  const perChangeVal = row.perChange ?? row.perChangeRaw ?? 0
  const volumeVal = row.trade_quantity ?? row.tradeQuantity ?? 0
  
  // Value (turnover * 100000 or raw value / totalTradedValue)
  const rawTurnover = row.turnover ?? row.turnover_lakhs ?? row.turnoverInLakhs ?? 0
  const rawValue = row.value ?? row.totalTradedValue ?? (rawTurnover ? rawTurnover * 100000 : 0)

  // CA (Corporate Action date or purpose)
  let caVal = '-'
  if (row.ca_ex_dt && row.ca_ex_dt !== '-') {
    caVal = row.ca_ex_dt
  } else if (row.ca_purpose && row.ca_purpose !== '-') {
    caVal = row.ca_purpose
  } else if (row.ca && row.ca !== '-') {
    caVal = row.ca
  }

  return {
    symbol: row.symbol || '—',
    open: typeof openPrice === 'number' ? openPrice : (parseFloat(openPrice) || 0),
    high: typeof highPrice === 'number' ? highPrice : (parseFloat(highPrice) || 0),
    low: typeof lowPrice === 'number' ? lowPrice : (parseFloat(lowPrice) || 0),
    previousClose: typeof prevPrice === 'number' ? prevPrice : (parseFloat(prevPrice) || 0),
    ltp: typeof ltpVal === 'number' ? ltpVal : (parseFloat(ltpVal) || 0),
    percentChange: typeof perChangeVal === 'number' ? perChangeVal : (parseFloat(perChangeVal) || 0),
    volume: typeof volumeVal === 'number' ? volumeVal : (parseInt(volumeVal, 10) || 0),
    value: typeof rawValue === 'number' ? rawValue : (parseFloat(rawValue) || 0),
    ca: caVal,
  }
}
