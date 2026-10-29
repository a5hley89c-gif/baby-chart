// Test entry point: the real app shell and chart, with the pretend backend and no phone features.
import { runShell } from "../src/shell.js";
import { backend } from "./local-backend.js";
// syncFeedCheck records what would be scheduled, so tests can check the "still feeding?" notification.
window.__feedChecks = [];
const native = { isNative: false, syncAlert(){}, syncFeedCheck(at, title, body, slot){ window.__feedChecks.push({ at, title, body, slot }); },
  permission: async () => "unsupported", requestPermission: async () => "unsupported" };
runShell(backend, native);
