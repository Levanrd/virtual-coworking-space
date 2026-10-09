import {applyBoardPatch} from '../shared/collaboration.js';
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {createReactionFeed} from './reactions.js';
import { APPEARANCE_DEFAULTS } from '../shared/avatar.js';

export {readSaved, save} from './storage.js';
export const DEFAULT_PROFILE = {
  ...APPEARANCE_DEFAULTS,
  name: "You",
  job: "Remote worker",
  color: "#8b73c4",
  skin: "#e5b18c",
  hair: "#49352e",
  hairstyle: "short",
};

export function useWorkspace(profile, notify) {
  const socketRef = useRef(null);
  const profileRef = useRef(profile);
  const roomRef = useRef("studio");
  profileRef.current = profile;
  const [world, setWorld] = useState({ users: [], tables: {} });
  const [selfId, setSelfId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState({ room: [], table: [] });
  const [board, setBoard] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const joinRequest=joinRequests[0]||null;
  const setJoinRequest=()=>setJoinRequests(previous=>previous.slice(1));
  useEffect(()=>{const timer=setInterval(()=>setJoinRequests(previous=>{
    const remaining=previous.filter(request=>request.expires>Date.now());return remaining.length===previous.length?previous:remaining;
  }),1000);return()=>clearInterval(timer);},[]);
  const [invitation, setInvitation] = useState(null);
  const boardScope = useRef(null);
  const [reactions, setReactions] = useState({});
  const space =
    new URLSearchParams(window.location.search).get("space") || "common-ground";
  useEffect(() => {
    const socket = io({ autoConnect: false });
    const reactionFeed = createReactionFeed(setReactions);
    let retryTimer, restarting = false;
    const retryConnection = () => {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => socket.connect(), 8000 + Math.random() * 4000);
    };
    const enter = () => socket.emit('enter', { space, room: roomRef.current, profile: profileRef.current }, result => {
      if (result.ok) {
        setSelfId(result.id);
        setConnected(true);
        restarting = false;
      } else {
        notify(result.error);
        if (result.code === 'FORBIDDEN') window.dispatchEvent(new Event('cg-access-revoked'));
        if (result.code === 'CAPACITY') {
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => { if (socket.connected) enter(); }, 10000 + Math.random() * 5000);
        }
      }
    });
    socketRef.current = socket;
    socket.on('connect', () => { clearTimeout(retryTimer); enter(); });
    socket.on('server-restarting', () => {
      restarting = true;
      notify('The workspace is restarting. You will reconnect automatically.');
    });
    const requireAuth = () =>
      window.dispatchEvent(new Event("cg-auth-required"));
    socket.on("auth-expired", requireAuth);
    socket.on("connect_error", (error) => {
      if (["UNAUTHORIZED", "EMAIL_UNVERIFIED"].includes(error.data?.code)) requireAuth();
      else if (['CAPACITY', 'RESTARTING'].includes(error.data?.code)) { notify(error.message); retryConnection(); }
    });
    socket.on('access-revoked', ({message}) => {
      notify(message);
      window.dispatchEvent(new Event('cg-access-revoked'));
    });
    socket.on("disconnect", (reason) => {
      setConnected(false);
      setWorld({ users: [], tables: {} });
      setHistory({ room: [], table: [] });
      setSelfId(null);
      setBoard(null);setJoinRequests([]);setInvitation(null);boardScope.current=null;
      reactionFeed.clear();
      clearTimeout(retryTimer);
      if (reason === 'io server disconnect') {
        if (restarting) retryConnection();
        else requireAuth();
      }
    });
    socket.on("world", (data) => {
      reactionFeed.prune(data.users);
      const receivedAt = performance.now();
      setWorld({
        ...data,
        users: data.users.map((user) => ({
          ...user,
          snapshotTime: data.time,
          receivedAt,
        })),
      });
    });
    socket.on('board', data => {boardScope.current = data.table ? `${data.room}:${data.table}` : null; setBoard(data.board);});
    socket.on('board-update', data => {
      const scope=`${data.room}:${data.table}`;
      if(boardScope.current === scope) setBoard(previous => {
        if(data.patch.revision <= (previous?.revision??-1))return previous;
        const updated=applyBoardPatch(previous,data.patch);
        if(!updated)queueMicrotask(()=>socket.emit('board-read',null,result=>{if(result.ok&&boardScope.current===scope)setBoard(current=>result.board.revision>=(current?.revision??-1)?result.board:current);}));
        return updated||previous;
      });
    });
    socket.on('join-request', request=>setJoinRequests(previous=>[...previous.filter(r=>r.id!==request.id&&r.expires>Date.now()),request].slice(-20)));
    socket.on('join-answer', data => { if(data.invitation) setInvitation(data.invitation); else notify('Your table request was declined.'); });
    socket.on("history", setHistory);
    socket.on('motion', data => {
      const receivedAt = performance.now();
      const updates = new Map(data.users.map(user => [user.id, user]));
      setWorld(previous => ({ ...previous, users: previous.users.map(user => {
        const update = updates.get(user.id);
        return update && update.motionVersion >= user.motionVersion
          ? { ...user, ...update, snapshotTime: data.time, receivedAt } : user;
      }) }));
    });
    socket.on("message", (message) =>
      setHistory((prev) => ({
        ...prev,
        [message.channel]: [...prev[message.channel], message].slice(-100),
      })),
    );
    socket.on("reaction", reactionFeed.receive);
    socket.connect();
    return () => {
      socket.disconnect();
      clearTimeout(retryTimer);
      reactionFeed.clear();
    };
  }, [space]);
  const self = world.users.find((u) => u.id === selfId);
  if (self) roomRef.current = self.room;

  async function action(event, data) {
    const socket = socketRef.current;
    if (!socket?.connected) {
      const error = "Reconnecting to your workspace. Try again in a moment.";
      notify(error);
      return { error };
    }
    try {
      const result = await socket.timeout(7000).emitWithAck(event, data);
      if (result.error && result.code !== "PRIVATE") notify(result.error);
      return result;
    } catch {
      notify("The server did not respond. Please try again.");
      return { error: "Connection timeout." };
    }
  }
  return {
    board, joinRequest, setJoinRequest, invitation, setInvitation,
    world,
    self,
    selfId,
    connected,
    history,
    reactions,
    space,
    socketRef,
    action,
  };
}
