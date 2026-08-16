/**
 * RFC 4180 compliant CSV generator for normalized market mover datasets.
 */

function escapeCsvCell(val) {
  if (val == null) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

function generateNseCsv(data = []) {
  const headers = ['Symbol', 'Open', 'High', 'Low', 'Prev. Close', 'LTP', '%chng', 'Volume (Shares)', 'Value', 'CA'];
  const rows = data.map(item => [
    escapeCsvCell(item.symbol),
    item.open ?? 0,
    item.high ?? 0,
    item.low ?? 0,
    item.previousClose ?? 0,
    item.ltp ?? 0,
    item.percentChange ?? 0,
    item.volume ?? 0,
    item.value ?? 0,
    escapeCsvCell(item.ca ?? '-'),
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

function generateBseCsv(data = []) {
  const headers = ['Security Code', 'Security Name', 'Group', 'LTP', 'Chg', '% Chg'];
  const rows = data.map(item => [
    escapeCsvCell(item.securityCode),
    escapeCsvCell(item.securityName),
    escapeCsvCell(item.group || 'A'),
    item.ltp ?? 0,
    item.change ?? 0,
    item.percentChange ?? 0,
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

module.exports = {
  generateNseCsv,
  generateBseCsv,
};
