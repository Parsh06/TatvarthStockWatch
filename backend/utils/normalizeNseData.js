/**
 * Normalizes raw NSE item into canonical JSON object structure.
 * Standard fields: symbol, open, high, low, previousClose, ltp, percentChange, volume, value, ca
 */
function normalizeNseRow(row) {
  if (!row || typeof row !== 'object') return null;

  const symbol = row.symbol || '—';
  const openPrice = typeof row.open_price === 'number' && !isNaN(row.open_price) ? row.open_price : (parseFloat(String(row.openPrice || row.open_price || 0).replace(/,/g, '')) || 0);
  const highPrice = typeof row.high_price === 'number' && !isNaN(row.high_price) ? row.high_price : (parseFloat(String(row.highPrice || row.high_price || 0).replace(/,/g, '')) || 0);
  const lowPrice = typeof row.low_price === 'number' && !isNaN(row.low_price) ? row.low_price : (parseFloat(String(row.lowPrice || row.low_price || 0).replace(/,/g, '')) || 0);
  const prevPrice = typeof row.prev_price === 'number' && !isNaN(row.prev_price) ? row.prev_price : (parseFloat(String(row.prevPrice || row.prev_price || 0).replace(/,/g, '')) || 0);
  const ltpVal = typeof row.ltp === 'number' && !isNaN(row.ltp) ? row.ltp : (parseFloat(String(row.ltp || 0).replace(/,/g, '')) || 0);
  const perChangeVal = typeof row.perChange === 'number' && !isNaN(row.perChange) ? row.perChange : (parseFloat(String(row.perChange || row.perChangeRaw || 0).replace(/,/g, '')) || 0);
  const volumeVal = typeof row.trade_quantity === 'number' && !isNaN(row.trade_quantity) ? row.trade_quantity : (parseInt(String(row.tradeQuantity || row.trade_quantity || 0).replace(/,/g, ''), 10) || 0);
  
  // Value (turnover * 100000 or raw value / totalTradedValue)
  const rawTurnover = row.turnover ?? row.turnover_lakhs ?? row.turnoverInLakhs ?? 0;
  const rawVal = row.value ?? row.totalTradedValue ?? (rawTurnover ? rawTurnover * 100000 : 0);
  const valueVal = typeof rawVal === 'number' && !isNaN(rawVal) ? rawVal : (parseFloat(String(rawVal || 0).replace(/,/g, '')) || 0);

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
    open: openPrice,
    high: highPrice,
    low: lowPrice,
    previousClose: prevPrice,
    ltp: ltpVal,
    percentChange: perChangeVal,
    volume: volumeVal,
    value: valueVal,
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
