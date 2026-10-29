// "Still feeding?" check: when a running feed goes past the baby's usual length for that
// kind of feed, the chart asks whether the feed is still going (catches forgotten timers).
// Shared by the chart (on-screen prompt) and the shell (phone notification) so they agree.

const MIN = 60000;
const LONGEST = 120 * MIN;         // longer timed feeds are probably forgotten timers: left out of the average
const FIRST_ASK_NO_HISTORY = 45 * MIN;
const SHORTEST_ASK = 5 * MIN;
export const ASK_AGAIN = 10 * MIN;  // after "Still feeding"

const timedMs = e => (e.kind === "feed" && !e.open && e.end > e.t && e.end - e.t <= LONGEST) ? e.end - e.t : 0;

// Average of the last 10 timed feeds of the same kind (left, right, both or bottle); needs 3.
// Falls back to the last 10 timed feeds of any kind. Returns {ms, same} or null.
export function usualFeed(entries, side, skipId){
  const timed = entries.filter(e => e.id !== skipId && timedMs(e) > 0).sort((a, b) => b.t - a.t);
  const avg = list => { const xs = list.slice(0, 10).map(timedMs); return xs.length >= 3 ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const same = avg(timed.filter(e => e.side === side));
  if(same) return { ms: same, same: true };
  const any = avg(timed);
  return any ? { ms: any, same: false } : null;
}

// When to ask about the open feed f: {at, usual} (usual may be null when there's no history yet).
// A "Still feeding" answer is saved on the feed as checkAt, so every phone waits for the same time.
export function feedCheckAt(f, entries){
  if(!f || !f.open) return null;
  const usual = usualFeed(entries, f.side, f.id);
  const first = f.t + (usual ? Math.max(usual.ms, SHORTEST_ASK) : FIRST_ASK_NO_HISTORY);
  return { at: Math.max(first, Number(f.checkAt) || 0), usual };
}

// A random id for this phone, kept on the device, so only the phone that started a feed
// gets the "still feeding?" notification (not a sleeping partner's phone).
export function deviceId(){
  try{
    let id = localStorage.getItem("bc-device");
    if(!id){ const a = new Uint32Array(2); crypto.getRandomValues(a); id = "d" + a[0].toString(36) + a[1].toString(36); localStorage.setItem("bc-device", id); }
    return id;
  }catch(e){ return ""; }
}

export const feedCheckOn = () => { try{ return localStorage.getItem("bc-feedcheck-on") !== "0"; }catch(e){ return true; } };

const KIND = { L: "left feed", R: "right feed", B: "feed on both sides", BO: "bottle feed" };
// "Harper's usual left feed is about 18m" / "Harper's usual feed is about 20m"
export function usualText(usual, side, name){
  if(!usual) return "";
  const m = Math.max(1, Math.round(usual.ms / MIN));
  const who = /s$/i.test(name) ? name + "'" : name + "'s";
  return `${who} usual ${usual.same ? KIND[side] || "feed" : "feed"} is about ${m}m`;
}
