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

  const openPrice = typeof row.open_price === 'number' && !isNaN(row.open_price) ? row.open_price : (parseFloat(String(row.openPrice || row.open_price || 0).replace(/,/g, '')) || 0)
  const highPrice = typeof row.high_price === 'number' && !isNaN(row.high_price) ? row.high_price : (parseFloat(String(row.highPrice || row.high_price || 0).replace(/,/g, '')) || 0)
  const lowPrice = typeof row.low_price === 'number' && !isNaN(row.low_price) ? row.low_price : (parseFloat(String(row.lowPrice || row.low_price || 0).replace(/,/g, '')) || 0)
  const prevPrice = typeof row.prev_price === 'number' && !isNaN(row.prev_price) ? row.prev_price : (parseFloat(String(row.prevPrice || row.prev_price || 0).replace(/,/g, '')) || 0)
  const ltpVal = typeof row.ltp === 'number' && !isNaN(row.ltp) ? row.ltp : (parseFloat(String(row.ltp || 0).replace(/,/g, '')) || 0)
  const perChangeVal = typeof row.perChange === 'number' && !isNaN(row.perChange) ? row.perChange : (parseFloat(String(row.perChange || row.perChangeRaw || row.percentChange || 0).replace(/,/g, '')) || 0)
  const volumeVal = typeof row.trade_quantity === 'number' && !isNaN(row.trade_quantity) ? row.trade_quantity : (parseInt(String(row.tradeQuantity || row.trade_quantity || row.volume || 0).replace(/,/g, ''), 10) || 0)
  
  // Value (turnover * 100000 or raw value / totalTradedValue)
  const rawTurnover = row.turnover ?? row.turnover_lakhs ?? row.turnoverInLakhs ?? 0
  const rawVal = row.value ?? row.totalTradedValue ?? (rawTurnover ? rawTurnover * 100000 : 0)
  const valueVal = typeof rawVal === 'number' && !isNaN(rawVal) ? rawVal : (parseFloat(String(rawVal || 0).replace(/,/g, '')) || 0)

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
    open: openPrice,
    high: highPrice,
    low: lowPrice,
    previousClose: prevPrice,
    ltp: ltpVal,
    percentChange: perChangeVal,
    volume: volumeVal,
    value: valueVal,
    ca: caVal,
  }
}
