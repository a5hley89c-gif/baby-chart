// Phone features that only exist inside the Android app (Capacitor).
// In the web version (iPhone / browser) every function here quietly does nothing.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";

const isNative = Capacitor.isNativePlatform();
const ALERT_ID = 3001;
const CHANNEL = "feed-alerts";
let lastKey = undefined;
let channelReady = null;

function ensureChannel(){
  if(!isNative) return Promise.resolve();
  if(!channelReady){
    channelReady = LocalNotifications.createChannel({
      id: CHANNEL,
      name: "Feed alerts",
      description: "Reminders to wake the baby for a feed",
      importance: 5,       // high: makes a sound and pops up on screen
      visibility: 1,       // show on the lock screen
      vibration: true
    }).catch(()=>{});
  }
  return channelReady;
}

export const native = {
  isNative,

  // "granted" | "denied" | "prompt" | "prompt-with-rationale" | "unsupported"
  async permission(){
    if(!isNative) return "unsupported";
    try{ return (await LocalNotifications.checkPermissions()).display; }catch(e){ return "unsupported"; }
  },
  async requestPermission(){
    if(!isNative) return "unsupported";
    try{ await ensureChannel(); return (await LocalNotifications.requestPermissions()).display; }catch(e){ return "denied"; }
  },

  // Keep exactly one wake-to-feed notification scheduled, at `at` (ms), or none when at is null.
  async syncAlert(at, title, body){
    if(!isNative) return;
    const key = at ? at + "|" + title + "|" + body : null;
    if(key === lastKey) return;
    lastKey = key;
    try{
      await ensureChannel();
      await LocalNotifications.cancel({ notifications: [{ id: ALERT_ID }] });
      if(at && at > Date.now() + 5000){
        const perm = (await LocalNotifications.checkPermissions()).display;
        if(perm !== "granted") return;
        await LocalNotifications.schedule({ notifications: [{
          id: ALERT_ID, title, body,
          channelId: CHANNEL,
          schedule: { at: new Date(at), allowWhileIdle: true }
        }] });
      }
    }catch(e){ try{ console.warn("Notification scheduling failed", e); }catch(_){} }
  },

  // Android back button: let the page close a sheet first, otherwise send the app to the background.
  onBackButton(handler){
    if(!isNative) return;
    App.addListener("backButton", () => {
      if(handler && handler()) return;
      if(App.minimizeApp) App.minimizeApp(); else App.exitApp();
    });
  },

  onResume(handler){
    if(!isNative) return;
    App.addListener("resume", handler);
  }
};
