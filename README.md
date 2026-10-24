# Baby Chart

A feeds, sleep, nappies and health log for a newborn, shared by both parents.

- **Android app.** Built automatically by GitHub into an `.apk` you install on your phone, plus an `.aab` file for Google Play. It shows a real phone notification when a feed is due, even when the app is closed.
- **iPhone (web version).** The same app, published as a website that you add to the home screen from Safari.
- **One shared log.** Both versions use the same online database (Firebase). It works offline and catches up when you reconnect.

Nothing personal is stored in this code. Your baby's name, date of birth and every log entry live only in your own Firebase database, and only family members who join with your invite code can read them.

---

## Setting it up (about 30–45 minutes, once)

You need a Google account (for Firebase) and a free GitHub account.

### Step 0: Unzip the project

In *Documents › Baby Chart*, right-click **baby-chart.zip** and choose **Extract All**. Use the extracted `baby-chart` folder for everything below. It includes the hidden `.github` build folder that GitHub needs.

### Step 1: Create the database (Firebase)

1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click **Create a project**. Name it something like `baby-chart`. You can turn Google Analytics **off**. Click **Create project**.
3. **Turn on sign-in:**
   - In the left menu, choose **Build › Authentication › Get started**.
   - Under **Sign-in method**, click **Email/Password**, switch on the first toggle and click **Save**.
4. **Create the database:**
   - Choose **Build › Firestore Database › Create database**.
   - Pick the location **australia-southeast1 (Sydney)**.
   - Choose **Start in production mode** and click **Create**.
5. **Add the security rules:**
   - In Firestore, open the **Rules** tab.
   - Delete what's there, paste the whole contents of the `firestore.rules` file from this folder, and click **Publish**.
6. **Get the app settings:**
   - Click the ⚙️ gear next to *Project overview*, then **Project settings**.
   - Under **Your apps**, click the **</>** (Web) icon. Name it `Baby Chart web` and leave "Firebase Hosting" unticked. Click **Register app**.
   - You'll see a block of code with `const firebaseConfig = { apiKey: "...", ... }`. Copy those values into **`src/config.js`** in the extracted folder (open it with Notepad), replacing the empty `""` values. Save the file.
   - These values aren't secret. The security rules protect your data.

### Step 2: Put the code on GitHub

1. Create a free account at **https://github.com** if you don't have one.
2. Click **+ › New repository**.
   - Name it `baby-chart` and choose **Public**. Public lets GitHub host the iPhone version for free, and the code holds no personal information.
   - Click **Create repository**.
3. On the new repository's page, click **uploading an existing file**.
   - Open the extracted `baby-chart` folder and drag **everything inside it**, including the `.github` folder, onto the GitHub page.
   - Don't include the `baby-chart-signing-key` folder, which is kept separately.
   - Make sure `src/config.js` already has your Firebase settings from step 1.
   - Click **Commit changes**.
4. **Add the signing key:**
   - Go to **Settings › Secrets and variables › Actions › New repository secret**.
   - Add the 4 secrets listed in `baby-chart-signing-key/signing-secrets.txt`. Copy each name and value exactly.
5. **Turn on the iPhone website:**
   - Go to **Settings › Pages**.
   - Under *Build and deployment › Source*, choose **GitHub Actions**.
6. Go to the **Actions** tab. Open each workflow (**Build Android app** and **Publish web version**) and click **Run workflow**.

> Tip: you can also connect GitHub to Claude (claude.ai › Settings › Connectors › GitHub). Then Claude can upload the code and make future changes for you.

### Step 3: Install on Android

1. On your phone, open GitHub (in the browser) › your `baby-chart` repository › **Actions** › **Build Android app** › the latest run with a green tick.
2. Under **Artifacts**, download `baby-chart-android-…`. It's a zip file, so open it and tap **`baby-chart.apk`**.
3. Android will ask to allow installs from your browser or Files app. Allow it, then tap **Install**.
4. Open **Baby Chart** and allow notifications when asked.

To update later, install the newer `baby-chart.apk` the same way. Your log stays.

### Step 4: Install on iPhone

1. In **Safari**, open `https://YOUR-GITHUB-USERNAME.github.io/baby-chart/`.
2. Tap **Share › Add to Home Screen › Add**.
3. Open it from the home screen icon.

### Step 5: Start the chart and share it

1. **First phone:**
   - Choose **Create account** and sign up with an email and password.
   - Choose **Start a new chart** and enter the baby's name and date of birth.
2. **Bring in the earlier log:** open **Settings and family › Import file** and choose the exported `.json` log file.
3. **Second phone:**
   - Choose **Create account**, then **Join with a code**.
   - Enter the invite code shown under **Settings and family** on the first phone.

---

## Putting it on Google Play (optional)

For just your family, installing the `.apk` (step 3) is enough. Google Play adds automatic updates.

1. Create a **Google Play Console** account at https://play.google.com/console. It costs US$25 once, and Google verifies your identity, which can take a few days.
2. **Create app:**
   - Name it *Baby Chart*, set it as an **App** and **Free**.
   - Go to **Testing › Internal testing › Create new release**.
   - Upload **`baby-chart-for-play-store.aab`** from the build download.
   - Accept **Play App Signing**.
3. **Add testers:** add your email (and any other Android users' emails) as testers. Open the opt-in link on your phone and install from the Play Store.
4. **Complete the Play Console checklist:** app access, content rating, data safety and privacy policy. Claude can draft the answers and a short privacy policy for you.

Internal testing is available straight away. A public listing needs 12 testers for 14 days, then Google's review.

For each new version, the build number goes up automatically. Upload the new `.aab` as a new internal testing release.

---

## Good to know

- **Android notifications:** a notification is scheduled on the phone for 3 hours after the start of the last feed it knows about. If your partner logs a feed on their phone while yours is closed, open the app so it can move the reminder.
- **iPhone alerts:** the web version can't send notifications while closed. Its alert shows and chimes while the app is open on screen.
- **Export:** the web version has an **Export** button under Settings and family that saves a backup of the whole log.
- **Medical content:** the guidance in the app is general information for a healthy term baby, not medical advice. Always follow your midwife, child health nurse or GP.

---

## For developers

```
src/index.html      page markup (sign-in, set-up and chart screens)
src/styles.css      styles (light and dark)
src/app.js          the chart: logging, history, calendar, alerts, editing
src/shell.js        sign-in, family set-up, settings, import/export
src/main.js         Firebase backend (Auth + Firestore with offline cache)
src/native.js       Android-only features (local notifications, back button)
src/config.js       your Firebase web settings
firestore.rules     database security rules
build.mjs           bundles src/ into www/ (esbuild)
scripts/patch-android.mjs   version number, release signing, notification icon
.github/workflows/  android.yml (APK + AAB), web.yml (GitHub Pages)
test/               a pretend backend for testing in a browser without Firebase
```

- **Build locally:** `npm install`, then `npm run build`. For Android, run `npx cap add android`, `node scripts/patch-android.mjs` and `npx cap sync android`, then open the `android/` folder in Android Studio.
- **Test without Firebase:** run `node test/make-test-page.mjs`, start any web server in this folder (for example `npx serve .`), and open `/test/index.html`.
