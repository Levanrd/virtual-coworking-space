import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { io } from "socket.io-client";
import { AuthStore, registrationFields } from "../server/auth.js";
import { createWorkspaceServer } from "../server/index.js";

const details = {
  fullName: "Test Worker",
  username: "test_worker",
  email: "worker@example.test",
  age: 28,
  password: "a-long-test-password!",
};
const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];
async function serverFor(t, options = {}) {
  const server = createWorkspaceServer({ authFile: ":memory:", ...options });
  await new Promise((resolve) => server.http.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.io.close(resolve)));
  const url = `http://127.0.0.1:${server.http.address().port}`;
  const api = (endpoint, body, cookie, headers = {}) =>
    fetch(`${url}/api/${endpoint}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const connect = (cookie) => {
    const client = io(url, {
      autoConnect: false,
      reconnection: false,
      transports: ["websocket"],
      extraHeaders: cookie ? { Cookie: cookie } : {},
    });
    t.after(() => client.disconnect());
    return client;
  };
  return { ...server, url, api, connect };
}

test("registration validates every required field and normalizes identity", () => {
  assert.deepEqual(Object.keys(registrationFields({}).fields).sort(), [
    "age",
    "email",
    "fullName",
    "password",
    "username",
  ]);
  for (const age of [0, 121, 3.5, "abc", null])
    assert.ok(registrationFields({ ...details, age }).fields.age);
  assert.ok(
    registrationFields({ ...details, username: "bad username" }).fields
      .username,
  );
  const result = registrationFields({
    ...details,
    fullName: "  Test   Worker  ",
    username: "TEST_Worker",
    email: "WORKER@EXAMPLE.TEST",
    age: "28",
  });
  assert.deepEqual(result.fields, {});
  assert.deepEqual(result.values, details);
});

test("accounts and hashed sessions survive restart without plaintext passwords or tokens", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "cg-auth-test-"));
  const filename = path.join(directory, "accounts.sqlite");
  let store;
  try {
    store = new AuthStore(filename);
    const { user } = await store.register(details);
    const session = store.createSession(user.id);
    const record = store.db.prepare("SELECT * FROM accounts").get();
    assert.notEqual(record.password_hash, details.password);
    assert.equal(record.password_hash.length, 128);
    assert.equal(record.password_salt.length, 32);
    assert.ok(!JSON.stringify(record).includes(details.password));
    assert.notEqual(
      store.db.prepare("SELECT token_hash FROM sessions").get().token_hash,
      session.token,
    );
    store.close();
    store = new AuthStore(filename);
    assert.equal(
      (
        await store.login({
          identifier: details.username,
          password: details.password,
        })
      ).user.id,
      user.id,
    );
    assert.equal(
      store.session({ headers: { cookie: `cg_session=${session.token}` } }).user
        .id,
      user.id,
    );
    assert.deepEqual(Object.keys(user).sort(), [
      "age",
      "email",
      "emailVerified",
      "fullName",
      "id",
      "username",
    ]);
  } finally {
    store?.close();
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("cg-auth-test-"));
    rmSync(directory, { recursive: true, force: true });
  }
});

test(
  "signup, session recovery, duplicate rejection, and username/email login",
  { timeout: 15000 },
  async (t) => {
    const { api } = await serverFor(t);
    assert.equal((await api("auth/me")).status, 401);
    const invalid = await api("auth/register", {});
    assert.equal(invalid.status, 400);
    assert.equal(Object.keys((await invalid.json()).fields).length, 5);
    const registered = await api("auth/register", details);
    assert.equal(registered.status, 201);
    assert.match(registered.headers.get("set-cookie"), /HttpOnly/);
    assert.match(registered.headers.get("set-cookie"), /SameSite=Lax/);
    assert.equal(registered.headers.get("cache-control"), "no-store");
    const account = (await registered.json()).user;
    const cookie = cookieOf(registered);
    assert.deepEqual(
      (await (await api("auth/me", undefined, cookie)).json()).user,
      account,
    );
    assert.equal((await api("rtc-config", undefined, cookie)).status, 200);
    assert.equal(
      (
        await api("auth/register", {
          ...details,
          username: "TEST_WORKER",
          email: "different@example.test",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await api("auth/register", {
          ...details,
          username: "different",
          email: "WORKER@EXAMPLE.TEST",
        })
      ).status,
      409,
    );
    const wrong = await api("auth/login", {
      identifier: details.username,
      password: "incorrect-password",
    });
    const unknown = await api("auth/login", {
      identifier: "unknown_worker",
      password: "incorrect-password",
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
    for (const identifier of ["TEST_WORKER", "WORKER@EXAMPLE.TEST"]) {
      const login = await api("auth/login", {
        identifier,
        password: details.password,
      });
      assert.equal(login.status, 200);
      assert.deepEqual((await login.json()).user, account);
    }
  },
);

test(
  "anonymous and forged sessions cannot access live workspaces or calling configuration",
  { timeout: 5000 },
  async (t) => {
    const { api, connect } = await serverFor(t);
    for (const cookie of [
      undefined,
      `cg_session=${"a".repeat(64)}`,
      "cg_session=invalid",
    ]) {
      assert.equal((await api("auth/me", undefined, cookie)).status, 401);
      assert.equal((await api("rtc-config", undefined, cookie)).status, 401);
      const client = connect(cookie);
      const denied = once(client, "connect_error");
      client.connect();
      assert.equal((await denied)[0].data.code, "UNAUTHORIZED");
      client.disconnect();
    }
  },
);

test(
  "account identity is authoritative and logout revokes HTTP and live socket access",
  { timeout: 8000 },
  async (t) => {
    const { api, connect, state } = await serverFor(t);
    const registration = await api("auth/register", details);
    const user = (await registration.json()).user;
    const cookie = cookieOf(registration);
    const client = connect(cookie);
    const connected = once(client, "connect");
    client.connect();
    await connected;
    await client
      .timeout(1500)
      .emitWithAck("enter", {
        accountId: "forged",
        username: "forged",
        profile: {
          accountId: "forged",
          username: "forged",
          email: details.email,
          age: 28,
        },
      });
    const member = state.users.get(client.id);
    assert.equal(member.accountId, user.id);
    assert.equal(member.username, details.username);
    assert.equal(member.email, undefined);
    assert.equal(member.age, undefined);
    assert.ok(
      !JSON.stringify(state.snapshot(member.space)).includes(details.email),
    );
    await client
      .timeout(1500)
      .emitWithAck("profile", {
        accountId: "forged",
        username: "forged",
        name: "Display name",
      });
    assert.equal(member.accountId, user.id);
    assert.equal(member.username, details.username);
    const disconnected = once(client, "disconnect");
    const logout = await api("auth/logout", {}, cookie);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    await disconnected;
    assert.equal(state.users.size, 0);
    assert.equal((await api("auth/me", undefined, cookie)).status, 401);
    const denied = once(client, "connect_error");
    client.connect();
    assert.equal((await denied)[0].data.code, "UNAUTHORIZED");
  },
);

test(
  "expired sessions disconnect live clients and cannot be reused",
  { timeout: 8000 },
  async (t) => {
    const { api, connect } = await serverFor(t, { sessionMs: 800 });
    const cookie = cookieOf(await api("auth/register", details));
    const client = connect(cookie);
    const connected = once(client, "connect");
    const disconnected = once(client, "disconnect");
    client.connect();
    await connected;
    await disconnected;
    assert.equal((await api("auth/me", undefined, cookie)).status, 401);
  },
);

test("cross-origin requests, non-JSON submissions, malformed bodies and repeated attempts are rejected", async (t) => {
  const { api, url } = await serverFor(t, { authRateLimit: 2 });
  assert.equal(
    (
      await api("auth/register", details, undefined, {
        Origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api("auth/register", details, undefined, {
        "Content-Type": "text/plain",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${url}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
    400,
  );
  assert.equal(
    (await api("auth/register", {}, undefined, { Origin: url })).status,
    400,
  );
  assert.equal((await api("auth/register", {})).status, 400);
  const limited = await api("auth/register", {});
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "900");
});
