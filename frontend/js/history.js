/* transaction-history.js — REALTIME-FIRST VERSION using window.supabaseClient
   Priority: Supabase realtime (postgres_changes) → API fallback only if needed
   No forced initial full-page load when opening history tab
   Uses existing window.supabaseClient from dashboard.js
*/

(() => {
  'use strict';

  /* ──────────────────────────────── CONFIG ──────────────────────────────── */
  const CONFIG = {
    apiEndpoint: `${window.__SEC_API_BASE}/transactions`,
    currencySymbol: '₦',
    dateLocale: 'en-GB',
    chunkRenderSize: 12,
    realtimeRetryMs: 14000,
    realtimeHealthyThresholdMs: 8000,
    fallbackPollIntervalMs: 18000,
    fallbackAfterNoRealtimeMs: 25000
  };

  /* ──────────────────────────────── DOM ELEMENTS ──────────────────────────────── */
  const modal = document.getElementById('historyModal');
  const historyList = document.getElementById('historyList');
  const loadingEl = document.getElementById('historyLoading');
  const emptyEl = document.getElementById('historyEmpty');
  const downloadBtn = document.getElementById('downloadHistory');
  const searchInput = document.getElementById('historySearch');

  if (!modal || !historyList) {
    console.error('[TxHistory] Critical DOM elements missing');
    return;
  }

  historyList.innerHTML = ''; // clear any pre-existing static content

  /* ──────────────────────────────── STATE ──────────────────────────────── */
  let state = {
    open: false,
    items: [],                    // newest first
    grouped: [],
    searchTerm: '',
    lastRenderIndex: 0,
    realtimeActive: false,
    realtimeChannel: null,
    realtimeHealthyTs: 0,
    isSubscribing: false,
    retryTimer: null,
    fallbackPollTimer: null
  };

  let selectedMonth = null; // null = all time, or {year, month}

  /* ──────────────────────────────── UTILITIES ──────────────────────────────── */
  function formatCurrency(amount) {
    const n = Number(amount) || 0;
    return CONFIG.currencySymbol + n.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-NG', {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short'
      });
    } catch {
      return iso?.slice(0,16).replace('T',' ') || '—';
    }
  }

  function getTxIcon(tx) {
    let text = (tx.description || tx.narration || tx.service || tx.provider || '').toLowerCase();

    if (text.includes('opay'))      return { cls: 'incoming',       img: '/frontend/svg/bank.svg',      alt: 'Opay' };
    if (text.includes('mtn'))       return { cls: 'mtn targets',    img: '/frontend/img/mtn.svg',       alt: 'MTN' };
    if (text.includes('airtel'))    return { cls: 'airtel targets', img: '/frontend/svg/airtel-icon.svg', alt: 'Airtel' };
    if (text.includes('glo'))       return { cls: 'glo targets',    img: '/frontend/svg/GLO-icon.svg',  alt: 'GLO' };
    if (text.includes('9mobile') || text.includes('etisalat') || text.includes('nine')) {
      return { cls: 'nine-mobile targets', img: '/frontend/svg/9mobile-icon.svg', alt: '9Mobile' };
    }
    if (text.includes('refund'))    return { cls: 'refund incoming', img: '/frontend/svg/refund.svg', alt: 'Refund' };

    return { cls: tx.type === 'credit' ? 'incoming' : 'outgoing', img: '', alt: '' };
  }

  function truncateDescription(text) {
    if (!text) return '';
    let max = 25;
    const w = window.innerWidth;
    if (w >= 640  && w < 1024) max = 30;
    if (w >= 1024)             max = 40;
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  function safeFetch(url, opts = {}) {
    const headers = { ...(window.APP_TOKEN ? { Authorization: window.APP_TOKEN } : {}) };
    return fetch(url, { ...opts, headers, credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
  }

  /* ──────────────────────────────── TRANSACTION ITEM RENDER ──────────────────────────────── */
  function makeTxNode(tx) {
    try {
      const isCredit = tx.type === 'credit';
      const icon = getTxIcon(tx);
      const rawDesc = tx.description || tx.narration || tx.type || 'Transaction';
      const truncated = truncateDescription(rawDesc);
      const amountStr = formatCurrency(tx.amount);
      const dateTime = formatTime(tx.time || tx.created_at);

      let statusClass = 'success', statusText = 'SUCCESS';
      const st = (tx.status || 'success').toLowerCase().trim();
      if (st.includes('fail'))   { statusClass = 'failed';  statusText = 'FAILED';  }
      else if (st.includes('refund')) { statusClass = 'refund'; statusText = 'REFUNDED'; }
      else if (st.includes('pend'))   { statusClass = 'pending'; statusText = 'PENDING'; }

      const article = document.createElement('article');
      article.className = 'tx-item';
      article.setAttribute('role', 'listitem');

      article.innerHTML = `
        <div class="tx-icon ${icon.cls}" aria-hidden="true">
          ${icon.img
            ? `<img class="tx-img" src="${icon.img}" alt="${icon.alt}" />`
            : (isCredit ? '↓' : '↑')}
        </div>
        <div class="tx-content">
          <div class="tx-row">
            <div class="tx-desc" title="${rawDesc.replace(/"/g,'&quot;')}">${truncated}</div>
            <div class="tx-amount ${isCredit ? 'credit' : 'debit'}">
              ${isCredit ? '+' : '-'} ${amountStr}
            </div>
          </div>
          <div class="tx-row meta">
            <div class="tx-time">${dateTime}</div>
            <div class="tx-status" data-status="${statusClass}">${statusText}</div>
          </div>
        </div>
      `;

      article.addEventListener('click', () => showTransactionReceipt(tx));
      return article;
    } catch (err) {
      console.error('[Tx Render] Error:', err, tx);
      const fallback = document.createElement('div');
      fallback.className = 'tx-item error';
      fallback.textContent = 'Could not display transaction';
      return fallback;
    }
  }

  /* ──────────────────────────────── RECEIPT MODAL ──────────────────────────────── */
  function showTransactionReceipt(tx) {
    const existing = document.getElementById('receiptModal');
    if (existing) existing.remove();

    const icon = getTxIcon(tx);
    const amount = formatCurrency(Math.abs(Number(tx.amount || 0)));
    const dateObj = new Date(tx.time || tx.created_at);
    const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const phoneMatch = tx.description?.match(/\d{11}/)?.[0] || null;
    const bundleMatch = tx.description?.match(/\d+\.?\d* ?GB|[\d.]+ ?Days?/gi)?.join(' ') || null;

    const statusMap = {
      success:  { text: 'Successful', color: '#00D4AA' },
      failed:   { text: 'Failed',     color: '#FF3B30' },
      pending:  { text: 'Pending',    color: '#FF9500' },
      refunded: { text: 'Refunded',   color: '#00D4AA' }
    };

    const stLower = (tx.status || 'success').toLowerCase();
    const statusKey = stLower.includes('fail') ? 'failed' :
                      stLower.includes('refund') ? 'refunded' :
                      stLower.includes('pend') ? 'pending' : 'success';
    const status = statusMap[statusKey];

    const network = (() => {
      const d = (tx.description || '').toLowerCase();
      if (d.includes('mtn'))    return { name: 'MTN',    color: '#FFC107' };
      if (d.includes('airtel')) return { name: 'Airtel', color: '#E4002B' };
      if (d.includes('glo'))    return { name: 'GLO',    color: '#6FBF48' };
      if (d.includes('9mobile')||d.includes('etisalat')) return { name: '9Mobile', color: '#00A650' };
      if (d.includes('opay'))   return { name: 'Opay',   color: '#1E3225' };
      if (d.includes('refund')) return { name: 'Refund', color: '#fb923c' };
      return { name: 'Transaction', color: '' };
    })();

    const html = `
      <div id="receiptModal" style="position:fixed;inset:0;z-index:100000;background:#000;display:flex;flex-direction:column;font-family:system-ui,sans-serif;">
        <div class="backdrop" onclick="this.parentElement.remove()" style="position:absolute;inset:0;"></div>
        <div style="background:#1e1e1e;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;z-index:10;">
          <button onclick="document.getElementById('receiptModal')?.remove()" style="background:none;border:none;color:#aaa;padding:8px;border-radius:50%;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h2 style="margin:0;color:white;font-size:17px;font-weight:700;">Transaction Details</h2>
          <div style="width:40px;"></div>
        </div>
        <div style="flex:1;background:#121212;padding:16px;display:flex;flex-direction:column;gap:24px;overflow-y:auto;">
          <div style="background:#1e1e1e;border-radius:16px;padding:32px 24px 24px;position:relative;text-align:center;">
            <div class="${icon.cls}" style="width:56px;height:56px;border-radius:50%;position:absolute;top:-28px;left:50%;transform:translateX(-50%);background:${network.color};box-shadow:0 6px 16px #0006;display:flex;align-items:center;justify-content:center;">
              ${icon.img ? `<img src="${icon.img}" alt="${icon.alt}" style="width:32px;height:32px;object-fit:contain;">` : ''}
            </div>
            <div style="font-size:36px;font-weight:800;color:white;margin:40px 0 8px;">${amount}</div>
            <div style="color:${status.color};font-size:17px;font-weight:600;">${status.text}</div>
          </div>

          <div style="background:#1e1e1e;border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px;">
            <h3 style="margin:0;color:#ccc;font-size:15px;font-weight:600;">Details</h3>
            ${phoneMatch ? `<div style="display:flex;justify-content:space-between;color:#e0e0e0;font-size:14px;"><span>Phone</span><strong>${phoneMatch}</strong></div>` : ''}
            ${bundleMatch ? `<div style="display:flex;justify-content:space-between;color:#e0e0e0;font-size:14px;"><span>Bundle</span><strong>${bundleMatch}</strong></div>` : ''}
            <div style="display:flex;justify-content:space-between;color:#e0e0e0;font-size:14px;"><span>Type</span><strong>${tx.type === 'credit' ? 'Credit' : 'Debit'}</strong></div>
            <div style="display:flex;justify-content:space-between;color:#e0e0e0;font-size:14px;"><span>Reference</span><strong style="font-family:monospace;">${tx.reference || tx.id || '—'}</strong></div>
            <div style="display:flex;justify-content:space-between;color:#e0e0e0;font-size:14px;"><span>Date</span><strong>${dateStr} ${timeStr}</strong></div>
          </div>

          <div style="display:flex;gap:12px;margin-top:auto;">
            <button onclick="reportTransactionIssue('${tx.reference || tx.id || ''}')" style="flex:1;background:#2c2c2c;color:#00d4aa;border:1px solid #00d4aa;border-radius:50px;padding:14px;font-weight:600;">Report Issue</button>
            <button onclick="shareReceipt(this.closest('#receiptModal'), '${tx.reference || tx.id || ''}', '${amount}', '${(tx.description||'').replace(/'/g,"\\'")}', '${dateStr}', '${timeStr}', '${status.text}', '${network.name}', '${network.color}', '${icon.img||''}', '${tx.type}')" style="flex:1;background:linear-gradient(90deg,#00d4aa,#00bfa5);color:white;border:none;border-radius:50px;padding:14px;font-weight:600;">Share Receipt</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  }

  window.reportTransactionIssue = (id) => {
    alert(`Issue report for transaction ${id} — support flow would open here`);
    document.getElementById('receiptModal')?.remove();
  };

  // Note: keep your original shareReceipt function here (it's long, so not duplicated)

  window.reportTransactionIssue = reportTransactionIssue;
window.shareReceipt = shareReceipt;

/**
 * shareReceipt - Generates receipt matching the EXACT minimalist design
 * Clean white card, properly centered, with smart credit transaction handling
 */
function shareReceipt(modalEl, ref, amount, desc, date, time, statusText, networkName, networkColor, logoImg, txType) {
  
  // ====================
  // 1. INTELLIGENT DATA EXTRACTION
  // ====================
  
  const dataBundle = desc.match(/\d+\.?\d*\s?GB|[\d.]+\s?Days?/gi)?.join(' ') || null;
  const phoneNumber = desc.match(/0?\d{10,11}/)?.[0] || null;
  
  // Extract credit/funding source info
  const fromMatch = desc.match(/(?:from|via)\s+([A-Za-z0-9\s]+)/i);
  const accountNumberMatch = desc.match(/\b\d{10}\b/); // 10-digit account number
  const accountNameMatch = desc.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/); // Name pattern
  
  const fundingSource = fromMatch ? fromMatch[1].trim() : 'External Source';
  const accountNumber = accountNumberMatch ? accountNumberMatch[0] : null;
  const accountName = accountNameMatch ? accountNameMatch[0] : null;
  
  // Determine transaction category
  const isDataPurchase = desc.toLowerCase().includes('data') || dataBundle;
  const isAirtimePurchase = desc.toLowerCase().includes('airtime');
  const isCreditTransaction = txType === 'credit';
  const isRefund = desc.toLowerCase().includes('refund');
  const isWalletFunding = desc.toLowerCase().includes('fund') || desc.toLowerCase().includes('deposit');
  
  // Provider type detection
  const providerType = desc.toLowerCase().includes('sme') ? 'SME' 
    : desc.toLowerCase().includes('direct') ? 'Direct Data'
    : desc.toLowerCase().includes('gifting') ? 'Gifting'
    : desc.toLowerCase().includes('corporate') ? 'Corporate'
    : isAirtimePurchase ? 'VTU'
    : 'Standard';

  // ====================
  // 2. DYNAMIC HEADLINE
  // ====================
  
  let headline = '';
  if (isCreditTransaction || isWalletFunding) {
    headline = amount; // Show amount for credits (e.g., "₦5,000")
  } else if (isDataPurchase && dataBundle) {
    headline = dataBundle; // "3.5GB"
  } else if (isAirtimePurchase) {
    headline = amount; // "₦500"
  } else if (isRefund) {
    headline = 'Refund';
  } else {
    headline = amount; // Fallback
  }

  // ====================
  // 3. DYNAMIC METADATA ROWS
  // ====================
  
  const metadataRows = [];
  
  // FOR CREDIT TRANSACTIONS - Show funding source details
  if (isCreditTransaction || isWalletFunding) {
    metadataRows.push({ label: 'Source', value: fundingSource });
    
    if (accountNumber) {
      metadataRows.push({ label: 'Account Number', value: accountNumber });
    }
    
    if (accountName) {
      metadataRows.push({ label: 'Account Name', value: accountName });
    }
    
    // Determine bank/platform from description
    let platform = 'Bank Transfer';
    if (desc.toLowerCase().includes('opay')) platform = 'Opay';
    else if (desc.toLowerCase().includes('palmpay')) platform = 'PalmPay';
    else if (desc.toLowerCase().includes('kuda')) platform = 'Kuda Bank';
    else if (desc.toLowerCase().includes('gtbank') || desc.toLowerCase().includes('gtb')) platform = 'GTBank';
    
    metadataRows.push({ label: 'Via', value: platform });
  }
  // FOR DATA/AIRTIME PURCHASES
  else if (isDataPurchase || isAirtimePurchase) {
    if (networkName && networkName !== 'Transaction') {
      metadataRows.push({ label: 'Network', value: networkName });
    }
    
    if (providerType !== 'Standard') {
      metadataRows.push({ label: 'Type', value: providerType });
    }
    
    if (phoneNumber) {
      metadataRows.push({ label: 'Phone Number', value: phoneNumber });
    }
    
    if (isDataPurchase && dataBundle) {
      metadataRows.push({ label: 'Plan Duration', value: `${dataBundle} Monthly` });
    }
  }
  
  // Amount (always show)
  metadataRows.push({ label: 'Amount', value: amount });

  // ====================
  // 4. BUILD HTML - PERFECTLY CENTERED
  // ====================
  
  const receiptHTML = `
    <div style="
      background: #f5f5f5;
      padding: 20px;
      min-height: 100vh;
      box-sizing: border-box;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      
      <div style="max-width: 360px; width: 100%;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 4px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center;">
            <img src="https://flexgig.com.ng/frontend/svg/logo.svg" 
                 alt="Flexgig logo" 
                 style="width: 38px; margin-right: 8px; display: block;"
                 crossorigin="anonymous">
            <span style="font-size: 22px; font-weight: 700; color: #0a52ff;">Flexgig</span>
          </div>
          <div style="font-size: 13px; color: #aaa;">Transaction Receipt</div>
        </div>

        <!-- Receipt Card -->
        <div style="
          background: #fff;
          padding: 24px;
          border-radius: 16px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
          position: relative;
        ">
          
          <!-- Dotted top edge (receipt style) -->
          <div style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 10px;
            background: repeating-linear-gradient(90deg, transparent 0 6px, rgba(0,0,0,0.03) 6px 8px);
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
          "></div>

          <!-- Headline -->
          <div style="
            font-size: 26px;
            font-weight: 800;
            text-align: center;
            margin: 16px 0 6px;
            color: #000;
            line-height: 1;
          ">${headline}</div>

          <!-- Status -->
          <div style="
            display: block;
            text-align: center;
            font-size: 16px;
            margin-top: 6px;
            color: ${statusText === 'Successful' ? '#1fbf7a' : statusText === 'Failed' ? '#ff3b30' : '#ff9500'};
            font-weight: 600;
          ">${statusText}</div>

          <!-- Timestamp -->
          <div style="
            font-size: 13px;
            color: #555;
            text-align: center;
            margin-top: 6px;
            margin-bottom: 16px;
          ">${date} ${time}</div>

          <!-- Divider -->
          <div style="height: 1px; background: #eee; margin: 16px 0;"></div>

          <!-- Metadata Rows -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
            ${metadataRows.map(row => `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="color: #666; font-size: 13px;">${row.label}</div>
                <div style="
                  color: #555;
                  font-size: 14px;
                  font-weight: 600;
                  text-align: right;
                  max-width: 60%;
                  word-break: break-word;
                  ${row.label === 'Phone Number' || row.label === 'Account Number' ? 'font-family: monospace; letter-spacing: 0.5px;' : ''}
                ">${row.value}</div>
              </div>
            `).join('')}
          </div>

          <!-- Transaction Number -->
          <div style="font-size: 14px; color: #444; line-height: 1.8; margin-top: 8px;">
            <strong style="font-weight: 700;">Transaction No.:</strong> ${ref}
          </div>

          <!-- Divider -->
          <div style="height: 1px; background: #eee; margin: 16px 0;"></div>

          <!-- Footer -->
          <p style="
            font-size: 13px;
            color: #888;
            text-align: center;
            line-height: 1.4;
            margin: 14px 0 0;
          ">
            Flexgig is built for you — fast, secure and always reliable.<br>
            Join the Flexgig family today and enjoy more.
          </p>

        </div>
      </div>
    </div>
  `;

  // ====================
  // 5. RENDER & CAPTURE
  // ====================
  
  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = receiptHTML;
  tempContainer.style.cssText = 'position: fixed; top: -99999px; left: -99999px; width: 400px;';
  document.body.appendChild(tempContainer);

  // Wait for logo to load
  const logo = tempContainer.querySelector('img[alt="Flexgig logo"]');
  const logoPromise = new Promise(resolve => {
    if (logo && logo.complete) {
      resolve();
    } else if (logo) {
      logo.onload = resolve;
      logo.onerror = resolve;
    } else {
      resolve();
    }
  });

  logoPromise.then(() => {
    // Capture the entire centered container
    const mainDiv = tempContainer.firstElementChild;
    
    html2canvas(mainDiv, {
      scale: 2,
      backgroundColor: '#f5f5f5',
      logging: false,
      useCORS: true,
      allowTaint: false,
      width: 400,
      height: mainDiv.scrollHeight
    }).then(canvas => {
      canvas.toBlob(blob => {
        const filename = `FlexGig-Receipt-${ref.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        
        // Share or download
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: 'FlexGig Transaction Receipt',
            text: `Transaction Receipt - ${headline}`
          }).catch(err => {
            if (err.name !== 'AbortError') {
              console.log('Share failed, downloading instead');
              downloadImage(blob, filename);
            }
          });
        } else {
          downloadImage(blob, filename);
        }
        
        tempContainer.remove();
      }, 'image/png');
    }).catch(err => {
      console.error('Canvas generation failed:', err);
      alert('Failed to generate receipt image. Please try again.');
      tempContainer.remove();
    });
  });

  // Helper function for downloading
  function downloadImage(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // Close modal
  if (modalEl) modalEl.remove();
}


  window.addEventListener('resize', () => {
    document.querySelectorAll('.tx-desc').forEach(descEl => {
      const fullText = descEl.getAttribute('title') || descEl.textContent;
      descEl.textContent = truncateDescription(fullText);
    });
  });

  /* ──────────────────────────────── MONTH GROUPING & STICKY HEADERS ──────────────────────────────── */
  function groupTransactions(items) {
    const map = new Map();
    items.forEach(tx => {
      const d = new Date(tx.time || tx.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) map.set(key, { txs: [], totalIn: 0, totalOut: 0 });
      const g = map.get(key);
      g.txs.push(tx);
      const amt = Math.abs(Number(tx.amount || 0));
      if (tx.type === 'credit') g.totalIn += amt; else g.totalOut += amt;
    });

    return Array.from(map.entries())
      .sort((a,b) => b[0].localeCompare(a[0]))
      .map(([key, data]) => {
        const [y, m] = key.split('-').map(Number);
        const date = new Date(y, m);
        return {
          monthKey: key,
          prettyMonth: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
          totalIn: data.totalIn,
          totalOut: data.totalOut,
          txs: data.txs.sort((a,b) => new Date(b.time||b.created_at) - new Date(a.time||a.created_at))
        };
      });
  }

  function makeMonthDivider(month) {
    const div = document.createElement('div');
    div.className = 'month-section-header';
    div.dataset.monthKey = month.monthKey;
    div.innerHTML = `
      <div style="padding:12px 16px;background:#1e1e1e;display:flex;justify-content:space-between;align-items:center;border-top-left-radius:10px;border-top-right-radius:10px;">
        <div style="font-size:16px;font-weight:600;color:white;">${month.prettyMonth}</div>
      </div>
      <div style="padding:0 16px 12px;background:#1e1e1e;display:flex;justify-content:space-between;font-size:14px;color:#aaa;">
        <div>In: <strong style="color:white;">${formatCurrency(month.totalIn)}</strong></div>
        <div>Out: <strong style="color:white;">${formatCurrency(month.totalOut)}</strong></div>
      </div>
    `;
    return div;
  }

  function renderChunked(grouped) {
    historyList.innerHTML = '';
    state.lastRenderIndex = 0;

    const flat = [];
    grouped.forEach(m => {
      flat.push({ type: 'header', month: m });
      if (m.txs.length === 0) {
        flat.push({ type: 'empty-month', month: m });
      } else {
        m.txs.forEach(tx => flat.push({ type: 'tx', tx }));
      }
    });

    function renderNext() {
      const start = state.lastRenderIndex;
      const end = Math.min(flat.length, start + CONFIG.chunkRenderSize);
      const frag = document.createDocumentFragment();

      for (let i = start; i < end; i++) {
        const entry = flat[i];
        if (entry.type === 'header') {
          frag.appendChild(makeMonthDivider(entry.month));
        } else if (entry.type === 'tx') {
          frag.appendChild(makeTxNode(entry.tx));
        } else if (entry.type === 'empty-month') {
          const el = document.createElement('div');
          el.style.cssText = 'padding:60px 20px;text-align:center;color:#777;font-size:15px;';
          el.textContent = `No transactions in ${entry.month.prettyMonth}`;
          frag.appendChild(el);
        }
      }

      historyList.appendChild(frag);
      state.lastRenderIndex = end;

      if (end < flat.length) {
        requestAnimationFrame(renderNext);
      } else {
        window.trunTx?.();
      }
    }

    renderNext();
  }

  /* ──────────────────────────────── FILTER & RENDER LOGIC ──────────────────────────────── */
  function filterBySelectedMonth(items) {
    if (!selectedMonth) return items;
    return items.filter(tx => {
      const d = new Date(tx.time || tx.created_at);
      return d.getFullYear() === selectedMonth.year && d.getMonth() === selectedMonth.month;
    });
  }

  function applyTransformsAndRender() {
    let items = [...state.items];

    if (state.searchTerm) {
      const term = state.searchTerm.toLowerCase();
      items = items.filter(tx =>
        (tx.description || '').toLowerCase().includes(term) ||
        (tx.reference || tx.id || '').toLowerCase().includes(term)
      );
    }

    items = filterBySelectedMonth(items);
    const grouped = groupTransactions(items);
    renderChunked(grouped);

    if (items.length === 0) {
      if (selectedMonth) {
        const emptyMonth = {
          monthKey: `${selectedMonth.year}-${selectedMonth.month}`,
          prettyMonth: new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('en-GB', {month:'short',year:'numeric'}),
          totalIn: 0, totalOut: 0, txs: []
        };
        renderChunked([emptyMonth]);
      } else {
        emptyEl?.classList.remove('hidden');
      }
    } else {
      emptyEl?.classList.add('hidden');
    }
  }

  window.applyTransformsAndRender = applyTransformsAndRender;

  /* ──────────────────────────────── REALTIME SUBSCRIPTION (using window.supabaseClient) ──────────────────────────────── */
  async function subscribeToTransactions(force = false) {
    const now = Date.now();
    if (state.isSubscribing) return;
    if (!force && now - state.realtimeHealthyTs < CONFIG.realtimeHealthyThresholdMs) return;

    state.isSubscribing = true;

    try {
      const uid =
        window.__USER_UID ||
        localStorage.getItem('userId') ||
        JSON.parse(localStorage.getItem('userData')||'{}')?.uid ||
        null;

      if (!uid) {
        console.warn('[Tx RT] No user UID available — cannot subscribe');
        return;
      }

      if (!window.supabaseClient) {
        console.error('[Tx RT] window.supabaseClient not found');
        return;
      }

      const client = window.supabaseClient;

      // Subscribe
      const channelName = `tx-user:${uid.replace(/-/g,'')}`;
      state.realtimeChannel = client.channel(channelName);

      state.realtimeChannel
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_uid=eq.${uid}`
        }, (payload) => {
          if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;

          const tx = payload.new;

          const normalized = {
            id: tx.id || tx.reference || `tx-${Date.now()}`,
            reference: tx.reference || tx.id,
            type: tx.type || (Number(tx.amount||0) > 0 ? 'credit' : 'debit'),
            amount: Math.abs(Number(tx.amount || 0)),
            description: (tx.description || tx.narration || 'Transaction').trim(),
            time: tx.created_at || tx.time || new Date().toISOString(),
            status: tx.status || 'SUCCESS',
            provider: tx.provider,
            phone: tx.phone
          };

          // Deduplicate & add to top
          state.items = [normalized, ...state.items.filter(t => t.id !== normalized.id)];
          state.realtimeHealthyTs = Date.now();
          state.realtimeActive = true;

          if (state.open) {
            applyTransformsAndRender();
            historyList.scrollTop = 0;
          }

          window.dispatchEvent(new CustomEvent('transaction_update', { detail: normalized }));
        })
        .subscribe((status, err) => {
          console.log('[Tx RT] Channel status:', status);
          if (status === 'SUBSCRIBED') {
            state.realtimeHealthyTs = Date.now();
            state.realtimeActive = true;
            console.log('[Tx RT] → ACTIVE & LISTENING');
          } else if (['CLOSED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
            console.warn('[Tx RT] Channel issue →', status, err?.message);
            state.realtimeActive = false;
            scheduleRealtimeRetry();
          }
        });

      console.log('[Tx RT] Subscription attempt completed for user:', uid);

    } catch (err) {
      console.error('[Tx RT] Subscription setup failed:', err);
      scheduleRealtimeRetry();
    } finally {
      state.isSubscribing = false;
    }
  }

  function scheduleRealtimeRetry() {
    if (state.retryTimer) clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(() => {
      subscribeToTransactions(true);
    }, CONFIG.realtimeRetryMs);
  }

  /* ──────────────────────────────── FALLBACK POLLING ──────────────────────────────── */
  function startFallbackPolling() {
    if (state.fallbackPollTimer) return;
    console.warn('[Tx History] Realtime not healthy → fallback polling activated');

    const poll = async () => {
      try {
        const data = await safeFetch(`${CONFIG.apiEndpoint}?page=1&limit=60`);
        const received = (data.items || []).reverse(); // oldest → newest

        let addedCount = 0;
        const existing = new Set(state.items.map(t => t.id));

        for (const raw of received) {
          const norm = {
            id: raw.id || raw.reference,
            reference: raw.reference || raw.id,
            type: raw.type || (Number(raw.amount||0) > 0 ? 'credit' : 'debit'),
            amount: Math.abs(Number(raw.amount || 0)),
            description: (raw.description || raw.narration || 'Transaction').trim(),
            time: raw.created_at || raw.time || new Date().toISOString(),
            status: raw.status || 'SUCCESS'
          };
          if (!existing.has(norm.id)) {
            state.items.unshift(norm);
            existing.add(norm.id);
            addedCount++;
          }
        }

        if (addedCount > 0 && state.open) {
          applyTransformsAndRender();
          historyList.scrollTop = 0;
        }
      } catch (err) {
        console.warn('[Tx Poll] Failed:', err);
      }
    };

    poll(); // immediate
    state.fallbackPollTimer = setInterval(poll, CONFIG.fallbackPollIntervalMs);
  }

  function stopFallbackPolling() {
    if (state.fallbackPollTimer) {
      clearInterval(state.fallbackPollTimer);
      state.fallbackPollTimer = null;
    }
  }

  /* ──────────────────────────────── MODAL OPEN / CLOSE ──────────────────────────────── */
  async function handleModalOpened() {
    state.open = true;
    selectedMonth = null;

    if (loadingEl) loadingEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');

    // Try realtime (non-blocking)
    await subscribeToTransactions();

    // If realtime is silent for too long → fallback
    setTimeout(() => {
      if (state.open && !state.realtimeActive && !state.fallbackPollTimer) {
        startFallbackPolling();
      }
    }, CONFIG.fallbackAfterNoRealtimeMs);
  }

  document.addEventListener('modalOpened', e => {
    if (e.detail === 'historyModal') {
      handleModalOpened();
    }
  });

  document.addEventListener('modalClosed', e => {
    if (e.detail === 'historyModal') {
      state.open = false;
      stopFallbackPolling();
    }
  });

  /* ──────────────────────────────── SEARCH ──────────────────────────────── */
  if (searchInput) {
    let timeout;
    searchInput.addEventListener('input', e => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        state.searchTerm = e.target.value.trim();
        if (state.open) applyTransformsAndRender();
      }, 280);
    });
  }

  /* ──────────────────────────────── DOWNLOAD ──────────────────────────────── */
  downloadBtn?.addEventListener('click', () => {
    const fmt = prompt('Download format (csv or json)?', 'csv')?.toLowerCase();
    if (!fmt || !['csv','json'].includes(fmt)) return;

    if (fmt === 'json') {
      const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flexgig-tx-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // CSV
    const rows = [['Date','Description','Reference','Type','Amount','Status']];
    state.items.forEach(tx => {
      rows.push([
        new Date(tx.time).toISOString(),
        `"${(tx.description||'').replace(/"/g,'""')}"`,
        tx.reference || tx.id || '',
        tx.type,
        tx.amount,
        tx.status || 'SUCCESS'
      ]);
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flexgig-tx-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  /* ──────────────────────────────── TRUNCATE ON RESIZE ──────────────────────────────── */
  function trunTx() {
    document.querySelectorAll('.tx-desc').forEach(el => {
      const full = el.getAttribute('title') || el.textContent;
      el.textContent = truncateDescription(full);
    });
  }
  window.trunTx = trunTx;
  window.addEventListener('resize', trunTx);

  /* ──────────────────────────────── START REALTIME EARLY ──────────────────────────────── */
  subscribeToTransactions();

  console.log('[TransactionHistory] Initialized — using window.supabaseClient • realtime first • no bulk load on open');

})();