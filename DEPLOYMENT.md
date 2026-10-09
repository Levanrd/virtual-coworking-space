# Docker development and launch preparation

The current free 20-person deployment and operator runbook is [FRIENDS-BETA.md](FRIENDS-BETA.md). It supersedes older production setup notes below, including the bundled TURN service, registration allowlist and backup requirements.

## Local stack

Docker Desktop with Linux containers and Node.js 22.16+ for the setup command:

```sh
npm run docker:setup
docker compose up --build -d
```

- App: http://localhost:8080
- Test inbox: http://localhost:8025
- TURN: localhost:3478, TCP and UDP; UDP relay range 45000–45100.
- All published ports bind to `127.0.0.1`. This is a single-computer test stack.
- Accounts, verification state, sessions, memberships, invitations, reports, and moderation logs persist in the `common-ground-local_accounts` Docker volume. This is separate from `data/accounts.sqlite` used by `npm run dev`.
- `docker compose down` stops the stack without deleting accounts. Do not add `-v` unless you intend to erase its data.
- Mailpit captures messages locally. It does **not** deliver email to real inboxes. Open its inbox to follow verification and reset links. Anyone who can open that local inbox can read its test links.
- `.env` contains a generated TURN shared secret. It is ignored by Git and excluded from Docker build context. Do not share it or run `docker compose config` in a public log, since rendered configuration contains secrets.
- If Windows reserves a relay port, choose another unreserved range and change both the coturn min/max arguments and matching Docker port mapping.

The Docker app requires verified email. The plain Vite development server does not unless `REQUIRE_EMAIL_VERIFICATION=true` is set with SMTP configured. Node development reads `.env` at startup; restart it after changing that file. Cookies are shared across localhost ports, so switching between the Docker and Vite databases may require signing in again.

## Access and moderation

Use **More → Workspace** to create a private workspace. Its creator owns it. A `?space=` address does not create or grant access to a private workspace. Owners and moderators can generate single-use invitations through **Invite**; each expires after 24 hours. The recipient signs in, verifies email when required, and explicitly accepts the invitation.

**More → Workspace → Manage members & reports** provides five-minute removals, bans/unbans, owner-controlled moderator roles, reports, and a persistent moderation log. Bans disconnect every active session of that member in that workspace; other workspaces remain accessible. A new invitation cannot bypass a ban. Workspace owners cannot be demoted or banned through these controls. Reports are private to workspace managers.

The local community workspace is open to authenticated users. In production it is closed by default. To open it with moderation, set `COMMUNITY_OWNER_ACCOUNT_ID` to an existing verified account ID (available to that user in `/api/auth/me`). This uses a database account ID, not a claimable username. Custom private workspaces remain usable while the community is closed.

Password-reset links expire after 30 minutes; verification links after 24 hours. Only hashes are stored. Links are single-use; requesting another invalidates the earlier link. Resetting a password revokes all login sessions and disconnects live sockets. Link tokens use URL fragments and are removed from the address bar when the recovery screen loads. Do not refresh the recovery screen before submitting; reopen the email link if needed.

## Calling verification

Run `npm run dev`, sign in, and open:

```
http://localhost:5173/tests/media-harness.html
http://localhost:5173/tests/media-harness.html?relay
```

The second URL forces TURN. Set `TURN_URLS=turn:127.0.0.1:3478?transport=udp,turn:127.0.0.1:3478?transport=tcp` in `.env` alongside the same generated secret used by Docker, then restart the development server. The harness creates an isolated private workspace owned by the signed-in test account. It runs three real WebRTC clients with generated camera, audio, and screen tracks. It never captures physical devices and all playback is muted. Each run creates a workspace; use dedicated test accounts. The harness is excluded from the production image.

Inspect connection diagnostics for `localCandidate: relay`, `remoteCandidate: relay`, increasing bytes, and decoded remote video sizes. A successful direct call does not prove TURN works. Test separate tables, private-code rejection, disconnect/reconnect, leaving a table, and all capture tracks ending. The local TURN quota permits multiple synthetic clients using one account. Its loopback-peer allowance is for localhost tests only. Failed/stalled calls have up to two coordinated transport rebuild attempts; live capture is reused, and generation IDs reject stale signaling. Socket disconnects still stop capture and require explicit table re-entry.

## Future HTTPS deployment

The production template is prepared but has not been deployed or exercised against a public domain. Obtain a domain, server, real SMTP delivery, and a TURN service first.

1. Copy `deploy/production.env.example` to `.env.production` and fill it privately. Configure DNS for `APP_DOMAIN` to the host. Set `APP_ORIGIN` to its exact HTTPS origin.
2. Use real SMTP credentials and a verified sender. Production requires SMTP TLS and refuses to start without mail configuration, HTTPS origin, and a TURN REST shared secret of at least 32 characters.
3. Configure a TURN service with the **same** REST shared secret. Advertise UDP/TCP plus TLS endpoints. Open its listener and relay ranges in the host firewall. Do not use the localhost coturn profile in production: deny loopback/private/multicast peers, set bandwidth/allocation quotas, monitor capacity, and provide valid TLS certificates. A TURN outage prevents users on restrictive networks from calling.
4. On the hosting server, run the standalone template (not a merge with the local stack):

```sh
docker compose -f deploy/compose.production.yaml up --build -d
```

Caddy exposes ports 80/443, handles certificates, and proxies HTTP and WebSockets to the internal app. Mailpit is not part of this template. The app runs as the unprivileged `node` user; the database uses a persistent volume. Trust of forwarded headers is limited to the private proxy network. Secure cookies, no-referrer policy, framing protection, and production CSP are enabled.

This deployment is **single-instance**. Presence, seats, table codes, and chat are in memory. Do not scale app replicas without introducing shared state and a Socket.IO adapter. Back up SQLite consistently (stop the app briefly or use SQLite's backup API, including any required WAL handling), test restoration, and monitor the HTTP health endpoint, SMTP failures, TURN capacity, and application errors. Define retention for reports/audit logs before collecting real user data.

## Checks still requiring real people and networks

- Separate laptops/phones on home Wi-Fi and mobile data, with actual microphones/cameras.
- Browser permission denial, device unplug/replug, echo, speaker selection, screen capture and mobile backgrounding.
- Six-person table load, long sessions, weak connections, network switching, relay interruption and server restart.
- Confirm nobody at another table/room/workspace receives audio, video, screen or table chat.
- Password email delivery to real providers, HTTPS certificate issuance/renewal, and database backup restoration.

Passing the local generated-media tests is not a substitute for these checks.

Implementation references: [Nodemailer SMTP](https://nodemailer.com/smtp), [Mailpit Docker](https://mailpit.axllent.org/docs/install/docker/), [coturn REST authentication](https://github.com/coturn/coturn/blob/master/README.turnserver), [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), [Caddy WebSocket proxying](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
