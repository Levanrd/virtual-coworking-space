# Share Common Ground on the same Wi-Fi

This is a free, local-network setup for up to 20 online friends (six people per call table). Your computer and Docker Desktop must stay running. No domain, public hosting or router port forwarding is needed. Guest Wi-Fi/client isolation can prevent devices from reaching one another.

## Start and get the link

With Docker Desktop running, open a terminal in this folder:

```powershell
npm run lan:up
```

The command detects your private Wi-Fi IPv4 address, builds the app, starts HTTPS and a LAN TURN relay, checks HTTPS with certificate verification, and prints **Share this link**. It also writes `output/lan/SHARE.txt` and `output/lan/common-ground-root.crt`. For example, the link looks like `https://192.168.254.104:8443`.

If there is more than one physical network to choose from:

```powershell
npm run lan:up -- --ip 192.168.254.104
```

Use an address currently assigned to your computer. Run `npm run lan:link` to print the link again. If DHCP changes your IP, rerun `lan:up`, share the new link, and rerun the host firewall script below. The retained certificate authority means friends do not need to trust a new certificate just because the IP changed.

LAN mode replaces the localhost Docker configuration while retaining the same account and backup volumes. `http://localhost:8080` redirects to the HTTPS address. You may need to sign in again because this is a different browser origin. Live calls restart during the switch.

## One-time certificate trust on every device

Caddy creates a local certificate authority in a persistent Docker volume. Only the public root certificate is exported. Send `common-ground-root.crt` directly to your friends along with the SHA-256 fingerprint printed by the startup command. Verify the fingerprint before trusting it. Trusting this CA allows certificates issued by this host to be accepted on that device; remove it when you no longer use this setup. Never share Docker's CA private keys.

HTTPS alone is not sufficient: the certificate must be trusted for browsers to offer microphone/camera access. Do not bypass certificate warnings or disable browser security. Once trusted, each user still grants normal camera/microphone permission.

- **Windows host:** from this project folder run `powershell -NoProfile -File scripts/lan-trust.ps1`. This trusts only this generated root in the current Windows user's certificate store. Restart the browser if needed. Undo with the same command plus `-Remove`.
- **Windows friends:** check `certutil -hashfile common-ground-root.crt SHA256` against the host's **Certificate file SHA-256**. Open the received `.crt` file, choose **Install Certificate → Current User → Place all certificates in the following store → Trusted Root Certification Authorities**. Remove the matching certificate from `certmgr.msc` when finished.
- **macOS:** import the `.crt` into Keychain Access, open its Trust section, and trust it for SSL. Remove the imported certificate when finished.
- **iPhone/iPad:** transfer and install the certificate profile in Settings, then enable it under **General → About → Certificate Trust Settings**. Installing the profile alone does not enable SSL trust. Remove the profile to undo this. [Apple's instructions](https://support.apple.com/en-us/102390).
- **Android:** install the file as a **CA certificate** under your device's security/encryption/credentials settings (the exact menu depends on the device). Restart the browser and verify the page is secure. Managed devices and some browsers may prohibit user-added CAs; do not disable their security protections.
- **Firefox:** if the Windows/macOS system trust is not picked up, import this certificate under Firefox's certificate Authorities settings for identifying websites.

See [Caddy's local HTTPS documentation](https://caddyserver.com/docs/automatic-https) for how local certificates and trust work.

## Host firewall, if friends cannot connect

On your trusted home Wi-Fi, in an **Administrator PowerShell** opened in this project folder:

```powershell
powershell -NoProfile -File scripts/lan-firewall.ps1
```

The script allows TCP 8443 (HTTPS), TCP/UDP 3478 and UDP 45000–45100 (call relay), only on that interface's current Public or Private profile, bound to the host's current Wi-Fi IP and from the local subnet. It does not change the network profile, disable the firewall, expose Mailpit or open router ports. Use this only on your trusted home network and remove the rules before moving to another network. It requires Windows administrator privileges. Undo with `powershell -NoProfile -File scripts/lan-firewall.ps1 -Remove`.

If a second device still cannot connect, check that it is on the same non-guest Wi-Fi, disable neither device's security, and check router AP/client isolation. Docker Desktop/Hyper-V or third-party firewall policy may also require approval for inbound Docker traffic. A successful check on the host does not prove access from a second device.

## Accounts and verification

Local email is captured by Mailpit, **not delivered to real email inboxes**. After a friend registers, the host opens `http://localhost:8025`, finds that friend's verification email, and privately gives them only their own verification link. Keep the inbox private: it contains verification and password-reset links for all accounts. Old emails created before LAN mode may contain localhost links; request a fresh verification email from the HTTPS app.

After signing in, use **Invite** for friends to join your private workspace. The LAN URL itself does not grant workspace membership. The public shared workspace remains governed by the app's existing behavior; LAN mode is intended for a trusted home network.

## Calls stuck on connecting

LAN mode now defaults to authenticated relay-only calls (`RTC_RELAY_ONLY=true`) so calls use the host rather than waiting on direct device paths that a firewall or Wi-Fi configuration may block. A deliberate `RTC_RELAY_ONLY=false` entry in `.env` overrides this default; remove that override or change it to `true` when troubleshooting LAN calls, then run `npm run lan:up`.

After an update, both callers should refresh the page, sit at the same table again, and turn their microphones on. On Windows use Ctrl+Shift+R to reload the current version. If the browser shows a play button on a participant's tile, click it to allow incoming audio. Check that incoming sound is not muted. **Expand call** shows each participant's connection quality.

Initial call signaling now has a 15-second watchdog even if the connection never reaches the connecting state. It retries with fresh transports; exhausted recovery shows offline rather than leaving the quality label on connecting indefinitely. Leaving and rejoining the table starts a fresh attempt and keeps devices off until you enable them again.

If it still fails, record both device/browser types and the connection status shown under Expand call. A working website and a basic STUN response alone do not prove that audio/video can flow.

## Stop or switch back

```powershell
npm run lan:down   # Stop the LAN stack; keep accounts/backups/certificates
npm run lan:local  # Start the original localhost-only configuration
```

Use these commands rather than mixing the two Compose files. Do not add `-v` to a Docker down command: that deletes persisted data and the CA. `lan:local` removes the LAN proxy and binds the app/relay back to loopback. Optional firewall rules and device certificate trust remain until explicitly removed.

## Validation limits

Validated on this host on 2026-10-09: all 64 automated tests passed; Docker build and repeated `lan:up` succeeded with the same CA; HTTPS verified both certificate chain and IP identity without SNI; localhost redirects correctly; foreign origins are rejected; `/api/ops` is hidden by the proxy; and the TURN server answered a UDP STUN request through the Wi-Fi address. A health check now gates startup on the TURN server. The Windows firewall command requires a separate Administrator terminal, and certificate trust requires the Windows confirmation dialog.

The startup check validates the HTTPS chain, IP identity and app readiness from the host using the exported CA. It does not install trust on friends' devices or prove two-device voice/video. Test with a second device: register/verify, accept a workspace invite, sit at the same table, allow mic/camera, test screen sharing where the browser supports it, and reconnect after briefly turning Wi-Fi off. This setup is for the same LAN; it does not create a public internet link.

Call follow-up on 2026-10-09: two separate disposable accounts in separate browser tabs exchanged generated audio/video through the actual LAN TURN address using relay-to-relay UDP; selected-pair counters increased in both directions, with 3–4 ms sampled RTT and 0% measured packet loss. A generated 360×220 shared screen arrived at the second account. Deliberately dropping all initial SDP/ICE messages also recovered automatically through the new watchdog. These browser checks ran on the host; separate physical devices and audible playback still need confirmation from the two callers.
