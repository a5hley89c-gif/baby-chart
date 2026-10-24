// Baby Chart: the chart screen. Ported from the original web chart.
// startChart(ctx) wires up the page that index.html already contains.
// ctx.store  : data store (see main.js for the Firebase version, test/local-store.js for tests)
// ctx.native : phone features (notifications); optional
// ctx.family : {name, birth: "YYYY-MM-DD"}
export function startChart(ctx){

const $ = s => document.querySelector(s);
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const METHOD = {armpit:"armpit", ear:"ear", forehead:"forehead"};
function noteOf(id){ const v = $(id).value.trim(); return v ? v.slice(0,200) : ""; }
function withNote(obj, id){ const n = noteOf(id); if(n) obj.note = n; return obj; }
const SIDE = {L:"Left", R:"Right", B:"Both sides", BO:"Bottle"};
const SIDECOL = {L:"var(--left)", R:"var(--right)", B:"var(--both)", BO:"var(--bottle)"};
const NAPPY = {wee:"Wee", poo:"Poo", both:"Wee + poo", dry:"Dry (fresh change)"};
const NAPPYCOL = {wee:"var(--wee)", poo:"var(--poo)", both:"var(--both)", dry:"var(--dry)"};

let entries = [];           // newest first
let mode = "db";
const store = ctx.store;
function sortEntries(){ entries.sort((a,b)=>b.t-a.t); }
function fail(e){
  const code = String((e && e.code) || "");
  if(code.includes("permission-denied")) toast("You don't have access to this chart any more. Check Settings and family.");
  else toast("Couldn't save that. It will be saved when you're back online.");
  try{ console.error(e); }catch(_){}
}
store.onError = fail;
// The store applies writes to its local copy straight away and syncs in the background,
// so these resolve immediately (they also work offline).
async function addEntry(obj){ try{ return store.add(obj); }catch(e){ fail(e); return null; } }
async function updateEntry(id, patch){ try{ store.update(id, patch); }catch(e){ fail(e); } }
async function deleteEntry(id){ try{ store.remove(id); }catch(e){ fail(e); } }

/* ---------- helpers ---------- */
function fmtTime(ms){ return new Date(ms).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"}).replace(" ",""); }
function dur(ms){ const m = Math.max(0, Math.round(ms/MIN)); const h = Math.floor(m/60); return h ? `${h}h ${m%60}m` : `${m}m`; }
function ago(ms){ const d = Date.now()-ms; return d < MIN ? "just now" : dur(d) + " ago"; }
function clock(ms){ const s = Math.max(0, Math.floor(ms/1000)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), ss = s%60;
  return (h ? h + ":" + String(m).padStart(2,"0") : m) + ":" + String(ss).padStart(2,"0"); }
function timeFrom(id){
  const v = $(id).value; const now = Date.now();
  if(!v) return now;
  const [h,m] = v.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0);
  let t = d.getTime(); if(t > now + MIN) t -= DAY; return t;
}
function dayLabel(ms){
  const d = new Date(ms); d.setHours(0,0,0,0); const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((t - d)/DAY);
  if(diff === 0) return "Today"; if(diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-AU",{weekday:"short", day:"numeric", month:"short"});
}
const openFeed = () => entries.find(e=>e.kind==="feed" && e.open);
const openSleep = () => entries.find(e=>e.kind==="sleep" && e.open);
const endedOn = e => e.last || (e.side==="L"||e.side==="R" ? e.side : null);
function lastSideFeed(){ return entries.find(e=>e.kind==="feed" && endedOn(e)) || null; }
function lastBreastSide(){ const f = lastSideFeed(); return f ? endedOn(f) : null; }
// Next-side rule: alternate breasts, unless the last single-breast feed was
// under half of Harper's recent average on that breast (last 10 timed feeds,
// needs at least 3) — then that breast probably wasn't drained, so start there again.
const feedMs = e => (!e.open && e.end > e.t) ? e.end - e.t : 0;
function avgOn(side, skipId){
  const xs = entries.filter(e=>e.kind==="feed" && e.side===side && e.id!==skipId && feedMs(e) > 0).slice(0,10).map(feedMs);
  return xs.length >= 3 ? xs.reduce((a,b)=>a+b, 0) / xs.length : null;
}
function sideAdvice(){
  const f = lastSideFeed(); if(!f) return null;
  const s = endedOn(f), other = s==="L" ? "R" : "L";
  if(f.side===s){ const d = feedMs(f), avg = avgOn(s, f.id);
    if(d > 0 && avg && d < avg * 0.5) return {side:s, short:true, d, avg}; }
  return {side:other, short:false};
}
function nextSide(){ const a = sideAdvice(); return a ? a.side : null; }
function sideText(e){ return SIDE[e.side] + (e.last && e.last !== e.side ? ", ended " + SIDE[e.last].toLowerCase() : ""); }

/* ---------- render ---------- */
function renderLive(){
  const box = $("#live"); let html = "";
  const keepMl = $("#liveMl") ? $("#liveMl").value : "";
  const f = openFeed(), s = openSleep();
  if(f) html += `<div class="banner" style="--c:${SIDECOL[f.side]}"><span class="pulse"></span><div class="txt"><div class="what">Feeding · ${SIDE[f.side]}</div><div class="big" data-since="${f.t}">${clock(Date.now()-f.t)}</div></div>${f.side==="B"
    ? `<div class="acts"><button class="btn" data-act="stopFeedL">Ended Left</button><button class="btn" data-act="stopFeedR">Ended Right</button></div>`
    : `<div class="acts">${f.side==="BO" ? `<input id="liveMl" type="number" inputmode="numeric" min="0" step="5" placeholder="ml" aria-label="Amount in ml">` : ""}<button class="btn" data-act="stopFeed">Finish</button></div>`}</div>`;
  if(s) html += `<div class="banner" style="--c:var(--sleep)"><span class="pulse"></span><div class="txt"><div class="what">Asleep since ${fmtTime(s.t)}${feedDue() ? (Date.now() < feedDue() ? " · feed due " : " · feed was due ") + fmtTime(feedDue()) : ""}</div><div class="big" data-since="${s.t}">${clock(Date.now()-s.t)}</div></div><button class="btn" style="width:auto" data-act="wake">Woke up</button></div>`;
  box.innerHTML = html;
  if(keepMl && $("#liveMl")) $("#liveMl").value = keepMl;
}
function tickLive(){ document.querySelectorAll("#live [data-since]").forEach(el=>{ el.textContent = clock(Date.now() - Number(el.dataset.since)); }); }

function renderStatus(){
  const f = entries.find(e=>e.kind==="feed");
  if(f){ $("#sFeed").textContent = f.open ? "Now" : ago(f.t).replace(" ago",""); $("#sFeedD").textContent = (f.open ? "" : "ago · ") + sideText(f) + " · " + fmtTime(f.t); }
  else { $("#sFeed").textContent = "—"; $("#sFeedD").textContent = "None logged yet"; }
  const ns = nextSide(); const hint = $("#sNext");
  const adv = sideAdvice();
  hint.textContent = ns ? "Next: " + SIDE[ns] + (adv && adv.short ? " again" : "") : ""; hint.style.color = ns ? SIDECOL[ns] : "";
  const lf = lastSideFeed(), lu = $("#lastUsed");
  if(lf){ const s = endedOn(lf), dl = dayLabel(lf.t);
    const when = dl==="Today" ? "" : dl==="Yesterday" ? " yesterday" : " on " + dl;
    lu.innerHTML = `Last side used: <b style="--c:${SIDECOL[s]}">${SIDE[s]}</b> · ${fmtTime(lf.t)}${when}${adv && adv.short
      ? `, only ${dur(adv.d)} (her recent average there is ${dur(adv.avg)}). Start on <b style="--c:${SIDECOL[ns]}">${SIDE[ns]}</b> again so it gets fully drained.`
      : `. Start on <b style="--c:${SIDECOL[ns]}">${SIDE[ns]}</b>.`}`; }
  else lu.textContent = "No breastfeeds logged yet.";
  const n = entries.find(e=>e.kind==="nappy");
  if(n){ $("#sNappy").textContent = ago(n.t).replace(" ago",""); $("#sNappyD").textContent = "ago · " + NAPPY[n.type] + " · " + fmtTime(n.t); }
  else { $("#sNappy").textContent = "—"; $("#sNappyD").textContent = "None logged yet"; }
  const os = openSleep(), ls = entries.find(e=>e.kind==="sleep");
  if(os){ $("#sSleep").textContent = "Asleep"; $("#sSleepD").textContent = dur(Date.now()-os.t) + " so far"; }
  else if(ls){ $("#sSleep").textContent = "Awake"; $("#sSleepD").textContent = dur(Date.now()-ls.end) + " · since " + fmtTime(ls.end); }
  else { $("#sSleep").textContent = "—"; $("#sSleepD").textContent = "None logged yet"; }
  $("#sleepNow").textContent = os ? "Woke up now" : "Fell asleep now";
  $("#feedStart").textContent = f && f.open ? "Finish feed now" : "Start feed now";
}

const endOf = e => e.open ? Date.now() : e.end;
function dayStats(list, w0, w1){
  const feeds = list.filter(e=>e.kind==="feed" && e.t >= w0 && e.t < w1);
  const feedMs = feeds.reduce((a,e)=>a + Math.max(0, Math.min(endOf(e), w1) - e.t), 0);
  const naps = list.filter(e=>e.kind==="nappy" && e.t >= w0 && e.t < w1);
  const wet = naps.filter(e=>e.type==="wee"||e.type==="both").length, dirty = naps.filter(e=>e.type==="poo"||e.type==="both").length;
  let slept = 0;
  list.filter(e=>e.kind==="sleep").forEach(e=>{ const a = Math.max(e.t, w0), b = Math.min(endOf(e), w1); if(b > a) slept += b - a; });
  return {feeds: feeds.length, feedMs, wet, dirty, slept};
}
function ribbonHtml(list, w0, w1){
  const span = w1 - w0, now = Date.now();
  const pct = t => (Math.min(Math.max(t, w0), w1) - w0) / span * 100;
  const seg = (c,a,b) => `<span class="seg" style="--c:${c};left:${a}%;width:${Math.max(.5,b-a)}%"></span>`;
  const sl = list.filter(e=>e.kind==="sleep" && endOf(e) > w0 && e.t < w1).map(e=>seg("var(--sleep)", pct(e.t), pct(endOf(e)))).join("");
  const fd = list.filter(e=>e.kind==="feed" && e.t >= w0 && e.t < w1).map(e=>seg(SIDECOL[e.side], pct(e.t), pct(e.open ? now : Math.max(e.end, e.t + 5*MIN)))).join("");
  const np = list.filter(e=>e.kind==="nappy" && e.t >= w0 && e.t < w1).map(e=>`<span class="pip" style="--c:${NAPPYCOL[e.type]};left:${pct(e.t)}%"></span>`).join("");
  const hl = list.filter(e=>(e.kind==="temp" || e.kind==="med") && e.t >= w0 && e.t < w1).map(e=>{
    if(e.kind==="temp"){ const bad = e.c >= 38 || e.c < 36;
      return `<span class="pip" title="${Number(e.c).toFixed(1)}°C at ${fmtTime(e.t)}" style="--c:${bad ? "var(--danger)" : "var(--temp)"};left:${pct(e.t)}%"></span>`; }
    return `<span class="pip dia" title="${esc(e.name)} ${esc(e.dose || "")} at ${fmtTime(e.t)}" style="--c:var(--med);left:${pct(e.t)}%"></span>`;
  }).join("");
  const d = new Date(w0); d.setMinutes(0,0,0); d.setHours(d.getHours()+1);
  while(d.getHours() % 6) d.setHours(d.getHours()+1);
  let ax = "";
  for(let t = d.getTime(); t < w1; t += 6*HOUR){ const p = pct(t); if(p > 4 && p < 96) ax += `<span style="left:${p}%">${new Date(t).toLocaleTimeString("en-AU",{hour:"numeric"}).replace(" ","")}</span>`; }
  return `<div class="lane"><span class="l">Sleep</span><div class="track">${sl}</div></div>
    <div class="lane"><span class="l">Feeds</span><div class="track">${fd}</div></div>
    <div class="lane"><span class="l">Nappies</span><div class="track">${np}</div></div>
    <div class="lane"><span class="l">Health</span><div class="track">${hl}</div></div>
    <div class="axis">${ax}</div>
    <div class="legend">
      <span><i style="--c:var(--left)"></i>Left</span><span><i style="--c:var(--right)"></i>Right</span>
      <span><i style="--c:var(--both)"></i>Both</span><span><i style="--c:var(--bottle)"></i>Bottle</span>
      <span><i style="--c:var(--wee)"></i>Wee</span><span><i style="--c:var(--poo)"></i>Poo</span><span><i style="--c:var(--dry)"></i>Dry</span>
      <span><i style="--c:var(--temp)"></i>Temp</span><span><i style="--c:var(--danger)"></i>Fever / low temp</span><span><i class="dia" style="--c:var(--med)"></i>Medication</span>
    </div>`;
}

/* ---------- baby's age and age-based guidance ---------- */
let FAM = Object.assign({name:"Baby", birth:""}, ctx.family || {});
const NM = () => (FAM.name || "Baby").trim() || "Baby";
function birthMs(){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(FAM.birth || "");
  if(!m) { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  return new Date(+m[1], +m[2]-1, +m[3]).getTime();
}
function paintName(){
  document.querySelectorAll(".bn").forEach(el=>{ el.textContent = NM(); });
  // "Harper's Baby Chart", using the name entered under Settings and family
  const named = (FAM.name || "").trim();
  const title = named ? named + (/s$/i.test(named) ? "' Baby Chart" : "'s Baby Chart") : "Baby Chart";
  const h = document.getElementById("chartTitle"); if(h) h.textContent = title;
  document.title = title;
}
function ageInfo(){
  const BIRTH = birthMs();
  const today = new Date(); today.setHours(0,0,0,0);
  const dol = Math.floor((today.getTime() - BIRTH) / DAY) + 1;          // day of life: birth day = day 1
  const days = dol - 1, weeks = Math.floor(days / 7);
  const b = new Date(BIRTH), n = new Date();
  let months = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth(); if(n.getDate() < b.getDate()) months--;
  let label;
  if(days < 1) label = "born today";
  else if(days < 14) label = days + (days === 1 ? " day old" : " days old");
  else if(months < 3) label = weeks + " weeks old";
  else if(months < 24) label = months + " months old";
  else label = Math.floor(months/12) + " years old";
  return {dol, days, weeks, months, label};
}
function guideFor(a){
  // Typical ranges for a healthy term baby. Ranges, not rules.
  if(a.dol <= 5){
    const poo = a.dol <= 2 ? "black and sticky (meconium)" : a.dol <= 4 ? "changing to green-brown" : "turning yellow and seedy";
    return { feeds:"8–12", wet:a.dol + "+", dirty:(a.dol <= 2 ? "1+" : a.dol <= 4 ? "2+" : "3+"), sleep:"14–17h",
      text:`<b>Day ${a.dol}:</b> 8–12 feeds, at least ${a.dol} wet and ${a.dol <= 2 ? "1" : a.dol <= 4 ? "2" : "3"} dirty nappies in 24 hours. Poo is usually ${poo} by now. Wake her for a feed if it's been 3 hours.` };
  }
  if(a.days < 42) return { feeds:"8–12", wet:"6+", dirty:"3+", sleep:"14–17h",
      text:`<b>${a.label}:</b> 8–12 feeds, 6+ heavy wet nappies and usually 3+ yellow poos a day if breastfed. Most of the 14–17 hours of sleep comes in short stretches.` };
  if(a.months < 3) return { feeds:"7–10", wet:"6+", dirty:"varies", sleep:"14–17h",
      text:`<b>${a.label}:</b> about 7–10 feeds and 6+ wet nappies a day. Breastfed babies can now go a few days between poos if they're soft and she's content.` };
  if(a.months < 6) return { feeds:"6–8", wet:"6+", dirty:"varies", sleep:"12–16h",
      text:`<b>${a.label}:</b> about 6–8 milk feeds and 12–16 hours of sleep a day, with longer stretches at night. Solids usually start around 6 months, when she shows signs of readiness.` };
  if(a.months < 12) return { feeds:"4–6 milk", wet:"5+", dirty:"varies", sleep:"12–16h",
      text:`<b>${a.label}:</b> about 4–6 milk feeds alongside solids, and 12–16 hours of sleep including naps. Poos change with new foods.` };
  return { feeds:"", wet:"", dirty:"", sleep:"11–14h",
      text:`<b>${a.label}:</b> 3 meals and 2 snacks a day, with milk as a drink, and about 11–14 hours of sleep including a nap.` };
}
function feverAdvice(a){
  if(a.months < 3) return "This is a fever. " + NM() + " is under 3 months, so see a doctor straight away or go to the emergency department.";
  if(a.months < 6) return "This is a fever. At her age, see a GP today, sooner if she's unusually drowsy, not feeding or has a rash.";
  return "This is a fever. Keep her drinking, watch how she's behaving, and see a GP if it lasts over 48 hours or she seems unwell.";
}
function renderAge(){
  const a = ageInfo(), g = guideFor(a);
  $("#today").textContent = new Date().toLocaleDateString("en-AU",{weekday:"long", day:"numeric", month:"long"}) + " · " + NM() + " is " + a.label;
  $("#ageTag").textContent = a.dol <= 5 ? "Day " + a.dol + " of life" : a.label;
  $("#guide").innerHTML = g.text;
  return g;
}

function renderDay(){
  const now = Date.now(), w0 = now - DAY, s = dayStats(entries, w0, now);
  $("#tFeeds").textContent = s.feeds;
  $("#tFeedsD").textContent = s.feeds ? "feeds · " + dur(s.feedMs) : "feeds";
  $("#tWet").textContent = s.wet; $("#tDirty").textContent = s.dirty;
  $("#tSleep").textContent = dur(s.slept).replace(/ 0m$/,"");
  const g = renderAge();
  $("#tFeedsD").textContent = (s.feeds ? "feeds · " + dur(s.feedMs) : "feeds") + (g.feeds ? " · aim " + g.feeds : "");
  $("#tWetD").textContent = "wet nappies" + (g.wet ? " · aim " + g.wet : "");
  $("#tDirtyD").textContent = "dirty nappies" + (g.dirty ? " · " + (g.dirty === "varies" ? "varies" : "aim " + g.dirty) : "");
  $("#tSleepD").textContent = "asleep · usual " + g.sleep;
  $("#rib24").innerHTML = ribbonHtml(entries, w0, now);
}

/* ---------- calendar ---------- */
const startOfDay = ms => { const d = new Date(ms); d.setHours(0,0,0,0); return d.getTime(); };
const addDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
let calMonth = (()=>{ const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime(); })();
let calSel = startOfDay(Date.now());
let monthEntries = [], monthUnsub = null;
const nextMonth = ms => { const d = new Date(ms); d.setMonth(d.getMonth()+1); return d.getTime(); };
const prevMonth = ms => { const d = new Date(ms); d.setMonth(d.getMonth()-1); return d.getTime(); };
const calSource = () => monthEntries;

function subscribeMonth(){
  if(monthUnsub){ monthUnsub(); monthUnsub = null; }
  const a = addDays(calMonth, -1), b = nextMonth(calMonth);
  monthEntries = [];
  monthUnsub = store.subscribeRange(a, b, list=>{
    monthEntries = list;
    renderCal();
  }, ()=>toast("Couldn't load that month. Close and reopen the app to try again."));
}

function renderCal(){
  const list = calSource(), today = startOfDay(Date.now());
  $("#calTitle").textContent = new Date(calMonth).toLocaleDateString("en-AU",{month:"long", year:"numeric"});
  $("#calNext").disabled = nextMonth(calMonth) > Date.now();
  const lead = (new Date(calMonth).getDay() + 6) % 7;
  let html = "";
  for(let i = 0; i < lead; i++) html += `<span class="cell blank"></span>`;
  for(let d = calMonth; d < nextMonth(calMonth); d = addDays(d, 1)){
    const n = new Date(d).getDate();
    if(d > today){ html += `<button class="cell" disabled><span class="dn">${n}</span></button>`; continue; }
    const s = dayStats(list, d, addDays(d, 1));
    const showF = filt.feed && s.feeds, showN = filt.nappy && (s.wet || s.dirty);
    const counts = (showF ? `<span class="cc"><i style="--c:var(--accent)"></i>${s.feeds}</span>` : "") + (showN ? `<span class="cc"><i style="--c:var(--wee)"></i>${s.wet}</span><span class="cc"><i style="--c:var(--poo)"></i>${s.dirty}</span>` : "") + (filt.sleep && !filt.feed && !filt.nappy && s.slept ? `<span class="cc"><i style="--c:var(--sleep)"></i>${dur(s.slept).replace(/ 0m$/,"")}</span>` : "");
    let hx = "";
    if(filt.health){
      const dayH = list.filter(e=>e.t >= d && e.t < addDays(d,1) && (e.kind==="temp" || e.kind==="med"));
      const temps = dayH.filter(e=>e.kind==="temp").map(e=>Number(e.c)), mx = temps.length ? Math.max(...temps) : null;
      const meds = dayH.filter(e=>e.kind==="med").length;
      if(mx !== null && (mx >= 38 || (!filt.feed && !filt.nappy))) hx += `<span class="cc"><i style="--c:${mx >= 38 ? "var(--danger)" : "var(--temp)"}"></i>${mx.toFixed(1)}°</span>`;
      if(meds && !filt.feed && !filt.nappy) hx += `<span class="cc"><i style="--c:var(--med)"></i>${meds} med</span>`;
    }
    html += `<button class="cell${d===today?" today":""}" data-day="${d}" aria-pressed="${d===calSel}" aria-label="${new Date(d).toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}: ${s.feeds} feeds, ${s.wet} wet, ${s.dirty} dirty"><span class="dn">${n}</span>${counts}${hx}</button>`;
  }
  $("#calGrid").innerHTML = html;
  renderDayView();
}

function renderDayView(){
  const list = calSource(), w0 = calSel, w1 = addDays(calSel, 1);
  const box = $("#dayView");
  if(calSel < calMonth || calSel >= nextMonth(calMonth)){ box.innerHTML = `<p class="listnote">Tap a day to see everything logged that day.</p>`; return; }
  const s = dayStats(list, w0, w1);
  const items = list.filter(e=>e.t >= w0 && e.t < w1 && shown(e)).sort((a,b)=>b.t-a.t);
  const title = new Date(w0).toLocaleDateString("en-AU",{weekday:"long", day:"numeric", month:"long"});
  box.innerHTML = `<h3>${title}</h3>
    <div class="tiles">
      <div class="tile"><div class="v">${s.feeds}</div><div class="d">feeds${s.feeds ? " · " + dur(s.feedMs) : ""}</div></div>
      <div class="tile"><div class="v">${s.wet}</div><div class="d">wet nappies</div></div>
      <div class="tile"><div class="v">${s.dirty}</div><div class="d">dirty nappies</div></div>
      <div class="tile"><div class="v">${dur(s.slept).replace(/ 0m$/,"")}</div><div class="d">asleep</div></div>
    </div>
    <div class="ribbon">${ribbonHtml(list, w0, w1)}</div>
    ${items.length ? `<div class="rows">${items.map(rowHtml).join("")}</div>` : `<div class="empty">${allOn() ? "Nothing logged on this day." : "Nothing on this day matches the filter."}</div>`}`;
}

$("#calGrid").addEventListener("click", e=>{ const c = e.target.closest("[data-day]"); if(!c) return; calSel = Number(c.dataset.day); renderCal(); });
$("#calPrev").addEventListener("click", ()=>{ calMonth = prevMonth(calMonth); subscribeMonth(); renderCal(); });
$("#calNext").addEventListener("click", ()=>{ if(nextMonth(calMonth) > Date.now()) return; calMonth = nextMonth(calMonth); subscribeMonth(); renderCal(); });

function showView(v){
  $("#view-cal").setAttribute("aria-selected", v==="cal"); $("#view-list").setAttribute("aria-selected", v==="list");
  $("#cal").hidden = v!=="cal"; $("#hist").hidden = v!=="list";
  try{ localStorage.setItem("harper-chart-view", v); }catch(e){}
}
$("#view-cal").addEventListener("click", ()=>showView("cal"));
$("#view-list").addEventListener("click", ()=>showView("list"));
try{ const v = localStorage.getItem("harper-chart-view"); if(v) showView(v); }catch(e){}

let armed = null;
const ALL = () => ({feed:true, sleep:true, nappy:true, health:true});
const NONE = () => ({feed:false, sleep:false, nappy:false, health:false});
let filt = ALL();
try{ const f = JSON.parse(localStorage.getItem("harper-chart-filter") || "null"); if(f && (f.feed||f.sleep||f.nappy||f.health)) filt = Object.assign(ALL(), f); }catch(e){}
const allOn = () => filt.feed && filt.sleep && filt.nappy && filt.health;
const groupOf = e => (e.kind==="temp" || e.kind==="med") ? "health" : e.kind;
const shown = e => !!filt[groupOf(e)];
function paintFilters(){
  document.querySelectorAll("#filters .chip").forEach(c=>c.setAttribute("aria-pressed", c.dataset.f==="all" ? allOn() : !!filt[c.dataset.f]));
}
function setFilter(k){
  if(k==="all") filt = ALL();
  else if(allOn()) filt = Object.assign(NONE(), {[k]:true});
  else { filt[k] = !filt[k]; if(!filt.feed && !filt.sleep && !filt.nappy && !filt.health) filt = ALL(); }
  try{ localStorage.setItem("harper-chart-filter", JSON.stringify(filt)); }catch(e){}
  paintFilters(); renderHist(); renderCal();
}
function rowText(e){
  if(e.kind==="feed"){
    const bits = [];
    if(e.side==="BO" && e.ml) bits.push(e.ml + " ml");
    if(e.last && e.last !== e.side) bits.push("ended on " + SIDE[e.last].toLowerCase());
    if(e.open) bits.push("in progress"); else if(e.end > e.t) bits.push(dur(e.end - e.t));
    return { c: SIDECOL[e.side], h: "Feed · " + SIDE[e.side], s: bits.join(" · ") };
  }
  if(e.kind==="sleep") return { c:"var(--sleep)", h: e.open ? "Asleep" : "Slept " + dur(e.end - e.t), s: e.open ? "still sleeping" : "until " + fmtTime(e.end) };
  if(e.kind==="temp"){ const hi = e.c >= 38, lo = e.c < 36;
    return { c: hi || lo ? "var(--danger)" : "var(--temp)", h: "Temperature · " + Number(e.c).toFixed(1) + "°C", s: [METHOD[e.method], hi ? "fever" : lo ? "low" : ""].filter(Boolean).join(" · ") }; }
  if(e.kind==="med") return { c: "var(--med)", h: "Medication · " + esc(e.name), s: esc(e.dose || "") };
  return { c: NAPPYCOL[e.type], h: "Nappy · " + NAPPY[e.type], s: "" };
}
function renderHist(){
  const box = $("#hist");
  const list = entries.filter(shown);
  if(entries.length && !list.length){ box.innerHTML = `<div class="empty">Nothing matches this filter yet.</div>`; return; }
  if(!entries.length){ box.innerHTML = `<div class="empty">Nothing logged yet. Tap a side and <b>Start feed now</b>, or log a nappy, and it will show up here.</div>`; return; }
  const groups = []; let cur = null;
  list.slice(0, 300).forEach(e=>{ const l = dayLabel(e.t); if(!cur || cur.l !== l){ cur = {l, items:[]}; groups.push(cur); } cur.items.push(e); });
  box.innerHTML = groups.map(g=>`<div class="daygroup"><h3>${g.l}</h3><div class="rows">${g.items.map(rowHtml).join("")}</div></div>`).join("")
    + (list.length > 300 ? `<p class="listnote" style="margin-top:12px">Showing the latest 300 entries. Use Calendar for anything older.</p>` : "");
}
function rowHtml(e){
  const r = rowText(e);
  return `<div class="row"><span class="t">${fmtTime(e.t)}</span><span class="bar" style="--c:${r.c}"></span><span class="w"><b>${r.h}</b>${r.s ? `<br><span>${r.s}</span>` : ""}${e.note ? `<span class="nt">${esc(e.note)}</span>` : ""}</span><span class="ra"><button class="edit" data-edit="${e.id}" aria-label="Edit entry">Edit</button><button class="del${armed===e.id?" arm":""}" data-del="${e.id}" aria-label="Delete entry">${armed===e.id?"Delete?":"✕"}</button></span></div>`;
}

function render(){
  paintName();
  renderLive(); renderStatus(); renderDay(); renderHist(); renderCal(); renderHealth();
  if(typeof checkWake === "function") checkWake();
}

/* ---------- toast ---------- */
let toastTimer = null, undoFn = null;
function toast(msg, undo){
  $("#toastMsg").textContent = msg; undoFn = undo || null; $("#toastUndo").hidden = !undo; $("#toast").hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>{ $("#toast").hidden = true; undoFn = null; }, 5000);
}
$("#toastUndo").addEventListener("click", ()=>{ if(undoFn) undoFn(); $("#toast").hidden = true; undoFn = null; });

/* ---------- tabs ---------- */
function showTab(name){
  ["feed","sleep","nappy"].forEach(n=>{ $("#tab-"+n).setAttribute("aria-selected", n===name); $("#pane-"+n).hidden = n!==name; });
  try{ localStorage.setItem("harper-chart-tab", name); }catch(e){}
}
["feed","sleep","nappy"].forEach(n=>$("#tab-"+n).addEventListener("click", ()=>showTab(n)));
try{ const t = localStorage.getItem("harper-chart-tab"); if(t) showTab(t); }catch(e){}

/* ---------- feed ---------- */
let side = null, sideTouched = false, lastSide = null;
function setLast(s){ lastSide = s; document.querySelectorAll("#lastPick .choice").forEach(b=>b.setAttribute("aria-pressed", b.dataset.last===s)); }
function setSide(s){ side = s; document.querySelectorAll("#sidePick .choice").forEach(b=>b.setAttribute("aria-pressed", b.dataset.side===s)); $("#mlField").hidden = s!=="BO"; $("#lastRow").hidden = !(s==="L" || s==="R" || s==="B"); setLast(s==="L" || s==="R" ? s : null); }
document.querySelectorAll("#sidePick .choice").forEach(b=>b.addEventListener("click", ()=>{ sideTouched = true; setSide(b.dataset.side); }));
document.querySelectorAll("#lastPick .choice").forEach(b=>b.addEventListener("click", ()=>{ sideTouched = true; setLast(lastSide===b.dataset.last ? null : b.dataset.last); }));
function feedExtras(){
  const o = {}; const ml = parseInt($("#feedMl").value, 10);
  if(side==="BO" && ml > 0) o.ml = ml;
  if(side==="L" || side==="R") o.last = lastSide || side;
  if(side==="B" && lastSide) o.last = lastSide;
  return o;
}
function resetFeedForm(){ $("#feedNote").value = ""; $("#feedAt").value = ""; $("#feedMins").value = ""; $("#feedMl").value = ""; setLast(null); sideTouched = false; }

async function finishFeed(ended){
  const f = openFeed(); if(!f) return;
  const patch = {open:false, end:Date.now()};
  if(f.side==="B"){
    const s = ended || lastSide;
    if(!s){ toast("Tap Ended Left or Ended Right at the top to finish."); return; }
    patch.last = s;
  }
  { const n = noteOf("#feedNote"); if(n) patch.note = f.note ? f.note + " · " + n : n; }
  if(f.side==="BO"){ const ml = parseInt(($("#liveMl") && $("#liveMl").value) || $("#feedMl").value, 10); if(ml > 0) patch.ml = ml; }
  await updateEntry(f.id, patch);
  toast("Feed saved · " + dur(Date.now()-f.t) + (patch.ml ? " · " + patch.ml + " ml" : "") + (patch.last ? " · ended " + SIDE[patch.last].toLowerCase() : ""));
  resetFeedForm(); syncDefaultSide();
}
$("#feedStart").addEventListener("click", async ()=>{
  if(openFeed()){ await finishFeed(); return; }
  if(!side){ toast("Choose Left, Right, Both or Bottle first."); return; }
  const extras = feedExtras(); if(side==="B") delete extras.last;
  await addEntry(withNote(Object.assign({kind:"feed", side, t:Date.now(), end:null, open:true}, extras), "#feedNote"));
  $("#feedMl").value = ""; $("#feedNote").value = "";
});
$("#feedSave").addEventListener("click", async ()=>{
  if(!side){ toast("Choose Left, Right, Both or Bottle first."); return; }
  if(side==="B" && !lastSide){ toast("Choose the last side used."); return; }
  const t = timeFrom("#feedAt"); const mins = parseInt($("#feedMins").value, 10) || 0;
  const extras = feedExtras();
  await addEntry(withNote(Object.assign({kind:"feed", side, t, end:t + mins*MIN, open:false}, extras), "#feedNote"));
  toast(SIDE[side] + " feed at " + fmtTime(t) + " saved" + (extras.ml ? " · " + extras.ml + " ml" : "") + (extras.last ? " · last side " + SIDE[extras.last].toLowerCase() : ""));
  resetFeedForm(); syncDefaultSide();
});

/* ---------- sleep ---------- */
async function wake(){ const s = openSleep(); if(!s) return; const patch = {open:false, end:Date.now()}; const n = noteOf("#sleepNote"); if(n) patch.note = s.note ? s.note + " · " + n : n; await updateEntry(s.id, patch); $("#sleepNote").value = ""; toast("Woke up · slept " + dur(Date.now()-s.t)); }
$("#sleepNow").addEventListener("click", async ()=>{
  if(openSleep()){ await wake(); return; }
  await addEntry(withNote({kind:"sleep", t:Date.now(), end:null, open:true}, "#sleepNote")); $("#sleepNote").value = "";
});
$("#sleepSave").addEventListener("click", async ()=>{
  const err = $("#sleepErr"); err.hidden = true;
  if(!$("#sleepFrom").value || !$("#sleepTo").value){ err.textContent = "Enter both the time " + NM() + " fell asleep and the time of waking."; err.hidden = false; return; }
  const from = timeFrom("#sleepFrom");
  const [h,m] = $("#sleepTo").value.split(":").map(Number); const d = new Date(from); d.setHours(h,m,0,0);
  let to = d.getTime(); if(to <= from) to += DAY;
  if(to > Date.now() + MIN){ err.textContent = "The wake time is in the future. Use Fell asleep now for a sleep that's still going."; err.hidden = false; return; }
  await addEntry(withNote({kind:"sleep", t:from, end:to, open:false}, "#sleepNote")); $("#sleepNote").value = "";
  toast("Sleep saved · " + dur(to-from)); $("#sleepFrom").value = ""; $("#sleepTo").value = "";
});

/* ---------- nappy ---------- */
document.querySelectorAll("[data-nappy]").forEach(b=>b.addEventListener("click", async ()=>{
  const type = b.dataset.nappy, t = timeFrom("#nappyAt");
  const id = await addEntry(withNote({kind:"nappy", type, t}, "#nappyNote"));
  $("#nappyAt").value = ""; $("#nappyNote").value = "";
  if(id) toast(NAPPY[type] + " logged at " + fmtTime(t), ()=>deleteEntry(id));
}));


/* ---------- health ---------- */
function showHTab(name){
  ["temp","med"].forEach(n=>{ $("#tab-"+n).setAttribute("aria-selected", n===name); $("#pane-"+n).hidden = n!==name; });
  try{ localStorage.setItem("harper-chart-htab", name); }catch(e){}
}
["temp","med"].forEach(n=>$("#tab-"+n).addEventListener("click", ()=>showHTab(n)));
try{ const t = localStorage.getItem("harper-chart-htab"); if(t) showHTab(t); }catch(e){}
let method = "armpit";
document.querySelectorAll("#tempMethod .choice").forEach(b=>b.addEventListener("click", ()=>{ method = b.dataset.m; document.querySelectorAll("#tempMethod .choice").forEach(x=>x.setAttribute("aria-pressed", x===b)); }));

$("#tempSave").addEventListener("click", async ()=>{
  const err = $("#tempErr"); err.hidden = true;
  const c = parseFloat(String($("#tempC").value).replace(",", "."));
  if(!(c >= 30 && c <= 43)){ err.textContent = "Enter a temperature in °C between 30 and 43, for example 36.8."; err.hidden = false; return; }
  const t = timeFrom("#tempAt"), v = Math.round(c*10)/10;
  await addEntry(withNote({kind:"temp", c:v, method, t}, "#tempNote"));
  $("#tempC").value = ""; $("#tempAt").value = ""; $("#tempNote").value = "";
  toast(v.toFixed(1) + "°C saved" + (v >= 38 ? " · this is a fever" : ""));
});
$("#medSave").addEventListener("click", async ()=>{
  const err = $("#medErr"); err.hidden = true;
  const name = $("#medName").value.trim().slice(0,80), dose = $("#medDose").value.trim().slice(0,40);
  if(!name){ err.textContent = "Enter the medicine's name."; err.hidden = false; return; }
  if(!dose){ err.textContent = "Enter the dose given, for example 1.2 ml."; err.hidden = false; return; }
  const t = timeFrom("#medAt");
  await addEntry(withNote({kind:"med", name, dose, t}, "#medNote"));
  $("#medName").value = ""; $("#medDose").value = ""; $("#medAt").value = ""; $("#medNote").value = "";
  toast(name + " " + dose + " saved at " + fmtTime(t));
});

function renderHealth(){
  const now = Date.now();
  const lt = entries.find(e=>e.kind==="temp");
  const meds = entries.filter(e=>e.kind==="med" && e.t >= now - DAY);
  let html = "";
  if(lt){
    const hi = lt.c >= 38, lo = lt.c < 36;
    html += `<div class="hline${hi||lo ? " alert" : ""}"><span class="k">Last temp</span><span class="val"><b>${Number(lt.c).toFixed(1)}°C</b> · ${METHOD[lt.method] || ""} · ${fmtTime(lt.t)} (${ago(lt.t)})${hi ? "<br>" + feverAdvice(ageInfo()) : lo ? "<br>This is low. Warm " + NM() + " up, recheck in 15 minutes and call 13 HEALTH if it stays low." : ""}</span></div>`;
  }
  if(meds.length){
    html += `<div class="hline"><span class="k">Meds, 24 h</span><span class="val">${meds.map(m=>`<b>${esc(m.name)}</b> ${esc(m.dose)} at ${fmtTime(m.t)} (${ago(m.t)})`).join("<br>")}</span></div>`;
  }
  $("#hStatus").innerHTML = html;
  const names = [...new Set(entries.filter(e=>e.kind==="med").map(e=>e.name))].slice(0,12);
  $("#medList").innerHTML = names.map(n=>`<option value="${esc(n)}"></option>`).join("");
}


/* ---------- edit an entry ---------- */
const pad2 = n => String(n).padStart(2,"0");
function toLocalInput(ms){ const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fromLocalInput(v){ if(!v) return NaN; const t = new Date(v).getTime(); return t; }
let editing = null;
const findEntry = id => entries.find(x=>x.id===id) || monthEntries.find(x=>x.id===id);
const opt = (v, label, cur) => `<option value="${v}"${v===cur?" selected":""}>${label}</option>`;
const fld = (label, html, wide) => `<label class="field"${wide?' style="flex-basis:100%"':""}><span class="label">${label}</span>${html}</label>`;

function openEdit(id){
  const e = findEntry(id); if(!e) return;
  editing = {id, kind:e.kind};
  const at = (lab) => fld(lab, `<input id="eAt" type="datetime-local" value="${toLocalInput(e.t)}">`, true);
  const note = fld("Note", `<input id="eNote" type="text" maxlength="200" autocomplete="off" value="${esc(e.note || "")}">`, true);
  let body = "", title = "Edit entry";
  if(e.kind==="feed"){
    title = "Edit feed";
    const mins = (!e.open && e.end > e.t) ? Math.round((e.end - e.t)/MIN) : "";
    body = `<div class="fields">
      ${fld("Side", `<select id="eSide">${opt("L","Left",e.side)}${opt("R","Right",e.side)}${opt("B","Both",e.side)}${opt("BO","Bottle",e.side)}</select>`)}
      ${fld("Last side used", `<select id="eLast"><option value="">—</option>${opt("L","Left",e.last)}${opt("R","Right",e.last)}</select>`)}
      ${at("Started")}
      ${e.open ? "" : fld("Minutes", `<input id="eMins" type="number" inputmode="numeric" min="0" max="240" value="${mins}">`)}
      ${fld("Amount (ml)", `<input id="eMl" type="number" inputmode="numeric" min="0" step="5" value="${e.ml || ""}">`)}
      </div>${note}${e.open ? `<p class="note">This feed is still running. Tap Finish on the timer to end it.</p>` : ""}`;
  } else if(e.kind==="sleep"){
    title = "Edit sleep";
    body = `<div class="fields">${at("Fell asleep")}
      ${e.open ? "" : fld("Woke up", `<input id="eEnd" type="datetime-local" value="${toLocalInput(e.end)}">`, true)}
      </div>${note}${e.open ? `<p class="note">${esc(NM())} is still asleep. Tap Woke up on the timer to end this sleep.</p>` : ""}`;
  } else if(e.kind==="nappy"){
    title = "Edit nappy";
    body = `<div class="fields">${fld("Nappy", `<select id="eType">${opt("wee","Wee",e.type)}${opt("poo","Poo",e.type)}${opt("both","Wee + poo",e.type)}${opt("dry","Dry (fresh change)",e.type)}</select>`, true)}${at("Changed at")}</div>${note}`;
  } else if(e.kind==="temp"){
    title = "Edit temperature";
    body = `<div class="fields">${fld("Temperature (°C)", `<input id="eC" type="number" inputmode="decimal" step="0.1" min="30" max="43" value="${Number(e.c).toFixed(1)}">`)}
      ${fld("Measured", `<select id="eMethod">${opt("armpit","Armpit",e.method)}${opt("ear","Ear",e.method)}${opt("forehead","Forehead",e.method)}</select>`)}
      ${at("Taken at")}</div>${note}`;
  } else if(e.kind==="med"){
    title = "Edit medication";
    body = `<div class="fields">${fld("Medicine", `<input id="eName" type="text" maxlength="80" value="${esc(e.name)}">`, true)}
      ${fld("Dose given", `<input id="eDose" type="text" maxlength="40" value="${esc(e.dose || "")}">`)}
      ${at("Given at")}</div>${note}`;
  }
  $("#editTitle").textContent = title; $("#editBody").innerHTML = body; $("#editErr").hidden = true;
  $("#editBg").hidden = false; $("#editSheet").hidden = false;
  const es = $("#eSide");
  if(es) es.addEventListener("change", ()=>{ const v = es.value; if(v==="L" || v==="R") $("#eLast").value = v; else if(v==="BO") $("#eLast").value = ""; });
  const first = $("#editBody").querySelector("input, select"); if(first) setTimeout(()=>first.focus(), 50);
}
function closeEdit(){ editing = null; $("#editBg").hidden = true; $("#editSheet").hidden = true; }
["#editClose","#editCancel","#editBg"].forEach(sel=>$(sel).addEventListener("click", closeEdit));
document.addEventListener("keydown", ev=>{ if(ev.key==="Escape" && editing) closeEdit(); });

function editError(msg){ const el = $("#editErr"); el.textContent = msg; el.hidden = false; }
$("#editSave").addEventListener("click", async ()=>{
  if(!editing) return;
  const e = findEntry(editing.id); if(!e){ closeEdit(); return; }
  const now = Date.now(), t = fromLocalInput($("#eAt").value);
  if(!isFinite(t)) return editError("Enter a date and time.");
  if(t > now + MIN) return editError("That time is in the future.");
  const patch = { t, note: $("#eNote").value.trim().slice(0,200) };
  if(e.kind==="feed"){
    const side = $("#eSide").value; patch.side = side;
    let last = $("#eLast").value || null;
    if(side==="L" || side==="R") last = last || side;
    if(side==="BO") last = null;
    patch.last = last;
    const ml = parseInt($("#eMl").value, 10); patch.ml = (side==="BO" && ml > 0) ? ml : null;
    if(!e.open){ const m = parseInt($("#eMins").value, 10); patch.end = t + (m > 0 ? m : 0) * MIN; }
  } else if(e.kind==="sleep"){
    if(!e.open){ const end = fromLocalInput($("#eEnd").value);
      if(!isFinite(end)) return editError("Enter when " + NM() + " woke up.");
      if(end <= t) return editError("The wake-up time must be after she fell asleep.");
      if(end > now + MIN) return editError("The wake-up time is in the future.");
      patch.end = end; }
  } else if(e.kind==="nappy"){
    patch.type = $("#eType").value;
  } else if(e.kind==="temp"){
    const c = parseFloat(String($("#eC").value).replace(",", "."));
    if(!(c >= 30 && c <= 43)) return editError("Enter a temperature between 30 and 43 °C.");
    patch.c = Math.round(c*10)/10; patch.method = $("#eMethod").value;
  } else if(e.kind==="med"){
    const name = $("#eName").value.trim().slice(0,80), dose = $("#eDose").value.trim().slice(0,40);
    if(!name) return editError("Enter the medicine's name.");
    if(!dose) return editError("Enter the dose given.");
    patch.name = name; patch.dose = dose;
  }
  $("#editSave").disabled = true;
  await updateEntry(editing.id, patch);
  $("#editSave").disabled = false;
  closeEdit(); toast("Changes saved"); syncDefaultSide();
});

/* ---------- 3-hour wake-to-feed alert ---------- */
const WAKE_AFTER = 3 * HOUR;
const lsGet = (k, d) => { try{ const v = localStorage.getItem(k); return v === null ? d : v; }catch(e){ return d; } };
const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
let remOn = lsGet("harper-rem-on", "1") === "1";
$("#remOn").checked = remOn;
function lastFeedStart(){ return entries.find(e=>e.kind==="feed") || null; }
function feedDue(){ if(!remOn) return null; const f = lastFeedStart(); if(!f || f.open) return null; return f.t + WAKE_AFTER; }
const feedEnd = f => (f.end && f.end > f.t) ? f.end : f.t;
let audioCtx = null;
function unlockAudio(){
  try{ if(!audioCtx){ const AC = window.AudioContext || window.webkitAudioContext; if(AC) audioCtx = new AC(); }
       if(audioCtx && audioCtx.state === "suspended") audioCtx.resume(); }catch(e){}
}
document.addEventListener("pointerdown", unlockAudio, {passive:true});
function chime(){
  if(!audioCtx || audioCtx.state !== "running") return;
  try{
    const t0 = audioCtx.currentTime;
    [659.25, 783.99, 1046.5].forEach((f, i)=>{
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i*0.28);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + i*0.28 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i*0.28 + 0.9);
      o.connect(g).connect(audioCtx.destination); o.start(t0 + i*0.28); o.stop(t0 + i*0.28 + 1);
    });
  }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate([300,150,300]); }catch(e){}
}
let lastChime = 0, chimes = 0, alertFor = null;
function syncNativeAlert(due, f, dismissed, snoozeUntil){
  if(!ctx.native || !ctx.native.syncAlert) return;
  let at = null;
  if(due && f && !dismissed){ at = Math.max(due, snoozeUntil || 0); }
  if(at && at <= Date.now() + 5000) at = null;   // already due: the on-screen alert handles it
  ctx.native.syncAlert(at, "Time to wake " + NM() + " for a feed",
    f ? "Last feed started at " + fmtTime(f.t) + ". Check the chart if someone else has fed " + NM() + " since." : "");
}
function checkWake(){
  const due = feedDue(), box = $("#wakeAlert"), f = lastFeedStart();
  $("#sDue").textContent = due ? (Date.now() < due ? "Feed due by " + fmtTime(due) : "Feed was due at " + fmtTime(due)) : "";
  const key = f ? f.id : null;
  const dismissed = key && lsGet("harper-rem-dismiss", "") === key;
  const snoozeUntil = Number(lsGet("harper-rem-snooze", "0"));
  syncNativeAlert(due, f, dismissed, snoozeUntil);
  if(!due || Date.now() < due || dismissed || Date.now() < snoozeUntil){ box.hidden = true; alertFor = null; return; }
  if(alertFor !== key){ alertFor = key; chimes = 0; lastChime = 0; }
  const s = openSleep();
  $("#waHead").textContent = s ? "Time to wake " + NM() + " for a feed" : "Time for " + NM() + "'s next feed";
  $("#waSub").textContent = (s ? "Asleep for " + dur(Date.now() - s.t) + ". " : "")
    + "Last feed started at " + fmtTime(f.t) + ", " + dur(Date.now() - f.t) + " ago.";
  box.hidden = false;
  if(chimes < 10 && Date.now() - lastChime > 60000){ chime(); lastChime = Date.now(); chimes++; }
}
$("#waFeed").addEventListener("click", ()=>{ showTab("feed"); $("#pane-feed").scrollIntoView({behavior:"smooth", block:"center"}); $("#wakeAlert").hidden = true; const f = lastFeedStart(); if(f) lsSet("harper-rem-dismiss", f.id); });
$("#waSnooze").addEventListener("click", ()=>{ lsSet("harper-rem-snooze", String(Date.now() + 15*MIN)); checkWake(); toast("Reminder snoozed for 15 minutes"); });
$("#waDismiss").addEventListener("click", ()=>{ const f = lastFeedStart(); if(f) lsSet("harper-rem-dismiss", f.id); checkWake(); });
$("#remOn").addEventListener("change", e=>{ remOn = e.target.checked; lsSet("harper-rem-on", remOn ? "1" : "0"); checkWake(); renderLive(); });

let wakeLock = null;
async function setKeepAwake(on){
  try{
    if(on){ if(!navigator.wakeLock) throw 0; wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", ()=>{ wakeLock = null; });
    } else if(wakeLock){ await wakeLock.release(); wakeLock = null; }
    lsSet("harper-keep-awake", on ? "1" : "0");
  }catch(e){
    $("#keepAwake").checked = false;
    toast("This phone won't let the chart keep the screen on. Set the screen timeout longer in your phone settings instead.");
  }
}
$("#keepAwake").addEventListener("change", e=>setKeepAwake(e.target.checked));
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState === "visible"){ checkWake(); if($("#keepAwake").checked && !wakeLock) setKeepAwake(true); } });

/* ---------- banners + delete ---------- */
$("#live").addEventListener("click", e=>{
  const a = e.target.closest("[data-act]"); if(!a) return;
  const act = a.dataset.act;
  if(act==="stopFeed") finishFeed(); else if(act==="stopFeedL") finishFeed("L"); else if(act==="stopFeedR") finishFeed("R"); else wake();
});
let armTimer = null;
$("#histSec").addEventListener("click", e=>{
  const ed = e.target.closest("[data-edit]"); if(ed){ openEdit(ed.dataset.edit); return; }
  const b = e.target.closest("[data-del]"); if(!b) return;
  const id = b.dataset.del;
  if(armed === id){ armed = null; deleteEntry(id); toast("Entry deleted"); return; }
  armed = id; renderHist(); renderDayView(); clearTimeout(armTimer); armTimer = setTimeout(()=>{ armed = null; renderHist(); renderDayView(); }, 3500);
});

function syncDefaultSide(){ if(!sideTouched){ setSide(nextSide() || null); } }

/* ---------- boot ---------- */
document.querySelectorAll("#filters .chip").forEach(c=>c.addEventListener("click", ()=>setFilter(c.dataset.f)));
paintFilters();
render(); syncDefaultSide();
setInterval(tickLive, 1000);
setInterval(checkWake, 15000);
setInterval(()=>{ renderStatus(); renderDay(); renderHealth(); }, 30000);

let unsubRecent = null;
function boot(){
  unsubRecent = store.subscribeRecent(1000, list=>{
    entries = list; sortEntries();
    render(); syncDefaultSide();
  }, ()=>toast("Lost connection to the chart. Close and reopen the app to reconnect."));
  subscribeMonth();
}
paintName();
boot();
if(lsGet("harper-keep-awake", "0") === "1"){ $("#keepAwake").checked = true; setKeepAwake(true); }

return {
  setFamily(f){ FAM = Object.assign({}, FAM, f || {}); paintName(); render(); },
  allEntries: () => entries.slice(),
  closeSheet(){ if(editing){ closeEdit(); return true; } return false; },
  stop(){ try{ unsubRecent && unsubRecent(); monthUnsub && monthUnsub(); }catch(e){} }
};

}
