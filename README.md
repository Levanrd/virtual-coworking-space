# Common Ground

A real-time virtual coworking space built in this folder. An original, furnished 3D office meets table-based voice, video, and chat.

For the free 20-person self-hosted deployment, operations and recovery procedures, start with [FRIENDS-BETA.md](FRIENDS-BETA.md).

For friends on the **same Wi-Fi**, run `npm run lan:up` to start HTTPS and print a shareable link. See [LAN-SETUP.md](LAN-SETUP.md) for the one-time certificate trust, Windows firewall setup, and local email verification.

## Same-Wi-Fi friends beta

**The LAN implementation and host Windows setup are complete.** On October 9, 2026, the Docker build and all **64 automated tests** passed. Host-side checks verified HTTPS certificate validation, app readiness, rejection of foreign origins, protection of the operations endpoint, the localhost redirect, and a UDP response from the call relay. The host has also successfully run the Windows firewall setup for `192.168.254.104` on Wi-Fi, scoped to the local subnet and the existing Public network profile. The generated certificate is confirmed in the host's current-user trusted root store.

**Still required:** trust the generated certificate on each friend's device and complete a real two-device session. A successful check on the host does not yet confirm a friend's microphone, camera, or connection. This setup provides a local-network link; public internet deployment remains separate.

### Start and share

Requires Docker Desktop running and Node.js 22.16+ on the host. In a terminal in this project folder:

```powershell
npm run lan:up
```

The command builds the app, detects your private Wi-Fi address, starts HTTPS and the call relay, waits for service health, and prints **Share this link**. The address at the latest setup was **https://192.168.254.104:8443**. Always use the address printed by the command, since your router may assign a different IP later.

The link and certificate fingerprints are also saved to `output/lan/SHARE.txt`. Keep the host computer and Docker running while friends are connected. LAN mode preserves the existing Docker accounts and backups; `http://localhost:8080` redirects to the HTTPS address. Signing in again may be necessary because the address changed.

### One-time setup and joining

1. **Trust the certificate on the host.** Already completed on the current host. On a new host or Windows user account, run the command below from this folder and approve the Windows certificate confirmation. Restart the browser if needed.

   ```powershell
   powershell -NoProfile -File scripts/lan-trust.ps1
   ```

2. **Trust the certificate on each friend's device.** Send `output/lan/common-ground-root.crt` and the fingerprint from `SHARE.txt`. Follow the Windows, macOS, iPhone/iPad, Android or Firefox instructions in [LAN-SETUP.md](LAN-SETUP.md). Browsers need a trusted HTTPS connection for microphone and camera access; each user still grants normal device permissions.

3. **Allow LAN traffic on the host.** This has already succeeded on the current host. For a new host or changed Wi-Fi IP, open **PowerShell as Administrator** in the project folder and run:

   ```powershell
   powershell -NoProfile -File scripts/lan-firewall.ps1
   ```

   The rules allow TCP 8443, TCP/UDP 3478, and UDP 45000–45100 only on the selected interface, current network profile, host IP, and local subnet. The script does not change the network profile or router settings. Use this setup on your trusted home network. The guide includes commands to remove the rules and certificate trust.

4. **Join and verify accounts.** Friends open the printed HTTPS link on the same Wi-Fi and register or sign in. Email is captured locally, so the host opens http://localhost:8025 and privately sends each friend only their own verification link. Mailpit does not deliver to real inboxes. Keep the inbox private. Use **Invite** in the app to add friends to your private workspace.

5. **Test together.** On two separate devices, enter the same workspace, sit at the same table, enable microphone/camera, test supported screen sharing, and check reconnect behavior. Guest Wi-Fi or router client isolation can block devices even when they use the same router. Capacity is configured for 20 online users, with up to six callers per table; real-device performance still needs validation.

### LAN commands

| Command | Purpose |
| --- | --- |
| `npm run lan:up` | Build/start LAN mode and print the sharing link |
| `npm run lan:up -- --ip 192.168.254.104` | Choose an address currently assigned to this computer when automatic selection is ambiguous |
| `npm run lan:link` | Check HTTPS readiness and print the current link again |
| `npm run lan:down` | Stop LAN mode while preserving accounts, backups and certificates |
| `npm run lan:local` | Restore the original localhost-only Docker setup |

If the host's IP changes, rerun `lan:up`, rerun the firewall script as Administrator, and share the new link. The certificate authority persists, so an IP change alone does not require installing a new root certificate. Use `lan:local` to switch back instead of mixing the local and LAN Compose configurations. Do not use `docker compose down -v` unless you intend to delete persisted data.

LAN calls default to the host's authenticated relay to avoid waiting for blocked direct device connections. Both callers should refresh and rejoin their table after updating. An initial-signaling watchdog now retries calls that would otherwise remain stuck on connecting. See [call troubleshooting](LAN-SETUP.md#calls-stuck-on-connecting) for audio playback checks and configuration overrides. Separate-account browser tests exchanged synthetic audio, video and screen sharing through the LAN relay; real-device confirmation is still required.

## Neighborhood and coworking tools

- **Rooms** now includes the courtyard, Corner café, pocket park, and nature retreat. The studio's courtyard exit connects to the outdoor paths. The courtyard has a central fountain; the café has sheltered conversation circles; the park has picnic clearings; the retreat has woodland and a distant pond. Only the current zone is built, with lightweight destination previews, instanced trees, distance-based foliage detail, and procedural contact shading.
- **More → Camera & microphone** selects devices, tests a private camera preview or microphone meter, and switches live call devices. Tests do not publish tracks. Camera quality adapts to measured RTT/loss and table size, with a combined camera upload target of at most 1.8 Mbps across peers. Screen sharing is separately capped at 800 kbps per peer and 15 fps where supported. These are encoder targets, not a total network bandwidth guarantee.
- **Expand call** opens speaker/presentation or gallery view. Click a tile to pin it; shared screens take priority when nothing is pinned. Connection quality, RTT and packet loss appear in this view. Incoming sound continues through the meeting tray, avoiding duplicate playback.
- **Table board** shares drawings, sticky notes, resource links and a host-set session goal. Updates are incremental, bounded and restricted to table members. Only the author or host can remove an item; only the host can clear drawings. Export a JSON copy before the last person leaves: boards are deliberately ephemeral, like table chat, and are not included in account backups.
- **More → Find people** searches the entire campus, shows room/table and availability, and allows a request to join a friend's table. Hosts accept or decline; guests explicitly join after acceptance. Requests expire after a minute. Focus/away users cannot be targeted. No device is enabled by joining.
- **React** includes animated waving, applause, nodding and stretching. A speaking indicator uses measured audio activity when the browser exposes it. Reduced-motion preferences disable gesture motion. **Soundscapes** optionally adds local surface-aware footsteps and outdoor birds; effects stop during calls and incoming-audio mute.

Calls remain table-scoped, with six seats per table and 20 online connections. There is no automatic proximity microphone activation. Internet access and a tested relay still require the setup in FRIENDS-BETA.md; an outdoor map does not change these deployment requirements.

## Run locally

Requires Node.js 22.16+ (uses built-in SQLite and online backups).

```sh
npm install
npm run dev
```

Open http://localhost:5173. The React app runs on port 5173 and the multiplayer server on port 3001. Vite proxies WebSocket and API traffic to the server.

Create an account or sign in first. Registration asks for full name, username, email, age, and a password of at least 12 characters. Login accepts username or email. Sign out from **Settings → Account**.

Open the same URL in two browsers or tabs to try multiplayer. Use separate browser profiles for separate accounts. Create private workspaces through **More → Workspace**. Owners/moderators issue single-use invitations through **Invite**; a workspace address alone does not grant access. See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker, verification emails, TURN tests, and launch preparation.

## Docker on this computer only

For sharing with friends, use the LAN instructions above. If LAN mode is currently active, run `npm run lan:local` to restore this configuration first.

```sh
npm run docker:setup
docker compose up --build -d
```

Open http://localhost:8080 and the local test inbox at http://localhost:8025. The stack includes the app, Mailpit, and coturn; verification is required. Docker accounts use their own persistent volume. `docker compose down` preserves it. This setup is bound to localhost and does not publish the app to the internet.

## What works

- Registration, username/email login, sign-out, persistent accounts, and seven-day login sessions. Live workspaces and calling configuration require authentication.
- Spatial Campus fills the screen with a third-person world and a floating call dock. Walk through the labeled doorways to change rooms, or use the Rooms menu. Hold WASD/arrow keys to walk, drag to look, Q/R to rotate, and scroll to zoom. More includes Reset camera and Fullscreen. Touch devices have a walking pad and drag-to-look controls. Floor clicks walk toward a destination; furniture blocks walking and the camera pulls in around obstacles.
- Nearby empty chairs show an E · Sit prompt. Press E or click the prompt to take that seat; private tables still require their invite code. Rooms → Browse tables also provides an accessible seat picker.
- Sitting reveals the Table Lounge tray with real participant video or avatar placeholders, table chat, privacy, media controls, and Stand up. The tray collapses without ending the call or unmounting incoming audio. Stand up releases the chair and ends the table call. No demo coworkers or fake camera feeds are displayed.
- Articulated avatars with walking arm/leg swings, bent-knee sitting, and synchronized jumps. Press Space or the on-screen Jump button to jump. While seated, Space or Stand up gets you up in a clear spot beside your chair; Leave table does the same. Chair footprints block walking, seat changes clear jumps, and stale movement packets cannot undo a chair transition. Jump height and cooldown are fixed by the server; jumping does not let you pass through furniture.
- Live characters and presence, exclusive server-controlled seats, and table switching.
- Name, job, shirt color, skin tone, hair color, and hairstyle customization; saved on the current device.
- Room chat and table chat, with server-enforced room/workspace/table boundaries.
- Table-only WebRTC microphone, camera, and screen sharing, incoming audio mute, and reactions. Devices start off and stop when leaving a table or room.
- Host-controlled private tables with an eight-character invite code. Codes are only provided to seated members; the host role transfers if the host disconnects.
- Focus timer and focus presence, private ambient sound, personal schedule, coworker search, and light/dark/system themes.
- Responsive controls keep microphone, camera, chat, More, and Stand up visible on narrow screens. Extra call controls are under More. Character editing is available from the top-right avatar; search, schedule, soundscapes, focus timer, and account settings are in More.

Only signed-in, connected users appear in the office, people list, and online counts.

### Room architecture and rendering

Each room has its own floor plan: an L-shaped studio, oval focus room, twin-bay lounge, and irregular garden deck. A shared outline drives architecture, walking boundaries, doorways and server-authoritative arrivals. Doors occupy different walls and face arrivals into the destination. Textured finishes, glazing, rooflights and continuous thresholds use locally generated materials. Repeated foliage uses instancing; static furniture is merged by material and seat identity. Tests cover all 192 chairs across eight zones and enforce fewer than 400 meshes and 400,000 triangles per room.

**More → Settings & account → 3D graphics** offers Automatic, Low, Balanced and High. The preference is saved on the device and changes rendering without rebuilding the room or interrupting a call. Automatic starts conservatively, measures foreground frame pacing after warm-up and adjusts resolution/shadows with hysteresis. Low disables dynamic shadows and caps pixel ratio at 0.85; Balanced uses 512px shadows and a 1.15 cap; High uses 1024px shadows and a 1.5 cap. Rendering is capped at 60 fps (30 in Low mode). Hidden tabs and the expanded call view pause 3D rendering while calls stay connected. Camera perimeter checks prevent clipping through glazing and terrace rails while leaving doorways open.

Avatars now have sculpted hairstyles, ears, expressive faces, hoodie and sneaker details, and subtle idle movement (disabled with reduced motion). Nearby seat changes preserve the camera focus and camera turning eases along the shortest angle. Decorative foliage and signs do not push the camera into the character. Development builds expose frame timing, draw-call count, and triangle count on the scene surface's data attributes for profiling; these are not shown in the UI.

## Production build

```sh
npm run build
npm start
```

The Node server serves `dist/`, API routes, and Socket.IO at http://localhost:3001. Set `PORT` to change the port. Deploy the Node application behind an HTTPS reverse proxy that supports WebSocket upgrade requests. This project is local; it has not been deployed to a public service.

### Calls across networks

Browsers require a secure context for device capture: localhost works for development, and HTTPS is required for remote devices. A LAN HTTP address can test avatars and chat, but camera/microphone will generally be unavailable.

The default ICE configuration includes a Google STUN server. For reliable connections across restrictive networks, configure your own TURN relay before starting the server:

```sh
TURN_URL=turn:your-relay.example.com:3478
TURN_USERNAME=your-username
TURN_CREDENTIAL=your-credential
```

Static TURN credentials remain supported for development. For deployment use comma-separated `TURN_URLS` and `TURN_SECRET`; `/api/rtc-config` generates account-scoped credentials valid for one hour. The client refreshes configuration and retries failed or stalled ICE negotiation at most twice. `RTC_RELAY_ONLY=true` forces relay use for testing. WebRTC uses a peer mesh, with a maximum of six seats per table.

## Persistence and access model

Accounts and login sessions are stored in `data/accounts.sqlite`, which is excluded from Git. Set `AUTH_DB_PATH` to use another persistent location. Back up this database and protect it as private account data. Passwords use salted scrypt hashes; session tokens are stored as hashes and sent to the browser in HttpOnly, SameSite cookies. Logout and session expiry revoke live connections. Registration/login attempts are rate-limited, and browser requests are checked for matching origins. Email and age are only returned to the account owner, never included in public coworker presence.

For HTTPS deployment, set `APP_ORIGIN` to the exact public origin and `NODE_ENV=production`; cookies become Secure and verified email is mandatory. Password reset and email verification use expiring single-use links, SMTP delivery, and hashed token storage. Reset revokes all sessions. See the production Docker/Caddy template and required settings in [DEPLOYMENT.md](DEPLOYMENT.md).

Presence, private-table metadata, and chat are kept in server memory; an empty table clears its table chat, an empty workspace clears its live data, and a server restart resets presence and chat. Accounts, sessions, membership, invitations, reports, and moderation logs persist in SQLite. Avatar profiles and personal schedules are saved per account on the current browser; theme is a device preference. Private workspace membership is checked in HTTP and live socket actions. Reconnecting releases the seat, clears chat history locally, and keeps media off until explicitly enabled again.

Membership authorization, owner/moderator controls, reporting, and deployment templates are implemented. Actual public hosting, real email delivery, production TURN/TLS provisioning, monitoring, backups, and different-device/network acceptance tests remain launch requirements.

## Verification

```sh
npm test
npm run build
```

Tests cover camera-relative movement, diagonal speed, frame-rate independence, room bounds and desk collisions; registration validation, password/session storage, account persistence, duplicate accounts, login, cookie recovery, anonymous access rejection, rate limits, request origins, logout and session expiry, private account fields, seat conflicts, profile validation, private-table codes and host transfer, table/room/workspace isolation, media signal authorization, chat cleanup, and actual authenticated multiplayer Socket.IO clients. Tests use isolated databases.

With the dev server running, sign in to the main app, then open http://localhost:5173/tests/media-harness.html to exercise two real WebRTC clients with generated camera, audio, and screen tracks. Append `?relay` to require TURN. This development-only harness never captures physical devices and mutes all playback; it is excluded from the production image.

The latest October 9, 2026 run passed **64 automated tests**, including movement and camera behavior, eight-zone geometry and seat access, account recovery and authorization, authenticated multiplayer flows, shared table tools, backups, capacity enforcement, and LAN address selection. The Docker build passed with the existing Three.js chunk-size advisory. LAN HTTPS, proxy security, localhost redirect and host-to-relay UDP checks also passed. See [LAN-SETUP.md](LAN-SETUP.md) for LAN validation limits and [BETA-VALIDATION.md](BETA-VALIDATION.md) for earlier browser and load-test evidence.

Earlier browser checks verified live Low/High changes, saved preferences, studio seating/standing, directional room arrival, and graphics controls at 390px without horizontal overflow. Historical synthetic relay-only checks received audio/video and a 360×220 screen stream; a client at another table received no media and could not enter a private table without a code. Disconnect/reconnect cleared seats and kept media off; table exit ended captured tracks. The most recent Docker dependency audit reported zero known vulnerabilities at the time it ran.

These local tests use generated media, not physical microphones/cameras or separate networks. Low-end-device FPS, real touch gestures, public TURN reachability and real-device/network acceptance remain unverified. The earlier October 8 checks also covered three-person relay calls, TURN restart recovery, and verification/reset email delivery through Mailpit.

For disposable browser QA, `node tests/browser-server.mjs` starts a loopback-only server on port 3007 with an in-memory account (`browserqa` / `Local-browser-check-2026`). Start Vite on port 5175 with `CG_API_TARGET=http://127.0.0.1:3007`, sign in at `http://127.0.0.1:5175`, then use the development harnesses. Stop both processes afterward; the account disappears. The server and harnesses are excluded from Docker images and production builds.

Built with React, Vite, Three.js, Express, Socket.IO, Phosphor Icons, and locally bundled DM Sans. All 3D furniture and characters are generated in code, with no third-party 3D assets.
