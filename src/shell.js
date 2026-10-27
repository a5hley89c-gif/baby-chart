// The app shell: sign-in, family set-up, settings, import/export.
// It talks to a "backend" (Firebase in main.js, a local fake in test/) so it can be tested without a server.
import { startChart } from "./app.js";
import { startMum } from "./mum.js";

const $ = s => document.querySelector(s);
const show = (id) => ["#gLoading","#gConfig","#gAuth","#gFamily"].forEach(s => { $(s).hidden = s !== id; });

function friendlyAuthError(e){
  const c = String((e && e.code) || "");
  if(c.includes("invalid-email")) return "That email address doesn't look right.";
  if(c.includes("missing-password")) return "Enter your password.";
  if(c.includes("weak-password")) return "Use a password with at least 6 characters.";
  if(c.includes("email-already-in-use")) return "There's already an account with that email. Choose Sign in instead.";
  if(c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "The email or password is wrong.";
  if(c.includes("too-many-requests")) return "Too many tries. Wait a few minutes and try again.";
  if(c.includes("network")) return "No internet connection. Connect and try again.";
  return (e && e.message) ? e.message : "Something went wrong. Try again.";
}
function errOut(sel, msg){ const el = $(sel); el.textContent = msg; el.hidden = !msg; }
function todayISO(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function validBirth(v){ return /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= todayISO() && v >= "2000-01-01"; }

export function runShell(backend, native){
  let chart = null, famUnsub = null, family = null, fid = null, user = null;

  // ---------- sign in / create account ----------
  let creating = false;
  function setAuthMode(isNew){
    creating = isNew;
    $("#aTabIn").setAttribute("aria-selected", !isNew);
    $("#aTabNew").setAttribute("aria-selected", isNew);
    $("#aGo").textContent = isNew ? "Create account" : "Sign in";
    $("#aPass").autocomplete = isNew ? "new-password" : "current-password";
    $("#aHint").hidden = !isNew; $("#aForgot").hidden = isNew;
    errOut("#aErr", "");
  }
  $("#aTabIn").addEventListener("click", () => setAuthMode(false));
  $("#aTabNew").addEventListener("click", () => setAuthMode(true));
  async function submitAuth(){
    const email = $("#aEmail").value.trim(), pass = $("#aPass").value;
    if(!email){ errOut("#aErr", "Enter your email address."); return; }
    if(!pass){ errOut("#aErr", "Enter a password."); return; }
    $("#aGo").disabled = true; errOut("#aErr", "");
    try{ creating ? await backend.signUp(email, pass) : await backend.signIn(email, pass); }
    catch(e){ errOut("#aErr", friendlyAuthError(e)); }
    finally{ $("#aGo").disabled = false; }
  }
  $("#aGo").addEventListener("click", submitAuth);
  $("#aPass").addEventListener("keydown", e => { if(e.key === "Enter") submitAuth(); });
  $("#aForgot").addEventListener("click", async () => {
    const email = $("#aEmail").value.trim();
    if(!email){ errOut("#aErr", "Enter your email address first, then tap Forgot your password."); return; }
    try{ await backend.resetPassword(email); errOut("#aErr", ""); alertNote("#aErr", "Check your email for a link to reset your password."); }
    catch(e){ errOut("#aErr", friendlyAuthError(e)); }
  });
  function alertNote(sel, msg){ const el = $(sel); el.textContent = msg; el.hidden = false; }

  // ---------- family set-up ----------
  function setFamMode(join){
    $("#fTabNew").setAttribute("aria-selected", !join);
    $("#fTabJoin").setAttribute("aria-selected", join);
    $("#fNewPane").hidden = join; $("#fJoinPane").hidden = !join;
    errOut("#fErr", "");
  }
  $("#fTabNew").addEventListener("click", () => setFamMode(false));
  $("#fTabJoin").addEventListener("click", () => setFamMode(true));
  $("#fBirth").max = todayISO();
  $("#fCreate").addEventListener("click", async () => {
    const name = $("#fName").value.trim(), birth = $("#fBirth").value;
    if(!name){ errOut("#fErr", "Enter your baby's name."); return; }
    if(!validBirth(birth)){ errOut("#fErr", "Enter your baby's date of birth."); return; }
    $("#fCreate").disabled = true; errOut("#fErr", "");
    try{ const id = await backend.createFamily({ name, birth }); await openFamily(id); }
    catch(e){ errOut("#fErr", "Couldn't create the chart. Check your internet connection and try again."); try{ console.error(e); }catch(_){} }
    finally{ $("#fCreate").disabled = false; }
  });
  $("#fJoin").addEventListener("click", async () => {
    const code = $("#fCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if(code.length !== 8){ errOut("#fErr", "The invite code has 8 letters and numbers, like KQ7M-3XPA."); return; }
    $("#fJoin").disabled = true; errOut("#fErr", "");
    try{
      const id = await backend.joinFamily(code);
      if(!id){ errOut("#fErr", "That code didn't match a chart. Check it with your partner and try again."); return; }
      await openFamily(id);
    }catch(e){ errOut("#fErr", "Couldn't join the chart. Check the code and your internet connection."); try{ console.error(e); }catch(_){} }
    finally{ $("#fJoin").disabled = false; }
  });
  $("#fSignOut").addEventListener("click", () => backend.signOut());

  // ---------- the chart and children ----------
  // A family has one or more children. The first child ("main") is the original name and
  // birth date on the family record, and keeps its log at families/{id}/entries.
  const childrenOf = f => (Array.isArray(f.children) && f.children.length)
    ? f.children : [{ id: "main", name: f.name || "", birth: f.birth || "" }];
  const ALERT_GAP = 3 * 3600000;
  const kidKey = id => id === "main" ? "" : id;     // the first child keeps its existing alert settings
  const lsGet = (k, d) => { try{ const v = localStorage.getItem(k); return v === null ? d : v; }catch(e){ return d; } };
  const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
  const escH = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmtBirth = b => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || ""); return m ? "born " + new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString("en-AU", { day:"numeric", month:"short", year:"numeric" }) : ""; };
  const newId = () => { const a = new Uint32Array(2); crypto.getRandomValues(a); return "c" + a[0].toString(36) + a[1].toString(36); };
  // The chart itself doesn't schedule phone alerts; this shell does, for every child.
  const chartNative = Object.assign({}, native, { syncAlert: null });
  let kids = [], curKid = null;
  const kidWatch = {};                               // child id -> { feed, unsub }

  function chooseKid(id, initial){
    const k = kids.find(x => x.id === id) || kids[0];
    curKid = k.id; lsSet("bc-child-" + fid, k.id);
    const fam = { name: k.name, birth: k.birth };
    if(initial || !chart){
      chart = startChart({ store: backend.makeStore(fid, k.id), native: chartNative, family: fam, childKey: kidKey(k.id) });
    } else {
      chart.switchChild({ store: backend.makeStore(fid, k.id), family: fam, key: kidKey(k.id) });
      window.scrollTo({ top: 0 });
    }
    paintKids(); paintSettings();
  }

  // Keep an eye on each child's latest feed, for their phone alerts and the "feed due" dots.
  function watchKids(){
    const ids = new Set(kids.map(k => k.id));
    Object.keys(kidWatch).forEach(id => { if(!ids.has(id)){ try{ kidWatch[id].unsub(); }catch(e){} delete kidWatch[id]; } });
    kids.forEach(k => {
      if(kidWatch[k.id]) return;
      const w = kidWatch[k.id] = { feed: null, unsub: null };
      w.unsub = backend.makeStore(fid, k.id).subscribeRecent(40, list => {
        w.feed = list.filter(e => e.kind === "feed").sort((a, b) => b.t - a.t)[0] || null;
        syncAlerts(); paintKids();
      }, () => {});
    });
  }
  function syncAlerts(){
    if(!native.syncAlert) return;
    const on = lsGet("harper-rem-on", "1") === "1";
    kids.forEach((k, i) => {
      const f = (kidWatch[k.id] || {}).feed;
      const name = (k.name || "Baby").trim() || "Baby";
      let at = null;
      if(on && f && !f.open){
        const sfx = kidKey(k.id) ? "-" + kidKey(k.id) : "";
        const dismissed = lsGet("harper-rem-dismiss" + sfx, "") === f.id;
        const snooze = Number(lsGet("harper-rem-snooze" + sfx, "0"));
        if(!dismissed) at = Math.max(f.t + ALERT_GAP, snooze || 0);
        if(at && at <= Date.now() + 5000) at = null;
      }
      const when = f ? new Date(f.t).toLocaleTimeString("en-AU", { hour:"numeric", minute:"2-digit" }).replace(" ", "") : "";
      native.syncAlert(at, "Time to wake " + name + " for a feed",
        f ? "Last feed started at " + when + ". Check the chart if someone else has fed " + name + " since." : "", i);
    });
    for(let i = kids.length; i < 8; i++) native.syncAlert(null, "", "", i);
  }
  setInterval(() => { paintKids(); syncAlerts(); }, 20000);

  function paintKids(){
    const bar = $("#kidBar");
    if(kids.length < 2){ bar.hidden = true; bar.innerHTML = ""; $("#kidList").innerHTML = ""; $("#kidRemove").hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = kids.map(k => {
      const f = (kidWatch[k.id] || {}).feed;
      const due = f && !f.open && Date.now() >= f.t + ALERT_GAP;
      return `<button class="kid" data-kid="${escH(k.id)}" aria-pressed="${k.id === curKid}">${due ? '<span class="due" title="Feed due"></span>' : ""}${escH(k.name || "Baby")}</button>`;
    }).join("");
    $("#kidList").innerHTML = kids.map(k =>
      `<button class="kidrow" data-kid="${escH(k.id)}" aria-current="${k.id === curKid}"><b>${escH(k.name || "Baby")}</b><span>${escH(fmtBirth(k.birth))}</span></button>`).join("");
    $("#kidRemove").hidden = false;
  }
  const pickKid = e => { const b = e.target.closest("[data-kid]"); if(b && b.dataset.kid !== curKid) chooseKid(b.dataset.kid); };
  $("#kidBar").addEventListener("click", pickKid);
  $("#kidList").addEventListener("click", pickKid);

  async function openFamily(id){
    fid = id;
    if(famUnsub) famUnsub();
    let first = true;
    famUnsub = backend.watchFamily(id, f => {
      if(!f) return;
      family = f;
      kids = childrenOf(f);
      watchKids();
      if(first){
        first = false;
        $("#gate").hidden = true; $("#chartWrap").hidden = false;
        const saved = lsGet("bc-child-" + id, "");
        chooseKid(kids.some(k => k.id === saved) ? saved : kids[0].id, true);
        $("#mode").textContent = native.isNative
          ? "Synced between your phones. Works offline and catches up when you reconnect."
          : "Synced between your phones. Add this page to your home screen to use it like an app.";
        $("#remNote").textContent = native.isNative
          ? "You'll also get a phone notification when a feed is due, even with the app closed. If your partner logs a feed on their phone, open the app so it can update the reminder."
          : "On iPhone, alerts show and chime while this app is open on screen.";
        refreshNotif();
        if(backend.makeCol && user){
          startMum({
            meds: backend.makeCol(id, "mumMeds", "createdAt", "asc", 50),
            doses: backend.makeCol(id, "mumDoses", "t", "desc", 300),
            uid: user.uid, native, toast: toastLite
          });
        }
      } else if(chart){
        const k = kids.find(x => x.id === curKid);
        if(!k) chooseKid(kids[0].id);                // this child was removed on another phone
        else chart.setFamily({ name: k.name, birth: k.birth });
      }
      paintKids(); paintSettings();
      syncAlerts();
    }, () => {});
  }

  function paintSettings(){
    if(!family) return;
    const k = kids.find(x => x.id === curKid) || kids[0] || {};
    if(document.activeElement !== $("#setName")) $("#setName").value = k.name || "";
    if(document.activeElement !== $("#setBirth")) $("#setBirth").value = k.birth || "";
    const c = family.code || "";
    $("#setCode").textContent = c ? c.slice(0,4) + "-" + c.slice(4) : "—";
    $("#setEmail").textContent = user ? (user.email || "") : "";
  }
  // Save the list of children. The first child's details also stay on the family record.
  function saveKids(list){
    const patch = { children: list.map(k => ({ id: k.id, name: k.name, birth: k.birth })) };
    const main = list.find(k => k.id === "main");
    if(main){ patch.name = main.name; patch.birth = main.birth; }
    return backend.updateFamily(fid, patch);
  }
  $("#setBirth").max = todayISO(); $("#newKidBirth").max = todayISO();
  $("#setSave").addEventListener("click", async () => {
    const name = $("#setName").value.trim(), birth = $("#setBirth").value;
    if(!name || !validBirth(birth)){ toastLite("Enter a name and a date of birth."); return; }
    const list = kids.map(k => k.id === curKid ? Object.assign({}, k, { name, birth }) : k);
    const legacy = !(Array.isArray(family.children) && family.children.length);
    try{
      if(legacy && list.length === 1 && list[0].id === "main") await backend.updateFamily(fid, { name, birth });
      else await saveKids(list);
      toastLite("Saved");
    }catch(e){ toastLite("Couldn't save. Check your internet connection."); }
  });
  $("#newKidAdd").addEventListener("click", () => {
    const name = $("#newKidName").value.trim(), birth = $("#newKidBirth").value;
    if(!name){ toastLite("Enter the child's name."); return; }
    if(!validBirth(birth)){ toastLite("Enter the child's date of birth."); return; }
    if(kids.length >= 8){ toastLite("A chart can hold up to 8 children."); return; }
    const k = { id: newId(), name, birth };
    const list = kids.concat([k]);
    saveKids(list).catch(() => toastLite("Couldn't save. Check your internet connection."));
    kids = list; watchKids();
    $("#newKidName").value = ""; $("#newKidBirth").value = ""; $("#addKidBox").open = false;
    chooseKid(k.id);
    toastLite(name + " added. Tap a name at the top to switch.");
  });
  let removeArmed = null, removeTimer = null;
  $("#kidRemove").addEventListener("click", () => {
    if(kids.length < 2) return;
    const k = kids.find(x => x.id === curKid); if(!k) return;
    if(removeArmed !== k.id){
      removeArmed = k.id;
      $("#kidRemove").textContent = "Tap again to remove " + (k.name || "this child");
      clearTimeout(removeTimer);
      removeTimer = setTimeout(() => { removeArmed = null; const c = kids.find(x => x.id === curKid); $("#kidRemove").innerHTML = 'Remove <span class="bn">' + escH((c && c.name) || "Baby") + "</span>"; }, 4000);
      return;
    }
    removeArmed = null; clearTimeout(removeTimer);
    const list = kids.filter(x => x.id !== k.id);
    saveKids(list).catch(() => toastLite("Couldn't save. Check your internet connection."));
    kids = list; watchKids();
    chooseKid(list[0].id);
    $("#kidRemove").innerHTML = 'Remove <span class="bn">' + escH(list[0].name || "Baby") + "</span>";
    toastLite((k.name || "Child") + " removed from the chart. Their log isn't deleted.");
  });
  $("#setCopy").addEventListener("click", async () => {
    const t = $("#setCode").textContent;
    try{ await navigator.clipboard.writeText(t); toastLite("Invite code copied"); }
    catch(e){ const r = document.createRange(); r.selectNodeContents($("#setCode")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toastLite("Code selected. Copy it from the menu."); }
  });
  $("#signOutBtn").addEventListener("click", () => backend.signOut());

  // delete account (two taps, plus their password)
  let delArmed = false, delTimer = null;
  $("#delGo").addEventListener("click", async () => {
    const pass = $("#delPass").value;
    errOut("#delErr", "");
    if(!pass){ errOut("#delErr", "Enter your password to confirm."); return; }
    if(!delArmed){
      delArmed = true; $("#delGo").textContent = "Tap again to delete permanently";
      clearTimeout(delTimer); delTimer = setTimeout(() => { delArmed = false; $("#delGo").textContent = "Delete my account"; }, 5000);
      return;
    }
    delArmed = false; clearTimeout(delTimer);
    $("#delGo").disabled = true; $("#delGo").textContent = "Deleting…";
    try{
      await backend.deleteAccount(pass, fid);
      try{ localStorage.clear(); }catch(e){}
      location.reload();
    }catch(e){
      const c = String((e && e.code) || "");
      errOut("#delErr", c.includes("wrong-password") || c.includes("invalid-credential") ? "That password is wrong."
        : c.includes("too-many-requests") ? "Too many tries. Wait a few minutes and try again."
        : "Couldn't delete the account. Check your internet connection and try again.");
      $("#delGo").disabled = false; $("#delGo").textContent = "Delete my account";
    }
  });

  // phone notifications (Android app only)
  async function refreshNotif(){
    if(!native.isNative){ $("#notifRow").hidden = true; return; }
    $("#notifRow").hidden = false;
    const p = await native.permission();
    $("#notifState").textContent = p === "granted" ? "On" : p === "denied" ? "Blocked in phone settings" : "Off";
    $("#notifBtn").hidden = p === "granted";
    if(p === "denied") $("#notifBtn").hidden = true;
    if(p !== "granted" && p !== "denied" && !refreshNotif.asked){ refreshNotif.asked = true; await native.requestPermission(); refreshNotif(); }
  }
  $("#notifBtn").addEventListener("click", async () => { await native.requestPermission(); refreshNotif(); });
  native.onResume && native.onResume(refreshNotif);
  native.onBackButton && native.onBackButton(() => chart ? chart.closeSheet() : false);

  // import / export
  $("#importFile").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if(!file) return;
    const note = $("#importNote");
    try{
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.entries) ? data.entries : null);
      if(!list) throw new Error("format");
      const clean = list.filter(x => x && typeof x.id === "string" && typeof x.t === "number" && typeof x.kind === "string");
      if(!clean.length) throw new Error("empty");
      note.hidden = false; note.textContent = `Importing ${clean.length} entries…`;
      const n = await backend.importEntries(fid, clean, curKid);
      note.textContent = `Imported ${n} entries. Importing the same file again won't create duplicates.`;
    }catch(err){
      note.hidden = false;
      note.textContent = "That file couldn't be imported. Choose the .json log file exported from the old chart.";
    }
  });
  $("#exportBtn").hidden = !!native.isNative;   // the Android WebView can't save downloads
  $("#exportBtn").addEventListener("click", () => {
    const list = chart ? chart.allEntries() : [];
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), baby: family && family.name, entries: list }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `baby-chart-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  function toastLite(msg){
    const t = $("#toast"); $("#toastMsg").textContent = msg; $("#toastUndo").hidden = true; t.hidden = false;
    clearTimeout(toastLite.tm); toastLite.tm = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // ---------- start ----------
  if(!backend.configured){ show("#gConfig"); return; }
  backend.onAuth(async u => {
    user = u;
    if(!u){
      if(chart){ location.reload(); return; }      // signed out: start clean
      $("#gate").hidden = false; $("#chartWrap").hidden = true;
      show("#gAuth"); return;
    }
    show("#gLoading");
    try{
      const id = await backend.getFamilyId(u.uid);
      if(id){ await openFamily(id); }
      else { show("#gFamily"); }
    }catch(e){
      show("#gFamily");
    }
  });
}
