// Test entry point: the real app shell and chart, with the pretend backend and no phone features.
import { runShell } from "../src/shell.js";
import { backend } from "./local-backend.js";
const native = { isNative: false, syncAlert(){}, permission: async () => "unsupported", requestPermission: async () => "unsupported" };
runShell(backend, native);
