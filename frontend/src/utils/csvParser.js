import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// Normalize a raw row from any supported format:
//   StockWatch template:  Script Name | LTD Code | Symbol
//   BSE Equity.csv:       Security Name | Security Code | Security Id
function normalizeRow(row) {
  const scriptName = (
    row['Script Name']   || row['scriptName']   ||
    row['Security Name'] || row['security_name'] || ''
  ).toString().trim()

  const ltdCode = (
    row['LTD Code']      || row['ltdCode']      ||
    row['Security Code'] || row['security_code'] || ''
  ).toString().trim()

  const symbol = (
    row['Symbol']      || row['symbol']      ||
    row['NSE Symbol']  || row['nseSymbol']   ||
    row['Security Id'] || row['security_id'] || ''
  ).toString().trim().toUpperCase()

  const group = (
    row['Group'] || row['group'] || row['Sector'] || row['sector'] || ''
  ).toString().trim()

  return { scriptName, ltdCode, symbol, exchange: 'BOTH', group }
}

export function parseCSV(file) {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve({ data: results.data.map(normalizeRow), errors: results.errors }),
      error:    (error)   => resolve({ data: [], errors: [error] }),
    })
  })
}

export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook  = XLSX.read(e.target.result, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rawData   = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
        resolve({ data: rawData.map(normalizeRow), errors: [] })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export function downloadCSVTemplate() {
  const headers = ['Script Name', 'LTD Code', 'Symbol', 'Group']
  const rows = [
    ['Reliance Industries', '500325', 'RELIANCE',  'Energy'],
    ['Infosys Limited',     '500209', 'INFY',      'IT'],
    ['HDFC Bank',           '500180', 'HDFCBANK',  'Banking'],
    ['Zomato Limited',      '543320', 'ZOMATO',    'Consumer'],
  ]
  const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'stockwatch_template.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportToXLSX(announcements, filename = 'announcements.xlsx') {
  if (!announcements || announcements.length === 0) return
  const rows = announcements.map((a) => ({
    'Date':        a.datetimeIST || a.date        || '',
    'Exchange':    a.exchange    || 'BSE',
    'Company':     a.scriptName  || a.companyName || '',
    'Code':        a.scriptCode  || a.scripCode   || '',
    'Category':    a.category    || '',
    'Subject':     a.subject     || a.headline    || '',
    'PDF Link':    a.pdfUrl      || '',
    'Source Link': a.sourceUrl   || '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 24 }, { wch: 8 }, { wch: 36 }, { wch: 10 },
    { wch: 22 }, { wch: 90 }, { wch: 55 }, { wch: 55 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Announcements')
  XLSX.writeFile(wb, filename)
}

export function exportToCSV(data, filename = 'export.csv') {
  if (!data || data.length === 0) return
  const headers    = Object.keys(data[0])
  const rows       = data.map((row) => headers.map((h) => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
  const csvContent = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
