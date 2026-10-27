// A pretend backend that keeps everything in this browser, used to test the app without Firebase.
// Open test/index.html through a local web server (see README "Testing").
const KEY = "bc-test-db";
const load = () => { try{ return JSON.parse(localStorage.getItem(KEY)) || { users:{}, families:{}, codes:{}, entries:{} }; }catch(e){ return { users:{}, families:{}, codes:{}, entries:{} }; } };
let db = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const rid = () => Math.random().toString(36).slice(2, 12);
const listeners = new Set();
const notify = () => setTimeout(() => listeners.forEach(f => f()), 0);

let authCb = null, current = null;
export const backend = {
  configured: true,
  onAuth(cb){ authCb = cb; const u = sessionStorage.getItem("bc-test-user"); current = u ? { uid: u, email: u + "@example.com" } : null; setTimeout(() => cb(current), 0); },
  async signIn(email, pass){ if(pass.length < 6){ const e = new Error("bad"); e.code = "auth/invalid-credential"; throw e; } current = { uid: email.split("@")[0], email }; sessionStorage.setItem("bc-test-user", current.uid); authCb(current); },
  async signUp(email, pass){ if(pass.length < 6){ const e = new Error("weak"); e.code = "auth/weak-password"; throw e; } return this.signIn(email, pass); },
  async resetPassword(){},
  async signOut(){ sessionStorage.removeItem("bc-test-user"); current = null; authCb(null); },
  async getFamilyId(uid){ return (db.users[uid] || {}).familyId || null; },
  async createFamily({ name, birth }){
    const id = rid(), code = "ABCD2345";
    db.families[id] = { members:[current.uid], name, birth, code }; db.codes[code] = id; db.users[current.uid] = { familyId:id }; db.entries[id] = {}; save(); return id;
  },
  async joinFamily(code){ const id = db.codes[code]; if(!id) return null; db.families[id].members.push(current.uid); db.users[current.uid] = { familyId:id }; save(); return id; },
  watchFamily(id, cb){ const f = () => cb(db.families[id]); listeners.add(f); f(); return () => listeners.delete(f); },
  async updateFamily(id, patch){ Object.assign(db.families[id], patch); save(); notify(); },
  makeStore(fid, childId){
    const id = (!childId || childId === "main") ? fid : fid + "/" + childId;
    if(!db.entries[id]) db.entries[id] = {};
    const all = () => Object.entries(db.entries[id] || {}).map(([k, v]) => Object.assign({ id:k }, v)).sort((a, b) => b.t - a.t);
    const s = {
      onError(){},
      subscribeRecent(n, cb){ const f = () => cb(all().slice(0, n)); listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); },
      subscribeKind(kind, cb){ const f = () => cb(all().filter(e => e.kind === kind)); listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); },
      subscribeRange(a, b, cb){ const f = () => cb(all().filter(e => e.t >= a && e.t < b)); listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); },
      add(obj){ const k = rid(); db.entries[id][k] = JSON.parse(JSON.stringify(obj)); save(); notify(); return k; },
      update(k, patch){ Object.assign(db.entries[id][k], JSON.parse(JSON.stringify(patch))); save(); notify(); },
      remove(k){ delete db.entries[id][k]; save(); notify(); }
    };
    return s;
  },
  async deleteAccount(pass, fid){ if(pass.length < 6){ const e = new Error("bad"); e.code = "auth/invalid-credential"; throw e; } const f = db.families[fid]; if(f){ f.members = f.members.filter(m => m !== current.uid); if(!f.members.length){ delete db.families[fid]; Object.keys(db.entries).forEach(k => { if(k === fid || k.startsWith(fid + "/")) delete db.entries[k]; }); } } delete db.users[current.uid]; save(); sessionStorage.removeItem("bc-test-user"); },
  makeCol(fid, name, orderField = "t", dir = "desc"){
    const key = fid + "#" + name; if(!db.entries[key]) db.entries[key] = {};
    const all = () => Object.entries(db.entries[key]).map(([k, v]) => Object.assign({ id:k }, v)).sort((a, b) => dir === "desc" ? (b[orderField]||0) - (a[orderField]||0) : (a[orderField]||0) - (b[orderField]||0));
    return {
      subscribe(cb){ const f = () => cb(all()); listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); },
      add(obj){ const k = rid(); db.entries[key][k] = JSON.parse(JSON.stringify(Object.assign({}, obj, { by: current.uid }))); save(); notify(); return k; },
      update(k, patch){ Object.assign(db.entries[key][k], JSON.parse(JSON.stringify(patch))); save(); notify(); },
      remove(k){ delete db.entries[key][k]; save(); notify(); }
    };
  },
  async importEntries(fid, list, childId){ const id = (!childId || childId === "main") ? fid : fid + "/" + childId; if(!db.entries[id]) db.entries[id] = {}; for(const e of list){ const { id:k, ...rest } = e; db.entries[id][k] = rest; } save(); notify(); return list.length; }
};
