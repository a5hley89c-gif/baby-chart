// Entry point: connects the app shell to Firebase (sign-in + Firestore database).
import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, EmailAuthProvider, reauthenticateWithCredential, deleteUser
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, orderBy, limit, where,
  onSnapshot, arrayUnion, arrayRemove, writeBatch, getDocs
} from "firebase/firestore";
import { firebaseConfig } from "./config.js";
import { native } from "./native.js";
import { runShell } from "./shell.js";

const configured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no 0/O, 1/I/L
const newCode = () => {
  const a = new Uint32Array(8); crypto.getRandomValues(a);
  return Array.from(a, n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join("");
};
// Firestore rejects undefined values
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

let backend = { configured: false };

if(configured){
  const app = initializeApp(firebaseConfig);
  // No popup/redirect sign-in, so this works inside the Android app's web view too.
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  let db;
  try{
    // Keep a copy of the log on the phone: the app works offline and syncs when it reconnects.
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  }catch(e){
    db = initializeFirestore(app, {});
  }
  let uid = null;
  const fidKey = u => "bc-family-" + u;
  const lsGet = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const lsSet = (k, v) => { try{ v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} };

  backend = {
    configured: true,
    onAuth(cb){ onAuthStateChanged(auth, u => { uid = u ? u.uid : null; cb(u); }); },
    signIn: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
    signUp: (email, pass) => createUserWithEmailAndPassword(auth, email, pass),
    resetPassword: email => sendPasswordResetEmail(auth, email),
    signOut: () => signOut(auth),

    async getFamilyId(u){
      const cached = lsGet(fidKey(u));
      if(cached) return cached;                       // instant start, also offline
      const snap = await getDoc(doc(db, "users", u));
      const id = snap.exists() ? snap.data().familyId || null : null;
      if(id) lsSet(fidKey(u), id);
      return id;
    },

    async createFamily({ name, birth }){
      const ref = doc(collection(db, "families"));
      const code = newCode();
      await setDoc(ref, { members: [uid], name, birth, code, createdAt: Date.now() });
      await setDoc(doc(db, "joinCodes", code), { familyId: ref.id });
      await setDoc(doc(db, "users", uid), { familyId: ref.id });
      lsSet(fidKey(uid), ref.id);
      return ref.id;
    },

    async joinFamily(code){
      const snap = await getDoc(doc(db, "joinCodes", code));
      if(!snap.exists()) return null;
      const id = snap.data().familyId;
      await updateDoc(doc(db, "families", id), { members: arrayUnion(uid) });
      await setDoc(doc(db, "users", uid), { familyId: id });
      lsSet(fidKey(uid), id);
      return id;
    },

    watchFamily(id, cb, err){
      return onSnapshot(doc(db, "families", id), s => {
        if(!s.exists()){
          // not a member any more (or the family was removed): forget it and start over
          if(!s.metadata.fromCache){ lsSet(fidKey(uid), null); setDoc(doc(db, "users", uid), { familyId: null }).catch(()=>{}); location.reload(); }
          return;
        }
        cb(s.data());
      }, e => {
        if(String(e && e.code).includes("permission-denied")){ lsSet(fidKey(uid), null); location.reload(); }
        err && err(e);
      });
    },

    updateFamily: (id, patch) => updateDoc(doc(db, "families", id), clean(patch)),

    // Each child's log: the first child ("main") at families/{id}/entries, others at
    // families/{id}/children/{childId}/entries
    makeStore(id, childId){
      const col = (!childId || childId === "main")
        ? collection(db, "families", id, "entries")
        : collection(db, "families", id, "children", childId, "entries");
      const list = snap => snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      const store = {
        onError: e => { try{ console.error(e); }catch(_){} },
        subscribeRecent: (n, cb, err) =>
          onSnapshot(query(col, orderBy("t", "desc"), limit(n)), s => cb(list(s)), err),
        // all entries of one kind (e.g. every weight), whatever their age; sorted by the caller
        subscribeKind: (kind, cb, err) =>
          onSnapshot(query(col, where("kind", "==", kind), limit(500)), s => cb(list(s)), err),
        subscribeRange: (a, b, cb, err) =>
          onSnapshot(query(col, where("t", ">=", a), where("t", "<", b), orderBy("t", "desc"), limit(1000)), s => cb(list(s)), err),
        add(obj){
          const ref = doc(col);
          setDoc(ref, clean(Object.assign({}, obj, { by: uid, at: Date.now() }))).catch(e => store.onError(e));
          return ref.id;
        },
        update(entryId, patch){
          updateDoc(doc(col, entryId), clean(Object.assign({}, patch, { by: uid, at: Date.now() }))).catch(e => store.onError(e));
        },
        remove(entryId){
          deleteDoc(doc(col, entryId)).catch(e => store.onError(e));
        }
      };
      return store;
    },

    // Any other family-level list (e.g. Mum's medications and doses): live list + add/update/remove
    makeCol(id, name, orderField = "t", dir = "desc", n = 300){
      const col = collection(db, "families", id, name);
      return {
        subscribe: (cb, err) => onSnapshot(query(col, orderBy(orderField, dir), limit(n)),
          s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), err),
        add(obj){ const ref = doc(col); setDoc(ref, clean(Object.assign({}, obj, { by: uid, at: Date.now() }))).catch(e => console.error(e)); return ref.id; },
        update(docId, patch){ updateDoc(doc(col, docId), clean(Object.assign({}, patch, { at: Date.now() }))).catch(e => console.error(e)); },
        remove(docId){ deleteDoc(doc(col, docId)).catch(e => console.error(e)); }
      };
    },

    // Permanently delete the signed-in account. If they're the only person in the family,
    // every child's log, the invite code and the family are deleted too; otherwise they just leave it.
    async deleteAccount(password, familyId){
      const u = auth.currentUser;
      if(!u) throw new Error("not signed in");
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
      if(familyId){
        const famRef = doc(db, "families", familyId);
        const snap = await getDoc(famRef);
        if(snap.exists()){
          const f = snap.data();
          const others = (f.members || []).filter(m => m !== u.uid);
          if(others.length === 0){
            const kids = (Array.isArray(f.children) && f.children.length) ? f.children.map(k => k.id) : [];
            if(!kids.includes("main")) kids.push("main");
            for(const cid of kids){
              const col = cid === "main" ? collection(db, "families", familyId, "entries")
                                         : collection(db, "families", familyId, "children", cid, "entries");
              for(;;){
                const page = await getDocs(query(col, limit(400)));
                if(page.empty) break;
                const batch = writeBatch(db);
                page.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
              }
            }
            for(const extra of ["mumMeds", "mumDoses"]){
              for(;;){
                const page = await getDocs(query(collection(db, "families", familyId, extra), limit(400)));
                if(page.empty) break;
                const batch = writeBatch(db);
                page.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
              }
            }
            if(f.code) await deleteDoc(doc(db, "joinCodes", f.code)).catch(() => {});
            await deleteDoc(famRef);
          } else {
            await updateDoc(famRef, { members: arrayRemove(u.uid) });
          }
        }
      }
      await deleteDoc(doc(db, "users", u.uid)).catch(() => {});
      lsSet(fidKey(u.uid), null);
      await deleteUser(u);
    },

    // Import entries exported from the old chart. Uses the old ids, so importing twice doesn't duplicate.
    async importEntries(id, entries, childId){
      const col = (!childId || childId === "main")
        ? collection(db, "families", id, "entries")
        : collection(db, "families", id, "children", childId, "entries");
      let n = 0;
      for(let i = 0; i < entries.length; i += 400){
        const batch = writeBatch(db);
        for(const e of entries.slice(i, i + 400)){
          const { id: entryId, ...rest } = e;
          batch.set(doc(col, String(entryId).replace(/\//g, "_")), clean(Object.assign({}, rest, { by: uid, at: Date.now() })), { merge: true });
          n++;
        }
        await batch.commit();
      }
      return n;
    }
  };
}

// Offline support for the web version (not needed inside the Android app)
if(!native.isNative && "serviceWorker" in navigator && location.protocol === "https:"){
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}

runShell(backend, native);
