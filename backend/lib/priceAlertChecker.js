'use strict';

/**
 * Checks live rates against per-script price alert thresholds.
 * Fires email + Telegram when a threshold is crossed.
 * Deduplicates: won't re-fire the same alert direction within COOLDOWN_MS.
 */

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes — don't spam

// In-memory cooldown map: `${scriptCode}:${direction}` → last fired timestamp
const _cooldown = new Map();

function isCooledDown(key) {
  const last = _cooldown.get(key);
  return !last || (Date.now() - last) > COOLDOWN_MS;
}

function markFired(key) {
  _cooldown.set(key, Date.now());
}

/**
 * Check all scripts with alert thresholds against the latest rates.
 * Returns array of fired alert objects.
 *
 * @param {object[]} scripts   - watchlist scripts (each may have alertAbove, alertBelow, alertEnabled)
 * @param {object}   ratesMap  - { [bseCode]: { ltp, ... } }
 * @param {object}   prefs     - { emailEnabled, telegramEnabled }
 * @param {Function} sendEmail - async fn(alert)
 * @param {Function} sendTelegram - async fn(alert)
 * @returns {object[]} fired alerts
 */
async function checkPriceAlerts(scripts, ratesMap, prefs, sendEmail, sendTelegram) {
  const fired = [];

  for (const script of scripts) {
    if (!script.alertEnabled) continue;

    const code = (script.ltdCode || script.bseCode || '').trim();
    if (!code) continue;

    const rate = ratesMap[code];
    if (!rate || rate.ltp == null) continue;

    const ltp = rate.ltp;
    const checks = [];

    if (script.alertAbove != null && ltp >= script.alertAbove) {
      checks.push({ direction: 'above', threshold: script.alertAbove });
    }
    if (script.alertBelow != null && ltp <= script.alertBelow) {
      checks.push({ direction: 'below', threshold: script.alertBelow });
    }

    for (const { direction, threshold } of checks) {
      const cooldownKey = `${code}:${direction}:${threshold}`;
      if (!isCooledDown(cooldownKey)) continue;

      const alert = {
        id:           `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        scriptCode:   code,
        scriptName:   script.scriptName || code,
        exchange:     script.exchange || 'BSE',
        direction,
        threshold,
        ltp,
        change:       rate.change,
        pctChange:    rate.pctChange,
        triggeredAt:  new Date().toISOString(),
        notified:     [],
      };

      markFired(cooldownKey);

      // Fire notifications
      if (prefs?.emailEnabled !== false && sendEmail) {
        try { await sendEmail(alert); alert.notified.push('email'); } catch (e) {
          console.error('[PriceAlert] Email failed:', e.message);
        }
      }
      if (prefs?.telegramEnabled !== false && sendTelegram) {
        try { await sendTelegram(alert); alert.notified.push('telegram'); } catch (e) {
          console.error('[PriceAlert] Telegram failed:', e.message);
        }
      }

      fired.push(alert);
      console.log(`[PriceAlert] ${script.scriptName} LTP ₹${ltp} ${direction} ₹${threshold} — notified: ${alert.notified.join(', ') || 'none'}`);
    }
  }

  return fired;
}

module.exports = { checkPriceAlerts };
