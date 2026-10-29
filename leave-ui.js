/* My Leave (employee screen) — loaded only when My Leave is opened (leave-loader.js), so the
   main page stays the same size. Balances and every rule are decided by the server
   (Leave.gs / LeaveCalc.gs); this screen only shows them and explains them in plain words.
   All text from the server is escaped before it is shown. */
(function(){
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
  const h = n => { const x = Math.round(Number(n || 0) * 2) / 2; return (Number.isInteger(x) ? x : x.toFixed(1)) + (Math.abs(x) === 1 ? ' hr' : ' hrs'); };
  const day = ymd => { const d = new Date(ymd + 'T00:00:00'); return isNaN(d) ? esc(ymd) : d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}); };
  const range = (a, b) => !b || a === b ? day(a) : day(a) + ' – ' + day(b);
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const hoursFor = (a, b, part) => !a || !b || b < a ? 0 : part > 0 && a === b ? part : (daysBetween(a, b) + 1) * 8; // same rule as the server
  const VACATION = ['Paid Vacation Leave', 'Unpaid Vacation Leave'];
  // [Paid/Unpaid, Description & Policy Guidelines, Filing Criteria] from the approved leave policy table (2026-10-27).
  const POLICY = {
    'Paid Vacation Leave': ['Paid', 'Paid annual recreation leave allocated per fiscal year', '1 Week in advance'],
    'Unpaid Vacation Leave': ['Unpaid', 'Extra unpaid leave for recreation', '1 Week in advance'],
    'Sick / Medical Leave': ['Unpaid', 'Leave for illness, doctor visits, and medical care', 'ASAP'],
    'Family & Medical Leave (FMLA)': ['Unpaid', 'Job-protected leave for qualifying medical and family care reasons', 'ASAP'],
    'Maternity Leave': ['Paid', 'Paid leave for child birth, adoption, or primary care', 'ASAP'],
    'Bereavement Leave': ['Unpaid', 'Compassionate leave for immediate family loss', 'ASAP'],
    'Jury or Witness Duty Leave': ['Unpaid', 'Leave to fulfill civic duty, jury service, or court witness subpoenas', 'ASAP'],
    'Military Leave': ['Unpaid', 'Leave for active duty, military training, or reserve service commitments', 'ASAP'],
    'Emergency Leave': ['Unpaid', 'Immediate temporary leave for sudden unforeseen personal emergencies', 'ASAP'],
  };
  const STATUS = {pending: ['warn', 'Pending'], 'needs-clarification': ['warn', 'Need Clarification'], acknowledged: ['warn', 'Pending'],
    approved: ['ok', 'Approved'], 'cancel-requested': ['warn', 'Cancellation Requested'], declined: ['bad', 'Declined'], cancelled: ['bad', 'Cancelled']};
  const pill = s => { const [c, l] = STATUS[s] || ['ok', s]; return `<span class="pill ${c}">${esc(l)}</span>`; };

  let data = null, older = false, form = null; // form: {id (when editing), clientId}

  if(!document.getElementById('leaveUiCss')){
    const css = document.createElement('style'); css.id = 'leaveUiCss';
    css.textContent = `
.lv-stats{display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:12px 0 8px;}
.lv-stat{border:1px solid var(--line); border-radius:12px; padding:12px; text-align:center; background:var(--panel);}
.lv-stat b{display:block; font-size:26px; font-weight:800; line-height:1.15;}
.lv-stat span{font-size:12px; color:var(--text-mute);}
.lv-stat.main{background:var(--green-soft); border-color:#BBF7D0;} .lv-stat.main b{color:var(--green);}
.lv-stat.neg{background:var(--red-soft); border-color:#FECACA;} .lv-stat.neg b{color:var(--red);}
.lv-bar{height:8px; border-radius:99px; background:var(--panel-2); overflow:hidden; display:flex; margin:6px 0 2px;}
.lv-bar i{display:block; height:100%;} .lv-bar .u{background:#94A3B8;} .lv-bar .a{background:var(--blue);} .lv-bar .p{background:var(--orange);}
.lv-item{border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:flex-start;}
.lv-item + .lv-item{margin-top:10px;}
.lv-sum{border-radius:12px; padding:12px; margin:10px 0; background:var(--panel-2); font-size:14px; line-height:1.6;}
.lv-sum.warn{background:var(--orange-soft); border:1px solid #FDE68A;}
.lv-split{display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:8px 0;}
.lv-split div{background:var(--panel); border-radius:10px; padding:8px; text-align:center;} .lv-split b{display:block; font-size:20px;}
.lv-policy{border:1px solid #BFDBFE; background:#EFF6FF; border-radius:12px; padding:12px 14px; margin:10px 0 4px; font-size:14px; line-height:1.5;}
.lv-policy h4{margin:0 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#1E3A8A;} .lv-policy h4 + p{margin:0 0 10px;} .lv-policy p:last-child{margin-bottom:0;}
.lv-sending{display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:10px; background:#EFF6FF; color:#1D4ED8; font-weight:600; font-size:14px; margin:8px 0;}
.lv-sending .btn-spinner{border-color:rgba(29,78,216,.25) !important; border-top-color:#1D4ED8 !important; margin:0;}
.lv-ro{border:1px solid var(--line); border-radius:10px; padding:10px 12px; background:var(--panel-2); font-weight:600; margin-bottom:12px;}
.lv-bad{border-color:var(--red) !important; box-shadow:0 0 0 2px var(--red-soft) !important;} .lv-ferr{display:block; color:var(--red); font-size:12px; margin:-6px 0 10px;}
.lv-tabs{display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;}
.lv-ico{width:20px; height:20px; flex:none; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round;}
.lv-ntabs{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:16px; max-width:900px;}
.lv-ntab{display:flex; align-items:center; gap:12px; text-align:left; padding:12px 16px; border-radius:14px; border:1px solid var(--line); background:var(--panel); color:var(--text); cursor:pointer; font:inherit; box-shadow:0 1px 2px rgba(15,23,42,.04);}
.lv-ntab .lv-ico{width:28px; height:28px; color:#64748B;} .lv-ntab b{display:block; font-size:15px;} .lv-ntab small{display:block; font-size:12.5px; color:var(--text-mute);}
.lv-ntab.on{background:#1D6FF2; border-color:#1D6FF2; color:#fff; box-shadow:0 6px 16px rgba(29,111,242,.25);} .lv-ntab.on .lv-ico,.lv-ntab.on small{color:#fff;}
.lv-fbar{display:grid; grid-template-columns:minmax(180px,1fr) minmax(300px,2fr) auto auto; gap:16px 20px; align-items:end;}
.lv-form .grid-2,.lv-pair{column-gap:24px; row-gap:4px; align-items:end; margin:14px 0 6px;} .lv-form .grid-2 input,.lv-form .grid-2 select,.lv-pair input{width:100%; height:44px; box-sizing:border-box;}
.lv-check.lv-showall{display:flex; margin:16px 0 18px; font-size:14px; gap:8px;} .lv-check.lv-showall input{width:16px; height:16px;}
.lv-fbar label.cap{display:block; font-size:11.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--text-mute); margin:0 0 6px;}
.lv-field{position:relative;} .lv-field .lv-ico{position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#64748B; pointer-events:none;}
#lvSearch{padding-right:48px;}
.lv-field .lv-clear{position:absolute; right:4px; top:50%; transform:translateY(-50%); width:38px; min-width:38px; height:38px; padding:0; margin:0; border:0; border-radius:8px; background:#E2E8F0; color:#0F172A; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;}
.lv-field .lv-clear .lv-ico{position:static; transform:none; width:18px; height:18px; color:inherit; stroke-width:2.5;}
.lv-field .lv-clear:hover,.lv-field .lv-clear:focus-visible{background:#CBD5E1; outline:2px solid #64748B; outline-offset:1px;}
.lv-field select,.lv-field input{margin:0; padding-left:40px; height:44px; border-radius:10px; width:100%; max-width:none; box-sizing:border-box;}
.lv-fbar > *,.lv-fbar .lv-addbtn{margin:0; min-width:0;}
.lv-need{display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 14px; border-radius:10px; border:1px solid #FDE68A; background:#FFFBEB; font-size:14px; font-weight:600; margin:0; cursor:pointer; white-space:nowrap;}
.lv-need input{width:18px; height:18px; margin:0;} .lv-need .lv-ico{color:#F59E0B;}
.lv-addbtn,.lv-calnav .btn{display:inline-flex; flex-direction:row; align-items:center; justify-content:center; gap:6px; height:44px; white-space:nowrap;}
.lv-calbar{display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin-bottom:12px;}
.lv-calnav{display:flex; align-items:center; gap:8px;} .lv-calnav b{display:inline-flex; align-items:center; gap:8px; min-width:170px; justify-content:center; font-size:18px;}
.lv-legend{display:flex; flex-wrap:wrap; gap:14px; align-items:center; font-size:13px; padding:8px 12px; border:1px solid var(--line); border-radius:10px;}
.lv-legend span{display:inline-flex; align-items:center; gap:6px;} .lv-legend i{width:12px; height:12px; border-radius:50%; display:inline-block;}
.lv-calbar .lv-field{min-width:190px;}
.lv-cal-head span{background:var(--panel-2); border-radius:6px; padding:6px 0;}
.lv-chip.c-ok{background:#DBEAFE; color:#1E40AF;} .lv-chip.c-pend{background:#FEF3C7; color:#92400E; border:none;}
.lv-chip.c-sus{background:#FEE2E2; color:#B91C1C;}
.lv-more{border:none; background:none; color:#1D6FF2; font-size:11px; font-weight:700; padding:1px 4px; text-align:left; cursor:pointer;}
.lv-daylist{border-top:1px solid var(--line); margin-top:12px; padding-top:12px;}
@media (max-width:1280px){ .lv-calbar > .lv-legend{display:none;} }
@media (max-width:1200px){ .lv-fbar{grid-template-columns:minmax(0,1fr) minmax(0,1fr);} .lv-need,.lv-addbtn{width:100%; justify-content:center;} }
@media (max-width:640px){ .lv-ntabs{gap:6px;} .lv-ntab{flex-direction:column; text-align:center; padding:10px 6px; gap:4px;} .lv-ntab small{display:none;} .lv-ntab b{font-size:13px;}
  .lv-fbar{grid-template-columns:1fr;} .lv-need,.lv-addbtn{width:100%; justify-content:center;} .lv-calnav{width:100%; justify-content:space-between;} .lv-calnav b{min-width:0; font-size:16px;} .lv-calbar .lv-field{width:100%;} }
.lv-filters{display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px;} .lv-filters input[type=search]{flex:1; min-width:180px; margin:0;} .lv-filters select{width:auto; margin:0;}
.lv-check{display:inline-flex; align-items:center; gap:6px; font-size:13px; margin:0;} .lv-check input{width:auto; margin:0;}
.lv-neg{color:var(--red);} .lv-actions{display:flex; gap:8px; flex-wrap:wrap; margin:14px 0 6px;}
.lv-form{border-top:1px solid var(--line); margin-top:12px; padding-top:12px;}
.lv-cal-head,.lv-cal{display:grid; grid-template-columns:repeat(7,1fr); gap:4px;} .lv-cal-head span{font-size:12px; color:var(--text-mute); text-align:center; font-weight:600;}
.lv-day{min-height:78px; border:1px solid var(--line); border-radius:8px; padding:4px; display:flex; flex-direction:column; gap:2px; overflow:hidden; background:var(--panel);}
.lv-empty{border:none; background:none;} .lv-today{border-color:var(--blue); box-shadow:inset 0 0 0 1px var(--blue);} .lv-dnum{font-size:12px; font-weight:700;} .lv-dname{display:none;}
.lv-chip{display:block; font-size:11px; line-height:1.3; background:var(--blue-soft); color:#1D4ED8; border-radius:6px; padding:1px 5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.lv-chip.lv-pend{background:var(--orange-soft); color:#B45309; border:1px dashed #F59E0B;}
@media (max-width:640px){ .lv-stats{grid-template-columns:repeat(2,1fr);} .lv-stat b{font-size:22px;}
  .lv-cal-head{display:none;} .lv-cal{grid-template-columns:1fr;} .lv-empty,.lv-free{display:none;} .lv-day{min-height:0;} .lv-dname{display:inline;} .lv-chip{white-space:normal;} }`;
    document.head.appendChild(css);
  }

  async function load(){
    const fresh = await fastOrFallback('myLeave', null, older ? 'older=true' : '');
    if(fresh && fresh.summary) data = fresh;
    return data;
  }
  const root = () => activeView === 'my-leave' && document.getElementById('leaveRoot');

  // Furlough: leave paused (server rule); earned hours are kept and shown, nothing can be filed.
  const pausedNote = s => s.paused ? `<div class="banner note" style="margin-top:10px;">Your status is ${esc(s.paused)}, so leave is paused: new leave requests can't be filed and 0 hours can be used for now.${s.paid && s.paid.held > 0 ? ` Your earned ${h(s.paid.held)} are kept` : ' Your earned leave is kept'} and will be reviewed by Admin when you are back to Active.</div>` : '';
  const requestButton = s => s.paused ? '' : `<button class="btn" style="margin-top:10px;" onclick="LeaveUI.openForm()">＋ Request Leave</button>`;
  function balanceCard(){
    const s = data.summary;
    if(!s.setUp && s.paused) return `<div class="card"><h3><span class="ic">🌴</span> Paid Vacation</h3>${pausedNote(s)}</div>`;
    if(!s.setUp) return `<div class="card"><h3><span class="ic">🌴</span> Paid Vacation</h3>
      <div class="banner note" style="margin-top:8px;">${esc(s.reason || 'Your leave balance is not set up yet — please contact Admin.')} You can still request other types of leave.</div>
      <button class="btn" style="margin-top:12px;" onclick="LeaveUI.openForm()">＋ Request Leave</button></div>`;
    const p = s.paid, total = Math.max(p.allowance, p.used + p.upcoming + p.pending, 1), pct = n => Math.max(0, n) / total * 100;
    const m = s.maternity, matUsed = m.used + m.upcoming + m.pending;
    return `<div class="card"><h3><span class="ic">🌴</span> Paid Vacation</h3>
      <p class="muted" style="font-size:13px;">Leave year: ${range(s.cycle.start, s.cycle.end)}</p>
      <div class="lv-stats">
        <div class="lv-stat ${p.available < 0 ? 'neg' : 'main'}"><b>${h(p.available).replace(/ hrs?$/, '')}</b><span>Available (hrs)</span></div>
        <div class="lv-stat"><b>${h(p.pending).replace(/ hrs?$/, '')}</b><span>Pending</span></div>
        <div class="lv-stat"><b>${h(p.upcoming).replace(/ hrs?$/, '')}</b><span>Approved Upcoming</span></div>
        <div class="lv-stat"><b>${h(p.used).replace(/ hrs?$/, '')}</b><span>Used / Taken</span></div>
      </div>
      <div class="lv-bar" aria-hidden="true"><i class="u" style="width:${pct(p.used)}%"></i><i class="a" style="width:${pct(p.upcoming)}%"></i><i class="p" style="width:${pct(p.pending)}%"></i></div>
      <p class="muted" style="font-size:12px;">${p.starting ? `This leave year started from ${h(p.starting.hours)} available on ${day(p.starting.date)} (entered by Admin)${p.yearly !== null ? `; each new leave year gives ${h(p.yearly)}` : ''}` : `You get ${h(p.allowance)} of Paid Vacation each leave year`}${p.adjustments ? ` (${p.adjustments > 0 ? '+' : ''}${h(p.adjustments)} adjusted by Admin)` : ''}. Pending hours are held for you until your request is decided.</p>
      ${s.nextCycleReserved ? `<p class="muted" style="font-size:12px;">${h(s.nextCycleReserved)} already requested for your next leave year.</p>` : ''}
      ${matUsed ? `<p class="muted" style="font-size:12px;">Maternity Leave: ${h(m.available)} available of ${h(m.allowance)}.</p>` : ''}
      ${pausedNote(s)}${requestButton(s)}</div>`;
  }

  function historyCard(){
    const today = data.today, list = data.history;
    const items = list.map(r => {
      const typeLabel = r.type === 'Other' && r.typeOther ? r.typeOther : r.type;
      const split = r.unpaidHours > 0 ? ` · Paid ${h(r.paidHours)} + Unpaid ${h(r.unpaidHours)}` : '';
      const canEdit = r.source === 'portal' && (r.status === 'pending' || r.status === 'needs-clarification');
      const canCancel = r.source === 'portal' && r.status === 'approved' && (r.end || r.start) >= today;
      const canPrint = r.source === 'portal' && (r.status === 'pending' || r.status === 'approved') && MOCK.requests.some(x => x.id === r.id); // own requests only
      return `<div class="lv-item"><div style="min-width:0;">
          <div style="font-weight:600;">${range(r.start, r.end)}</div>
          <div class="muted" style="font-size:13px;">${esc(typeLabel)} · ${h(r.hours)}${split}${r.number ? ' · ' + esc(r.number) : ''}</div>
        </div>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">${pill(r.status)}
          ${canEdit ? `<button class="btn edit auto" style="padding:5px 10px;" onclick="LeaveUI.openForm('${esc(r.id)}')">✏️ Edit</button>` : ''}
          ${canCancel ? `<button class="btn ghost auto" style="padding:5px 10px;" onclick="LeaveUI.askCancel('${esc(r.id)}', this)">Request Cancellation</button>` : ''}
          ${canPrint ? `<button class="btn ghost auto" style="padding:5px 10px;" title="Print leave request" aria-label="Print leave request ${esc(r.number)}" onclick="printLeaveRequestForm('${esc(r.id)}')">🖨️</button>` : ''}
        </div></div>`;
    }).join('');
    return `<div class="card"><h3><span class="ic">🗂️</span> My Leave History</h3>
      <p class="muted" style="font-size:12px; margin-bottom:10px;">${older ? 'All your leave records.' : 'This leave year and the one before.'}</p>
      ${items || '<p class="muted">No leave records yet.</p>'}
      ${data.hasOlder && !older ? `<button class="btn ghost auto" style="margin-top:12px;" onclick="LeaveUI.showOlder(this)">View older history</button>` : ''}</div>`;
  }

  function paint(){
    const el = root(); if(!el || !data) return;
    el.innerHTML = `<div class="grid grid-2">${balanceCard()}<div id="leaveFormSlot">${form ? formCard() : ''}</div></div><div style="margin-top:16px;">${historyCard()}</div>`;
    if(form) fillForm();
  }

  /* ---------- request form ---------- */
  function formCard(){
    const types = data.types || [];
    const avail = data.summary.setUp ? ` (${h(data.summary.paid.available)} available)` : '';
    return `<div class="card" id="leaveForm"><h3><span class="ic">📝</span> ${form.id ? 'Edit Leave Request' : 'Request Leave'}</h3>
      <label for="lvType">Type of leave</label>
      <select id="lvType" onchange="LeaveUI.update()"><option value="">Choose the type of leave</option>${types.map(t => `<option value="${esc(t)}">${esc(t)}${t === 'Paid Vacation Leave' ? esc(avail) : ''}</option>`).join('')}</select>
      <div id="lvPolicy"></div>
      <div id="lvOtherWrap" style="display:none;"><label for="lvOther">Please specify</label><input id="lvOther" type="text" maxlength="80" placeholder="What kind of leave?" oninput="LeaveUI.update()"></div>
      <label>Company</label>${data.company ? `<div class="lv-ro" id="lvCompany">${esc(data.company)}</div>`
        : `<div class="banner bad" id="lvCompany" style="margin-bottom:12px;">Your Employment Company is not set in your profile, so leave can’t be filed yet. Please contact Admin.</div>`}
      <div class="grid grid-2"><div><label for="lvStart">First day of leave</label><input id="lvStart" type="date" onchange="LeaveUI.update()"></div>
        <div><label for="lvEnd">Last day of leave</label><input id="lvEnd" type="date" onchange="LeaveUI.update()"></div></div>
      <div id="lvPartWrap" style="display:none;"><div class="checkbox-row"><input type="checkbox" id="lvPart" onchange="LeaveUI.update()"><label for="lvPart">Only part of the day</label></div>
        <div id="lvPartHoursWrap" style="display:none;"><label for="lvPartHours">How many hours?</label><input id="lvPartHours" type="number" min="0.5" max="7.5" step="0.5" oninput="LeaveUI.update()"></div></div>
      <label for="lvReturn">Back to work on <span class="muted">(optional)</span></label><input id="lvReturn" type="date" onchange="LeaveUI.update()">
      <label for="lvReason">Reason <span class="muted">(required)</span></label><textarea id="lvReason" maxlength="1000" placeholder="Why do you need this leave?" oninput="LeaveUI.update()"></textarea>
      <div id="lvSummary"></div>
      <p class="login-err" id="lvErr"></p>
      <p class="lv-sending" id="lvSending" role="status" aria-live="polite" style="display:none;"><span class="btn-spinner"></span>${form.id ? 'Saving your changes... Please wait.' : 'Submitting your leave request... Please wait.'}</p>
      <div style="display:flex; gap:8px; margin-top:8px;"><button class="btn" id="lvSubmit" style="flex:1;" onclick="LeaveUI.submit()">${form.id ? 'Save Changes' : 'Submit Leave Request'}</button>
        <button class="btn ghost auto" onclick="LeaveUI.closeForm()">Cancel</button></div></div>`;
  }
  const $ = id => document.getElementById(id);
  function fillForm(){
    const f = form.values || {};
    if(f.type) $('lvType').value = f.type;
    $('lvOther').value = f.other || ''; $('lvStart').value = f.start || ''; $('lvEnd').value = f.end || '';
    $('lvPart').checked = !!f.part; $('lvPartHours').value = f.part || ''; $('lvReturn').value = f.ret || ''; $('lvReason').value = f.reason || '';
    update();
  }
  function values(){
    const start = $('lvStart').value, end = $('lvEnd').value || start, single = !!start && start === end;
    const part = single && $('lvPart').checked ? Number($('lvPartHours').value) || 0 : 0;
    return {type: $('lvType').value, other: $('lvOther').value.trim(), start, end, part, ret: $('lvReturn').value, reason: $('lvReason').value.trim(),
      hours: hoursFor(start, end, part), days: start && end && end >= start ? daysBetween(start, end) + 1 : 0};
  }
  // Paid hours this request may use: the available balance plus its own hours when editing it.
  function paidAvailable(){
    const s = data.summary; if(!s.setUp) return null;
    const own = form.id && data.history.find(r => r.id === form.id);
    return s.paid.available + (own && own.type === 'Paid Vacation Leave' ? own.paidHours : 0);
  }
  function update(){
    if(!$('lvType')) return;
    const v = values(), s = data.summary;
    $('lvOtherWrap').style.display = v.type === 'Other' ? '' : 'none';
    $('lvPartWrap').style.display = v.start && v.start === v.end ? '' : 'none';
    $('lvPartHoursWrap').style.display = $('lvPart').checked ? '' : 'none';
    const out = [];
    if(v.hours > 0) out.push(`This request: <b>${h(v.hours)}</b>${v.days > 1 ? ` (${v.days} days)` : ''}`);
    let warn = false; form.split = null;
    if(v.type === 'Paid Vacation Leave' && v.hours > 0){
      const avail = paidAvailable();
      if(avail === null) { out.push('Your Paid Vacation balance is not set up yet — please contact Admin, or choose another type of leave.'); warn = true; }
      else if(s.setUp && v.start > s.cycle.end) out.push(`This leave is in your next leave year (from ${day(leaveNextYear(s))}). Your balance for that year will be checked when you submit.`);
      else if(v.hours <= avail) out.push(`Available Paid Vacation: ${h(avail)} → after this request: <b>${h(avail - v.hours)}</b>`);
      else {
        const paid = Math.max(0, avail), unpaid = v.hours - paid; warn = true; form.split = {paid, unpaid};
        out.push(`Your available Paid Vacation is ${h(paid)}, but you requested ${h(v.hours)}. The remaining ${h(unpaid)} can be requested as Unpaid Vacation. Please review before submitting.`
          + `<div class="lv-split"><div><span class="muted">Paid Vacation</span><b>${h(paid)}</b></div><div><span class="muted">Unpaid Vacation</span><b>${h(unpaid)}</b></div></div>`
          + `<div class="checkbox-row"><input type="checkbox" id="lvSplitOk"><label for="lvSplitOk">I understand ${h(unpaid)} will be Unpaid Vacation.</label></div>`);
      }
    }
    if(v.type === 'Maternity Leave' && v.hours > 0 && s.setUp && v.hours > s.maternity.available){ warn = true; out.push(`You have ${h(s.maternity.available)} of Maternity Leave available.`); }
    if(VACATION.includes(v.type) && v.start && daysBetween(data.today, v.start) < 7) { warn = true; out.push('Vacation leave should be filed at least 1 week in advance. You can still submit; it will go through normal approval.'); }
    $('lvSummary').innerHTML = out.length ? `<div class="lv-sum ${warn ? 'warn' : ''}">${out.join('<br>')}</div>` : '';
    $('lvPolicy').innerHTML = policyHtml(v.type);
    if(form && form.tried) showErrors(fieldErrors(v));
  }
  function policyHtml(type){
    if(!type) return '';
    const p = POLICY[type], s = data.summary;
    if(!p) return `<div class="lv-policy"><h4>Description &amp; Policy Guidelines</h4><p>No guideline is listed for this type yet. Please describe your leave; it goes through normal approval.</p></div>`;
    const avail = type === 'Paid Vacation Leave' ? (s.setUp ? `Available Paid Vacation: <b>${h(paidAvailable())}</b>` : 'Your Paid Vacation balance is not set up yet — please contact Admin.')
      : type === 'Maternity Leave' && s.setUp ? `Maternity Leave available: <b>${h(s.maternity.available)}</b> of ${h(s.maternity.allowance)}` : '';
    return `<div class="lv-policy"><span class="pill ${p[0] === 'Paid' ? 'ok' : 'warn'}" style="float:right;">${p[0]}</span>
      <h4>Description &amp; Policy Guidelines</h4><p>${esc(p[1])}.${avail ? '<br>' + avail : ''}</p>
      <h4>Filing Criteria</h4><p>${esc(p[2])}</p></div>`;
  }
  // Every problem at once, by field (the server checks the same things again).
  function fieldErrors(v){
    const e = {};
    if(!v.type) e.lvType = 'Please choose the type of leave.';
    if(v.type === 'Other' && !v.other) e.lvOther = 'Please say what kind of leave this is.';
    if(!$('lvStart').value) e.lvStart = 'Choose the first day of your leave.';
    if(!$('lvEnd').value) e.lvEnd = 'Choose the last day of your leave.';
    else if(v.start && v.end < v.start) e.lvEnd = 'The last day can’t be before the first day.';
    if($('lvPart').checked && v.start === v.end && !(v.part > 0 && v.part < 8)) e.lvPartHours = 'Part of the day must be between 0.5 and 7.5 hours.';
    if(v.ret && v.end && v.ret < v.end) e.lvReturn = 'Back to work should be on or after your last day of leave.';
    if(!v.reason) e.lvReason = 'Please give a reason for your leave.';
    const clash = !e.lvEnd && v.start && data.history.find(r => r.id !== (form && form.id) && r.source === 'portal' && ['pending', 'needs-clarification', 'approved', 'cancel-requested'].includes(r.status)
      && r.start <= v.end && (r.end || r.start) >= v.start);
    if(clash) e.lvStart = `You already have a leave on these dates (${range(clash.start, clash.end)}). Edit or cancel that one instead.`;
    if(form && form.split && !($('lvSplitOk') && $('lvSplitOk').checked)) e.lvSplitOk = 'Please tick the box to confirm the Unpaid Vacation hours.';
    return e;
  }
  function showErrors(e){
    document.querySelectorAll('#leaveForm .lv-bad').forEach(x => x.classList.remove('lv-bad'));
    document.querySelectorAll('#leaveForm .lv-ferr').forEach(x => x.remove());
    Object.entries(e).forEach(([id, msg]) => { const f = $(id); if(!f) return;
      f.classList.add('lv-bad'); f.setAttribute('aria-invalid', 'true');
      const m = document.createElement('span'); m.className = 'lv-ferr'; m.textContent = msg; (f.type === 'checkbox' ? f.parentNode : f).insertAdjacentElement('afterend', m); });
    document.querySelectorAll('#leaveForm [aria-invalid]').forEach(x => { if(!e[x.id]) x.removeAttribute('aria-invalid'); });
  }
  const leaveNextYear = s => { const d = new Date(s.cycle.end + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

  async function submit(){
    const v = values(), err = $('lvErr'), fail = m => { err.textContent = m; err.style.display = 'block'; };
    err.style.display = 'none';
    if(form.sending) return;
    if(!data.company) return fail('Your Employment Company is not set in your profile. Please contact Admin.');
    form.tried = true;
    const errors = fieldErrors(v), first = Object.keys(errors)[0];
    showErrors(errors);
    if(first){ fail('Please fix the highlighted ' + (Object.keys(errors).length > 1 ? 'fields' : 'field') + '.'); $(first).focus(); return; }
    const lines = [(v.type === 'Other' ? v.other : v.type), range(v.start, v.end) + ' · ' + h(v.hours), 'Company: ' + data.company]
      .concat(form.split ? ['Paid ' + h(form.split.paid) + ' + Unpaid ' + h(form.split.unpaid)] : []);
    if(!await confirmDialog_({title: form.id ? 'Save changes?' : 'Submit leave request?', message: lines.join('\n'), confirm: form.id ? 'Save' : 'Submit', danger: false})) return;
    const body = {Type: 'Leave Request', Details: v.reason, LeaveType: v.type, LeaveTypeOther: v.type === 'Other' ? v.other : '',
      LeaveStartDate: v.start, LeaveEndDate: v.end, NumberOfDays: v.days, ReturnToWorkDate: v.ret, PartialHours: v.part || '',
      AnniversaryDate: data.summary.setUp ? data.summary.cycle.start : ''};
    if(form.split) Object.assign(body, {PaidHours: form.split.paid, UnpaidHours: form.split.unpaid, SplitConfirmed: 'yes'});
    // While sending: spinner + message, the form is locked (not cleared). The same clientId is sent on every
    // try, so a retry after an error never files a second request.
    const btn = $('lvSubmit'), sending = on => {
      form.sending = on; btn.disabled = on;
      if(on) btn.innerHTML = `<span class="btn-spinner"></span>${form.id ? 'Saving...' : 'Submitting...'}`; else btn.textContent = form.id ? 'Save Changes' : 'Submit Leave Request';
      document.querySelectorAll('#leaveForm input, #leaveForm select, #leaveForm textarea, #leaveForm button:not(#lvSubmit)').forEach(x => { x.disabled = on; });
      $('lvSending').style.display = on ? '' : 'none';
    };
    sending(true);
    try{
      const r = form.id ? await apiPostMinDelayRetrying('editRequest', Object.assign({id: form.id}, body))
        : await apiPostMinDelayRetrying('submitRequest', Object.assign({EmployeeName: CURRENT_EMPLOYEE.name, clientId: form.clientId}, body));
      if(!r.ok){
        sending(false);
        if(r.needsSplitConfirm){ // the balance changed since this screen was loaded: show the server's breakdown
          data.summary.paid.available = r.available - (paidAvailable() - data.summary.paid.available);
          form.values = v; update();
        }
        const field = /reason/i.test(r.error || '') ? 'lvReason' : /date|already have a leave|end date/i.test(r.error || '') ? 'lvStart' : '';
        if(field){ const m = {}; m[field] = r.error; showErrors(m); }
        return fail(r.error || 'Couldn’t send your request. Please try again.');
      }
      const edited = !!form.id; form = null;
      saveStatusPill_('done', edited ? 'Leave request updated.' : 'Leave request sent — waiting for approval.');
      if(typeof refreshMyRequests === 'function') refreshMyRequests().catch(() => {});
      await load(); paint();
    } catch(e){
      if(form) sending(false);
      fail(e.message || 'Couldn’t send your request. Please try again.');
    }
  }

  async function openForm(id){
    if(!data) await render();
    if(data && data.summary && data.summary.paused) return paint(); // paused: the card explains why there is no form
    form = {id: id || null, clientId: crypto.randomUUID ? crypto.randomUUID() : 'cid-' + Date.now() + '-' + Math.random().toString(36).slice(2)};
    if(id){
      const r = data.history.find(x => x.id === id) || {}, m = (MOCK.requests || []).find(x => x.id === id) || {};
      form.values = {type: r.type, other: r.typeOther, start: r.start, end: r.end, part: r.hours && r.start === r.end && r.hours < 8 ? r.hours : 0,
        ret: typeof toDateInputValue_ === 'function' ? toDateInputValue_(m.returnToWorkDate) : '', reason: m.details};
    }
    paint();
    const el = $('leaveForm'); if(el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  async function askCancel(id, el){
    const r = data.history.find(x => x.id === id); if(!r) return;
    const reason = await confirmDialog_({title: 'Request cancellation?', message: `${r.type}, ${range(r.start, r.end)}.\nYour hours stay booked until your cancellation is approved.`,
      confirm: 'Send Request', danger: false, input: true, placeholder: 'Reason for cancelling'});
    if(!reason) return;
    el.disabled = true; el.textContent = 'Sending...';
    try{
      const res = await apiPostMinDelayRetrying('requestLeaveCancellation', {id, reason});
      if(!res.ok){ el.disabled = false; el.textContent = 'Request Cancellation'; return alert(res.error || 'Couldn’t send the cancellation request.'); }
      saveStatusPill_('done', 'Cancellation request sent — waiting for approval.');
      if(typeof refreshMyRequests === 'function') refreshMyRequests().catch(() => {});
      await load(); paint();
    } catch(e){ el.disabled = false; el.textContent = 'Request Cancellation'; alert(e.message || 'Couldn’t send the cancellation request.'); }
  }

  async function render(){
    const el = root(); if(!el) return;
    if(!data && MY_LEAVE_PREFETCH) data = MY_LEAVE_PREFETCH;
    if(data) paint();
    try{ await load(); } catch(e){ if(!data){ el.innerHTML = `<div class="card"><p class="muted">Couldn’t load your leave right now. Please try again.</p></div>`; return; } }
    if(!data){ el.innerHTML = `<div class="card"><p class="muted">Couldn’t load your leave right now. Please try again.</p></div>`; return; }
    paint();
  }

  /* ===================== Leave Monitoring (Shift Manager, Limited Admin, Full Admin) =====================
     Everyone in the Roster is listed. Starting balances, adjustments, recorded leave and leave settings are
     Full Admin only (the server checks this too); everyone else here can only look. */
  const COMPANIES = ['MP Holdings LLC', 'Mariana Entertainment'];
  const ICON = {
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h2M14 14h2M8 18h2M14 18h2"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>'};
  const ico = k => `<svg class="lv-ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const companyOf = name => ((adm.data.employees.find(e => e.name === name) || {}).company || '');
  const inCompany = c => !adm.company || (adm.company === '-' ? !c : c === adm.company);
  const companySelect = () => `<div class="lv-field">${ico('building')}<select aria-label="Company" onchange="LeaveUI.admSet('company', this.value)"><option value="">All companies</option>
      ${COMPANIES.map(c => `<option value="${esc(c)}" ${adm.company === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      <option value="-" ${adm.company === '-' ? 'selected' : ''}>Company not set</option></select></div>`;
  const shortCo = c => c === 'MP Holdings LLC' ? 'MP Holdings' : c === 'Mariana Entertainment' ? 'Mariana Ent.' : '—';
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const isFull = () => typeof isFullAdmin === 'function' && isFullAdmin();
  const adm = {tab: 'balances', company: '', q: '', needsOnly: false, data: null, month: '', monthData: null, person: null, personData: null, action: '', bulk: false, bulkAll: false, split: null};
  const rootAdmin = () => activeView === 'mgmt-leave' && document.getElementById('leaveRoot');
  const say = (el, msg) => { if(el) el.innerHTML = `<div class="card"><p class="muted">${esc(msg)}</p></div>`; };

  async function monitoring(from, to){
    const res = await fastOrFallback('leaveMonitoring', null, from ? 'from=' + from + '&to=' + to : '');
    if(!res || res.error) throw new Error((res && res.error) || 'Couldn’t load leave monitoring. Please try again.');
    return res;
  }
  async function renderAdmin(){
    const el = rootAdmin(); if(!el) return;
    if(adm.data) paintAdmin();
    try{ adm.data = await monitoring(); } catch(e){ if(!adm.data) return say(el, e.message); }
    paintAdmin();
  }
  function paintAdmin(){
    const el = rootAdmin(); if(!el || !adm.data) return;
    if(adm.person) return paintPerson(el);
    if(adm.bulk) return paintBulk(el);
    const tabs = [['balances', 'Leave Balances', 'Employee leave overview', 'people'], ['now', 'On Leave & Upcoming', 'Current and future leaves', 'clock'], ['calendar', 'Calendar', 'Visual leave schedule', 'cal']];
    el.innerHTML = `<div class="lv-ntabs lv-tabs" role="tablist">${tabs.map(([k, l, sub, i]) => `<button class="lv-ntab ${adm.tab === k ? 'on' : ''}" role="tab" aria-selected="${adm.tab === k}" onclick="LeaveUI.admTab('${k}')">${ico(i)}<span><b>${l}</b><small>${sub}</small></span></button>`).join('')}</div>`
      + (adm.tab === 'balances' ? balancesHtml() : adm.tab === 'now' ? nowHtml() : calendarHtml());
    if(adm.focusSearch){ const s = document.getElementById('lvSearch'); if(s){ s.focus(); s.setSelectionRange(s.value.length, s.value.length); } adm.focusSearch = false; }
    if(adm.tab === 'calendar' && !adm.monthData) loadMonth();
  }

  /* ----- Leave Balances ----- */
  function matches(e){
    const q = adm.q.trim().toLowerCase();
    return inCompany(e.company) && (!q || [e.name, e.position, e.employeeId].some(x => String(x || '').toLowerCase().includes(q)));
  }
  function visible(){ return adm.data.employees.filter(e => matches(e) && (!adm.needsOnly || e.needsEntry)); }
  const n = (e, k) => e.setUp ? String(Math.round(e.paid[k] * 2) / 2) : '—';
  function balancesHtml(){
    const list = visible(), needs = adm.data.employees.filter(e => matches(e) && e.needsEntry).length;
    // Starting-balance controls only while someone still needs one (any company, any search, so typing never moves the bar).
    const needsAny = adm.data.employees.some(e => e.needsEntry); if(!needsAny) adm.needsOnly = false;
    return `<div class="card" style="margin-bottom:16px;"><div class="lv-fbar">
        <div><label class="cap">Company</label>${companySelect()}</div>
        <div><label class="cap" for="lvSearch">Search employee</label><div class="lv-field">${ico('search')}<input id="lvSearch" type="text" enterkeyhint="search" autocomplete="off" placeholder="Search name, position or ID..." value="${esc(adm.q)}" oninput="LeaveUI.admSearch(this.value)">${adm.q ? `<button type="button" class="lv-clear" aria-label="Clear search" title="Clear search" onclick="LeaveUI.admSearch('')">${ico('x')}</button>` : ''}</div></div>
        ${needsAny ? `<label class="lv-need"><input type="checkbox" ${adm.needsOnly ? 'checked' : ''} onchange="LeaveUI.admSet('needsOnly', this.checked)">${ico('warn')} Needs starting balance (${needs})</label>
        ${isFull() ? `<button class="btn auto lv-addbtn" onclick="LeaveUI.openBulk()">${ico('plus')} Enter starting balances</button>` : '<span></span>'}` : ''}
      </div></div>
      <div class="card">
      <table class="mobile-card-table lv-table"><thead><tr><th>Employee</th><th>Company</th><th>Available</th><th>Pending</th><th>Upcoming</th><th>Used</th></tr></thead><tbody>
      ${list.map(e => `<tr>
        <td data-label="Employee"><button class="btn info auto" style="padding:3px 10px;" data-name="${esc(e.name)}" onclick="LeaveUI.openPerson(this.dataset.name)">${esc(e.name)}</button>
          ${e.needsEntry ? '<span class="pill warn">Needs starting balance</span>' : !e.setUp ? `<span class="pill bad" title="${esc(e.reason)}">Check settings</span>` : ''}
          ${e.paused ? `<span class="pill warn" title="Leave paused: 0 can be used, earned hours are kept">${esc(e.paused)} · leave paused${e.paid && e.paid.held ? ' (' + h(e.paid.held) + ' kept)' : ''}</span>` : ''}</td>
        <td data-label="Company">${esc(shortCo(e.company))}</td>
        <td data-label="Available"><b class="${e.setUp && e.paid.available < 0 ? 'lv-neg' : ''}">${n(e, 'available')}</b></td>
        <td data-label="Pending">${n(e, 'pending')}</td><td data-label="Upcoming">${n(e, 'upcoming')}</td><td data-label="Used">${n(e, 'used')}</td></tr>`).join('')
        || '<tr><td colspan="6" class="muted">No employees match.</td></tr>'}
      </tbody></table>
      <p class="muted" style="font-size:12px; margin-top:8px;">Paid Vacation hours in each employee’s current leave year. Click a name for details${isFull() ? ' and changes' : ''}.</p></div>`;
  }

  /* ----- On Leave & Upcoming ----- */
  function leaveLine(l){
    const t = l.type === 'Other' && l.typeOther ? l.typeOther : l.type;
    return `<div class="lv-item"><div style="min-width:0;"><div style="font-weight:600;">${esc(l.name)}</div>
      <div class="muted" style="font-size:13px;">${esc(t)} · ${range(l.start, l.end)} · ${h(l.hours)}</div></div>${pill(l.status)}</div>`;
  }
  function nowHtml(){
    const t = adm.data.today, live = adm.data.leaves.filter(l => !['declined', 'cancelled'].includes(l.status) && inCompany(companyOf(l.name)));
    const today = live.filter(l => l.start <= t && (l.end || l.start) >= t);
    const soon = live.filter(l => l.start > t && l.start <= addDays(t, 7));
    const later = live.filter(l => l.start > addDays(t, 7) && l.start <= addDays(t, 30));
    const block = (title, list, none) => `<div class="card" style="margin-bottom:16px;"><h3>${title} <span class="muted" style="font-size:13px;">(${list.length})</span></h3>
      ${list.map(leaveLine).join('') || `<p class="muted">${none}</p>`}</div>`;
    return `<div class="card" style="margin-bottom:16px; max-width:420px;"><label class="cap" style="font-size:11.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--text-mute);">Company</label>${companySelect()}</div>`
      + block('🏖️ On leave today', today, 'Nobody is on leave today.') + block('📅 Next 7 days', soon, 'No leave starts in the next 7 days.')
      + block('🗓️ Next 30 days', later, 'No other leave in the next 30 days.');
  }

  /* ----- Calendar ----- */
  async function loadMonth(){
    const m = adm.month || adm.data.today.slice(0, 7), first = m + '-01';
    const last = addDays(addDays(first, 32).slice(0, 7) + '-01', -1);
    try{ adm.monthData = {month: m, data: await monitoring(first, last)}; } catch(e){ adm.monthData = {month: m, error: e.message}; }
    if(adm.tab === 'calendar') paintAdmin();
  }
  // Kind of entry on the calendar: Suspension, or any type of leave by status. Anything else is not shown (records are untouched).
  // Only leave records and Admin entries are shown (attendance absences are not leave).
  const kind = l => l.type === 'Suspension' ? 'sus' : ['pending', 'needs-clarification', 'acknowledged'].includes(l.status) ? 'pend'
    : ['approved', 'cancel-requested'].includes(l.status) ? 'ok' : '';
  const KINDS = [['ok', 'Approved Leave', '#60A5FA'], ['pend', 'Pending Leave', '#FBBF24'], ['sus', 'Suspension', '#F87171']];
  const legend = () => `<div class="lv-legend">${KINDS.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;
  const chip = l => `<span class="lv-chip c-${kind(l)}" title="${esc(l.name + ' · ' + (l.type === 'Other' && l.typeOther ? l.typeOther : l.type) + ' · ' + l.status + (l.source === 'tracker' ? ' · Leave Tracker history' : ''))}">${esc(l.name)}${kind(l) === 'sus' ? ' (Suspension)' : ''}</span>`;
  function calendarHtml(){
    const m = adm.month || adm.data.today.slice(0, 7);
    const head = `<div class="lv-calbar"><div class="lv-calnav"><button class="btn ghost auto" onclick="LeaveUI.admMonth(-1)">${ico('left')} Previous</button>
      <b>${ico('cal')} ${new Date(m + '-01T00:00:00').toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</b>
      <button class="btn ghost auto" onclick="LeaveUI.admMonth(1)">Next ${ico('right')}</button></div>${legend()}${companySelect()}</div>`;
    if(!adm.monthData || adm.monthData.month !== m) return `<div class="card">${head}<p class="muted">Loading…</p></div>`;
    if(adm.monthData.error) return `<div class="card">${head}<p class="muted">${esc(adm.monthData.error)}</p></div>`;
    const leaves = adm.monthData.data.leaves.filter(l => kind(l) && inCompany(companyOf(l.name)));
    const first = m + '-01', startDow = new Date(first + 'T00:00:00Z').getUTCDay(), days = Number(addDays(addDays(first, 32).slice(0, 7) + '-01', -1).slice(8));
    const onDay = ymd => leaves.filter(l => l.start <= ymd && (l.end || l.start) >= ymd);
    const MAX = 3, cells = [];
    for(let i = 0; i < startDow; i++) cells.push('<div class="lv-day lv-empty"></div>');
    for(let d = 1; d <= days; d++){
      const ymd = m + '-' + String(d).padStart(2, '0'), on = onDay(ymd), mobile = window.innerWidth <= 640, shown = mobile ? on : on.slice(0, MAX);
      cells.push(`<div class="lv-day${ymd === adm.data.today ? ' lv-today' : ''}${on.length ? '' : ' lv-free'}"><span class="lv-dnum">${d}<span class="lv-dname"> ${new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', {weekday: 'short', timeZone: 'UTC'})}</span></span>
        ${shown.map(chip).join('')}${on.length > shown.length ? `<button class="lv-more" onclick="LeaveUI.admDay('${ymd}')">+${on.length - shown.length} more</button>` : ''}</div>`);
    }
    const sel = adm.day && adm.day.slice(0, 7) === m ? onDay(adm.day) : null;
    const dayList = sel ? `<div class="lv-daylist"><div style="display:flex; justify-content:space-between; align-items:center;"><h3 style="margin:0;">${day(adm.day)} <span class="muted" style="font-size:13px;">(${sel.length})</span></h3>
      <button class="btn ghost auto" onclick="LeaveUI.admDay('')">Close</button></div>
      ${sel.map(l => `<div class="lv-item"><div style="min-width:0;"><div style="font-weight:600;">${chip(l)}</div><div class="muted" style="font-size:13px;">${esc(l.type === 'Other' && l.typeOther ? l.typeOther : l.type)} · ${range(l.start, l.end)} · ${h(l.hours)}${l.source === 'tracker' ? ' · Leave Tracker history' : ''}</div></div>${pill(l.status)}</div>`).join('')}</div>` : '';
    return `<div class="card">${head}<div class="lv-cal-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="lv-cal">${cells.join('')}</div>${dayList}<div style="margin-top:12px;">${legend()}</div></div>`;
  }

  /* ----- One employee ----- */
  async function openPerson(name){
    adm.person = name; adm.personData = null; adm.action = ''; adm.split = null;
    const el = rootAdmin(); if(el) say(el, 'Loading ' + name + '…');
    window.scrollTo(0, 0);
    await loadPerson();
  }
  async function loadPerson(){
    try{
      const res = await fastOrFallback('leaveEmployee', null, 'name=' + encodeURIComponent(adm.person));
      if(!res || res.error) throw new Error((res && res.error) || 'Couldn’t load this employee.');
      adm.personData = res;
    } catch(e){ adm.personData = {error: e.message}; }
    paintAdmin();
  }
  function paintPerson(el){
    const back = `<button class="btn ghost auto" onclick="LeaveUI.closePerson()">← Back to Leave Monitoring</button>`;
    const d = adm.personData;
    if(!d) return el.innerHTML = `<div class="lv-tabs">${back}</div><div class="card"><p class="muted">Loading…</p></div>`;
    if(d.error) return el.innerHTML = `<div class="lv-tabs">${back}</div><div class="card"><p class="muted">${esc(d.error)}</p></div>`;
    const s = d.summary, p = d.profile, e = adm.data.employees.find(x => x.name === adm.person) || {};
    const info = `<p class="muted" style="font-size:13px;">${esc(e.company || 'Company not set')} · ${esc(e.position || '')}${p.entitlementPosition ? ' · Leave entitlement: ' + esc(p.entitlementPosition) : ''}${p.promotedDate ? ' · Promoted ' + day(p.promotedDate) : ''}</p>`;
    let bal;
    if(!s.setUp) bal = `<div class="banner note" style="margin-top:8px;">${esc(s.reason)}</div>`;
    else {
      const q = s.paid;
      bal = `<p class="muted" style="font-size:13px;">Leave year: ${range(s.cycle.start, s.cycle.end)}</p>
        <div class="lv-stats">
          <div class="lv-stat ${q.available < 0 ? 'neg' : 'main'}"><b>${String(q.available)}</b><span>Available (hrs)</span></div>
          <div class="lv-stat"><b>${String(q.pending)}</b><span>Pending</span></div>
          <div class="lv-stat"><b>${String(q.upcoming)}</b><span>Approved Upcoming</span></div>
          <div class="lv-stat"><b>${String(q.used)}</b><span>Used / Taken</span></div></div>
        <p class="muted" style="font-size:12px;">${q.starting ? `Starting balance ${h(q.starting.hours)} as of ${day(q.starting.date)}.` : `Yearly Paid Vacation: ${h(q.allowance)}.`}${q.adjustments ? ` Adjustments: ${q.adjustments > 0 ? '+' : ''}${h(q.adjustments)}.` : ''} Maternity: ${h(s.maternity.available)} available.</p>`;
    }
    if(s.paused) bal += `<div class="banner note" style="margin-top:8px;">${esc(s.paused)}: leave is paused. 0 hours can be used and new leave can't be filed or recorded until the status is back to Active.${s.paid && s.paid.held !== undefined ? ` Earned and kept: ${h(s.paid.held)} (same anniversary year).` : ''}</div>`;
    const acts = isFull() ? `<div class="lv-actions">${[['starting', 'Set starting balance'], ['record', 'Record approved leave'], ['adjust', 'Adjust balance'], ['suspension', 'Suspension'], ['settings', 'Leave settings']]
      .map(([k, l]) => `<button class="btn ${adm.action === k ? '' : 'ghost'} auto" onclick="LeaveUI.admAction('${k}')">${l}</button>`).join('')}</div>${actionForm(d)}` : '';
    const hist = d.history.map(r => `<div class="lv-item"><div style="min-width:0;"><div style="font-weight:600;">${range(r.start, r.end)}</div>
      <div class="muted" style="font-size:13px;">${esc(r.type === 'Other' && r.typeOther ? r.typeOther : r.type)} · ${h(r.hours)}${r.unpaidHours > 0 ? ` · Paid ${h(r.paidHours)} + Unpaid ${h(r.unpaidHours)}` : ''}${r.number ? ' · ' + esc(r.number) : ''}${r.source === 'tracker' ? ' · from Leave Tracker (history only)' : ''}</div></div>${pill(r.status)}</div>`).join('');
    el.innerHTML = `<div class="lv-tabs">${back}</div>
      <div class="card" style="margin-bottom:16px;"><h3><span class="ic">🌴</span> ${esc(adm.person)}</h3>${info}${bal}${acts}</div>
      <div class="card"><h3><span class="ic">🗂️</span> Leave History</h3>${hist || '<p class="muted">No leave records yet.</p>'}
        ${d.hasOlder ? `<button class="btn ghost auto" style="margin-top:12px;" onclick="LeaveUI.personOlder(this)">View older history</button>` : ''}</div>`;
    if(adm.action === 'record') recordUpdate();
  }
  const today = () => adm.data.today;
  function actionForm(d){
    const t = today(), types = (d.types || []).filter(x => x !== 'Other').concat(['Other']);
    const err = '<p class="login-err" id="lvAdmErr"></p>';
    if(adm.action === 'starting') return `<div class="lv-form"><p class="muted">Paid Vacation hours this employee has available on the date below (check the Leave Tracker first). Leave from that date on is counted by the portal.</p>
      <div class="grid grid-2"><div><label for="lvStDate">As of</label><input id="lvStDate" type="date" max="${t}" value="${t}"></div>
      <div><label for="lvStHours">Available hours</label><input id="lvStHours" type="number" step="0.5" value="${d.profile.startingPaidHours ?? ''}"></div></div>
      <label for="lvStNote">Note</label><input id="lvStNote" type="text" maxlength="300" placeholder="e.g. Checked against the Leave Tracker">${err}
      <button class="btn auto" onclick="LeaveUI.saveStarting(this)">Save starting balance</button></div>`;
    if(adm.action === 'record') return `<div class="lv-form"><p class="muted">For leave already approved outside the portal (for example in the Leave Tracker). It is saved as Approved and counted once.</p>
      <label for="lvRType">Type of leave</label><select id="lvRType" onchange="LeaveUI.recordUpdate()">${types.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>
      <div id="lvROtherWrap" style="display:none;"><label for="lvROther">Please specify</label><input id="lvROther" type="text" maxlength="80"></div>
      <div class="grid grid-2"><div><label for="lvRStart">First day</label><input id="lvRStart" type="date" onchange="LeaveUI.recordUpdate()"></div>
      <div><label for="lvREnd">Last day</label><input id="lvREnd" type="date" onchange="LeaveUI.recordUpdate()"></div></div>
      <label for="lvRPart">Part-day hours <span class="muted">(only for a one-day leave, optional)</span></label><input id="lvRPart" type="number" min="0.5" max="7.5" step="0.5" oninput="LeaveUI.recordUpdate()">
      <label for="lvRNote">Note</label><input id="lvRNote" type="text" maxlength="300" placeholder="e.g. Approved in the Leave Tracker on Oct 20">
      <div id="lvRSum"></div>${err}<button class="btn auto" onclick="LeaveUI.saveRecord(this)">Save as approved leave</button></div>`;
    if(adm.action === 'adjust') return `<div class="lv-form"><p class="muted">Add (+) or remove (−) hours. Every adjustment is recorded with your reason.</p>
      <div class="grid grid-2"><div><label for="lvAjBal">Balance</label><select id="lvAjBal"><option value="Paid">Paid Vacation</option><option value="Maternity">Maternity</option></select></div>
      <div><label for="lvAjHours">Hours (+ or −)</label><input id="lvAjHours" type="number" step="0.5"></div></div>
      <label for="lvAjDate">Date</label><input id="lvAjDate" type="date" value="${t}">
      <label for="lvAjReason">Reason</label><input id="lvAjReason" type="text" maxlength="300">${err}<button class="btn auto" onclick="LeaveUI.saveAdjust(this)">Save adjustment</button></div>`;
    if(adm.action === 'suspension') return `<div class="lv-form"><p class="muted">Records a suspension. It uses no leave balance.</p>
      <div class="grid grid-2"><div><label for="lvSuStart">First day</label><input id="lvSuStart" type="date"></div><div><label for="lvSuEnd">Last day</label><input id="lvSuEnd" type="date"></div></div>
      <label for="lvSuReason">Reason</label><input id="lvSuReason" type="text" maxlength="300">${err}<button class="btn auto" onclick="LeaveUI.saveSuspension(this)">Save suspension</button></div>`;
    if(adm.action === 'settings') return `<div class="lv-form"><p class="muted">Yearly Paid Vacation follows the entitlement position (from the next leave year). The leave year starts on the Promoted Date, or the Date Hired in All Employees.</p>
      <div class="grid grid-2"><div><label for="lvSePos">Entitlement position</label><select id="lvSePos"><option value="">— Choose —</option>${(d.positions || []).map(x => `<option value="${esc(x.position)}" ${x.position === d.profile.entitlementPosition ? 'selected' : ''}>${esc(x.position)} (${h(x.hours)})</option>`).join('')}</select></div>
      <div><label for="lvSeProm">Promoted date <span class="muted">(optional)</span></label><input id="lvSeProm" type="date" value="${esc(d.profile.promotedDate || '')}"></div></div>
      ${d.profile.source === 'Admin-managed' ? `<div class="grid grid-2"><div><label for="lvSeHire">Date hired</label><input id="lvSeHire" type="date"></div>
        <div><label for="lvSeCo">Company</label><select id="lvSeCo"><option value="">— Choose —</option>${COMPANIES.map(c => `<option ${c === d.profile.company ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>` : ''}
      <label for="lvSeReason">Reason</label><input id="lvSeReason" type="text" maxlength="300">${err}<button class="btn auto" onclick="LeaveUI.saveSettings(this)">Save leave settings</button></div>`;
    return '';
  }
  const val = id => (document.getElementById(id) || {}).value || '';
  const admFail = m => { const e = document.getElementById('lvAdmErr'); if(e){ e.textContent = m; e.style.display = m ? 'block' : 'none'; } };
  /* Saves (same pattern as All Employees): the clicked button (passed in, so it is found even after the
     confirmation dialog) shows a spinner and stays disabled; "Saving…" until the server answers; success only
     after it confirms; on an error the form keeps what was typed. Every save carries an operation ID that the
     automatic retries reuse, and saving the same thing again after an error reuses it too, so the server
     applies it once (Security.gs secWrite_) even when a reply was lost after the save. */
  let lastOp = null;
  const opFor = (action, payload) => { const key = action + JSON.stringify(payload); if(!lastOp || lastOp.key !== key) lastOp = {key, id: newOpId_()}; return lastOp.id; };
  const busy = (btn, on) => { if(!btn) return; if(on){ btn.dataset.t = btn.dataset.t || btn.textContent; btn.innerHTML = '<span class="btn-spinner"></span>Saving...'; } else if(document.body.contains(btn)) btn.textContent = btn.dataset.t; btn.disabled = on; };
  const pillOff = () => { const p = document.getElementById('saveStatusPill'); if(p) p.style.display = 'none'; };
  const saveError = e => /too long/i.test(e.message || '') ? 'The server is taking longer than usual, so the save may still finish. Please wait a moment and check before saving again (saving the same thing again will not record it twice).'
    : e.message || 'Couldn’t save. Please try again.';
  async function sendOnce(action, payload, btn){ // {r} with the server's answer, or {error}
    if(adm.saving) return {busy: true};
    adm.saving = true; busy(btn, true); admFail(''); saveStatusPill_('saving');
    try{ return {r: await apiPostMinDelayRetrying(action, Object.assign({opId: opFor(action, payload)}, payload))}; }
    catch(e){ const m = saveError(e); admFail(m); saveStatusPill_('error', m); return {error: m}; }
    finally { adm.saving = false; busy(btn, false); }
  }
  async function admSend(action, payload, done, btn){
    const {r} = await sendOnce(action, payload, btn);
    if(!r) return;
    if(!r.ok){
      if(r.needsSplitConfirm){ pillOff(); return showSplit(r); }
      const m = r.error || 'Couldn’t save. Nothing was changed.'; saveStatusPill_('error', m); return admFail(m);
    }
    lastOp = null; saveStatusPill_('done', done);
    adm.action = ''; adm.split = null;
    const [m] = await Promise.all([monitoring().catch(() => adm.data), loadPerson()]);
    adm.data = m; paintAdmin();
  }
  async function saveStarting(btn){
    if(adm.saving) return; // a save is already on its way
    const hours = val('lvStHours'), date = val('lvStDate'), note = val('lvStNote').trim();
    if(hours === '' || isNaN(Number(hours))) return admFail('Enter the available hours.');
    if(!date) return admFail('Choose the date.'); if(!note) return admFail('Please add a note.');
    if(!await confirmDialog_({title: 'Save starting balance?', message: adm.person + ': ' + h(hours) + ' available as of ' + day(date) + '.', confirm: 'Save', danger: false})) return;
    admSend('leaveSetStarting', {date, note, entries: [{employeeName: adm.person, paidHours: Number(hours)}]}, 'Starting balance saved.', btn);
  }
  function recordValues(){
    const start = val('lvRStart'), end = val('lvREnd') || start, part = start && start === end ? Number(val('lvRPart')) || 0 : 0;
    return {type: val('lvRType'), other: val('lvROther').trim(), start, end, part, note: val('lvRNote').trim(), hours: hoursFor(start, end, part)};
  }
  function recordUpdate(){
    const w = document.getElementById('lvROtherWrap'); if(!w) return;
    const v = recordValues(); w.style.display = v.type === 'Other' ? '' : 'none';
    const sum = document.getElementById('lvRSum');
    sum.innerHTML = adm.split ? `<div class="lv-sum warn">${esc(adm.split.error)}<div class="lv-split"><div><span class="muted">Paid Vacation</span><b>${h(adm.split.paidHours)}</b></div><div><span class="muted">Unpaid Vacation</span><b>${h(adm.split.unpaidHours)}</b></div></div>
      <div class="checkbox-row"><input type="checkbox" id="lvRSplitOk"><label for="lvRSplitOk">Record ${h(adm.split.unpaidHours)} as Unpaid Vacation.</label></div></div>`
      : v.hours ? `<div class="lv-sum">This leave: <b>${h(v.hours)}</b></div>` : '';
  }
  function showSplit(r){ adm.split = r; recordUpdate(); admFail(''); }
  async function saveRecord(btn){
    if(adm.saving) return; // a save is already on its way
    const v = recordValues();
    if(!v.start || v.end < v.start) return admFail('Choose valid first and last days.');
    if(v.type === 'Other' && !v.other) return admFail('Please say what kind of leave this is.');
    if(!v.note) return admFail('Please add a note.');
    const body = {employeeName: adm.person, LeaveType: v.type, LeaveTypeOther: v.type === 'Other' ? v.other : '', LeaveStartDate: v.start, LeaveEndDate: v.end, PartialHours: v.part || '', note: v.note};
    if(adm.split){
      if(!(document.getElementById('lvRSplitOk') || {}).checked) return admFail('Please tick the box to confirm the Unpaid Vacation hours.');
      Object.assign(body, {PaidHours: adm.split.paidHours, UnpaidHours: adm.split.unpaidHours, SplitConfirmed: 'yes'});
    }
    if(!await confirmDialog_({title: 'Save as approved leave?', message: adm.person + ': ' + v.type + ', ' + range(v.start, v.end) + ' · ' + h(v.hours), confirm: 'Save', danger: false})) return;
    admSend('leaveRecordApproved', body, 'Approved leave recorded.', btn);
  }
  async function saveAdjust(btn){
    if(adm.saving) return; // a save is already on its way
    const hours = val('lvAjHours'), reason = val('lvAjReason').trim();
    if(!hours || isNaN(Number(hours)) || Number(hours) === 0) return admFail('Enter the hours to add (+) or remove (−).');
    if(!reason) return admFail('A reason is required.');
    if(!await confirmDialog_({title: 'Save adjustment?', message: adm.person + ': ' + (Number(hours) > 0 ? '+' : '') + h(hours) + ' (' + val('lvAjBal') + ').', confirm: 'Save', danger: false})) return;
    admSend('leaveAdjust', {employeeName: adm.person, balance: val('lvAjBal'), hours: Number(hours), date: val('lvAjDate'), reason}, 'Adjustment saved.', btn);
  }
  async function saveSuspension(btn){
    if(adm.saving) return; // a save is already on its way
    const start = val('lvSuStart'), end = val('lvSuEnd') || start, reason = val('lvSuReason').trim();
    if(!start || end < start) return admFail('Choose valid first and last days.');
    if(!reason) return admFail('A reason is required.');
    if(!await confirmDialog_({title: 'Save suspension?', message: adm.person + ': ' + range(start, end) + '.', confirm: 'Save', danger: false})) return;
    admSend('leaveAdminEntry', {employeeName: adm.person, start, end, reason}, 'Suspension saved.', btn);
  }
  async function saveSettings(btn){
    if(adm.saving) return; // a save is already on its way
    const pos = val('lvSePos'), reason = val('lvSeReason').trim(), d = adm.personData;
    if(!pos) return admFail('Choose the entitlement position.');
    if(!reason) return admFail('A reason is required.');
    admSend('leaveProfileSave', {employeeName: adm.person, entitlementPosition: pos, promotedDate: val('lvSeProm'), hireDate: val('lvSeHire'),
      source: d.profile.source, company: val('lvSeCo'), reason}, 'Leave settings saved.', btn);
  }

  /* ----- Starting balances for many employees at once ----- */
  function paintBulk(el){
    const t = adm.data.today, list = adm.data.employees.filter(e => adm.bulkAll || e.needsEntry);
    const positions = adm.data.positions || [];
    el.innerHTML = `<div class="lv-tabs"><button class="btn ghost auto" onclick="LeaveUI.closeBulk()">← Back to Leave Monitoring</button></div>
      <div class="card"><h3><span class="ic">✍️</span> Enter starting balances</h3>
      <p class="muted" style="font-size:13px;">Type the Paid Vacation hours each employee has available on the date below (after checking the Leave Tracker). Leave from that date on is counted by the portal. Rows left empty are not changed.</p>
      <div class="grid grid-2 lv-pair"><div><label for="lvBDate">As of</label><input id="lvBDate" type="date" max="${t}" value="${t}"></div>
      <div><label for="lvBNote">Note</label><input id="lvBNote" type="text" maxlength="300" placeholder="e.g. Checked against the Leave Tracker"></div></div>
      <label class="lv-check lv-showall"><input type="checkbox" ${adm.bulkAll ? 'checked' : ''} onchange="LeaveUI.bulkAll(this.checked)"> Show everyone (not only those without a starting balance)</label>
      <table class="mobile-card-table lv-table"><thead><tr><th>Employee</th><th>Company</th><th>Entitlement position</th><th>Now</th><th>Available hours</th></tr></thead><tbody>
      ${list.map((e, i) => `<tr data-name="${esc(e.name)}">
        <td data-label="Employee">${esc(e.name)}</td><td data-label="Company">${esc(shortCo(e.company))}</td>
        <td data-label="Entitlement"><select class="lvBPos" aria-label="Entitlement position for ${esc(e.name)}"><option value="">${e.entitlementPosition ? esc(e.entitlementPosition) : '— Choose —'}</option>
          ${positions.filter(x => x.position !== e.entitlementPosition).map(x => `<option value="${esc(x.position)}">${esc(x.position)} (${h(x.hours)})</option>`).join('')}</select></td>
        <td data-label="Now">${e.needsEntry ? '<span class="pill warn">Not set</span>' : e.setUp ? esc(String(e.paid.available)) + ' h' : '—'}</td>
        <td data-label="Available hours"><input class="lvBHours" type="number" step="0.5" aria-label="Available hours for ${esc(e.name)}" style="max-width:120px;"></td></tr>`).join('')
        || '<tr><td colspan="5" class="muted">Everyone already has a starting balance.</td></tr>'}
      </tbody></table><p class="login-err" id="lvAdmErr"></p>
      <button class="btn" style="margin-top:12px;" onclick="LeaveUI.saveBulk(this)">Save starting balances</button></div>`;
  }
  async function saveBulk(btn){
    if(adm.saving) return; // a save is already on its way
    const date = val('lvBDate'), note = val('lvBNote').trim();
    const entries = [...document.querySelectorAll('#leaveRoot tr[data-name]')].map(tr => ({employeeName: tr.dataset.name,
      paidHours: tr.querySelector('.lvBHours').value, entitlementPosition: tr.querySelector('.lvBPos').value})).filter(x => x.paidHours !== '');
    if(!entries.length) return admFail('Type the hours for at least one employee.');
    if(entries.some(x => isNaN(Number(x.paidHours)))) return admFail('Hours must be numbers.');
    if(!date) return admFail('Choose the date.'); if(!note) return admFail('Please add a note.');
    if(!await confirmDialog_({title: 'Save ' + entries.length + ' starting balance' + (entries.length > 1 ? 's' : '') + '?', message: 'As of ' + day(date) + '.\n' + entries.slice(0, 8).map(x => x.employeeName + ': ' + h(x.paidHours)).join('\n') + (entries.length > 8 ? '\n…' : ''), confirm: 'Save', danger: false})) return;
    const {r} = await sendOnce('leaveSetStarting', {date, note, entries: entries.map(x => ({employeeName: x.employeeName, paidHours: Number(x.paidHours), entitlementPosition: x.entitlementPosition}))}, btn);
    if(!r) return;
    if(!r.ok){ const m = r.error || 'Couldn’t save. Nothing was changed.'; saveStatusPill_('error', m); return admFail(m); }
    lastOp = null; saveStatusPill_('done', r.saved + ' starting balance' + (r.saved > 1 ? 's' : '') + ' saved.');
    adm.bulk = false; adm.data = await monitoring().catch(() => adm.data); paintAdmin();
  }

  /* ----- Paid Vacation box on a leave request (Manage Requests) ----- */
  async function balanceBox(r){
    const el = () => document.getElementById('lvBalanceBox');
    if(!el()) return;
    el().innerHTML = '<p class="muted" style="font-size:13px;">Checking Paid Vacation balance…</p>';
    let d; try{ d = await fastOrFallback('leaveEmployee', null, 'name=' + encodeURIComponent(r.EmployeeName)); } catch(e){ d = null; }
    if(!el()) return;
    if(!d || d.error || !d.summary) return el().innerHTML = '';
    const s = d.summary;
    if(!s.setUp) return el().innerHTML = `<div class="lv-sum warn">${esc(s.reason)}</div>`;
    const paid = Number(r.PaidHours) || (r.LeaveType === 'Paid Vacation Leave' ? Number(r.LeaveHours) || 0 : 0), unpaid = Number(r.UnpaidHours) || 0;
    const waiting = ['pending', 'needs-clarification', 'acknowledged'].includes(r.Status);
    el().innerHTML = `<div class="lv-sum ${s.paid.available < 0 ? 'warn' : ''}"><b>Paid Vacation</b> · Available: <b>${h(s.paid.available)}</b>${waiting && paid ? ' (this request is already held)' : ''}
      ${paid || unpaid ? ` · This request: Paid ${h(paid)}${unpaid ? ' + Unpaid ' + h(unpaid) : ''}` : ' · This leave type does not use Paid Vacation'}</div>`;
  }

  /* ----- Printable Leave Request Form (printLeaveRequestForm in the page): Type of Leave and Paid hours -----
     The choices are the configured leave types (the server's list) and the hours come from the same saved
     leave record the balances use, so the printed form matches the request. */
  async function printInfo(id){
    const raw = typeof ALL_REQUESTS !== 'undefined' && ALL_REQUESTS.find(x => x.ID === id) || null;
    const mine = !raw && MOCK.requests.find(x => x.id === id) || {};
    const name = raw ? raw.EmployeeName : CURRENT_EMPLOYEE.name;
    // Admin: that employee's records; an employee: only their own (the server scopes myLeave to the signed-in person).
    let d = null; try{ d = raw ? await fastOrFallback('leaveEmployee', null, 'name=' + encodeURIComponent(name) + '&older=true') : await fastOrFallback('myLeave', null, 'older=true'); } catch(e){}
    const rec = d && !d.error && (d.history || []).find(x => x.id === id) || null;
    const type = rec ? rec.type : String((raw ? raw.LeaveType : mine.leaveType) || ''), other = rec ? rec.typeOther : String((raw ? raw.LeaveTypeOther : mine.leaveTypeOther) || '');
    const hours = rec ? rec.hours : Number(raw && (raw.LeaveHours || raw.NumberOfDays * 8)) || 0;
    // Maternity is paid from its own balance; older "Vacation Leave" requests show Paid or Unpaid Vacation from their hours.
    const paid = type === 'Maternity Leave' ? hours : rec ? rec.paidHours : Number(raw && raw.PaidHours) || 0, unpaid = rec ? rec.unpaidHours : Number(raw && raw.UnpaidHours) || 0;
    const ticked = type === 'Vacation Leave' ? (paid > 0 ? 'Paid Vacation Leave' : 'Unpaid Vacation Leave') : type;
    let types = (d && !d.error && d.types) || (data && data.types) || [];
    if(ticked && !types.includes(ticked)) types = types.concat([ticked]); // an older type no longer offered
    const box = t => `<div style="margin-bottom:8px;"><span style="display:inline-block; width:14px; height:14px; border:1.2px solid #000; margin-right:8px; vertical-align:middle; text-align:center; line-height:13px; font-size:12px;">${t === ticked ? '✓' : ''}</span>${esc(t)}${t === 'Other' && ticked === 'Other' && other ? ': <strong>' + esc(other) + '</strong>' : ''}</div>`;
    const cell = list => `<td style="border:none !important; padding:0 !important; vertical-align:top; width:50%;">${list.map(box).join('')}</td>`, half = Math.ceil(types.length / 2);
    const known = !!(rec || raw), mark = on => `<span style="font-size:14px;">${on ? '☑' : '☐'}</span>`;
    return {types: `<table style="width:100%; border:none !important; font-size:12px !important; border-collapse:collapse;"><tr>${cell(types.slice(0, half))}${cell(types.slice(half))}</tr></table>`,
      paid: `${mark(known && paid > 0)} YES &nbsp;&nbsp; ${mark(known && !(paid > 0))} NO`,
      hoursPaid: known ? '<strong>' + h(paid) + '</strong>' + (unpaid > 0 ? ' (+ ' + h(unpaid) + ' unpaid)' : '') : '_______________'};
  }

  window.LeaveUI = {render, openForm, update, submit, askCancel, renderAdmin, openPerson, balanceBox, recordUpdate, saveStarting, saveRecord, saveAdjust, saveSuspension, saveSettings, saveBulk, printInfo,
    admTab(t){ adm.tab = t; paintAdmin(); },
    admSet(k, v){ adm[k] = v; paintAdmin(); },
    admSearch(v){ adm.q = v; adm.focusSearch = true; paintAdmin(); },
    admDay(d){ adm.day = d; paintAdmin(); },
    admMonth(step){ const m = adm.month || adm.data.today.slice(0, 7); const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + step); adm.month = d.toISOString().slice(0, 7); adm.monthData = null; paintAdmin(); },
    admAction(k){ adm.action = adm.action === k ? '' : k; adm.split = null; paintAdmin(); },
    closePerson(){ adm.person = null; adm.personData = null; adm.action = ''; paintAdmin(); },
    async personOlder(btn){ btn.disabled = true; btn.textContent = 'Loading...'; const r = await fastOrFallback('leaveEmployee', null, 'name=' + encodeURIComponent(adm.person) + '&older=true'); if(r && !r.error) adm.personData = r; paintAdmin(); },
    openBulk(){ adm.bulk = true; paintAdmin(); },
    closeBulk(){ adm.bulk = false; paintAdmin(); },
    bulkAll(v){ adm.bulkAll = v; paintAdmin(); },
    closeForm(){ form = null; paint(); },
    async showOlder(btn){ btn.disabled = true; btn.textContent = 'Loading...'; older = true; await load(); paint(); }};
})();
