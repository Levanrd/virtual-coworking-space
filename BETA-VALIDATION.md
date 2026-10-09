# Friends beta validation — 9 October 2026

Target: one self-hosted instance, 20 online connections, up to six callers per table. No external hosting account, public exposure or paid service was created.

| Check | Result |
| --- | --- |
| Automated suite | 64 passed, 0 failed (LAN call-recovery follow-up) |
| Production dependency audit | 0 reported vulnerabilities |
| Vite and Docker production build | Passed; Three.js chunk remains over Vite's 500 kB advisory threshold |
| Production Compose syntax | Passed with `config --quiet`; public services not started |
| Local Docker app | Running, ready, startup backup successful, no operational errors at final check |
| Backup/recovery | Integrity and schema checks, restored account login/membership, retention and refusal to overwrite recovery target passed |
| Browser | Sign-in, new motion updates, room change, seating, transport loss/reconnect, crash fallback and reload passed in disposable QA |
| Admission/security | Allowlist rejection, full-capacity rejection, event budget, telemetry authentication/redaction, seat exclusivity, table privacy and lease fencing passed |

Five-minute loopback load check on Node v24.21.0:

- 20 clients for 303.68 seconds; 98,340 movement packets.
- 6,000 acknowledged actions; p95 response **7.64 ms**.
- Event-loop p95 **33.51 ms**; final process memory **75.3 MiB**, including simulated clients.
- Estimated uncompressed application state outbound traffic **8.063 Mbps** with all twenty clients moving in one room. This excludes WebRTC and transport overhead; it is not measured ISP throughput.
- Twenty-first admission rejected, exactly one winner for concurrent seat claims, five reconnects passed.
- Raw reproducible output: `output/load-test.json`; rerun `npm run test:load`, or set `LOAD_SECONDS=300` for the longer check.

The load result came from the same machine running server and clients, not twenty physical browsers. It does not establish GPU performance, six-way video quality, internet latency or long-term availability. The final logging-only changes were covered by the 54-test suite and Docker rebuild; the soak process had already started before those logging changes.

Not validated: external HTTPS issuance, external SMTP delivery, internet TURN reachability, real friends on separate networks, production resource limits under real calls, ISP upload capacity, private-network sharing, off-device recovery or failover. Production preflight intentionally fails until the host's domain, public IP, email settings and registration allowlist are provided. See FRIENDS-BETA.md for the current runbook and the upstream-NAT alternative.

## Neighborhood release validation

- 61 tests pass, including eight-zone reachability, reciprocal thresholds, all 192 seat exits, geometry budgets, session-scoped board writes, ownership, safe links, bounded drawings, incremental patch convergence and host-only join approval.
- Real Socket.IO clients verify that outsiders receive no board updates and cannot spoof another table session; approved guests can join private tables through the invitation flow.
- Browser checks: desktop and 390 px mobile board layouts, notes, strokes, links, presentation controls, outdoor navigation and device setup. Mobile document width remains 390 px without horizontal overflow.
- Synthetic two-client browser calls exchange camera/audio/screen tracks. Camera and microphone replacement preserve connected/stable transports. Leaving during a deferred device switch ends the late capture; ordinary departure ends all captures. Device-check camera previews and microphone metering are local only. No physical mic, camera or screen was captured in this QA.
- A 30.49-second loopback repeat with 20 clients passed: 9,880 movement packets, 600 acknowledgements, p95 13.86 ms, event-loop p95 34.83 ms, 86.4 MiB including clients, estimated state traffic 8.242 Mbps. Capacity rejection, exclusive seating and five reconnects passed. The raw output/load-test.json now records this repeat; the five-minute measurements above are historical.
- Current media tests selected local host candidates. They do not certify TURN from a friend's network or a six-person video call. Larger SFU meetings, external HTTPS/SMTP, private overlay access and real-network testing remain separate deployment work.

Final browser and runtime checks for this release:
- Two browser sessions completed host approval and guest joining, loaded existing notes, and synchronized new notes, strokes and session goals. Host-only controls were absent for the guest.
- Café desktop sample after the frame cap: 16.7 ms per rendered frame, 126 draw calls, 103,456 triangles at Balanced quality on this machine. This is a spot check, not a low-end-device benchmark.
- Latest Docker build completed with zero reported production dependency vulnerabilities. App readiness is true, startup backup succeeded, and operational server/client error counters are zero.
- Browser console had no warnings or errors in the final QA session. Screenshots: output/neighborhood-cafe.png and output/shared-table-board.png.

## LAN call-recovery follow-up — 9 October 2026

- LAN Compose now defaults to relay-only WebRTC, using the host's authenticated TURN relay; explicit environment overrides are retained.
- Initial signaling recovery is armed at peer creation, covering calls that remain in the WebRTC `new` state after lost initial offers. Exhausted recovery reports offline.
- All 64 automated tests and the updated Docker build passed. The live app was restarted with the fix.
- Browser fault injection (`tests/media-harness.html?relay&dropInitial`) discarded initial SDP/ICE messages. The watchdog rebuilt the connection; both clients reached connected/stable, received synthetic audio/video and reported relay/UDP paths.
- Two different disposable accounts, in separate browser tabs on 127.0.0.1 and localhost, exchanged generated audio/video through `192.168.254.104:3478`. Selected relay-to-relay UDP paths showed increasing sent/received bytes, 3–4 ms sample RTT and 0% measured loss. A synthetic 360×220 screen stream reached the other account.
- These checks did not capture physical devices or play sound. They do not establish that the user's two physical devices now connect; both users must refresh and repeat the call. An exploratory raw-packet probe also failed to forward payloads, so it was not used as an acceptance test or added to startup. Basic STUN health is explicitly not treated as proof of a working call.
