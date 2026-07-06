'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set');
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    rateDelta: 1500,
    rateLimit: 3,
  });
  return transporter;
}

// ── Category styling ──────────────────────────────────────────────────────────

function getCategoryStyle(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('result') || c.includes('financial')) return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
  if (c.includes('dividend') || c.includes('bonus'))   return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
  if (c.includes('board') || c.includes('meeting'))    return { bg: '#dbeafe', text: '#1e3a8a', border: '#bfdbfe' };
  if (c.includes('merger') || c.includes('acqui') || c.includes('takeover')) return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
  if (c.includes('agm') || c.includes('egm'))          return { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' };
  if (c.includes('buyback'))                           return { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' };
  if (c.includes('insider') || c.includes('sast'))     return { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' };
  return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
}

// ── Single announcement email HTML ────────────────────────────────────────────

function buildEmailHtml(userName, announcements) {
  return announcements.map((ann) => buildSingleEmailHtml(userName, ann)).join(
    '<div style="height:24px;background:#f8fafc;"></div>'
  );
}

function buildSingleEmailHtml(userName, ann) {
  const catStyle   = getCategoryStyle(ann.category);
  const isCritical = ann.critical === true;
  const company    = (ann.scriptName  || ann.scriptCode || 'Unknown').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const code       = (ann.scriptCode  || ann.scripCode  || '').replace(/</g, '&lt;');
  const category   = (ann.category    || 'General').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const subCat     = (ann.subCategory || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const subject    = (ann.subject     || ann.headline || ann.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const timeStr    = ann.datetimeIST  || ann.time || '';
  const exchange   = ann.exchange     || 'BSE';

  const exchangeStyle = exchange === 'NSE'
    ? 'background:#dcfce7;color:#166534;border:1px solid #bbf7d0;'
    : 'background:#dbeafe;color:#1e3a8a;border:1px solid #bfdbfe;';

  const pdfBtn = ann.pdfUrl
    ? `<a href="${ann.pdfUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-right:12px;box-shadow:0 2px 4px rgba(37,99,235,0.2);">View PDF</a>`
    : '';
  const bseBtn = ann.sourceUrl
    ? `<a href="${ann.sourceUrl}" style="display:inline-block;background:#ffffff;color:#475569;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;border:1px solid #cbd5e1;box-shadow:0 1px 2px rgba(0,0,0,0.05);">View Source</a>`
    : '';

  const criticalBanner = isCritical ? `
    <tr>
      <td style="background:#fee2e2;padding:12px 32px;text-align:center;border-bottom:1px solid #fecaca;">
        <span style="color:#b91c1c;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">
          CRITICAL ANNOUNCEMENT
        </span>
      </td>
    </tr>` : '';

  const subCatRow = subCat ? `
    <tr>
      <td style="padding:0 32px 16px;">
        <span style="display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;padding:6px 12px;border-radius:6px;color:#64748b;font-size:13px;font-weight:500;">
          <strong>Sub-category:</strong> ${subCat}
        </span>
      </td>
    </tr>` : '';

  let aiSummaryHtml = '';
  if (ann.aiSummary && typeof ann.aiSummary === 'object') {
    const s = ann.aiSummary;
    const bullets = Array.isArray(s.summary) ? s.summary.map(b => `<li style="margin-bottom:8px;">${b}</li>`).join('') : '';
    
    let metrics = '';
    if (s.financials && s.financials.applicable !== false) {
      const getMet = (label, val, qoq, yoy) => {
        if (!val || val === 'Not Reported' || val === 'Not Applicable') return '';
        const getColor = (num) => parseFloat(num) > 0 ? '#166534' : parseFloat(num) < 0 ? '#991b1b' : '#475569';
        const getBg = (num) => parseFloat(num) > 0 ? '#dcfce7' : parseFloat(num) < 0 ? '#fee2e2' : '#f1f5f9';
        
        const qBadge = (qoq && qoq !== 'Not Reported' && qoq !== 'Not Applicable') ? `<span style="background:${getBg(qoq)};color:${getColor(qoq)};padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;margin-left:4px;">QoQ ${qoq}%</span>` : '';
        const yBadge = (yoy && yoy !== 'Not Reported' && yoy !== 'Not Applicable') ? `<span style="background:${getBg(yoy)};color:${getColor(yoy)};padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;margin-left:4px;">YoY ${yoy}%</span>` : '';
        
        return `<div style="padding:10px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;text-align:center;width:30%;box-sizing:border-box;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:4px;">${label}</div>
          <div style="font-size:14px;color:#0f172a;font-weight:700;margin-bottom:6px;">${val}</div>
          <div style="display:flex;justify-content:center;gap:4px;">${qBadge}${yBadge}</div>
        </div>`;
      };
      
      const rev = getMet('Revenue', s.financials.revenue?.current, s.financials.revenue?.qoqPercent, s.financials.revenue?.yoyPercent);
      const pat = getMet('Net Profit', s.financials.netProfit?.current, s.financials.netProfit?.qoqPercent, s.financials.netProfit?.yoyPercent);
      const ebitda = getMet('EBITDA', s.financials.ebitda?.current, s.financials.ebitda?.qoqPercent, s.financials.ebitda?.yoyPercent);
      
      if (rev || pat || ebitda) {
        metrics = `<div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px;">${rev}${ebitda}${pat}</div>`;
      }
    }

    aiSummaryHtml = `
    <tr>
      <td style="padding:0 32px 24px;">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:20px;border-radius:12px;">
          <div style="font-size:12px;font-weight:800;color:#166534;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;">
            ✨ Tatvarth AI Insight
          </div>
          ${s.headline ? `<div style="font-size:16px;font-weight:700;color:#14532d;margin-bottom:12px;">${s.headline}</div>` : ''}
          <ul style="margin:0;padding-left:20px;font-size:14px;color:#166534;line-height:1.6;">
            ${bullets}
          </ul>
          ${metrics}
        </div>
      </td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Tatvarth Stock Watch Alert — ${company}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  @media only screen and (max-width:600px){
    .wrapper{ padding:16px 8px !important; }
    .card{ border-radius:12px !important; }
    .company-name{ font-size:22px !important; }
    .btn-row td{ display:block !important; text-align:center !important; padding-bottom:12px !important; }
    .btn-row a{ display:block !important; margin:0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8fafc;min-height:100vh;">
  <tr>
    <td align="center" class="wrapper" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" class="card" 
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 10px 15px -3px rgba(0,0,0,0.05),0 4px 6px -4px rgba(0,0,0,0.05);overflow:hidden;">
        
        ${criticalBanner}

        <!-- ── Top bar ── -->
        <tr>
          <td style="background:#ffffff;padding:24px 32px 16px;border-bottom:1px solid #f1f5f9;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td>
                  <span style="font-size:18px;color:#0f172a;font-weight:800;letter-spacing:-0.5px;display:flex;align-items:center;">
                    Tatvarth Stock Watch
                  </span>
                </td>
                <td align="right">
                  <span style="font-size:12px;color:#64748b;font-weight:500;">${timeStr}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Company identity ── -->
        <tr>
          <td style="padding:32px 32px 16px;">
            <div style="margin-bottom:16px;">
              <span style="${exchangeStyle}padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:0.5px;">
                ${exchange}
              </span>
              &nbsp;
              <span style="background:${catStyle.bg};color:${catStyle.text};border:1px solid ${catStyle.border};padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;">
                ${category}
              </span>
            </div>
            <div class="company-name" style="font-size:26px;font-weight:800;color:#0f172a;line-height:1.2;margin-bottom:8px;letter-spacing:-0.5px;">
              ${company}
            </div>
            <div style="font-size:14px;color:#64748b;font-weight:500;">
              Code: <span style="color:#0f172a;font-weight:700;">${code}</span>
            </div>
          </td>
        </tr>

        <!-- ── Subject ── -->
        <tr>
          <td style="padding:0 32px 20px;">
            <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:16px 20px;border-radius:0 8px 8px 0;">
              <p style="margin:0;font-size:16px;color:#334155;line-height:1.6;font-weight:500;">
                ${subject}
              </p>
            </div>
          </td>
        </tr>

        ${subCatRow}
        ${aiSummaryHtml}

        <!-- ── Action buttons ── -->
        <tr>
          <td style="padding:12px 32px 40px;">
            <table cellpadding="0" cellspacing="0" role="presentation" class="btn-row">
              <tr>
                <td style="padding-right:0;">${pdfBtn}</td>
                <td>${bseBtn}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;line-height:1.6;text-align:center;font-weight:500;">
              Sent specifically to <strong style="color:#0f172a;">${(userName || 'you').replace(/</g,'&lt;')}</strong> because you track <strong style="color:#0f172a;">${company}</strong>.
            </p>
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;text-align:center;">
              Tatvarth Stock Watch is an automated market data aggregator. Not financial advice.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ── Send one email per announcement ──────────────────────────────────────────

async function sendAnnouncementEmails(userEmail, userName, announcements) {
  if (!userEmail) throw new Error('userEmail is required');
  if (!Array.isArray(announcements) || !announcements.length) return { sent: 0 };

  const t    = getTransporter();
  let sent   = 0;
  
  // Remove emojis from the From header to prevent spam triggers
  const from = `"Tatvarth Stock Watch Alerts" <${process.env.GMAIL_USER}>`;

  for (const ann of announcements) {
    const company  = ann.scriptName || ann.scriptCode || 'Unknown';
    const category = ann.category   || 'General';
    
    // A clean, professional subject line without spammy brackets or emojis
    const subject  = `${company} (${ann.exchange || 'BSE'}): New Update from Tatvarth Stock Watch`;
    
    const html     = buildSingleEmailHtml(userName, ann);
    
    // Construct a high-quality plaintext version that matches the HTML closely
    const text     = `
TATVARTH STOCK WATCH ALERT
================

A new corporate announcement has been released for a company in your watchlist.

Company: ${company} (${ann.scriptCode})
Exchange: ${ann.exchange || 'BSE'}
Category: ${category}
${ann.subCategory ? `Sub-category: ${ann.subCategory}` : ''}

Subject:
${ann.subject || ''}

Date & Time:
${ann.datetimeIST || ''}

${ann.pdfUrl ? `View PDF: ${ann.pdfUrl}` : ''}
${ann.sourceUrl ? `View on BSE: ${ann.sourceUrl}` : ''}

--
Sent specifically to ${userName || 'you'} because you track ${company}.
Tatvarth Stock Watch is an automated market data aggregator. Not financial advice.
    `.trim();

    try {
      await t.sendMail({ 
        from, 
        to: userEmail, 
        subject, 
        html, 
        text,
        headers: {
          'X-Entity-Ref-ID': ann.id || Date.now().toString(),
          'Precedence': 'bulk'
        }
      });
      sent++;
    } catch (e) {
      console.error(`[Mailer] Failed for ${company}: ${e.message}`);
    }
  }

  console.log(`[Mailer] Sent ${sent}/${announcements.length} emails to ${userEmail}`);
  return { sent };
}

// Keep old single-email function for /api/email-preview (renders all as one page)
async function sendAnnouncementEmail(userEmail, userName, announcements) {
  return sendAnnouncementEmails(userEmail, userName, announcements);
}

// ── Price alert email ─────────────────────────────────────────────────────────

function buildPriceAlertHtml(alert) {
  const dir       = alert.direction === 'above' ? 'ABOVE' : 'BELOW';
  const arrow     = alert.direction === 'above' ? '&#9650;' : '&#9660;';
  const color     = alert.direction === 'above' ? '#16a34a' : '#dc2626';
  const bgColor   = alert.direction === 'above' ? '#f0fdf4' : '#fef2f2';
  const border    = alert.direction === 'above' ? '#bbf7d0' : '#fecaca';
  const name      = (alert.scriptName  || alert.scriptCode || 'Unknown').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const code      = (alert.scriptCode  || '').replace(/</g, '&lt;');
  const ltp       = alert.ltp   != null ? `&#8377;${Number(alert.ltp).toFixed(2)}`       : '—';
  const threshold = alert.threshold != null ? `&#8377;${Number(alert.threshold).toFixed(2)}` : '—';
  const pct       = alert.pctChange != null
    ? `${alert.pctChange >= 0 ? '+' : ''}${Number(alert.pctChange).toFixed(2)}%`
    : '';
  const now = new Date(alert.triggeredAt || Date.now())
    .toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Price Alert — ${name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  body { font-family: 'Inter', sans-serif; }
</style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8fafc;min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 10px 15px -3px rgba(0,0,0,0.05);overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#ffffff;padding:24px 32px 16px;border-bottom:1px solid #f1f5f9;">
            <span style="font-size:18px;color:#0f172a;font-weight:800;display:flex;align-items:center;">
              Tatvarth Stock Watch
            </span>
            <div style="color:#64748b;font-size:12px;margin-top:2px;font-weight:600;letter-spacing:0.5px;">PRICE ALERT TRIGGERED</div>
          </td>
        </tr>

        <!-- Alert badge -->
        <tr>
          <td style="padding:32px 32px 0;text-align:center;">
            <div style="display:inline-block;background:${bgColor};border:1px solid ${border};border-radius:16px;padding:20px 40px;box-shadow:0 2px 4px rgba(0,0,0,0.02);">
              <div style="font-size:36px;font-weight:900;color:${color};letter-spacing:-1px;">${arrow} ${dir}</div>
              <div style="font-size:14px;color:#64748b;margin-top:8px;font-weight:500;">
                Target Threshold: <strong style="color:#0f172a;font-size:16px;">${threshold}</strong>
              </div>
            </div>
          </td>
        </tr>

        <!-- Company + price -->
        <tr>
          <td style="padding:32px 32px 0;text-align:center;">
            <div style="font-size:26px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">${name}</div>
            <div style="font-size:14px;color:#64748b;font-weight:600;margin-top:4px;">${code}</div>
            <div style="margin-top:24px;font-size:36px;font-weight:900;color:${color};letter-spacing:-1px;">${ltp}</div>
            ${pct ? `<div style="font-size:16px;color:${color};margin-top:4px;font-weight:600;">${pct} today</div>` : ''}
          </td>
        </tr>

        <!-- Timestamp -->
        <tr>
          <td style="padding:24px 32px 32px;text-align:center;">
            <div style="display:inline-block;background:#f1f5f9;padding:6px 16px;border-radius:20px;font-size:13px;color:#475569;font-weight:500;">
              ${now} IST
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">
              Tatvarth Stock Watch price alert &mdash; for informational purposes only.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

async function sendPriceAlertEmail(userEmail, alert) {
  if (!userEmail) throw new Error('userEmail is required');
  const t    = getTransporter();
  const dir  = alert.direction === 'above' ? 'ABOVE' : 'BELOW';
  const name = alert.scriptName || alert.scriptCode || 'Unknown';
  
  // Professional subject line
  const subj = `Price Alert: ${name} is ${dir} ₹${Number(alert.threshold).toFixed(2)}`;
  
  // High quality plaintext fallback
  const text = `
TATVARTH STOCK WATCH PRICE ALERT
======================

The price of a script in your watchlist has crossed your target threshold.

Company: ${name} (${alert.scriptCode})
Current Price (LTP): ₹${alert.ltp}
Target Threshold: ${dir} ₹${alert.threshold}
Triggered At: ${alert.triggeredAt}

--
Tatvarth Stock Watch is an automated market data aggregator. Not financial advice.
  `.trim();

  await t.sendMail({
    from: `"Tatvarth Stock Watch Alerts" <${process.env.GMAIL_USER}>`,
    to:   userEmail,
    subject: subj,
    html: buildPriceAlertHtml(alert),
    text,
    headers: {
      'X-Entity-Ref-ID': `price-${alert.scriptCode}-${Date.now()}`,
      'Precedence': 'bulk'
    }
  });
  console.log(`[Mailer] Price alert email sent for ${name} to ${userEmail}`);
}

// ── Board Meeting Global Email Alert ──────────────────────────────────────────

async function sendBoardMeetingAlertEmail(userEmail, userName, ann) {
  if (!userEmail) throw new Error('userEmail is required');
  const transporter = getTransporter();

  const company     = (ann.scriptName  || ann.scriptCode || 'Unknown').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const code        = (ann.scriptCode  || ann.scripCode  || '').replace(/</g, '&lt;');
  const category    = (ann.category    || 'General').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const subCategory = (ann.subCategory || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const subjectStr  = (ann.subject     || ann.headline || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const descStr     = (ann.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dateStr     = ann.date || 'Unknown Date';
  const timeStr     = ann.time || 'Unknown Time';
  const exchange    = ann.exchange     || 'BSE';
  const isCritical  = !!ann.critical;
  
  const linkUrl = ann.pdfUrl || ann.sourceUrl || 'https://tatvarthstockwatch.web.app/board-meetings';

  // Format HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Board Meeting Announcement Released – ${company}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f7f6; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); overflow: hidden; }
  .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 30px; text-align: center; color: #ffffff; }
  .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
  .content { padding: 40px 30px; color: #334155; }
  .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 20px; }
  .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
  .detail-row { margin-bottom: 12px; font-size: 14px; }
  .detail-label { font-weight: 600; color: #64748b; width: 140px; display: inline-block; }
  .detail-value { font-weight: 700; color: #0f172a; }
  .critical-badge { display: inline-block; background: #ef4444; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-left: 8px; }
  .summary { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; font-size: 14px; margin-top: 20px; border-radius: 0 8px 8px 0; color: #78350f; }
  .description-box { margin-top: 15px; font-size: 13px; color: #475569; line-height: 1.6; }
  .action-btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; text-align: center; margin: 30px 0; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.2); }
  .footer { background: #f1f5f9; padding: 20px 30px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  @media only screen and (max-width:600px){
    .container { margin: 10px; border-radius: 8px; }
    .content { padding: 20px; }
    .detail-label { display: block; margin-bottom: 4px; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Board Meeting Update</h1>
  </div>
  <div class="content">
    <div class="greeting">Hello ${userName || 'Investor'},</div>
    <p style="font-size: 15px; line-height: 1.6;">A new Board Meeting announcement has just been released for one of today's scheduled Board Meetings.</p>
    
    <div class="details-box">
      <div class="detail-row"><span class="detail-label">Company Name:</span> <span class="detail-value">${company} (${code})</span></div>
      <div class="detail-row"><span class="detail-label">Board Meeting Date:</span> <span class="detail-value">${dateStr}</span></div>
      <div class="detail-row"><span class="detail-label">Announcement Time:</span> <span class="detail-value">${timeStr}</span></div>
      <div class="detail-row"><span class="detail-label">Exchange:</span> <span class="detail-value">${exchange}</span></div>
      <div class="detail-row">
        <span class="detail-label">Category:</span> 
        <span class="detail-value">${category}${subCategory ? ` - ${subCategory}` : ''}</span>
        ${isCritical ? '<span class="critical-badge">Critical</span>' : ''}
      </div>
    </div>
    
    ${subjectStr ? `
    <div class="summary">
      <strong>Announcement Subject:</strong><br/>
      ${subjectStr}
    </div>
    ` : ''}

    ${descStr && descStr !== subjectStr ? `
    <div class="description-box">
      <strong>Details:</strong><br/>
      ${descStr}
    </div>
    ` : ''}
    
    <center>
      <a href="${linkUrl}" target="_blank" rel="noreferrer" class="action-btn">View Full Announcement Document</a>
    </center>
  </div>
  
  <div class="footer">
    <p style="margin: 0 0 10px 0;">You are receiving this email because you enabled <strong>"Send me Board Meeting Updates"</strong> in your account settings on the Board Meeting page.</p>
    <p style="margin: 0;">You can disable these notifications at any time by unchecking the option on the Board Meeting page.</p>
  </div>
</div>
</body>
</html>`;

  await transporter.sendMail({
    from: '"Tatvarth Stock Watch" <tatvarthstockwatch@gmail.com>',
    to: userEmail,
    subject: `📢 Board Meeting Announcement Released – ${company}`,
    html,
  });
}

module.exports = { sendAnnouncementEmail, sendAnnouncementEmails, buildEmailHtml, buildSingleEmailHtml, sendPriceAlertEmail, sendBoardMeetingAlertEmail };
