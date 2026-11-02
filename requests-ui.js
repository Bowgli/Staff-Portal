/* Manage Requests (Admin screen) — loaded on demand (requests-loader.js), so the main page stays small.
   Same data, same actions as before: status dropdown (handleRequestStatusChange), View, Archive, Archived
   Requests and Print all call the existing functions. Only the layout is new: summary cards, one filter row,
   colored type labels, pagination. All text is escaped before it is shown. */
(function(){
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
  const js = v => esc(JSON.stringify(String(v ?? ''))); // a JS string inside an onclick="..."
  // [background, text] per request type; other types are grey.
  const TYPE_COLOR = {'Leave Request': ['#DCFCE7', '#15803D'], 'Schedule Swap': ['#DBEAFE', '#1D4ED8'], 'Schedule Request': ['#EDE7FE', '#6D28D9'],
    'Absence / Call-Out Notice': ['#FEE2E2', '#B91C1C'], 'Late / Tardiness Notice': ['#FEF3C7', '#B45309'],
    'Certificate of Employment (COE)': ['#CCFBF1', '#0F766E'], 'Uniform Replacement': ['#FCE7F3', '#BE185D']};
  // Card colors = the status dropdown colors.
  const CARDS = [['pending', 'Pending', '#B45309'], ['needs-clarification', 'Needs Clarification', '#1D4ED8'], ['declined', 'Declined', '#B91C1C'],
    ['approved', 'Approved', '#15803D'], ['acknowledged', 'Acknowledged', '#0369A1'], ['cancelled', 'Cancelled', '#475569']];
  const CANCEL_REQUESTED = ['cancel-requested', 'Cancellation Requested', '#B45309']; // a card only while there are some, so the cards always add up to Total
  const label = st => STATUS_LABELS[st] || {cancelled: 'Cancelled', 'cancel-requested': 'Cancellation Requested'}[st] || st;
  const RANK = {'pending': 0, 'needs-clarification': 1, 'declined': 2, 'acknowledged': 3, 'approved': 4};
  const state = {page: 1, size: 10, key: ''};
  let archive = {loading: false, failed: false};

  document.head.insertAdjacentHTML('beforeend', `<style id="requests-ui-css">
.rq-cards{display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px;}
.rq-card{background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--c); border-radius:12px; padding:10px 12px; cursor:pointer; text-align:left; font:inherit; color:inherit;}
.rq-card:hover{background:var(--panel-2);} .rq-card.on{outline:2px solid var(--c); outline-offset:-1px;}
.rq-card b{display:block; font-size:22px; line-height:1.2; color:var(--c);} .rq-card span{font-size:12px; color:var(--text-faint); font-weight:600;}
.rq-filters{display:flex; flex-wrap:wrap; gap:8px; align-items:center;}
.rq-filters > *{margin:0 !important; width:auto; min-width:0; flex:1 1 120px;} .rq-filters input[type=text]{flex:2 1 170px;} .rq-filters .btn{flex:0 0 auto;}
.rq-table td{padding-top:12px; padding-bottom:12px; vertical-align:middle;}
.rq-emp{display:flex; align-items:center; gap:10px; font-weight:600;}
.rq-av{flex-shrink:0; width:32px; height:32px; border-radius:50%; background:var(--blue-soft); color:var(--blue); font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center;}
.rq-type{display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:700; white-space:nowrap; background:#F1F5F9; color:#475569;}
.rq-details{display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; max-width:320px;}
.rq-actions{display:flex; gap:6px;} .rq-actions .btn{padding:5px 10px; font-size:12px; white-space:nowrap; margin:0;}
.rq-pager{display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:12px; font-size:13px;}
.rq-pager .btn{padding:5px 10px; min-width:34px;} .rq-pager .btn.on{background:var(--blue); color:#fff; border-color:var(--blue);}
.rq-pager select{width:auto; margin:0; padding:4px 8px;}
@media(max-width:600px){ .rq-cards{grid-template-columns:repeat(2,1fr);} .rq-filters > *{flex:1 1 100% !important;} .rq-filters input[type=date]{flex:1 1 40% !important;} .rq-details{max-width:none;} }
</style>`);

  // The one filter used by the table, the page counts and the print. Search = employee name only (partial too).
  function filtered(){
    const q = (reqFilter.employee || '').trim().toLowerCase();
    return ALL_REQUESTS.map((r, idx) => Object.assign({}, r, {_idx: idx})).filter(r => {
      if(q && !String(r.EmployeeName || '').toLowerCase().includes(q)) return false;
      if(reqFilter.type !== 'All' && r.Type !== reqFilter.type) return false;
      if(reqFilter.status !== 'All' && r.Status !== reqFilter.status) return false;
      if(reqFilter.dateFrom){ const dt = new Date(r.Date); if(isNaN(dt) || dt < new Date(reqFilter.dateFrom)) return false; }
      if(reqFilter.dateTo){ const dt = new Date(r.Date); if(isNaN(dt) || dt > new Date(reqFilter.dateTo + 'T23:59:59')) return false; }
      return true;
    });
  }
  const newestFirst = (a, b) => (a.Date || '') !== (b.Date || '') ? (b.Date || '').localeCompare(a.Date || '') : b._idx - a._idx;

  // Archived count: the archive list is read once in the background (Full Admin), the same list the Archived page uses.
  function archivedCount(){
    if(Array.isArray(requestsArchiveData)) return requestsArchiveData.length;
    if(!USE_REMOTE() || archive.failed) return '—';
    if(!archive.loading){
      archive.loading = true;
      const list = ALL_REQUESTS; // Archive/Restore replace this list: an answer that started before them is stale
      safeApiGet(bustCache_('requestsArchive&username=' + encodeURIComponent(CURRENT_USER.username || '')), null, undefined, undefined, ARCHIVE_TIMEOUT_MS).then(raw => {
        if(!Array.isArray(raw)) throw Error('unexpected response');
        if(requestsArchiveData === null && ALL_REQUESTS === list) requestsArchiveData = raw.map(r => ({id: r.ID, employeeName: r.EmployeeName, type: r.Type, details: r.Details, date: r.Date, status: r.Status, actionBy: r.ActionBy, archived: true}))
          .sort((a, b) => new Date(b.date) - new Date(a.date)); // same shape and order as openRequestsArchivedPage
      }).catch(e => { console.warn('archived count:', e.message || e); archive.failed = true; }).finally(() => {
        archive.loading = false;
        const el = document.getElementById('rqArchivedCount');
        if(el) el.textContent = archivedCount();
      });
    }
    return '…';
  }

  function cell(r){
    const swap = r.Type === 'Schedule Swap' && r.SwapWithName ? `<div class="muted" style="font-size:11px; margin-top:4px;">${esc(fmtDayLabel(r.SwapDay))}${r.TheirDay && r.TheirDay !== r.SwapDay ? ' ↔ ' + esc(fmtDayLabel(r.TheirDay)) : ''} ↔ ${esc(r.SwapWithName)}</div>` : '';
    const status = savingRequestIds.has(r.ID) ? `<span class="btn-spinner"></span><span class="muted" style="font-size:12px;">Saving...</span>`
      : `<select class="status-select ${esc(r.Status)}" onchange="handleRequestStatusChange(this, ${js(r.ID)}, ${js(r.Status)}, ${js(r.Type)})">${requestStatusOptions_(r)}</select>`;
    return `<tr>
      <td data-label="Employee"><div class="rq-emp"><span class="rq-av">${esc(initialsFromName(r.EmployeeName))}</span>${esc(r.EmployeeName)}</div></td>
      <td data-label="Type"><span class="rq-type"${TYPE_COLOR[r.Type] ? ` style="background:${TYPE_COLOR[r.Type][0]}; color:${TYPE_COLOR[r.Type][1]};"` : ''}>${esc(r.Type)}</span>${swap}</td>
      <td class="muted" data-label="Details"><div class="rq-details" title="${esc(r.Details || '')}">${esc(r.Details || '—')}</div></td>
      <td data-label="Date" style="white-space:nowrap;">${esc(fmtDateTime(r.Date))}</td>
      <td data-label="Status">${status}</td>
      <td class="muted" data-label="Action By">${esc(r.Status !== 'pending' && r.ActionBy ? r.ActionBy : '—')}</td>
      <td data-label="Actions"><div class="rq-actions no-print"><button class="btn ghost auto" onclick="openAdminRequestDetail(${js(r.ID)})">👁 View</button>${isFullAdmin() && REQUEST_ARCHIVABLE_STATUSES.has(r.Status) ? `<button class="btn ghost auto" onclick="archiveRecordNow('request',${js(r.ID)}, this)">📦 Archive</button>` : ''}</div></td>
    </tr>`;
  }

  function html(){
    const types = Array.from(new Set(ALL_REQUESTS.map(r => r.Type))).sort();
    const rows = filtered().sort((a, b) => (RANK[a.Status] ?? 5) - (RANK[b.Status] ?? 5) || newestFirst(a, b));
    const key = JSON.stringify(reqFilter);
    if(key !== state.key){ state.key = key; state.page = 1; } // a filter changed → back to page 1
    const pages = Math.max(1, Math.ceil(rows.length / state.size));
    state.page = Math.min(state.page, pages);
    const from = (state.page - 1) * state.size, shown = rows.slice(from, from + state.size);
    const count = s => ALL_REQUESTS.filter(r => r.Status === s).length;
    const card = (s, label, c, n, idAttr = '') => `<button type="button" class="rq-card${reqFilter.status === s ? ' on' : ''}" style="--c:${c};" onclick="${s === 'archived' ? 'openRequestsArchivedPage()' : `setReqFilter('status', ${js(s)})`}"><b${idAttr}>${esc(n)}</b><span>${esc(label)}</span></button>`;
    const nums = [];
    for(let p = Math.max(1, state.page - 2); p <= Math.min(pages, state.page + 2); p++) nums.push(`<button class="btn ghost auto${p === state.page ? ' on' : ''}" onclick="RequestsUI.page(${p})">${p}</button>`);
    const opt = (v, label, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(label)}</option>`;
    return `
    <div class="no-print" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
      <p class="muted" style="margin:0; font-size:13px;">Status can be changed anytime — handy for an accidental click or if the staff member changes their mind on a swap.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn auto" onclick="printRequestsLog()">🖨️ Print Filtered Requests</button>
        ${isFullAdmin() ? `<button class="btn ghost auto" onclick="openRequestsArchivedPage()">📁 Archived Requests</button>` : ''}
      </div>
    </div>
    <div class="rq-cards no-print">
      ${CARDS.concat(count(CANCEL_REQUESTED[0]) ? [CANCEL_REQUESTED] : []).map(([s, label, c]) => card(s, label, c, count(s))).join('')}
      ${isFullAdmin() ? card('archived', 'Archived', '#6D28D9', archivedCount(), ' id="rqArchivedCount"') : ''}
      ${card('All', 'Total', '#334155', ALL_REQUESTS.length)}
    </div>
    <div class="card no-print" style="padding:12px 14px; margin-bottom:14px;">
      <div class="rq-filters">
        <input type="text" list="reqEmployeeDatalist" data-filter="reqEmployee" placeholder="Search by employee name..." aria-label="Search by employee name" value="${esc(reqFilter.employee)}" oninput="setReqFilter('employee', this.value)">
        <datalist id="reqEmployeeDatalist">${EMPLOYEE_ROSTER.map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>
        <select aria-label="Request type" onchange="setReqFilter('type', this.value)">${opt('All', 'All Types', reqFilter.type)}${types.map(t => opt(t, t, reqFilter.type)).join('')}</select>
        <select aria-label="Status" onchange="setReqFilter('status', this.value)">${opt('All', 'All Statuses', reqFilter.status)}${[['pending', 'Pending'], ['needs-clarification', 'Need Clarification'], ['declined', 'Declined'], ['acknowledged', 'Acknowledged'], ['approved', 'Approved'], ['cancel-requested', 'Cancellation Requested'], ['cancelled', 'Cancelled']].map(([v, l]) => opt(v, l, reqFilter.status)).join('')}</select>
        <input type="date" aria-label="Date from" title="Date from" value="${esc(reqFilter.dateFrom)}" onchange="setReqFilter('dateFrom', this.value)">
        <input type="date" aria-label="Date to" title="Date to" value="${esc(reqFilter.dateTo)}" onchange="setReqFilter('dateTo', this.value)">
        <button class="btn reset auto" onclick="resetReqFilter()">↻ Reset</button>
      </div>
    </div>
    <div class="card print-doc table-scroll" id="rqTableCard" style="scroll-margin-top:90px;">
      <div class="print-only" style="display:none;" id="reqPrintHeader"></div>
      <table class="no-print mobile-card-table rq-table">
        <thead><tr><th>Employee</th><th>Type</th><th>Details</th><th>Date</th><th>Status</th><th>Action By</th><th>Actions</th></tr></thead>
        <tbody>${shown.map(cell).join('') || `<tr><td colspan="7" class="muted">No matching requests.</td></tr>`}</tbody>
      </table>
      <div class="rq-pager no-print">
        <span class="muted">Showing ${rows.length ? from + 1 : 0}–${from + shown.length} of ${rows.length}</span>
        <span style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
          <button class="btn ghost auto" ${state.page <= 1 ? 'disabled' : ''} onclick="RequestsUI.page(${state.page - 1})" aria-label="Previous page">‹</button>${nums.join('')}<button class="btn ghost auto" ${state.page >= pages ? 'disabled' : ''} onclick="RequestsUI.page(${state.page + 1})" aria-label="Next page">›</button>
        </span>
        <label class="muted" style="margin:0; display:flex; gap:6px; align-items:center; font-size:13px; white-space:nowrap;">Rows per page <select onchange="RequestsUI.size(this.value)">${[10, 25, 50].map(n => `<option ${n === state.size ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <table class="print-only" style="display:none;" id="reqPrintTable"></table>
      <p class="print-only" style="display:none; font-weight:600; margin-top:8px;" id="reqPrintTotal"></p>
    </div>`;
  }

  // Print Filtered Requests: every filtered row (not just this page), newest first — same report as before.
  function print(){
    const rows = filtered().sort(newestFirst);
    const range = reqFilter.dateFrom || reqFilter.dateTo ? `${reqFilter.dateFrom ? fmtDiscDate(reqFilter.dateFrom) : 'Start'} – ${reqFilter.dateTo ? fmtDiscDate(reqFilter.dateTo) : 'Present'}` : 'All Dates';
    document.getElementById('reqPrintHeader').innerHTML = `
    <h3 style="margin-bottom:6px;">MANAGE REQUESTS REPORT</h3>
    <p style="margin:2px 0;">Employee: ${esc(reqFilter.employee || 'All Employees')}</p>
    <p style="margin:2px 0;">Request Type: ${esc(reqFilter.type === 'All' ? 'All Types' : reqFilter.type)}</p>
    <p style="margin:2px 0;">Date Range: ${esc(range)}</p>
    <p style="margin:2px 0 10px;">Status: ${esc(reqFilter.status === 'All' ? 'All Status' : label(reqFilter.status))}</p>`;
    document.getElementById('reqPrintTable').innerHTML = `<tr><th>Date Submitted</th><th>Employee</th><th>Request Type</th><th>Date/Period</th><th>Details</th><th>Status</th></tr>` + (rows.map(r => {
      const period = r.Type === 'Schedule Swap' && r.SwapWithName ? `${fmtDayLabel(r.SwapDay)}${r.TheirDay && r.TheirDay !== r.SwapDay ? ' ↔ ' + fmtDayLabel(r.TheirDay) : ''} ↔ ${r.SwapWithName}` : '—';
      return `<tr><td>${esc(fmtDateTime(r.Date))}</td><td>${esc(r.EmployeeName)}</td><td>${esc(r.Type)}</td><td>${esc(period)}</td><td>${esc(r.Details || '—')}</td><td>${esc(label(r.Status))}</td></tr>`;
    }).join('') || `<tr><td colspan="6">No matching requests.</td></tr>`);
    document.getElementById('reqPrintTotal').textContent = `Total Requests: ${rows.length}`;
    printWithPageSettings('letter', 'portrait', '0.75in');
  }

  // Changing page or rows per page brings the top of the table into view (below the sticky top bar).
  const redraw = () => { renderView('mgmt-requests'); const t = document.getElementById('rqTableCard'); if(t) t.scrollIntoView({block: 'start'}); };
  window.RequestsUI = {html, print, filtered,
    page(p){ state.page = p; redraw(); },
    size(n){ state.size = Number(n) || 10; state.page = 1; redraw(); }};
})();
