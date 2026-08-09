"""HTTP wrapper around the MPXJ converter.

POST /convert
  Authorization: Bearer <supabase access token>
  body: the raw file bytes
  header X-Filename: original name (optional, used for the reported file name)
  -> 200 {"schema":1,"file":...,"properties":{...},"resources":[...],"tasks":[...]}
  -> 4xx/5xx {"error": "<i18n key>"}

GET /health -> {"ok": true, "java": "<java home>"}

The caller's Supabase token is verified against Supabase Auth, and the caller must be
an active member (the `is_member` RPC). The service holds no service-role key: it can
read nothing and write nothing, it only converts bytes it is handed.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile

import urllib.error
import urllib.request

from flask import Flask, jsonify, request

from converter import convert, find_java_home, start_jvm

MAX_BYTES = int(os.environ.get("MPP_MAX_BYTES", 50 * 1024 * 1024))
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("MPP_ALLOWED_ORIGINS", "").split(",") if o.strip()]

log = logging.getLogger("mpp-converter")
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_BYTES


def _cors(response):
    origin = request.headers.get("Origin", "")
    if origin and (not ALLOWED_ORIGINS or origin in ALLOWED_ORIGINS):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "authorization, content-type, x-filename"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response.headers["Access-Control-Max-Age"] = "3600"
    return response


app.after_request(_cors)


def _post_rpc(name: str, token: str):
    """Call a Supabase RPC as the calling user. Returns the decoded body, or None."""
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        data=b"{}",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read() or b"null")
    except (urllib.error.URLError, ValueError, TimeoutError) as exc:
        log.warning("rpc %s failed: %s", name, exc)
        return None


def caller_is_member() -> bool:
    """True when the request carries a token for an active allowlisted member."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")

    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return False
    return _post_rpc("is_member", auth[7:].strip()) is True


@app.get("/health")
def health():
    return jsonify({"ok": True, "java": find_java_home()})


@app.post("/convert")
def convert_endpoint():
    try:
        if not caller_is_member():
            return jsonify({"error": "err_forbidden"}), 403
    except RuntimeError as exc:
        log.error("misconfigured: %s", exc)
        return jsonify({"error": "err_converter_config"}), 500

    payload = request.get_data(cache=False)
    if not payload:
        return jsonify({"error": "err_empty_file"}), 400

    name = os.path.basename(request.headers.get("X-Filename", "schedule.mpp"))
    suffix = os.path.splitext(name)[1].lower() or ".mpp"
    if suffix not in (".mpp", ".mpt", ".mpx", ".xml", ".xer", ".pp"):
        return jsonify({"error": "err_unsupported_format"}), 415

    # MPXJ reads from a path, and the native readers sniff the extension — so the
    # temp file keeps the original one. An ASCII name avoids encoding surprises.
    handle, path = tempfile.mkstemp(prefix="mpp-", suffix=suffix)
    try:
        with os.fdopen(handle, "wb") as fh:
            fh.write(payload)
        data = convert(path)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception:
        log.exception("conversion failed for %s", name)
        return jsonify({"error": "err_convert_failed"}), 500
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    data["file"] = name
    return app.response_class(
        json.dumps(data, ensure_ascii=False),
        mimetype="application/json",
    )


@app.route("/convert", methods=["OPTIONS"])
def convert_preflight():
    return ("", 204)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    start_jvm()  # pay the JVM cost at boot, not on the first upload
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
