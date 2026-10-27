// Mum's medications: a family-level list of medicines with dose logging and reminders.
// Medicines and doses are shared with the family. Reminders only go to the phones of the
// people who switch "Remind me on this phone" on for that medicine.
const $ = s => document.querySelector(s);
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = ms => new Date(ms).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(" ", "");
const dur = ms => { const m = Math.max(0, Math.round(ms / MIN)); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
const ago = ms => Date.now() - ms < MIN ? "just now" : dur(Date.now() - ms) + " ago";
const dayLabel = ms => { const d = new Date(ms); d.setHours(0,0,0,0); const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((t - d) / DAY); return diff === 0 ? "today" : diff === 1 ? "yesterday" : d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }); };
const timeLabel = hhmm => { const [h, m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return fmt(d.getTime()); };
const atToday = (hhmm, dayOffset = 0) => { const [h, m] = hhmm.split(":").map(Number); const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d.getTime(); };
function timeFromInput(v){ if(!v) return Date.now(); const [h, m] = v.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); let t = d.getTime(); if(t > Date.now() + MIN) t -= DAY; return t; }

// A dose "counts" for a set time if it was taken from 2 hours before to 3 hours after it.
const EARLY = 2 * HOUR, LATE = 3 * HOUR;

export function startMum({ meds: medStore, doses: doseStore, uid, native, toast }){
  let meds = [], doses = [], editing = null, armed = null, armTimer = null;

  // ---------- schedule maths ----------
  const dosesOf = id => doses.filter(d => d.medId === id);
  const lastDose = id => dosesOf(id)[0] || null;                // doses are newest first
  const takenAround = (id, T) => dosesOf(id).some(d => d.t >= T - EARLY && d.t <= T + LATE);
  function status(m){
    const now = Date.now(), last = lastDose(m.id);
    if(m.every){
      const hours = Number(m.every) || 0;
      if(!last) return { due: false, next: null, text: "No doses logged yet" };
      const next = last.t + hours * HOUR;
      return { due: now >= next, next, text: now >= next ? "Next dose is due (every " + hours + " hours)" : "Next dose from " + fmt(next) + (dayLabel(next) === "today" ? "" : " " + dayLabel(next)) };
    }
    const times = (m.times || []).slice().sort();
    if(!times.length) return { due: false, next: null, text: "" };
    // a set time within the last 3 hours that hasn't been taken = due
    for(const hhmm of times){
      for(const off of [0, -1]){
        const T = atToday(hhmm, off);
        if(T <= now && now - T <= LATE && !takenAround(m.id, T)) return { due: true, next: T, text: "Due since " + fmt(T) };
      }
    }
    for(const off of [0, 1]){
      for(const hhmm of times){
        const T = atToday(hhmm, off);
        if(T > now && !takenAround(m.id, T)) return { due: false, next: T, text: "Next at " + fmt(T) + (off ? " tomorrow" : "") };
      }
    }
    return { due: false, next: null, text: "" };
  }
  const scheduleText = m => m.every ? `Every ${m.every} hours` :
    (m.times && m.times.length ? "Daily at " + m.times.slice().sort().map(timeLabel).join(", ") : "No reminder times");

  // ---------- reminders (only on phones that opted in) ----------
  function syncReminders(){
    if(!native.syncMedReminders) return;
    const list = [], now = Date.now();
    meds.forEach((m, i) => {
      if(!(m.remind || []).includes(uid)) return;
      const title = "Time for " + m.name + (m.dose ? " (" + m.dose + ")" : "");
      if(m.every){
        const last = lastDose(m.id);
        if(last){ const at = last.t + Number(m.every) * HOUR; if(at > now + 5000) list.push({ id: 5000 + i * 20, at, title, body: "Last taken at " + fmt(last.t) + ". Tap to open Baby Chart and log it." }); }
        return;
      }
      let slot = 0;
      for(let off = 0; off < 3 && slot < 15; off++){
        for(const hhmm of (m.times || []).slice().sort()){
          const T = atToday(hhmm, off);
          if(T > now + 5000 && !takenAround(m.id, T)) list.push({ id: 5000 + i * 20 + (++slot), at: T, title, body: "Scheduled for " + fmt(T) + ". Tap to open Baby Chart and log it." });
        }
      }
    });
    native.syncMedReminders(list.slice(0, 50));
  }

  // ---------- rendering ----------
  function render(){
    const list = $("#mumList");
    // don't redraw the cards while someone is typing a time into one
    const busy = document.activeElement && list.contains(document.activeElement) && document.activeElement.matches("input");
    if(busy) return;
    if(!meds.length){
      list.innerHTML = `<p class="note">Add Mum's medicines (pain relief, iron, vitamins and so on) to log each dose and get reminders at the times she chooses.</p>`;
    } else {
      list.innerHTML = meds.map(m => {
        const st = status(m), last = lastDose(m.id);
        const mine = (m.remind || []).includes(uid);
        const label = armed === m.id ? "Tap again to log anyway" : "Taken now";
        return `<div class="medcard${st.due ? " due" : ""}" data-med="${esc(m.id)}">
          <div class="medtop">
            <div class="medname"><b>${esc(m.name)}</b>${m.dose ? ` <span>${esc(m.dose)}</span>` : ""}</div>
            <button class="edit" data-medact="edit" aria-label="Edit ${esc(m.name)}">Edit</button>
          </div>
          <div class="medmeta">${esc(scheduleText(m))}${mine ? " · Reminders on this phone" : ""}</div>
          <div class="medstat">${st.due ? `<b>${esc(st.text)}</b>` : esc(st.text)}${last ? `<span>Last taken ${fmt(last.t)} ${dayLabel(last.t) === "today" ? "" : dayLabel(last.t) + " "}(${ago(last.t)})</span>` : ""}</div>
          ${armed === m.id ? `<p class="err">Only ${dur(Date.now() - last.t)} since the last dose (every ${esc(m.every)} hours).</p>` : ""}
          <div class="medacts">
            <button class="btn${st.due ? "" : " ghost"}" data-medact="take">${label}</button>
            <label class="field mini"><span class="label">Earlier, at</span><input type="time" data-medtime></label>
            <button class="btn ghost sm" data-medact="takeat">Log</button>
          </div>
        </div>`;
      }).join("");
    }
    const recent = doses.slice(0, 12);
    $("#mumDoses").innerHTML = recent.length ? `<h3 class="setsub">Recent doses</h3><div class="rows">` + recent.map(d =>
      `<div class="row"><span class="t">${fmt(d.t)}</span><span class="bar" style="--c:var(--med)"></span><span class="w"><b>${esc(d.name)}</b>${d.dose ? `<br><span>${esc(d.dose)} · ${dayLabel(d.t)}</span>` : `<br><span>${dayLabel(d.t)}</span>`}</span><span class="ra"><button class="del" data-dosedel="${esc(d.id)}" aria-label="Delete dose">✕</button></span></div>`
    ).join("") + `</div>` : "";
    const dueCount = meds.filter(m => status(m).due).length;
    $("#mumDue").hidden = !dueCount;
    $("#mumDue").textContent = dueCount === 1 ? "1 due" : dueCount + " due";
  }

  // ---------- actions ----------
  function logDose(m, t){
    doseStore.add({ medId: m.id, name: m.name, dose: m.dose || "", t });
    toast(m.name + " logged at " + fmt(t));
  }
  $("#mumList").addEventListener("click", e => {
    const card = e.target.closest("[data-med]"); if(!card) return;
    const m = meds.find(x => x.id === card.dataset.med); if(!m) return;
    const act = (e.target.closest("[data-medact]") || {}).dataset?.medact;
    if(act === "edit"){ openForm(m); return; }
    if(act === "take"){
      const last = lastDose(m.id);
      // safety check for "every N hours" medicines like paracetamol
      if(m.every && last && Date.now() - last.t < Number(m.every) * HOUR * 0.9 && armed !== m.id){
        armed = m.id; clearTimeout(armTimer); armTimer = setTimeout(() => { armed = null; render(); }, 6000); render(); return;
      }
      armed = null; logDose(m, Date.now()); return;
    }
    if(act === "takeat"){
      const v = card.querySelector("[data-medtime]").value;
      if(!v){ toast("Choose the time it was taken, then tap Log."); return; }
      logDose(m, timeFromInput(v));
    }
  });
  let delArmed = null;
  $("#mumDoses").addEventListener("click", e => {
    const b = e.target.closest("[data-dosedel]"); if(!b) return;
    if(delArmed !== b.dataset.dosedel){ delArmed = b.dataset.dosedel; b.textContent = "Delete?"; b.classList.add("arm"); setTimeout(() => { delArmed = null; render(); }, 3500); return; }
    doseStore.remove(b.dataset.dosedel); delArmed = null; toast("Dose deleted");
  });

  // add / edit form
  function setMode(every){
    $("#mfModeTimes").setAttribute("aria-pressed", !every); $("#mfModeEvery").setAttribute("aria-pressed", every);
    $("#mfTimesBox").hidden = every; $("#mfEveryBox").hidden = !every;
  }
  function timeRow(v){ return `<div class="mftime"><input type="time" value="${esc(v || "")}" aria-label="Reminder time"><button class="del" data-rmtime aria-label="Remove time">✕</button></div>`; }
  function openForm(m){
    editing = m ? m.id : null;
    $("#mfTitle").textContent = m ? "Edit " + m.name : "Add a medication";
    $("#mfName").value = m ? m.name : ""; $("#mfDose").value = m ? (m.dose || "") : "";
    setMode(!!(m && m.every));
    $("#mfHours").value = m && m.every ? m.every : "";
    $("#mfTimes").innerHTML = ((m && m.times && m.times.length) ? m.times : ["08:00"]).map(timeRow).join("");
    $("#mfRemind").checked = m ? (m.remind || []).includes(uid) : true;
    $("#mfDelete").hidden = !m; $("#mfErr").hidden = true;
    $("#mumForm").hidden = false; $("#mumAddBtn").hidden = true;
    $("#mfName").focus();
  }
  function closeForm(){ editing = null; $("#mumForm").hidden = true; $("#mumAddBtn").hidden = false; }
  $("#mumAddBtn").addEventListener("click", () => openForm(null));
  $("#mfCancel").addEventListener("click", closeForm);
  $("#mfModeTimes").addEventListener("click", () => setMode(false));
  $("#mfModeEvery").addEventListener("click", () => setMode(true));
  $("#mfAddTime").addEventListener("click", () => { $("#mfTimes").insertAdjacentHTML("beforeend", timeRow("")); });
  $("#mfTimes").addEventListener("click", e => { const b = e.target.closest("[data-rmtime]"); if(b) b.parentElement.remove(); });
  $("#mfSave").addEventListener("click", () => {
    const err = msg => { $("#mfErr").textContent = msg; $("#mfErr").hidden = false; };
    const name = $("#mfName").value.trim().slice(0, 60), dose = $("#mfDose").value.trim().slice(0, 40);
    if(!name) return err("Enter the medicine's name.");
    const every = $("#mfEveryBox").hidden ? null : Number($("#mfHours").value);
    let times = [];
    if(every === null){
      times = [...$("#mfTimes").querySelectorAll("input")].map(i => i.value).filter(Boolean);
      times = [...new Set(times)].sort();
      if(!times.length) return err("Add at least one time, or choose \"Every few hours\".");
    } else if(!(every >= 1 && every <= 48)) return err("Enter how many hours apart the doses are, between 1 and 48.");
    const existing = editing ? meds.find(x => x.id === editing) : null;
    let remind = existing ? (existing.remind || []).filter(u => u !== uid) : [];
    if($("#mfRemind").checked) remind.push(uid);
    const data = { name, dose, times: every === null ? times : [], every: every === null ? null : every, remind };
    if(existing) medStore.update(existing.id, data);
    else medStore.add(Object.assign({ createdAt: Date.now() }, data));
    toast(existing ? "Saved" : name + " added");
    closeForm();
    if($("#mfRemind").checked && native.isNative && native.requestPermission) native.requestPermission();
  });
  let medDelArmed = false;
  $("#mfDelete").addEventListener("click", () => {
    if(!editing) return;
    if(!medDelArmed){ medDelArmed = true; $("#mfDelete").textContent = "Tap again to delete"; setTimeout(() => { medDelArmed = false; $("#mfDelete").textContent = "Delete medication"; }, 4000); return; }
    medDelArmed = false; $("#mfDelete").textContent = "Delete medication";
    medStore.remove(editing); toast("Medication deleted. Its past doses stay in the list."); closeForm();
  });

  // ---------- live data ----------
  const u1 = medStore.subscribe(list => { meds = list; render(); syncReminders(); }, () => {});
  const u2 = doseStore.subscribe(list => { doses = list; render(); syncReminders(); }, () => {});
  const tick = setInterval(() => { render(); syncReminders(); }, 30000);
  $("#mumSec").hidden = false;
  return { stop(){ try{ u1(); u2(); }catch(e){} clearInterval(tick); native.syncMedReminders && native.syncMedReminders([]); } };
}
