# Android TWA APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a signed, sideloadable Android APK (`app-release-signed.apk`) that opens the live Work Diary site (`https://work-diary-phi.vercel.app`) fullscreen as a Trusted Web Activity.

**Architecture:** A Bubblewrap-generated TWA project lives in `android-twa/` in the repo. The APK is a thin Chrome-rendered shell; all content comes from the deployed PWA, so website deploys update the app with no APK re-release. A Digital Asset Links file (`public/.well-known/assetlinks.json`) served by the site, containing the SHA-256 fingerprint of our signing certificate, removes the browser URL bar.

**Tech Stack:** @bubblewrap/cli (Node), JDK 17 + Android SDK (auto-downloaded by Bubblewrap on first run), existing Vite/Vercel deployment.

## Global Constraints

- Production site: `https://work-diary-phi.vercel.app` (spec)
- Package id: `com.agrotop.workdiary` (spec)
- App name: `Agrotop יומן עבודה`, launcher name: `יומן עבודה` (spec)
- Theme `#3aaa35`, background `#f4f1ea`, portrait, standalone (matches vite.config.ts manifest)
- Keystore MUST live outside the git repo: `C:\APPS\keys\workdiary-twa.keystore` (spec: never committed; same key must sign every future build)
- Windows host; Bubblewrap commands run in PowerShell
- This project has no unit-testable code — each task's "test" is a stated verification command with expected output

---

### Task 1: Scaffold TWA project config

**Files:**
- Create: `android-twa/twa-manifest.json`
- Create: `android-twa/.gitignore`
- Modify: `package.json` (add devDependency `@bubblewrap/cli`)

**Interfaces:**
- Produces: `android-twa/twa-manifest.json` consumed by `bubblewrap update`/`build` in Task 4; `signingKey.path` and `signingKey.alias` values consumed by Task 2.

- [ ] **Step 1: Install Bubblewrap CLI**

Run: `npm install -D @bubblewrap/cli`
Expected: `@bubblewrap/cli` appears in `package.json` devDependencies, exit 0.

- [ ] **Step 2: Create `android-twa/twa-manifest.json`** with exactly:

```json
{
  "packageId": "com.agrotop.workdiary",
  "host": "work-diary-phi.vercel.app",
  "name": "Agrotop יומן עבודה",
  "launcherName": "יומן עבודה",
  "display": "standalone",
  "themeColor": "#3aaa35",
  "themeColorDark": "#3aaa35",
  "navigationColor": "#3aaa35",
  "navigationColorDark": "#3aaa35",
  "navigationDividerColor": "#3aaa35",
  "navigationDividerColorDark": "#3aaa35",
  "backgroundColor": "#f4f1ea",
  "enableNotifications": true,
  "startUrl": "/",
  "iconUrl": "https://work-diary-phi.vercel.app/pwa-512.png",
  "maskableIconUrl": "https://work-diary-phi.vercel.app/pwa-512.png",
  "splashScreenFadeOutDuration": 300,
  "signingKey": {
    "path": "C:\\APPS\\keys\\workdiary-twa.keystore",
    "alias": "workdiary"
  },
  "appVersionName": "1.0.0",
  "appVersionCode": 1,
  "shortcuts": [],
  "generatorApp": "bubblewrap-cli",
  "webManifestUrl": "https://work-diary-phi.vercel.app/manifest.webmanifest",
  "fallbackType": "customtabs",
  "features": {},
  "alphaDependencies": { "enabled": false },
  "enableSiteSettingsShortcut": true,
  "isChromeOSOnly": false,
  "isMetaQuest": false,
  "fullScopeUrl": "https://work-diary-phi.vercel.app/",
  "minSdkVersion": 21,
  "orientation": "portrait",
  "fingerprints": [],
  "additionalTrustedOrigins": [],
  "retainedBundles": [],
  "appVersion": "1.0.0"
}
```

Save as UTF-8 (Hebrew strings must survive; verify with `Get-Content android-twa/twa-manifest.json` showing readable Hebrew).

- [ ] **Step 3: Create `android-twa/.gitignore`** with exactly:

```gitignore
# Bubblewrap-generated Android project — regenerable from twa-manifest.json
app/
gradle/
build/
.gradle/
*.apk
*.aab
*.idsig
gradlew
gradlew.bat
build.gradle
settings.gradle
gradle.properties
local.properties
store_icon.png
manifest-checksum.txt
```

(Only `twa-manifest.json` and `.gitignore` stay tracked; the generated Android project is reproducible.)

- [ ] **Step 4: Verify config parses**

Run: `node -e "const m=require('./android-twa/twa-manifest.json'); console.log(m.packageId, m.host)"`
Expected: `com.agrotop.workdiary work-diary-phi.vercel.app`

- [ ] **Step 5: Commit**

```bash
git add android-twa/twa-manifest.json android-twa/.gitignore package.json package-lock.json
git commit -m "feat(android): TWA project config for sideload APK"
```

---

### Task 2: Generate signing keystore (outside repo)

**Files:**
- Create: `C:\APPS\keys\workdiary-twa.keystore` (NOT in repo)
- Create: `C:\APPS\keys\workdiary-twa-credentials.txt` (NOT in repo)

**Interfaces:**
- Consumes: `signingKey` path/alias from Task 1.
- Produces: keystore used by Task 4 build; SHA-256 fingerprint extracted in Task 3.

- [ ] **Step 1: Ensure JDK available.** Bubblewrap downloads its own JDK on first run to `%USERPROFILE%\.bubblewrap\jdk`. Trigger setup:

Run: `npx bubblewrap doctor`
If it prompts to download JDK/Android SDK, answer `Y` to both. Expected final output includes `Your JDK is ok` (or the downloads complete). `keytool.exe` is then at a path like `%USERPROFILE%\.bubblewrap\jdk\jdk-17*\bin\keytool.exe` — if the system already has a JDK 11+ on PATH, plain `keytool` works too.

- [ ] **Step 2: Create keys directory and generate keystore**

```powershell
New-Item -ItemType Directory -Force C:\APPS\keys
$pw = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
Set-Content -NoNewline C:\APPS\keys\workdiary-twa-credentials.txt "keystore=C:\APPS\keys\workdiary-twa.keystore`nalias=workdiary`npassword=$pw"
keytool -genkeypair -v -keystore C:\APPS\keys\workdiary-twa.keystore -alias workdiary -keyalg RSA -keysize 2048 -validity 10000 -storepass $pw -keypass $pw -dname "CN=Agrotop Work Diary, O=Agrotop, C=IL"
```

(Use the full `keytool.exe` path from Step 1 if `keytool` is not on PATH.)
Expected: `Storing C:\APPS\keys\workdiary-twa.keystore` and file exists.

- [ ] **Step 3: Verify keystore**

Run: `keytool -list -keystore C:\APPS\keys\workdiary-twa.keystore -storepass (credentials password)`
Expected: one entry, alias `workdiary`, `PrivateKeyEntry`.

- [ ] **Step 4: Tell the user** (no commit — nothing in repo changed): back up `C:\APPS\keys\` somewhere safe; losing the keystore means every worker must uninstall/reinstall a future differently-signed APK.

---

### Task 3: Publish assetlinks.json

**Files:**
- Create: `public/.well-known/assetlinks.json`

**Interfaces:**
- Consumes: keystore from Task 2.
- Produces: live `https://work-diary-phi.vercel.app/.well-known/assetlinks.json` that Android checks to hide the URL bar (verified in Task 5).

- [ ] **Step 1: Extract SHA-256 fingerprint**

```powershell
keytool -list -v -keystore C:\APPS\keys\workdiary-twa.keystore -alias workdiary -storepass (credentials password) | Select-String "SHA256:"
```

Expected: line like `SHA256: AA:BB:CC:...` (32 colon-separated hex pairs). Copy the value.

- [ ] **Step 2: Create `public/.well-known/assetlinks.json`** with exactly (substitute the real fingerprint):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.agrotop.workdiary",
      "sha256_cert_fingerprints": ["AA:BB:CC:..."]
    }
  }
]
```

- [ ] **Step 3: Verify local serving**

Run: `npm run build && npx vite preview --port 4173` (background), then `curl -s http://localhost:4173/.well-known/assetlinks.json`
Expected: the JSON above. Stop preview server after.

- [ ] **Step 4: Commit and push (deploy)**

```bash
git add public/.well-known/assetlinks.json
git commit -m "feat(android): digital asset links for TWA URL-bar removal"
git push origin main
```

Note: push may be wrongly denied by classifier — retry; if still blocked, ask user to send "run it" (see memory note). Vercel auto-deploys on push.

- [ ] **Step 5: Verify live**

Run: `curl -s https://work-diary-phi.vercel.app/.well-known/assetlinks.json`
Expected: same JSON with correct fingerprint (wait ~1–2 min for deploy; confirm content, not just 200 — Vercel SPA fallback can return index.html).

---

### Task 4: Generate Android project and build signed APK

**Files:**
- Create (generated, git-ignored): `android-twa/app/`, gradle files, `android-twa/app-release-signed.apk`

**Interfaces:**
- Consumes: `twa-manifest.json` (Task 1), keystore + password (Task 2).
- Produces: `android-twa/app-release-signed.apk` — the deliverable.

- [ ] **Step 1: Generate the Android project from the manifest**

```powershell
cd android-twa
npx bubblewrap update
```

Expected: exit 0, `app/` directory and gradle files created. (`update` regenerates the project from `twa-manifest.json` without interactive `init` prompts.)

- [ ] **Step 2: Build signed APK**

```powershell
$cred = Get-Content C:\APPS\keys\workdiary-twa-credentials.txt | ConvertFrom-StringData
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = $cred.password
$env:BUBBLEWRAP_KEY_PASSWORD = $cred.password
npx bubblewrap build --skipPwaValidation
```

Expected: `Signed app-release-signed.apk` (and `app-release-bundle.aab`) in `android-twa/`. If Bubblewrap still prompts for passwords, enter the credentials-file password twice.

- [ ] **Step 3: Verify APK signature fingerprint matches assetlinks**

```powershell
keytool -printcert -jarfile app-release-signed.apk | Select-String "SHA256:"
```

Expected: SHA-256 identical to the one in `public/.well-known/assetlinks.json`.

- [ ] **Step 4: Verify git cleanliness**

Run: `git status --porcelain android-twa/`
Expected: empty (generated files ignored). Commit nothing if empty; if files leak, extend `android-twa/.gitignore`, then commit that fix:

```bash
git add android-twa/.gitignore
git commit -m "chore(android): ignore generated build artifacts"
```

---

### Task 5: On-device verification and handoff

**Files:** none (manual verification; user's phone required)

**Interfaces:**
- Consumes: `android-twa/app-release-signed.apk` (Task 4), live assetlinks (Task 3).

- [ ] **Step 1: Pre-check asset links via Google validator**

```powershell
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://work-diary-phi.vercel.app&relation=delegate_permission/common.handle_all_urls"
```

Expected: JSON listing package `com.agrotop.workdiary` with our fingerprint, no `errors`.

- [ ] **Step 2: Deliver APK to user** with install instructions (user performs on an Android phone):
  1. Copy `android-twa/app-release-signed.apk` to phone (WhatsApp/Drive/USB).
  2. Tap file → allow "install from unknown sources" for that app once → install.
  3. Open "יומן עבודה".

- [ ] **Step 3: User verifies on phone** (checklist from spec):
  - App opens fullscreen, **no URL bar** (if URL bar shows: assetlinks fingerprint mismatch — recheck Task 4 Step 3).
  - Login, close app, reopen — session persists.
  - Airplane mode → cached data visible.
  - Web push notification arrives.

- [ ] **Step 4: Mark plan complete** — update this file's checkboxes, commit:

```bash
git add docs/superpowers/plans/2026-07-21-android-twa-apk.md
git commit -m "docs: complete Android TWA APK plan"
```
