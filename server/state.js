import { blankBoard, editBoard } from '../shared/collaboration.js';
import { randomUUID } from "node:crypto";
import { ROOMS, TABLES, seatPosition } from "../shared/world.js";
import {roomArrival} from '../shared/architecture.js';
import { APPEARANCE_DEFAULTS, GENDERS, OUTFITS } from '../shared/avatar.js';
import {
  standPosition,
  JUMP_DURATION,
  JUMP_COOLDOWN,
  isWalkable,
  WALK_SPEED,
} from "../shared/navigation.js";

export const cleanText = (value, limit = 80) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const hex = (value, fallback) =>
  /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
export function cleanProfile(profile = {}) {
  profile ??= {};
  return {
    name: cleanText(profile.name, 30) || "You",
    job: cleanText(profile.job, 50) || "Remote worker",
    color: hex(profile.color, "#8b73c4"),
    skin: hex(profile.skin, "#e5b18c"),
    hair: hex(profile.hair, "#49352e"),
    gender: GENDERS.includes(profile.gender) ? profile.gender : APPEARANCE_DEFAULTS.gender,
    outfit: OUTFITS.includes(profile.outfit) ? profile.outfit : APPEARANCE_DEFAULTS.outfit,
    pants: hex(profile.pants, APPEARANCE_DEFAULTS.pants),
    hairstyle: ["short", "bob", "bun"].includes(profile.hairstyle)
      ? profile.hairstyle
      : "short",
  };
}

export class WorldState {
  constructor() {
    this.users = new Map();
    this.tables = new Map();
    this.messages = new Map();
    this.joinRequests = new Map();
  }
  key(user, table = user.table) {
    return `${user.space}:${user.room}:${table || "room"}`;
  }
  add(id, data = {}) {
    const space =
      cleanText(data.space, 40)
        .replace(/[^a-z0-9-]/gi, "")
        .toLowerCase() || "common-ground";
    const room = ROOMS.some((r) => r.id === data.room) ? data.room : "studio";
    const user = {
      id,
      ...cleanProfile(data.profile),
      space,
      room,
      table: null,
      tableSession: null,
      seat: null,
      ...roomArrival(room),
      motionVersion: 0,
      jumpStartedAt: null,
      mic: false,
      camera: false,
      sharing: false,
      status: "available",
    };
    this.users.set(id, user);
    return user;
  }
  peers(user) {
    return [...this.users.values()].filter(
      (u) =>
        u.space === user.space &&
        u.room === user.room &&
        u.table === user.table &&
        u.table &&
        u.id !== user.id,
    );
  }
  canSignal(a, b) {
    return !!(
      a &&
      b &&
      a.space === b.space &&
      a.room === b.room &&
      a.table &&
      a.table === b.table
    );
  }
  table(user, tableId) {
    const key = this.key(user, tableId);
    if (!this.tables.has(key))
      this.tables.set(key, { private: false, owner: null, code: null });
    return this.tables.get(key);
  }
  release(user) {
    if (!user.table) return;
    const exit = standPosition(user.table, user.seat, user.room);
    const metadata = this.table(user, user.table);
    const peers = this.peers(user);
    if (metadata.owner === user.id) metadata.owner = peers[0]?.id || null;
    if (peers.length === 0) {
      metadata.private = false;
      metadata.code = null;
      this.messages.delete(this.key(user));
      delete metadata.board;
    }
    user.table = null;
    user.tableSession = null;
    user.seat = null;
    user.mic = false;
    user.camera = false;
    user.sharing = false;
    Object.assign(user, exit, {
      jumpStartedAt: null,
      motionVersion: user.motionVersion + 1,
    });
  }
  join(user, { table: tableId, seat, code } = {}) {
    const table = TABLES.find((t) => t.id === tableId);
    if (!table || !Number.isInteger(seat) || seat < 0 || seat >= table.seats)
      return { error: "Choose a valid seat." };
    const metadata = this.table(user, tableId);
    if (
      metadata.private &&
      user.table !== tableId &&
      cleanText(code, 50) !== metadata.code
    )
      return {
        error: "This table is private. Ask a member for the table code.",
        code: "PRIVATE",
      };
    const occupied = [...this.users.values()].some(
      (u) =>
        u.id !== user.id &&
        u.space === user.space &&
        u.room === user.room &&
        u.table === tableId &&
        u.seat === seat,
    );
    if (occupied)
      return { error: "Someone just took that seat. Choose another one." };
    if (user.table === tableId && user.seat === seat) return { ok: true };
    if (user.table !== tableId) {
      this.release(user);
      user.tableSession = randomUUID();
    }
    if (!metadata.owner) metadata.owner = user.id;
    Object.assign(user, {
      table: tableId,
      seat,
      ...seatPosition(tableId, seat, user.room),
      jumpStartedAt: null,
      motionVersion: user.motionVersion + 1,
    });
    return { ok: true };
  }
  jump(user, version, now = Date.now()) {
    if (user.table || version !== user.motionVersion)
      return { error: "Stand up before jumping." };
    if (
      user.jumpStartedAt !== null &&
      now - user.jumpStartedAt < (JUMP_DURATION + JUMP_COOLDOWN) * 1000
    )
      return { error: "Wait until you land before jumping again." };
    user.jumpStartedAt = now;
    return { ok: true };
  }
  move(user, position, now = Date.now()) {
    if (user.table || position.motionVersion !== user.motionVersion) return false;
    if (![position.x, position.z].every(Number.isFinite)) return false;
    const distance = Math.hypot(position.x - user.x, position.z - user.z);
    const elapsed = Math.min(1, Math.max(0, (now - (user.lastMoveAt ?? now - 250)) / 1000));
    const allowance = Math.min(1, (user.moveAllowance ?? 0.35) + elapsed * WALK_SPEED * 1.2);
    const steps = Math.max(1, Math.ceil(distance / 0.08));
    let valid = distance <= allowance;
    for (let step = 1; valid && step <= steps; step++) {
      valid = isWalkable(user.x + (position.x-user.x)*step/steps, user.z + (position.z-user.z)*step/steps, user.room);
    }
    user.lastMoveAt = now;
    if (!valid) {
      // A new movement version corrects optimistic clients without accepting a teleport.
      user.motionVersion++;
      return true;
    }
    user.moveAllowance = allowance - distance;
    user.x = position.x;
    user.z = position.z;
    if (Number.isFinite(position.rotation)) user.rotation = position.rotation % (Math.PI * 2);
    return true;
  }
  privacy(user, isPrivate) {
    if (!user.table) return { error: "Join a table first." };
    const metadata = this.table(user, user.table);
    if (metadata.owner !== user.id)
      return { error: "Only the table host can change privacy." };
    metadata.private = !!isPrivate;
    metadata.code = isPrivate ? randomUUID().slice(0, 8) : null;
    return { ok: true, code: metadata.code };
  }
  board(user) { return user?.table ? (this.table(user, user.table).board ||= blankBoard()) : null; }
  updateBoard(user, operation) {
    if (!user?.table) return { error: 'Join a table to use its shared board.' };
    if (operation?.session !== user.tableSession) return { error: 'Your table changed. Reopen the board.' };
    return editBoard(this.board(user), operation, user.id, this.table(user, user.table).owner, randomUUID());
  }
  requestJoin(user, targetId, now = Date.now()) {
    for (const [id, request] of this.joinRequests) if(request.expires < now) this.joinRequests.delete(id);
    const target = this.users.get(targetId);
    if (!target?.table || target.space !== user.space || target.id === user.id) return { error: 'This coworker is no longer at a table.' };
    if (target.status !== 'available') return { error: 'This coworker is focusing or away. Try later.' };
    const host = this.table(target, target.table).owner;
    if ([...this.joinRequests.values()].some(r => r.from === user.id)) return { error: 'Your previous request is still pending.' };
    const request = {id:randomUUID(), from:user.id, host, room:target.room, table:target.table, expires:now+60000};
    this.joinRequests.set(request.id,request);
    return {ok:true, request};
  }
  answerJoin(user, data, now = Date.now()) {
    const request = this.joinRequests.get(data?.id);
    if (!request || request.host !== user.id || request.expires < now) return {error:'This request has expired.'};
    this.joinRequests.delete(request.id);
    const guest = this.users.get(request.from);
    if (!guest || guest.space !== user.space || user.room !== request.room || user.table !== request.table || this.table(user,user.table).owner !== user.id) return {error:'The table has changed. Ask your friend to request again.'};
    return {ok:true, to:guest.id, invitation:data.accept ? {room:user.room,table:user.table,code:this.table(user,user.table).code || '',host:user.name} : null};
  }
  snapshot(space) {
    return {
      time: Date.now(),
      users: [...this.users.values()].filter((u) => u.space === space).map(({lastMoveAt, moveAllowance, ...user}) => user),
      tables: Object.fromEntries(
        ROOMS.map((room) => [
          room.id,
          Object.fromEntries(
            TABLES.map((table) => {
              const metadata = this.tables.get(
                `${space}:${room.id}:${table.id}`,
              );
              return [
                table.id,
                {
                  private: metadata?.private || false,
                  owner: metadata?.owner || null,
                },
              ];
            }),
          ),
        ]),
      ),
    };
  }
  chat(user, data = {}) {
    data ??= {};
    const text = cleanText(data.text, 1000);
    if (!text) return { error: "Write a message first." };
    if (
      !["room", "table"].includes(data.channel) ||
      (data.channel === "table" && !user.table)
    )
      return { error: "Join a table to use its chat." };
    const key = this.key(user, data.channel === "table" ? user.table : null);
    const message = {
      id: randomUUID(),
      userId: user.id,
      name: user.name,
      color: user.color,
      text,
      time: Date.now(),
      channel: data.channel,
    };
    const messages = this.messages.get(key) || [];
    messages.push(message);
    this.messages.set(key, messages.slice(-100));
    // Chat history lives only while a workspace has connected members.
    return { ok: true, message, key };
  }
  remove(id) {
    const user = this.users.get(id);
    if (!user) return;
    this.release(user);
    this.users.delete(id);
    for (const [key,r] of this.joinRequests) if(r.from===id || r.host===id) this.joinRequests.delete(key);
    if (![...this.users.values()].some((u) => u.space === user.space)) {
      for (const key of this.messages.keys())
        if (key.startsWith(`${user.space}:`)) this.messages.delete(key);
      for (const key of this.tables.keys())
        if (key.startsWith(`${user.space}:`)) this.tables.delete(key);
    }
  }
}
