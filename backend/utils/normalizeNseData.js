/**
 * Normalizes raw NSE item into canonical JSON object structure.
 * Standard fields: symbol, open, high, low, previousClose, ltp, percentChange, volume, value, ca
 */
function normalizeNseRow(row) {
  if (!row || typeof row !== 'object') return null;

  const symbol = row.symbol || '—';
  const openPrice = row.open_price ?? row.openPrice ?? 0;
  const highPrice = row.high_price ?? row.highPrice ?? 0;
  const lowPrice = row.low_price ?? row.lowPrice ?? 0;
  const prevPrice = row.prev_price ?? row.prevPrice ?? 0;
  const ltpVal = row.ltp ?? 0;
  const perChangeVal = row.perChange ?? row.perChangeRaw ?? 0;
  const volumeVal = row.trade_quantity ?? row.tradeQuantity ?? 0;
  
  // Value (turnover * 100000 or raw value / totalTradedValue)
  const rawTurnover = row.turnover ?? row.turnover_lakhs ?? row.turnoverInLakhs ?? 0;
  const rawValue = row.value ?? row.totalTradedValue ?? (rawTurnover ? rawTurnover * 100000 : 0);

  let caVal = '-';
  if (row.ca_ex_dt && row.ca_ex_dt !== '-') {
    caVal = row.ca_ex_dt;
  } else if (row.ca_purpose && row.ca_purpose !== '-') {
    caVal = row.ca_purpose;
  } else if (row.ca && row.ca !== '-') {
    caVal = row.ca;
  }

  return {
    symbol,
    open: typeof openPrice === 'number' ? openPrice : (parseFloat(openPrice) || 0),
    high: typeof highPrice === 'number' ? highPrice : (parseFloat(highPrice) || 0),
    low: typeof lowPrice === 'number' ? lowPrice : (parseFloat(lowPrice) || 0),
    previousClose: typeof prevPrice === 'number' ? prevPrice : (parseFloat(prevPrice) || 0),
    ltp: typeof ltpVal === 'number' ? ltpVal : (parseFloat(ltpVal) || 0),
    percentChange: typeof perChangeVal === 'number' ? perChangeVal : (parseFloat(perChangeVal) || 0),
    volume: typeof volumeVal === 'number' ? volumeVal : (parseInt(volumeVal, 10) || 0),
    value: typeof rawValue === 'number' ? rawValue : (parseFloat(rawValue) || 0),
    ca: caVal,
  };
}

/**
 * Normalizes an array of NSE items and applies type-based sorting.
 */
function normalizeNseDataset(rawList, type = 'gainer') {
  if (!Array.isArray(rawList)) return [];

  const items = rawList
    .map(normalizeNseRow)
    .filter(Boolean);

  if (type === 'gainer') {
    items.sort((a, b) => b.percentChange - a.percentChange);
  } else {
    items.sort((a, b) => a.percentChange - b.percentChange);
  }

  return items;
}

module.exports = {
  normalizeNseRow,
  normalizeNseDataset,
};
