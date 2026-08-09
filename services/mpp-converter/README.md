# mpp-converter

Turns a Microsoft Project schedule into JSON for the app's Gantt board.

The app is a browser SPA talking to Supabase, and `.mpp` is an undocumented binary
container — there is no browser-side reader for it. This service wraps
[MPXJ](https://www.mpxj.org/), which does have one, and returns the schedule as JSON.

It stores nothing and holds no service-role key. It verifies the caller's own Supabase
token, converts the bytes it was handed, and forgets them.

## What it needs from the runtime

MPXJ requires a **full** JRE:

- `jdk.charsets` — MPXJ opens `.mpp` through a `MacRoman` decoder
- a headless `java.desktop` — it reads `java.awt.Color` while parsing Gantt view data

Two runtimes that look like they should work and do not:

- `jdk4py` (the pip-installable JVM) omits `jdk.charsets` →
  `UnsupportedCharsetException: MacRoman`
- `@byteink/mppjs`, a GraalVM native image of MPXJ, ships without the AWT native
  library → `UnsatisfiedLinkError: No awt in java.library.path` on any file carrying
  view data. This ruled out running the conversion inside a Vercel function.

The Dockerfile starts from `eclipse-temurin:21-jre-noble`, which has both.

## Run it

```bash
docker build -t mpp-converter services/mpp-converter
docker run -p 8080:8080 \
  -e SUPABASE_URL=https://<ref>.supabase.co \
  -e SUPABASE_ANON_KEY=<anon key> \
  -e MPP_ALLOWED_ORIGINS=https://<your app host> \
  mpp-converter
```

Locally, without Docker, point it at any full JRE:

```bash
pip install -r requirements.txt
MPP_JAVA_HOME=/path/to/jre SUPABASE_URL=... SUPABASE_ANON_KEY=... python app.py
```

On Windows, `run-local.ps1` does that for you — it reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` out of the app's `.env`, finds a JRE under `~/.local/jre`, and
allows the Vite dev origin:

```powershell
pwsh services/mpp-converter/run-local.ps1
```

Either way, set `VITE_MPP_CONVERTER_URL=http://localhost:8080/convert` in the app's
`.env`.

### Environment

| Name | Required | Meaning |
|---|---|---|
| `SUPABASE_URL` | yes | used to verify the caller is an active member |
| `SUPABASE_ANON_KEY` | yes | sent as `apikey` alongside the caller's own token |
| `MPP_ALLOWED_ORIGINS` | no | comma-separated CORS allowlist; empty reflects any origin |
| `MPP_JAVA_HOME` | no | JRE to use; otherwise `~/.local/jre/*`, then `JAVA_HOME` |
| `MPP_MAX_BYTES` | no | upload ceiling, default 50MB (matches the storage bucket) |
| `PORT` | no | default 8080 |

`JAVA_HOME` is deliberately ranked below `~/.local/jre` because on a developer machine
it often points at a bundled runtime (Android Studio's JBR, for one) that cannot load
MPXJ at all.

## API

```
POST /convert
  Authorization: Bearer <supabase access token>
  X-Filename: schedule.mpp          # only the extension is used
  body: raw file bytes
  -> 200 {"schema":1,"file":…,"properties":{…},"resources":[…],"tasks":[…]}
  -> 403 {"error":"err_forbidden"}          not an active member
  -> 415 {"error":"err_unsupported_format"}
  -> 422 {"error":"err_not_a_project_file"}
  -> 500 {"error":"err_convert_failed"}

GET /health -> {"ok":true,"java":"<java home>"}
```

Error bodies carry i18n keys, matching the convention in `supabase/functions/*`. The
client maps them in `src/gantt/i18n.ts`.

Accepted extensions: `.mpp`, `.mpt`, `.mpx`, `.xml` (MSPDI), `.xer`, `.pp`.

## Sizing

Each gunicorn worker boots its own JVM, roughly 200MB resident. Conversion is CPU-bound
inside Java, so scale with replicas rather than workers; the image runs one worker with
two threads. A 500-task schedule converts in well under a second once the JVM is warm —
`--preload` pays that cost at boot.
