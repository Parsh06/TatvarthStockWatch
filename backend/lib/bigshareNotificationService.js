'use strict';

const { scrapeBigshareCompanies } = require('./bigshareScraper');
const { getISTDateString } = require('./time/istTime');
const { dispatchNewIpoAllotment } = require('./ipoAutoVerificationService');
const { saveIpoSymbols, markNotificationsSent } = require('./ipoStore');

/**
 * Build rich push notification payload when a new IPO allotment goes live on BigShare Online
 */
function buildBigshareAllotmentPayload(company) {
  const dateIST = getISTDateString();
  const name = company.name || company.symbol;
  return {
    title: `📢 IPO Allotment Live: ${name}`,
    body: `Allotment status for ${name} is now active on BigShare Online. Check your allotment on StockWatch now!`,
    url: `/ipo-check?symbol=${encodeURIComponent(company.clientId || company.symbol)}&registrar=BIGSHARE`,
    tag: `ipo-allotment-bigshare-${company.clientId || company.symbol}-${dateIST}`,
    type: 'ipo-allotment',
    actions: [
      { action: 'check-allotment', title: 'Check Allotment' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
}

/**
 * Scan for newly listed IPO allotment symbols on BigShare Online.
 * If new symbols are detected, dispatches:
 * 1. Stage 1 Immediate Broadcast to all users
 * 2. Stage 2 Scheduled 5-minute automated family PAN verification
 */
async function checkAndNotifyNewBigshareIpos() {
  try {
    const symbols = await scrapeBigshareCompanies({ forceRefresh: true });
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return { checked: 0, newIpos: 0 };
    }

    // Save to MongoDB iposymbols - returns only truly new IPOs inserted
    const newIpos = await saveIpoSymbols(symbols, 'BIGSHARE');
    if (!Array.isArray(newIpos) || newIpos.length === 0) {
      return { checked: symbols.length, newIpos: 0 };
    }

    console.log(`[BigShare Notification] Discovered ${newIpos.length} NEW IPO allotment(s) in MongoDB:`, newIpos.map(s => s.symbol).join(', '));

    // Dispatch 2-Stage Pipeline (Stage 1 Immediate Broadcast + Stage 2 5-Min Auto Family Check)
    for (const newIpo of newIpos) {
      if (newIpo.notificationSent) continue;

      try {
        await dispatchNewIpoAllotment({
          ipo: newIpo,
          registrar: 'BIGSHARE',
        });
      } catch (dispErr) {
        console.error('[BigShare Notification] Allotment dispatch error:', dispErr.message);
      }

      // Mark notification as permanently recorded in MongoDB
      await markNotificationsSent([newIpo], 'BIGSHARE');
    }

    return { checked: symbols.length, newIpos: newIpos.length };
  } catch (err) {
    console.warn('[BigShare Notification Service] Transient check notice:', err.message);
    return { checked: 0, newIpos: 0, error: err.message };
  }
}

module.exports = {
  checkAndNotifyNewBigshareIpos,
  buildBigshareAllotmentPayload,
};
