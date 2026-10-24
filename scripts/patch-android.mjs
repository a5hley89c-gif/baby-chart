// Run after `npx cap add android` (the build does this automatically).
// - sets the version number from the build number
// - adds release signing that reads the key from environment variables
// - adds the small white notification icon
import { readFile, writeFile, mkdir, access } from "node:fs/promises";

const code = parseInt(process.env.VERSION_CODE || "1", 10);
const name = `1.0.${code}`;
const exists = p => access(p).then(() => true, () => false);

const groovy = "android/app/build.gradle", kts = "android/app/build.gradle.kts";
if(await exists(groovy)){
  let g = await readFile(groovy, "utf8");
  g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${name}"`);
  if(!g.includes("ANDROID_KEYSTORE_PATH")){
    const signing = `
    signingConfigs {
        release {
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`;
    if(!/\n\s*buildTypes\s*\{/.test(g)) throw new Error("buildTypes block not found in " + groovy);
    g = g.replace(/\n\s*buildTypes\s*\{/, "\n" + signing);
    if(!/buildTypes\s*\{\s*release\s*\{/.test(g)) throw new Error("release build type not found in " + groovy);
    g = g.replace(/(buildTypes\s*\{\s*release\s*\{)/, `$1\n            if (System.getenv("ANDROID_KEYSTORE_PATH")) { signingConfig signingConfigs.release }`);
  }
  await writeFile(groovy, g);
} else if(await exists(kts)){
  let g = await readFile(kts, "utf8");
  g = g.replace(/versionCode\s*=\s*\d+/, `versionCode = ${code}`).replace(/versionName\s*=\s*"[^"]*"/, `versionName = "${name}"`);
  if(!g.includes("ANDROID_KEYSTORE_PATH")){
    const signing = `
    signingConfigs {
        create("release") {
            System.getenv("ANDROID_KEYSTORE_PATH")?.let {
                storeFile = file(it)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`;
    g = g.replace(/\n\s*buildTypes\s*\{/, "\n" + signing);
    g = g.replace(/(getByName\("release"\)\s*\{|release\s*\{)/, `$1\n            if (System.getenv("ANDROID_KEYSTORE_PATH") != null) { signingConfig = signingConfigs.getByName("release") }`);
  }
  await writeFile(kts, g);
} else {
  throw new Error("Couldn't find android/app/build.gradle. Run `npx cap add android` first.");
}

// White moon used in the status bar for feed alerts (Material Symbols "bedtime", Apache 2.0)
const dir = "android/app/src/main/res/drawable";
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/ic_stat_notify.xml`, `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF"
      android:pathData="M12.34,2.02C6.59,1.82 2,6.42 2,12c0,5.52 4.48,10 10,10c3.71,0 6.93,-2.02 8.66,-5.02C13.15,16.73 8.57,8.55 12.34,2.02z"/>
</vector>
`);
console.log(`Android project patched: version ${name} (${code})`);
