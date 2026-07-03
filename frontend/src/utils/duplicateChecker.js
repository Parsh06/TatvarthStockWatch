export function checkDuplicates(uploadedRows, existingWatchlist = []) {
  const valid               = []
  const intraFileDuplicates = []
  const crossFileDuplicates = []
  const errors              = []

  const seenCodes   = new Map()  // ltdCode → index
  const seenSymbols = new Map()  // symbol  → index

  const existingCodes   = new Set(existingWatchlist.map((s) => (s.ltdCode  || '').trim().toLowerCase()).filter(Boolean))
  const existingSymbols = new Set(existingWatchlist.map((s) => (s.symbol   || '').trim().toUpperCase()).filter(Boolean))
  const existingNames   = new Set(existingWatchlist.map((s) => (s.scriptName || '').trim().toLowerCase()).filter(Boolean))

  uploadedRows.forEach((row, index) => {
    const name    = (row.scriptName || '').trim()
    const ltdCode = (row.ltdCode    || '').trim()
    const symbol  = (row.symbol     || '').trim().toUpperCase()

    if (!name && !ltdCode && !symbol) {
      errors.push({ ...row, _index: index, _reason: 'missing Script Name and LTD Code/Symbol' })
      return
    }
    if (!name) {
      errors.push({ ...row, _index: index, _reason: 'missing Script Name' })
      return
    }
    if (!ltdCode && !symbol) {
      errors.push({ ...row, _index: index, _reason: 'missing LTD Code and Symbol (at least one required)' })
      return
    }

    // Intra-file duplicate
    const intraDup =
      (ltdCode && seenCodes.has(ltdCode.toLowerCase()))     ? 'duplicate LTD Code in file'  :
      (symbol  && seenSymbols.has(symbol))                  ? 'duplicate Symbol in file'    : null

    if (intraDup) {
      intraFileDuplicates.push({ ...row, _index: index, _reason: intraDup })
      return
    }

    // Cross-file duplicate
    const crossDup =
      (ltdCode && existingCodes.has(ltdCode.toLowerCase()))  ? 'LTD Code already in watchlist'  :
      (symbol  && existingSymbols.has(symbol))               ? 'Symbol already in watchlist'     :
      (name    && existingNames.has(name.toLowerCase()))     ? 'Name already in watchlist'        : null

    if (crossDup) {
      crossFileDuplicates.push({ ...row, _index: index, _reason: crossDup })
      return
    }

    if (ltdCode) seenCodes.set(ltdCode.toLowerCase(), index)
    if (symbol)  seenSymbols.set(symbol, index)
    valid.push({ ...row, _index: index })
  })

  return { valid, intraFileDuplicates, crossFileDuplicates, errors }
}
