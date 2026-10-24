// The app shell: sign-in, family set-up, settings, import/export.
// It talks to a "backend" (Firebase in main.js, a local fake in test/) so it can be tested without a server.
import { startChart } from "./app.js";

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

  // ---------- the chart ----------
  async function openFamily(id){
    fid = id;
    if(famUnsub) famUnsub();
    let first = true;
    famUnsub = backend.watchFamily(id, f => {
      if(!f) return;
      family = f;
      paintSettings();
      if(first){
        first = false;
        $("#gate").hidden = true; $("#chartWrap").hidden = false;
        chart = startChart({ store: backend.makeStore(id), native, family: { name: f.name, birth: f.birth } });
        $("#mode").textContent = native.isNative
          ? "Synced between your phones. Works offline and catches up when you reconnect."
          : "Synced between your phones. Add this page to your home screen to use it like an app.";
        $("#remNote").textContent = native.isNative
          ? "You'll also get a phone notification when a feed is due, even with the app closed. If your partner logs a feed on their phone, open the app so it can update the reminder."
          : "On iPhone, alerts show and chime while this app is open on screen.";
        refreshNotif();
      } else if(chart){
        chart.setFamily({ name: f.name, birth: f.birth });
      }
    }, () => {});
  }

  function paintSettings(){
    if(!family) return;
    if(document.activeElement !== $("#setName")) $("#setName").value = family.name || "";
    if(document.activeElement !== $("#setBirth")) $("#setBirth").value = family.birth || "";
    const c = family.code || "";
    $("#setCode").textContent = c ? c.slice(0,4) + "-" + c.slice(4) : "—";
    $("#setEmail").textContent = user ? (user.email || "") : "";
  }
  $("#setBirth").max = todayISO();
  $("#setSave").addEventListener("click", async () => {
    const name = $("#setName").value.trim(), birth = $("#setBirth").value;
    if(!name || !validBirth(birth)){ toastLite("Enter a name and a date of birth."); return; }
    try{ await backend.updateFamily(fid, { name, birth }); toastLite("Baby details saved"); }
    catch(e){ toastLite("Couldn't save. Check your internet connection."); }
  });
  $("#setCopy").addEventListener("click", async () => {
    const t = $("#setCode").textContent;
    try{ await navigator.clipboard.writeText(t); toastLite("Invite code copied"); }
    catch(e){ const r = document.createRange(); r.selectNodeContents($("#setCode")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toastLite("Code selected. Copy it from the menu."); }
  });
  $("#signOutBtn").addEventListener("click", () => backend.signOut());

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
      const n = await backend.importEntries(fid, clean);
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
