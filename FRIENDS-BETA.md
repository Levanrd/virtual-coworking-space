# Free, self-hosted friends beta

Target: **20 online connections total**, invitation-only private workspaces, up to six people in a table call. Two tabs per account are allowed and each entered tab uses a place. No subscription, paid infrastructure, cloud signup, or public deployment has been performed. Your existing computer, electricity and internet connection are the host. It must stay on and awake.

This is a bounded single-server beta. It is not a highly available or horizontally scaled service. SQLite stores accounts, sessions, memberships, invitations and moderation. Presence, seating, private table codes and chat are temporary and reset when the server restarts. A production database lease prevents two app instances from owning the same world. Do not use `--scale app=2`, including with separate database volumes.

## What is ready locally

- Twenty-person admission limit; automatic browser retry when a place becomes available.
- Registration email allowlist, mandatory production verification, workspace invitations, bans and session revocation.
- Room-scoped movement packets batched at 20 Hz, with periodic authoritative correction. Slow motion delivery can be dropped rather than queued indefinitely.
- Readiness check, graceful restart notice and reconnect, bounded event rates, HTTP timeouts, error references and a browser crash recovery screen.
- Authenticated operations status; public proxy blocks that endpoint. Fixed-code error reporting excludes chat, passwords, account details, URLs and call SDP.
- Daily SQLite online backups, seven-snapshot retention, integrity verification and recovery-copy tooling. Backup on every app start as well.
- Docker log rotation, container resource limits and a separate monitor process that logs status changes. Monitor output is local; no email/push alerts are configured.
- CI/dependency update files, production container build and a repeatable 20-client load test. CI becomes active only if this folder is later pushed to a GitHub repository with Actions enabled; private repository usage has account-specific limits.

## Local use today

```powershell
npm run docker:setup
docker compose up --build -d
```

Open http://localhost:8080. Local verification emails are in http://localhost:8025. These addresses and the local TURN relay are bound to your computer; sharing `localhost` will not let friends join. Never publish Mailpit or disable verification to work around delivery.

## Internet setup with no hosting subscription

**If the router's WAN IPv4 is private (for example `10.x.x.x`), start here:** that indicates upstream NAT or another router. Forwarding ports on this router alone does not establish public reachability. Ask the ISP whether a publicly reachable IPv4 is available without a fee. Do not accept a paid upgrade for this beta.

A possible free alternative is [Tailscale device sharing](https://tailscale.com/docs/reference/inviting-vs-sharing): each friend uses their own account and installs Tailscale, and you share only the hosting device. Sharing does not increase your tailnet's user count; inviting all 20 as tailnet members would exceed the [free Personal plan's six-user limit](https://tailscale.com/pricing). Apply access rules limiting friends to the app and calling ports; do not share unrestricted access to your computer. [Tailscale Serve](https://tailscale.com/docs/reference/examples/serve) supplies private HTTPS. This option needs account setup, restricted sharing, a relay reachable through the private network and cross-device call validation. It is **not configured or certified by the current public-IP Compose template**. The local loopback TURN addresses cannot simply be shared. Neither a browser-only tunnel nor an HTTPS URL alone solves WebRTC relay connectivity.

The following direct-hosting steps apply only when public reachability is available:

1. Obtain a free DNS name, for example [DuckDNS](https://www.duckdns.org/why.jsp), and point it at your router's public IPv4 address. Keep its updater working if the address changes. Do not paste DNS tokens or passwords into chat.
2. Check that the router WAN address is a public IPv4 address and that you control port forwarding. If your ISP uses CGNAT, ask whether it offers a **free** public IPv4. If it does not, this direct hosting route is blocked; an HTTPS-only tunnel does not carry the TURN UDP relay. No free, universally reachable alternative is assumed here.
3. Configure TCP 80 and 443 to the host for Caddy's HTTPS certificate and website. Configure TCP/UDP 3478 and UDP 45000–45255 for the included TURN relay. Restrict other inbound ports. Keep the host's LAN address stable. Do not expose 3001, 8025 or the Docker daemon.
4. Use a mailbox/provider that allows SMTP without payment. An eligible personal Gmail account can use an app password with two-step verification; some accounts do not support this. Follow [Google's app-password instructions](https://support.google.com/accounts/answer/185833). Use the mailbox's documented SMTP settings and an app-specific password, not your regular password. This app supports SMTP; it does not provision an email service.
5. Run `npm run friends:setup`. It creates `.env.production` only if absent and generates unique TURN/operations secrets. It never overwrites existing secrets. Edit that file locally: domain/origin, public IP, SMTP settings, sender and comma-separated `REGISTRATION_EMAILS` (your email plus your friends). Keep `MAX_ONLINE_USERS=20`, `BACKUP_DIR=/app/backups`, and the public community owner empty. Match the TURN URL host to your DNS name. If your public IP changes, update `PUBLIC_IP` and recreate TURN as well as updating DNS.
6. Run `npm run deploy:check`. It validates settings without printing secret values or contacting services. A pass does not prove connectivity or delivery.

The production and local Compose projects are separate and have different data volumes. Production starts with a new account database. If migrating local accounts, use the recovery procedure below, never copy a live SQLite file without its WAL.

After configuration and a deliberate decision to expose this computer:

```powershell
docker compose --env-file .env.production -f deploy/compose.production.yaml config --quiet
docker compose --env-file .env.production -f deploy/compose.production.yaml up --build -d
```

The second command opens the published ports. It has **not** been run for you. Caddy obtains HTTPS certificates automatically when DNS and forwarding are correct. The included relay supports UDP and TCP on 3478; networks that allow only TLS/443 may still block calls. Adding TURN over TLS/443 requires a separately reachable address and certificate arrangement; the template does not pretend to cover that case.

Register your allowlisted address, verify it, create a private workspace, then create individual invitations using the app. Friends register with their allowlisted addresses, verify, and accept their workspace invitations. Invitations are single-use and expire after 24 hours. Adding an address to the allowlist does not grant workspace membership. Removing it prevents new registration; ban an existing member in the workspace if their access must be revoked.

## Operator checks

For local Compose, omit the production `--env-file ... -f ...` options below.

```powershell
docker compose --env-file .env.production -f deploy/compose.production.yaml ps
docker compose --env-file .env.production -f deploy/compose.production.yaml exec -T app node scripts/ops-status.mjs
docker compose --env-file .env.production -f deploy/compose.production.yaml logs --tail=100 app monitor
```

Investigate readiness failure immediately, backups older than 26 hours, event-loop p95 over 100 ms or app memory over 768 MiB. The status command exits nonzero for these conditions. Error references correlate with structured app logs; fixed error codes protect private data but intentionally do not contain full stack traces. Inspect browser developer tools locally when a client failure needs detailed debugging. Docker restarts crashed processes; it does not automatically restart a container solely because its health check is unhealthy. The separate monitor detects unreachable services and logs the change, but cannot notify you during total host/network failure. Monitor certificate expiry, free disk space and your public IP externally or manually as part of session setup.

No monitoring subscription is necessary, but paid-service-level uptime is not available from one home computer. Power, router, ISP or host failure makes the whole workspace unavailable. Before a planned update, tell coworkers to finish their conversations; clients reconnect, but users must rejoin their tables and turn devices on again.

## Backups and tested recovery

The app writes to a separate `backups` volume at startup and every 24 hours. Backups contain personal data, password hashes and session material; protect them like the live database. A volume on the same computer does not protect against computer/disk loss. Export an encrypted copy to a second device you own after important membership changes and before every release.

```powershell
docker compose --env-file .env.production -f deploy/compose.production.yaml exec -T app node scripts/backup.mjs create
docker compose --env-file .env.production -f deploy/compose.production.yaml exec -T app ls /app/backups
# Replace SNAPSHOT.sqlite with a real name from the preceding command.
docker compose --env-file .env.production -f deploy/compose.production.yaml exec -T app node scripts/backup.mjs verify /app/backups/SNAPSHOT.sqlite
docker compose --env-file .env.production -f deploy/compose.production.yaml cp app:/app/backups/SNAPSHOT.sqlite ./backups/SNAPSHOT.sqlite
```

Create the host `backups` directory first if needed. To restore, stop the app, create a new recovery file and leave the original intact:

```powershell
docker compose --env-file .env.production -f deploy/compose.production.yaml stop app
docker compose --env-file .env.production -f deploy/compose.production.yaml run --rm --no-deps app node scripts/backup.mjs restore-copy /app/backups/SNAPSHOT.sqlite /app/data/recovered.sqlite
```

Set `AUTH_DB_PATH=/app/data/recovered.sqlite` in `.env.production`, then run the production `up -d` command. The recovery tool refuses to overwrite a destination or its WAL sidecars. A restored lease may take at most 30 seconds to expire; Docker retries startup. Sign in, check workspace membership and moderation, then verify password recovery and a two-person call. A backup restores accounts but not in-memory conversations or seating. Reset compromised credentials separately; a backup is not incident cleanup.

## Releases and rollback

Before release: `npm ci --ignore-scripts`, `npm test`, `npm run build`, `npm audit --omit=dev --audit-level=high`, `npm run test:load`, verified backup, and browser/call checks. Do not change the admission cap based solely on this synthetic test.

Set a unique `CG_IMAGE_TAG` for each release (for example `friends-2026-10-09`). Build and start through the production Compose file. Keep the previous tagged image and its verified backup. To roll back, stop the app, select the previous tag, and run `up -d --no-build`. If a future release makes incompatible database changes, recover its matching pre-release backup to a new database path first. A rollback cannot recover ephemeral chat/presence. Keep source snapshots or a private Git repository; no remote repository has been created or pushed by this task.

## Go-live acceptance — still required on your network

- A friend on mobile data can open HTTPS and register only an allowlisted email; verification and password reset arrive.
- Two devices on different networks can join the same table, enable mic/camera/share, leave, reconnect after Wi-Fi interruption and remain signed in across an app restart.
- A third person outside the private table receives no table chat or media; a banned member cannot reconnect.
- Repeat a call with `RTC_RELAY_ONLY=true` temporarily to prove TURN works, then restore `false`. Test the actual networks your friends use.
- Gradually try 5, 10 and 20 friends. Watch frame rates, sound quality, host upload bandwidth, CPU, memory and monitor logs. Prefer microphones over simultaneous video on limited upload. The server cap is not a guarantee that every participant's device/network can run six-way video.
- Export a backup and recover it into a fresh database path before relying on the deployment.

For broader public traffic, the next architecture requires shared durable world authority, a shared authentication/rate-limit store, load-balancer routing and a WebRTC SFU, plus independently hosted monitoring and recovery. Simply adding app replicas or a Socket.IO adapter cannot make seat claims and private tables consistent. Those services and operational guarantees are beyond this free 20-person deployment.

## Conferencing expansion decision

This release keeps the existing six-person table mesh for the 20-online friends beta. Adaptive camera encoding, capped screen sharing and a paused 3D presentation view reduce client work without adding a paid service. A 20-person all-camera meeting is not implemented or validated.

The evaluated next architecture is a self-hosted SFU, such as [LiveKit](https://docs.livekit.io/reference/internals/livekit-sfu/), which receives publishers' tracks and forwards selected subscriptions. Self-hosted software still consumes host upload bandwidth, CPU and memory. Migration must provide server-issued short-lived tokens tied to the existing workspace/table membership, revoke subscriptions when users leave or are banned, retain private-table isolation, and test relay-only calls before enabling larger meetings. Merely adding an SFU container or raising the seat limit would not meet those requirements. No SFU service, external account or public port has been provisioned in this release.
