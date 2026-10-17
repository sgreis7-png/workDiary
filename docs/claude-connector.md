# Claude connector

A read-only remote MCP connector that lets managers and admins ask claude.ai questions about
Work Diary data (projects, diary entries, issues, defects, safety forms, schedules, deliveries,
traffic light, handovers, stats). Code: `supabase/functions/mcp/`; consent screen
`src/screens/OAuthConsent.tsx`; setup screen `src/screens/ClaudeConnector.tsx`; permission area
`claude`. Design: `docs/superpowers/specs/2026-10-17-claude-connector-design.md`.

The person signs in through Supabase Auth's OAuth server. The access token is their own Supabase
JWT, every query runs as them through PostgREST (RLS applies), and the service key is never used.

## Connector URL

`https://<project-ref>.supabase.co/functions/v1/mcp` (shown on the in-app setup screen). Add it in
claude.ai under Settings, Connectors, Add custom connector.

## Hosted Supabase settings (Authentication)

- OAuth server: **on**.
- Dynamic client registration: **on** (claude.ai registers itself; it cannot be pre-registered).
- Authorization path: `/oauth/consent`.
- Site URL: `https://work-diary-phi.vercel.app`.
- Access-token lifetime is the project-wide JWT expiry. Shortening it also shortens app sessions
  for everyone; there is no per-client setting.

## Enabling a manager

Eligibility is role `admin` or `manager` AND the `claude` permission area. Admins have it
automatically. For a manager: Admin, Users, the permissions button on their row, set the Claude
area to view (or edit). Members can never use the connector (the area is hidden for them in that
dialog). A person who is refused is told which of the two is missing.

The token must carry an e-mail claim (`is_member()` and `perm_level()` read it). The metadata
advertises scopes `openid email profile`; if a login lacks the claim, the connector asks the
person to reconnect and allow e-mail access.

## Accepted risk

The OAuth token keeps the person's normal rights: it is a regular Supabase user JWT, so someone
holding it could call PostgREST directly with the same reach as that person in the app, including
writes. The connector's own tools are read-only and allowlisted, but that is a property of the
connector, not of the token. Accepted for this internal tool. Follow-up if it is not enough:
restrictive RLS policies that deny writes for sessions issued through OAuth clients (for example
on the token's `client_id` claim or `amr`).

## Operating notes

- Tool results are capped at 999 rows (PostgREST `max_rows` is 1000; the tools fetch one extra row
  to detect truncation). Results report `truncated`.
- A Supabase Auth outage returns HTTP 503 or a tool error, not 401, so claude.ai does not start a
  needless re-login.
- The rate limiter is per function instance.
