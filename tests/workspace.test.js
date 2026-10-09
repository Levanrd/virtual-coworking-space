import test from "node:test";
import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { WorldState } from "../server/state.js";
import { createWorkspaceServer } from "../server/index.js";
import {roomArrival} from '../shared/architecture.js';
import {
  standPosition,
  JUMP_DURATION,
  JUMP_COOLDOWN,
} from "../shared/navigation.js";

test("chair transitions reset jumps, preserve seat ownership, and exit beside the chair", () => {
  const state = new WorldState(),
    user = state.add("sitter");
  assert.equal(state.jump(user, user.motionVersion, 1000).ok, true);
  assert.ok(state.jump(user, user.motionVersion, 1100).error);
  assert.equal(
    state.jump(
      user,
      user.motionVersion,
      1000 + (JUMP_DURATION + JUMP_COOLDOWN) * 1000,
    ).ok,
    true,
  );
  state.join(user, { table: "design", seat: 0 });
  assert.equal(user.jumpStartedAt, null);
  assert.ok(state.jump(user, user.motionVersion).error);
  const version = user.motionVersion;
  state.join(user, { table: "design", seat: 0 });
  assert.equal(user.motionVersion, version);
  state.join(user, { table: "design", seat: 1 });
  assert.ok(user.motionVersion > version);
  const expected = standPosition("design", 1);
  state.release(user);
  assert.deepEqual({ x: user.x, z: user.z, rotation: user.rotation }, expected);
  const after = user.motionVersion;
  state.release(user);
  assert.equal(user.motionVersion, after);
  assert.ok(state.jump(user, version).error);
});

test("seat claims are exclusive and invalid seats cannot change a membership", () => {
  const state = new WorldState();
  const a = state.add("a");
  const b = state.add("b");
  assert.equal(state.join(a, { table: "design", seat: 0 }).ok, true);
  assert.match(
    state.join(b, { table: "design", seat: 0 }).error,
    /took that seat/,
  );
  assert.equal(b.table, null);
  assert.ok(state.join(a, { table: "design", seat: 9 }).error);
  assert.equal(a.seat, 0);
  assert.equal(state.join(b, { table: "design", seat: 1 }).ok, true);
});

test("private table codes are never published and only the host can lock a table", () => {
  const state = new WorldState();
  const host = state.add("host");
  const guest = state.add("guest");
  const outsider = state.add("outsider");
  state.join(host, { table: "design", seat: 0 });
  state.join(guest, { table: "design", seat: 1 });
  assert.ok(state.privacy(guest, true).error);
  const locked = state.privacy(host, true);
  assert.ok(locked.code);
  assert.equal(
    state.join(outsider, { table: "design", seat: 2 }).code,
    "PRIVATE",
  );
  assert.equal(
    state.join(outsider, { table: "design", seat: 2, code: "wrong" }).code,
    "PRIVATE",
  );
  assert.equal(
    JSON.stringify(state.snapshot(host.space)).includes(locked.code),
    false,
  );
  assert.equal(
    state.join(outsider, { table: "design", seat: 2, code: locked.code }).ok,
    true,
  );
  state.remove("host");
  assert.equal(state.table(guest, "design").owner, "guest");
  state.remove("guest");
  state.remove("outsider");
  assert.equal(state.tables.size, 0);
});

test("audio signaling and messages are isolated by table, room, and workspace", () => {
  const state = new WorldState();
  const a = state.add("a");
  const b = state.add("b");
  const c = state.add("c", { room: "focus" });
  const d = state.add("d", { space: "another-team" });
  state.join(a, { table: "design", seat: 0 });
  state.join(b, { table: "builders", seat: 0 });
  state.join(c, { table: "design", seat: 0 });
  state.join(d, { table: "design", seat: 0 });
  assert.equal(state.canSignal(a, b), false);
  assert.equal(state.canSignal(a, c), false);
  assert.equal(state.canSignal(a, d), false);
  state.join(b, { table: "design", seat: 1 });
  assert.equal(state.canSignal(a, b), true);
  assert.equal(
    state.chat(a, { channel: "table", text: "Private hello" }).ok,
    true,
  );
  assert.equal(state.messages.get(state.key(c)), undefined);
  assert.equal(
    state.chat(a, { channel: "unknown", text: "Not delivered" }).error,
    "Join a table to use its chat.",
  );
  state.release(a);
  assert.equal(a.mic, false);
  assert.equal(state.canSignal(a, b), false);
  state.release(b);
  assert.equal(state.messages.size, 0);
});

test("profile input is bounded and unexpected fields do not override server identity", () => {
  const state = new WorldState();
  const a = state.add("a", {
    profile: {
      id: "forged",
      name: "n".repeat(100),
      color: "url(javascript:alert(1))",
      mic: true,
      table: "design",
      skin: "#123456",
    },
  });
  assert.equal(a.id, "a");
  assert.equal(a.name.length, 30);
  assert.equal(a.color, "#8b73c4");
  assert.equal(a.skin, "#123456");
  assert.equal(a.mic, false);
  assert.equal(a.table, null);
});

function eventually(check, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for real-time event."));
      }
    }, 15);
  });
}

test(
  "real socket clients synchronize seats, scoped chat, privacy, and disconnects",
  { timeout: 10000 },
  async () => {
    const server = createWorkspaceServer({ authFile: ":memory:" });
    await new Promise((resolve) => server.http.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.http.address().port}`;
    const clients = [];
    try {
      for (let i = 0; i < 3; i++) {
        const response = await fetch(`${url}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: `Test User ${i}`,
            username: `testuser${i}`,
            email: `test${i}@example.test`,
            age: 28,
            password: "testing-long-password",
          }),
        });
        assert.equal(response.status, 201);
        clients.push(
          connect(url, {
            autoConnect: false,
            transports: ["websocket"],
            extraHeaders: {
              Cookie: response.headers.get("set-cookie").split(";")[0],
            },
          }),
        );
      }
      await Promise.all(
        clients.map(
          (c) =>
            new Promise((resolve, reject) => {
              c.on("connect", resolve);
              c.on("connect_error", reject);
              c.connect();
            }),
        ),
      );
      const [a, b, c] = clients;
      const snapshots = [];
      const receivedB = [];
      const receivedC = [];
      const signalsB = [];
      const signalsC = [];
      b.on("world", (w) => snapshots.push(w));
      b.on("message", (m) => receivedB.push(m));
      c.on("message", (m) => receivedC.push(m));
      b.on("signal", (s) => signalsB.push(s));
      c.on("signal", (s) => signalsC.push(s));
      for (const [i, client] of clients.entries())
        assert.equal(
          (
            await client
              .timeout(2000)
              .emitWithAck("enter", { profile: { name: `Test ${i}` } })
          ).ok,
          true,
        );
      await eventually(() => snapshots.some((w) => w.users.length === 3));
      const ownReactions=[], peerReactions=[];
      a.on('reaction',data=>ownReactions.push(data));
      b.on('reaction',data=>peerReactions.push(data));
      assert.equal((await a.emitWithAck('reaction','wave')).ok,true);
      await eventually(()=>peerReactions.length===1);
      assert.deepEqual(ownReactions,[{id:a.id,reaction:'wave',room:'studio'}]);
      assert.deepEqual(peerReactions,ownReactions);
      assert.ok((await a.emitWithAck('reaction','heart')).error,'Rate-limited sends are acknowledged');
      assert.ok((await b.emitWithAck('reaction','invalid')).error);
      assert.equal(peerReactions.length,1);
      assert.equal(
        (await a.emitWithAck("join-table", { table: "design", seat: 0 })).ok,
        true,
      );
      assert.ok(
        (await b.emitWithAck("join-table", { table: "design", seat: 0 })).error,
      );
      assert.equal(
        (await b.emitWithAck("join-table", { table: "design", seat: 1 })).ok,
        true,
      );
      assert.equal(
        (await c.emitWithAck("join-table", { table: "builders", seat: 0 })).ok,
        true,
      );
      const boardsB=[],boardsC=[];
      b.on('board-update',data=>boardsB.push(data));c.on('board-update',data=>boardsC.push(data));
      assert.equal((await a.emitWithAck('board-edit',{session:server.state.users.get(a.id).tableSession,type:'note',text:'A private table idea'})).ok,true);
      await eventually(()=>boardsB.length===1);
      assert.equal(boardsC.length,0);
      assert.equal(boardsB[0].patch.item.text,'A private table idea');
      assert.ok((await c.emitWithAck('board-edit',{session:server.state.users.get(a.id).tableSession,type:'note',text:'Cannot spoof a session'})).error);
      await a.emitWithAck("chat", { channel: "table", text: "Only our table" });
      await eventually(() => receivedB.length === 1);
      assert.equal(receivedC.length, 0);
      a.emit("signal", {
        to: b.id,
        description: { type: "offer", sdp: "test signal" },
      });
      a.emit("signal", {
        to: c.id,
        description: { type: "offer", sdp: "blocked" },
      });
      await eventually(() => signalsB.length === 1);
      assert.equal(signalsC.length, 0);
      a.emit('signal',{to:b.id,restart:'11111111-1111-4111-8111-111111111111'});
      a.emit('signal',{to:c.id,restart:'11111111-1111-4111-8111-111111111111'});
      await eventually(()=>signalsB.length===2);
      assert.equal(signalsB[1].restart,'11111111-1111-4111-8111-111111111111');
      assert.equal(signalsC.length,0);
      const locked = await a.emitWithAck("privacy", true);
      assert.ok(locked.code);
      assert.equal(
        (await c.emitWithAck("join-table", { table: "design", seat: 2 })).code,
        "PRIVATE",
      );
      assert.equal(
        (
          await c.emitWithAck("join-table", {
            table: "design",
            seat: 2,
            code: locked.code,
          })
        ).ok,
        true,
      );
      const requests=[],answers=[];
      a.on('join-request',r=>requests.push(r));b.on('join-answer',r=>answers.push(r));
      await b.emitWithAck('leave-table',null);
      assert.equal((await b.emitWithAck('request-join',a.id)).ok,true);
      await eventually(()=>requests.length===1);
      assert.equal((await a.emitWithAck('answer-join',{id:requests[0].id,accept:true})).ok,true);
      await eventually(()=>answers.length===1);
      assert.equal((await b.emitWithAck('join-invited',answers[0].invitation)).ok,true);
      a.disconnect();
      await eventually(() => snapshots.at(-1)?.users.length === 2);
      assert.equal(snapshots.at(-1).tables.studio.design.owner, b.id);
      const oldVersion = server.state.users.get(c.id).motionVersion;
      assert.ok(
        (await c.emitWithAck("jump", { motionVersion: oldVersion })).error,
      );
      await c.emitWithAck("leave-table", null);
      const standing = server.state.users.get(c.id);
      const exit = standPosition("design", 2);
      c.emit("move", { x: 7, z: 6, rotation: 0, motionVersion: oldVersion });
      // An acknowledged event is a barrier for the preceding stale movement packet.
      await c.emitWithAck("profile", { name: "Standing worker", gender: 'female', outfit: 'shirt', pants: '#d6c6af' });
      await eventually(() => snapshots.at(-1)?.users.some(u => u.id === c.id && u.gender === 'female' && u.outfit === 'shirt' && u.pants === '#d6c6af'));
      assert.equal(standing.x, exit.x);
      assert.equal(standing.z, exit.z);
      assert.equal(
        (await c.emitWithAck("jump", { motionVersion: standing.motionVersion }))
          .ok,
        true,
      );
      await eventually(() =>
        snapshots.at(-1)?.users.some((u) => u.id === c.id && u.jumpStartedAt),
      );
      assert.ok(
        (await c.emitWithAck("jump", { motionVersion: standing.motionVersion }))
          .error,
      );
      c.emit("move", {
        x: standing.x,
        z: standing.z,
        y: 999,
        motionVersion: standing.motionVersion,
      });
      await c.emitWithAck("profile", { name: "Standing worker" });
      assert.equal(standing.y, undefined);
      await c.emitWithAck("join-table", {
        table: "design",
        seat: 2,
        code: locked.code,
      });
      assert.equal(standing.jumpStartedAt, null);
      // Room changes must use the reciprocal doorway and face into its interior.
      for(const room of ['lounge','focus','terrace','studio']) {
        const expected=roomArrival(room,standing.room),version=standing.motionVersion;
        assert.equal((await c.emitWithAck('room',room)).ok,true);
        assert.equal(standing.x,expected.x);assert.equal(standing.z,expected.z);
        assert.equal(standing.rotation,expected.rotation);assert.equal(standing.table,null);
        assert.ok(standing.motionVersion>version);assert.equal(standing.mic,false);
      }
    } finally {
      clients.forEach((c) => c.disconnect());
      await new Promise((resolve) => server.io.close(resolve));
    }
  },
);
