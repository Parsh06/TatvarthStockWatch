'use strict';

const axios = require('axios');

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID   = () => process.env.TELEGRAM_CHAT_ID   || '';

function isConfigured() {
  return !!(BOT_TOKEN() && CHAT_ID());
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function esc(str) {
  // Escape HTML special chars for Telegram HTML parse mode
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function exchangeIcon(exchange) {
  return (exchange || '').toUpperCase() === 'NSE' ? '🟠' : '🔵';
}

function categoryIcon(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('result') || c.includes('financial')) return '📊';
  if (c.includes('dividend'))                           return '💰';
  if (c.includes('board') || c.includes('meeting'))     return '📋';
  if (c.includes('agm')   || c.includes('egm'))         return '🏛';
  if (c.includes('merger') || c.includes('acqui'))      return '🤝';
  if (c.includes('bonus') || c.includes('split'))       return '🎁';
  if (c.includes('insider'))                            return '⚠️';
  return '📢';
}

// ── Build message blocks ──────────────────────────────────────────────────────

function buildAnnouncementBlock(a) {
  const name     = esc(a.scriptName || a.companyName || a.scriptCode || '');
  const code     = esc(a.scriptCode || a.scripCode || '');
  const category = esc(a.category || 'General');
  const subject  = esc((a.subject || a.headline || '').slice(0, 200));
  const dateStr  = esc(a.datetimeIST || a.date || '');
  const exIcon   = exchangeIcon(a.exchange);
  const catIcon  = categoryIcon(a.category);

  let block = `${exIcon} <b>${name}</b>`;
  if (code) block += ` <code>${code}</code>`;
  block += `\n${catIcon} <i>${category}</i>`;
  if (subject) block += `\n${subject}`;
  if (dateStr) block += `\n🕐 <i>${dateStr}</i>`;

  const links = [];
  if (a.pdfUrl)    links.push(`<a href="${esc(a.pdfUrl)}">📄 PDF</a>`);
  if (a.sourceUrl) links.push(`<a href="${esc(a.sourceUrl)}">🔗 ${esc(a.exchange || 'BSE')}</a>`);
  if (links.length) block += `\n${links.join('  ·  ')}`;

  return block;
}

// Split array of announcement blocks into messages ≤ 4000 chars each
function splitIntoMessages(header, blocks) {
  const LIMIT   = 4000;
  const divider = '\n\n─────────────────────\n\n';
  const messages = [];
  let current = header;

  for (const block of blocks) {
    const candidate = current + divider + block;
    if (candidate.length > LIMIT && current !== header) {
      messages.push(current);
      current = `<b>StockWatch</b> (continued)\n\n${block}`;
    } else {
      current = current === header ? current + divider + block : candidate;
    }
  }
  if (current !== header) messages.push(current);
  return messages.length ? messages : [header];
}

// ── Send via Bot API ──────────────────────────────────────────────────────────

async function sendMessage(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN()}/sendMessage`;
  const res  = await axios.post(url, {
    chat_id:                  CHAT_ID(),
    text,
    parse_mode:               'HTML',
    disable_web_page_preview: true,
  }, { timeout: 10000 });
  return res.data;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send announcement digest to Telegram.
 * Splits automatically if > 4000 chars.
 */
async function sendTelegramAlert(announcements) {
  if (!isConfigured()) {
    return { sent: false, reason: 'not_configured' };
  }
  if (!announcements || announcements.length === 0) {
    return { sent: false, reason: 'no_announcements' };
  }

  const bseCount = announcements.filter((a) => (a.exchange || 'BSE') === 'BSE').length;
  const nseCount = announcements.filter((a) => a.exchange === 'NSE').length;
  const parts    = [];
  if (bseCount > 0) parts.push(`${bseCount} BSE`);
  if (nseCount > 0) parts.push(`${nseCount} NSE`);
  const breakdown = parts.length ? ` (${parts.join(' · ')})` : '';

  const now    = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const header = `📢 <b>StockWatch Alert</b>\n🗓 <i>${now} IST</i>\n\n<b>${announcements.length} new announcement${announcements.length !== 1 ? 's' : ''}${breakdown}</b>`;

  const blocks   = announcements.map(buildAnnouncementBlock);
  const messages = splitIntoMessages(header, blocks);

  let sentCount = 0;
  const errors  = [];
  for (const msg of messages) {
    try {
      await sendMessage(msg);
      sentCount++;
      // Small delay between messages to avoid Telegram rate limits
      if (messages.length > 1) await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      errors.push(e.message);
    }
  }

  const success = sentCount > 0;
  console.log(`[Telegram] ${success ? `Sent ${sentCount} message(s)` : 'Failed'} — ${announcements.length} announcements`);
  return { sent: success, messagesSent: sentCount, errors };
}

/**
 * Send a test message to verify credentials.
 */
async function sendTelegramTest() {
  if (!isConfigured()) {
    return { sent: false, reason: 'not_configured' };
  }
  try {
    await sendMessage(
      '✅ <b>StockWatch — Telegram Connected!</b>\n\nYour bot is configured correctly. You will receive announcement alerts here when news is fetched for your watchlist.'
    );
    return { sent: true };
  } catch (e) {
    console.error('[Telegram] Test failed:', e.message);
    return { sent: false, error: e.message };
  }
}

/**
 * Send a price alert notification to Telegram.
 */
async function sendTelegramPriceAlert(alert) {
  if (!isConfigured()) return { sent: false, reason: 'not_configured' };
  const dir  = alert.direction === 'above' ? '📈 ABOVE' : '📉 BELOW';
  const pct  = alert.pctChange != null ? ` (${alert.pctChange >= 0 ? '+' : ''}${alert.pctChange.toFixed(2)}%)` : '';
  const text = `🚨 <b>Price Alert — ${esc(alert.scriptName)}</b>\n` +
    `<code>${esc(alert.scriptCode)}</code>\n\n` +
    `${dir} ₹${alert.threshold}\n` +
    `Current LTP: <b>₹${alert.ltp}</b>${pct}\n\n` +
    `🕐 ${new Date(alert.triggeredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;
  try {
    await sendMessage(text);
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}

module.exports = { sendTelegramAlert, sendTelegramPriceAlert, sendTelegramTest, isConfigured };
