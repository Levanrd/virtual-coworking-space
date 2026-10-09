import {DeviceCheck,Conference} from './Conference.jsx';
import TableBoard from './TableBoard.jsx';
import CharacterEditor from "./CharacterEditor.jsx";
import RoomGuide from './RoomGuide.jsx';
import GraphicsSettings from './GraphicsSettings.jsx';
import useLoungeMusic from './useLoungeMusic.js';
import LoungeMusicControls from './LoungeMusicControls.jsx';
import RoomTransition from './RoomTransition.jsx';
import {createRoomTransition} from './roomTransition.js';
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ChatCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarBlank,
  CaretDown,
  CaretRight,
  Check,
  Circle,
  Coffee,
  Copy,
  DoorOpen,
  DotsThree,
  GearSix,
  Headphones,
  Heart,
  Info,
  Leaf,
  LockSimple,
  MagnifyingGlass,
  Microphone,
  MicrophoneSlash,
  Minus,
  Moon,
  MusicNote,
  Palette,
  PaperPlaneTilt,
  Pause,
  Play,
  Plus,
  Question,
  SignOut,
  SlidersHorizontal,
  Smiley,
  Sparkle,
  SquaresFour,
  Sun,
  Timer,
  User,
  UserPlus,
  Users,
  VideoCamera,
  VideoCameraSlash,
  Waveform,
  X,
  Monitor,
  HandWaving,
} from "@phosphor-icons/react";
import WorldScene from "./WorldScene.jsx";
import { ROOMS, roomTables } from "../shared/world.js";
import {
  DEFAULT_PROFILE,
  readSaved,
  save,
  useWorkspace,
} from "./useWorkspace.js";
import useMedia from "./useMedia.js";
import {validProfile, validSettings, validEvents} from './storage.js';

const roomIcons = {
  studio: SquaresFour,
  focus: Headphones,
  lounge: Coffee,
  terrace: Leaf,
};
const REACTIONS = [
  { id: "nod", icon: Check, text: "Nod", glyph: "👍" },
  { id: "stretch", icon: User, text: "Stretch", glyph: "🙆" },
  { id: "wave", icon: HandWaving, text: "Say hello", glyph: "👋" },
  { id: "heart", icon: Heart, text: "Send love", glyph: "💜" },
  { id: "clap", icon: Sparkle, text: "Celebrate", glyph: "👏" },
  { id: "coffee", icon: Coffee, text: "Coffee break", glyph: "☕" },
];

function nextSessionTime() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function MiniAvatar({ profile, size = "", className = "" }) {
  return (
    <div
      className={`mini-avatar ${size} ${className}`}
      style={{
        "--shirt": profile.color,
        "--skin": profile.skin,
        "--hair": profile.hair,
      }}
      aria-hidden="true"
    >
      <span className={`avatar-head ${profile.hairstyle}`}>
        <i />
        <i />
      </span>
      <span className="avatar-body" />
    </div>
  );
}
function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const modal = ref.current;
    const focusables = () =>
      [
        ...modal.querySelectorAll("button,input,select,textarea,a[href]"),
      ].filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const backdrop = modal.parentElement;
    const host = backdrop.parentElement;
    const inert = new Map();
    const isolate = () => {
      if (!backdrop.isConnected) return;
      for (const el of host.children) {
        if (el === backdrop || el.classList.contains("toast")) continue;
        if (!inert.has(el)) inert.set(el, el.inert);
        el.inert = true;
      }
    };
    isolate();
    const observer = new MutationObserver(isolate);
    observer.observe(host, { childList: true });
    focusables()[0]?.focus();
    function keyboard(e) {
      if (e.key === "Escape") { e.preventDefault(); close.current(); }
      if (e.key === "Tab") {
        const items = focusables();
        const first = items[0],
          last = items.at(-1);
        if (!items.includes(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      observer.disconnect();
      document.body.style.overflow = overflow;
      inert.forEach((value, el) => { el.inert = value; });
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <button
          className="modal-close icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
function VideoTile({ stream, muted, label, active, onBlocked, profile, mic, quality, speaking }) {
  const ref = useRef(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream || null;
      if (stream)
        ref.current
          .play()
          .then(() => setNeedsPlay(false))
          .catch((error) => {
            if (!muted && error.name === "NotAllowedError") setNeedsPlay(true);
          });
    }
  }, [stream, muted]);
  return (
    <div className={`video-tile ${active ? "" : "audio-only"} ${speaking ? "is-speaking" : ""}`}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        aria-hidden={!active}
      />
      {!active && (
        <div className="audio-placeholder">
          {profile ? <MiniAvatar profile={profile}/> : <User size={22} />}
        </div>
      )}
      {needsPlay && (
        <button
          className="resume-audio"
          aria-label={`Play ${label}’s call audio`}
          onClick={() =>
            ref.current
              .play()
              .then(() => setNeedsPlay(false))
              .catch(() => onBlocked?.())
          }
        >
          <Play size={20} weight="fill" />
        </button>
      )}
      <span>{label}{quality && <small className={`call-quality ${quality}`} title="Connection quality"> · {quality}</small>}</span>
      {profile && <i className={`tile-mic ${mic ? "on" : ""}`}>{mic ? <Microphone size={13}/> : <MicrophoneSlash size={13}/>}</i>}
    </div>
  );
}

import { WorkspacePicker, WorkspaceInvite, ModerationPanel, ReportForm } from './WorkspaceAccess.jsx';

export default function App({ account, onLogout, loggingOut, authError, workspaceAccess }) {
  const [roomTransition,setRoomTransition]=useState(null);
  const [roomNavigator]=useState(()=>createRoomTransition({onChange:setRoomTransition,
    reduced:()=>matchMedia('(prefers-reduced-motion: reduce)').matches,
    onTimeout:()=>notify('The room is taking longer to load. Please try again if it does not appear.'),
  }));
  useEffect(()=>()=>roomNavigator.dispose(),[roomNavigator]);
  const [profile, setProfile] = useState(() =>
    readSaved(`cg-profile:${account.id}`, {
      ...DEFAULT_PROFILE,
      name: account.fullName.slice(0, 30),
    }, validProfile),
  );
  const [settings, setSettings] = useState(() =>
    readSaved("cg-settings", { theme: "system", graphics: "auto" }, validSettings),
  );
  const [activeGraphics, setActiveGraphics] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const notify = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  const workspace = useWorkspace(profile, notify);
  const { world, self, connected, history, space, socketRef, action } =
    workspace;
  const call = useMedia(socketRef, self, world.users, notify);
  const [selected, setSelected] = useState("design");
  const [panelTab, setPanelTab] = useState("chat");
  const [chatChannel, setChatChannel] = useState("room");
  const [chatDrafts, setChatDrafts] = useState({});
  const draftKey = `${self?.id}:${self?.room}:${chatChannel === 'table' ? self?.tableSession || self?.table : 'room'}`;
  const message = chatDrafts[draftKey] || '';
  const setMessage = update => setChatDrafts(previous => {
    const next = {...previous, [draftKey]: typeof update === 'function' ? update(previous[draftKey] || '') : update};
    return Object.fromEntries(Object.entries(next).slice(-40));
  });
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [modal, setModal] = useState(null);
  const [draft, setDraft] = useState(profile);
  const [search, setSearch] = useState("");
  const [privateJoin, setPrivateJoin] = useState(null);
  const [privateCode, setPrivateCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [hostCode, setHostCode] = useState(null);
  const [deafened, setDeafened] = useState(false);
  const [reactionMenu, setReactionMenu] = useState(false);
  const [ambient, setAmbient] = useState(false);
  const audio = useRef(null);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [focusEnd, setFocusEnd] = useState(null);
  const [events, setEvents] = useState(() =>
    readSaved(`cg-events:${account.id}`, [], validEvents),
  );
  const [eventTitle, setEventTitle] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [mobilePanel, setMobilePanel] = useState(false);
  const [trayCollapsed, setTrayCollapsed] = useState(false);
  const chatEnd = useRef(null);
  const sceneControls = useRef(null);
  const room = ROOMS.find((r) => r.id === self?.room) || ROOMS[0];
  const roomUsers = world.users.filter((u) => u.room === room.id);
  const tables = roomTables(room.id);
  const table = tables.find((t) => t.id === selected) || tables[0];
  const metadata = world.tables[room.id]?.[selected] || {};
  const ownMetadata = world.tables[room.id]?.[self?.table] || {};
  const seated = self?.table === selected;
  const tableUsers = roomUsers.filter((u) => u.table === selected);
  const tablePeers = roomUsers.filter(
    (u) => self?.table && u.table === self.table && u.id !== self.id,
  );
  const messages = history[chatChannel] || [];
  const onlineCount = world.users.length;
  const loungeMusic = useLoungeMusic({active:room.id==='lounge'&&!deafened,ducked:!!tablePeers.length||call.media.mic});

  useEffect(() => {
    save("cg-settings", settings);
    const system = matchMedia("(prefers-color-scheme: dark)");
    const setTheme = () =>
      (document.documentElement.dataset.theme =
        settings.theme === "system"
          ? system.matches
            ? "dark"
            : "light"
          : settings.theme);
    setTheme();
    system.addEventListener("change", setTheme);
    return () => system.removeEventListener("change", setTheme);
  }, [settings]);
  useEffect(() => {
    const list = chatEnd.current?.parentElement;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, chatChannel, modal]);
  useEffect(() => {
    if (modal === "schedule" && !eventTime) setEventTime(nextSessionTime());
  }, [modal]);
  useEffect(() => {
    if (!self?.table) {setChatChannel("room");setModal(current => ["conference","board"].includes(current)?null:current); }
    else {
      setSelected(self.table);
      setChatChannel("table");
    }
    setHostCode(null);
    setTrayCollapsed(false);
  }, [self?.table, self?.room]);
  useEffect(() => {
    if (!focusRunning || !focusEnd) return;
    const update = () => {
      const left = Math.max(0, Math.ceil((focusEnd - Date.now()) / 1000));
      setFocusSeconds(left);
      if (!left) {
        setFocusRunning(false);
        socketRef.current?.emit("status", "available");
        notify("That’s a wrap. Time to stretch and take a break.");
      }
    };
    const timer = setInterval(update, 1000);
    update();
    return () => clearInterval(timer);
  }, [focusRunning, focusEnd]);
  useEffect(() => {
    if (!ambient || deafened || room.id === 'lounge') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    const buffer = context.createBuffer(
      1,
      context.sampleRate * 4,
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.025) / 1.025;
      data[i] = last * 3;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    const gain = context.createGain();
    gain.gain.value = call.media.mic || tablePeers.length ? .025 : .11;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start();
    context.resume();
    audio.current = context;
    return () => {
      source.stop();
      context.close();
      audio.current = null;
    };
  }, [ambient, room.id, deafened, call.media.mic, tablePeers.length]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  async function joinSeat(tableId, seat, code = "") {
    const result = await action("join-table", { table: tableId, seat, code });
    if (result.code === "PRIVATE") {
      setModal(null);
      if (code)
        setCodeError(
          "That code didn’t match. Ask a table member for the current code.",
        );
      else {
        setPrivateJoin({ table: tableId, seat });
        setPrivateCode("");
        setCodeError("");
      }
      return;
    }
    if (result.ok) {
      setSelected(tableId);
      setPrivateJoin(null);
      setModal(null);
      setPanelTab("chat");
      notify("You’re at the table. Make yourself at home.");
    } else if (code) setCodeError(result.error);
  }
  async function joinFirst() {
    const seat = Array.from({ length: table.seats }, (_, i) => i).find(
      (i) => !tableUsers.some((u) => u.seat === i),
    );
    if (seat === undefined)
      return notify("This table is full. There’s room at another one.");
    await joinSeat(table.id, seat);
  }
  async function changeRoom(id) {
    if (id === self?.room || !ROOMS.some(r=>r.id===id)) return;
    setModal(null);
    const result = await roomNavigator.start(id, self?.room, () => action("room", id));
    if (result.ok) {
      setSelected("design");
      setMobilePanel(false);
    }
  }
  async function sendMessage(e) {
    e.preventDefault();
    if (!message.trim() || sendingRef.current) return;
    const submitted = message;
    sendingRef.current = true;
    setSending(true);
    try {
      const result = await action("chat", { text: submitted, channel: chatChannel });
      if (result.ok) setMessage(current => current === submitted ? "" : current);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  async function applyProfile(e) {
    e.preventDefault();
    const next = {
      ...draft,
      name: draft.name.trim() || "You",
      job: draft.job.trim() || "Remote worker",
    };
    const result = await action("profile", next);
    if (result.ok) {
      setProfile(next);
      const persisted = save(`cg-profile:${account.id}`, next);
      setModal(null);
      notify(persisted ? "Looking good. Your profile is updated." : "Profile updated for this session. Browser storage is unavailable, so it won’t be saved on this device.");
    }
  }
  async function privacyToggle() {
    const result = await action("privacy", !metadata.private);
    if (result.ok) {
      setHostCode(result.code);
      notify(
        result.code
          ? "Your table is private. Share the code with your guests."
          : "Your table is open to everyone.",
      );
    }
  }
  async function copy(text, success = "Copied to clipboard.") {
    try {
      await navigator.clipboard.writeText(text);
      notify(success);
    } catch {
      notify(
        "Clipboard access is unavailable. Select and copy the link below.",
      );
    }
  }
  async function openInvite() {
    setModal("invite");
    if (self?.table) {
      const result = await action("table-code", null);
      setHostCode(result.code);
    }
  }
  function toggleFocus() {
    if (focusRunning) {
      setFocusRunning(false);
      socketRef.current?.emit("status", "available");
    } else {
      if (focusSeconds === 0) setFocusSeconds(1500);
      setFocusEnd(Date.now() + (focusSeconds || 1500) * 1000);
      setFocusRunning(true);
      socketRef.current?.emit("status", "focus");
    }
  }
  function addEvent(e) {
    e.preventDefault();
    const timestamp = new Date(eventTime).getTime();
    if (
      !eventTitle.trim() ||
      !Number.isFinite(timestamp) ||
      timestamp <= Date.now()
    )
      return notify("Add a title and a future start time.");
    const next = [
      ...events,
      {
        id: crypto.randomUUID(),
        title: eventTitle.trim(),
        time: timestamp,
        room: room.id,
      },
    ].sort((a, b) => a.time - b.time);
    setEvents(next);
    const persisted = save(`cg-events:${account.id}`, next);
    setEventTitle("");
    setEventTime("");
    notify(persisted ? "Your session is on your personal schedule." : "Session added for now. Browser storage is unavailable, so it won’t be saved on this device.");
  }
  const inviteURL = new URL(window.location.href);
  inviteURL.search = "";
  inviteURL.searchParams.set("space", space);
  inviteURL.hash = "";
  const filteredPeople = world.users.filter((u) =>
    `${u.name} ${u.job}`.toLowerCase().includes(search.toLowerCase()),
  );
  const focusTime = `${String(Math.floor(focusSeconds / 60)).padStart(2, "0")}:${String(focusSeconds % 60).padStart(2, "0")}`;

  return (
    <div data-room={room.id} className={`campus-shell ${self?.table ? "is-seated" : "is-exploring"} ${trayCollapsed ? "tray-collapsed" : ""}`}>
      <main className="campus-world" aria-label="Virtual coworking campus" aria-busy={!!roomTransition}>
        <WorldScene controlRef={sceneControls} room={room} users={roomUsers} self={self} tables={world.tables[room.id]} selected={selected}
          paused={modal==='conference'} speaking={call.speaking} soundEnabled={ambient&&!deafened&&!call.media.mic&&!tablePeers.length}
          graphics={settings.graphics} onQualityChange={setActiveGraphics}
          transitioning={!!roomTransition} onRoomReady={roomNavigator.ready}
          onSelect={(id) => { setSelected(id); setModal("seat"); }} onSeat={joinSeat}
          onMove={(position) => socketRef.current?.emit("move", position)} onJump={(data) => action("jump", data)}
          onStand={() => action("leave-table", null)} onRoom={changeRoom} reactions={workspace.reactions} onHelp={() => setModal("help")} />
      </main>
      <RoomTransition transition={roomTransition}/>
      <header className="campus-header">
        <button className="campus-brand" onClick={() => setModal("rooms")} aria-label="Common Ground — choose a room">
          <strong>common ground<span>.</span></strong><span className="campus-location"><i className={`status-dot ${connected ? "" : "offline-dot"}`}/>{room.name} · {connected ? roomUsers.length + " here" : "Reconnecting…"}<CaretDown size={13}/></span>
        </button>
        <nav className="campus-actions" aria-label="Campus navigation">
          <button aria-label="Rooms" onClick={() => setModal("rooms")}><SquaresFour size={18}/><span>Rooms</span></button>
          <button onClick={openInvite} aria-label="Invite coworkers"><UserPlus size={18}/><span>Invite</span></button>
          <button className="campus-profile" aria-label="Edit my character" title="My character" onClick={() => {setDraft(profile);setModal("profile");}}><MiniAvatar profile={self || profile}/></button>
        </nav>
      </header>
      <RoomGuide room={room.id} people={roomUsers.length} focusTime={focusTime} focusRunning={focusRunning} onAction={() => setModal(room.id === "focus" ? "focus" : "tables")}>
        {room.id==='lounge'&&<LoungeMusicControls music={loungeMusic}/>}
      </RoomGuide>
      {focusRunning && room.id!=="focus" && <button className="campus-focus" onClick={() => setModal("focus")}><Timer size={16}/>{focusTime} · Focusing</button>}
      <section className="campus-call" aria-label={self?.table ? "Table Lounge meeting controls" : "Call controls"}>
        {self?.table && <>
          <div className="lounge-summary"><span className="lounge-eyebrow">YOUR TABLE</span><h2>{tables.find(t => t.id === self.table)?.name}</h2><p><LockSimple size={14}/>Only your table can hear you</p>
            <button className="lounge-privacy" onClick={() => {setSelected(self.table);setModal("seat");}}>{ownMetadata.private ? <LockSimple size={14}/> : <Users size={14}/>} {ownMetadata.private ? "Private table" : "Open table"}<CaretRight size={13}/></button>
          </div>
          <div className="lounge-videos" aria-label="Table video call">
            <VideoTile stream={call.localStream} muted label="You" active={call.media.camera} onBlocked={notify} profile={self || profile} mic={call.media.mic}/>
            {call.media.sharing && (
              <VideoTile
                stream={call.localScreen}
                muted
                label="Your screen"
                active
              />
            )}
            {tablePeers.map((u) => (
              <VideoTile
                key={u.id}
                stream={call.remote[u.id]?.stream}
                muted={deafened}
                label={u.name}
                profile={u}
                quality={call.health[u.id]?.quality} speaking={!!call.speaking[u.id]}
                mic={u.mic}
                active={u.camera}
                onBlocked={() =>
                  notify(
                    "Your browser paused call audio. Click Sound on to enable it.",
                  )
                }
              />
            ))}
            {tablePeers
              .filter((u) => u.sharing)
              .map((u) => (
                <VideoTile
                  key={`${u.id}-screen`}
                  stream={call.remote[u.id]?.screen}
                  muted
                  label={`${u.name}’s screen`}
                  active
                />
              ))}

            {tablePeers.length === 0 && <div className="lounge-empty"><Users size={23}/><span>Room for your people</span><button onClick={openInvite}>Invite a coworker <ArrowUpRight size={14}/></button></div>}
          </div>
          <div className="lounge-actions"><button onClick={() => setModal("conference")}><Monitor size={20}/>Expand call</button><button onClick={() => setModal("board")}><Palette size={20}/>Table board</button><button onClick={() => {setChatChannel("table");setModal("conversation");}}><ChatCircle size={20}/>Table chat</button><button onClick={() => setModal("table-people")}><Users size={20}/>People <span>{tablePeers.length + 1}</span></button></div>
          <button className="tray-toggle" aria-label={trayCollapsed ? "Expand meeting tray" : "Collapse meeting tray"} aria-expanded={!trayCollapsed} onClick={() => setTrayCollapsed(v => !v)}><CaretDown size={18}/></button>
        </>}
          <div className="call-controls">
            <button
              className={`media-button ${call.media.mic ? "enabled" : ""}`}
              disabled={call.busy}
              onClick={() => call.toggle("mic")}
              aria-label={
                call.media.mic ? "Turn microphone off" : "Turn microphone on"
              }
              title={
                call.media.mic ? "Turn microphone off" : "Turn microphone on"
              }
            >
              {call.media.mic ? (
                <Microphone size={21} />
              ) : (
                <MicrophoneSlash size={21} />
              )}
              <span>Mic {call.media.mic ? "on" : "off"}</span>
            </button>
            <button
              className={`media-button ${call.media.camera ? "enabled" : ""}`}
              disabled={call.busy}
              onClick={() => call.toggle("camera")}
              aria-label={
                call.media.camera ? "Turn camera off" : "Turn camera on"
              }
            >
              {call.media.camera ? (
                <VideoCamera size={22} />
              ) : (
                <VideoCameraSlash size={22} />
              )}
              <span>Camera {call.media.camera ? "on" : "off"}</span>
            </button>
            <button
              className={`media-button seated-control ${call.media.sharing ? "enabled" : ""}`}
              disabled={call.busy}
              onClick={() => call.toggle("sharing")}
              aria-label={
                call.media.sharing ? "Stop screen sharing" : "Share screen"
              }
            >
              <Monitor size={21} />
              <span>
                {call.media.sharing ? "Stop sharing" : "Share screen"}
              </span>
            </button>
            <span className="controls-divider" />
            <button
              className={`media-button seated-control ${deafened ? "enabled" : ""}`}
              onClick={() => setDeafened((v) => !v)}
              aria-label={
                deafened
                  ? "Unmute incoming call audio"
                  : "Mute incoming call audio"
              }
            >
              <Headphones size={21} />
              <span>{deafened ? "Deafened" : "Sound on"}</span>
            </button>
            <div className="reaction-control seated-control">
              <button
                className={`media-button ${reactionMenu ? "enabled" : ""}`}
                onClick={() => setReactionMenu((v) => !v)}
                aria-label="Send a reaction"
                aria-expanded={reactionMenu}
              >
                <Smiley size={21} />
                <span>React</span>
              </button>
              {reactionMenu && (
                <div className="reaction-menu">
                  {REACTIONS.map((r) => (
                    <button
                      key={r.id}
                      aria-label={r.text}
                      title={r.text}
                      onClick={() => {
                        action("reaction", r.id);
                        setReactionMenu(false);
                      }}
                    >
                      {r.glyph}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="media-button" aria-label="Open chat" onClick={() => setModal("conversation")}><ChatCircle size={22}/><span>Chat</span></button>
            <button className="media-button" aria-label="More tools" onClick={() => setModal("more")}><DotsThree size={24}/><span>More</span></button>
            {self?.table && (
              <button
                className="media-button tray-leave"
                aria-label="Stand up"
                onClick={() => action("leave-table", null)}
              >
                <SignOut size={21} />
                <span>Stand up</span>
              </button>
            )}
          </div>

      </section>
      {modal==='devices'&&<Modal title="Sound good. Look good." subtitle="Choose your devices before you join a conversation." onClose={()=>setModal(null)}><DeviceCheck call={call}/></Modal>}
      {modal==='conference'&&self?.table&&<Modal title={tables.find(t=>t.id===self.table)?.name || 'Your call'} onClose={()=>setModal(null)} wide><Conference call={call} self={self} peers={tablePeers}/></Modal>}
      {modal==='board'&&self?.table&&<Modal title="Make something together." subtitle="Your table’s shared working space." onClose={()=>setModal(null)} wide><TableBoard key={self.tableSession} board={workspace.board} self={self} host={ownMetadata.owner} action={action}/></Modal>}
      {(workspace.joinRequest || workspace.invitation)&&<button className="campus-request" onClick={()=>setModal('join-request')}><Users size={18}/>{workspace.invitation?'Your table invitation':`${workspace.joinRequest.name} wants to join`}</button>}
      {modal==='join-request'&&<Modal title="A little company?" onClose={()=>setModal(null)}>
        {workspace.joinRequest&&<div><p>{workspace.joinRequest.name} would like to join your table.</p><div className="tool-actions"><button onClick={async()=>{await action('answer-join',{id:workspace.joinRequest.id,accept:true});workspace.setJoinRequest(null);setModal(null);}}>Accept request</button><button onClick={async()=>{await action('answer-join',{id:workspace.joinRequest.id,accept:false});workspace.setJoinRequest(null);setModal(null);}}>Decline</button></div></div>}
        {workspace.invitation&&<div><p>{workspace.invitation.host} invited you to their table.</p><div className="tool-actions"><button onClick={async()=>{const invite=workspace.invitation;if(self.room!==invite.room)await changeRoom(invite.room);const result=await action('join-invited',invite);if(result.ok){workspace.setInvitation(null);setModal(null);}}}>Join table</button><button onClick={()=>{workspace.setInvitation(null);setModal(null);}}>Dismiss</button></div></div>}
        {!workspace.joinRequest&&!workspace.invitation&&<p>No pending requests.</p>}
      </Modal>}
      {modal === "rooms" && <Modal title="Find your place." subtitle="Walk through a doorway, or choose a room here." onClose={() => setModal(null)} wide>
        <div className="campus-room-grid">{ROOMS.map(r => {const Icon=roomIcons[r.id] || Leaf;const count=world.users.filter(u => u.room===r.id).length;return <button key={r.id} className={`campus-room-option ${room.id===r.id ? "current" : ""}`} style={{"--room-color":r.color}} onClick={async () => {await changeRoom(r.id);setModal(null);}}><Icon size={28}/><strong>{r.name}</strong><p>{r.description}</p><span>{room.id===r.id ? "You’re here" : "Enter room"}<ArrowUpRight size={16}/></span><small>{count} here</small></button>;})}</div>
        <button className="campus-text-button" onClick={() => setModal("tables")}><Users size={17}/>Browse tables in {room.name}</button>
      </Modal>}
      {modal === "seat" && <Modal title={table.name} subtitle={table.topic} onClose={() => setModal(null)}>
        <div className="campus-seat-access">{metadata.private ? <LockSimple size={16}/> : <Users size={16}/>} {metadata.private ? "Private table · invite code required" : "Open table · everyone is welcome"}</div>
        <div className="table-seats" aria-label="Choose a seat">{Array.from({length:6},(_,seat) => {const occupant=tableUsers.find(u => u.seat===seat);return <button key={seat} className={`seat ${occupant ? "occupied" : ""}`} disabled={!!occupant || !connected} aria-label={occupant ? `Seat ${seat+1}: ${occupant.name}` : `Take seat ${seat+1} at ${table.name}`} onClick={() => joinSeat(table.id,seat)}>{occupant ? <MiniAvatar profile={occupant} size="small"/> : <Plus size={20}/>}<span>{seat+1}</span></button>;})}</div>
        <div className="seats-caption"><span>{tableUsers.length} of 6 seats taken</span><span>{6-tableUsers.length} available</span></div>
        <button className="join-button" disabled={!connected || (!seated && tableUsers.length===6)} onClick={seated ? async () => {await action("leave-table",null);setModal(null);} : joinFirst}>{seated ? "Stand up & leave table" : "Take an available seat"}<ArrowRight size={17}/></button>
        {seated && <div className="privacy-row"><LockSimple size={15}/><span>Invite-only table</span><button className={`toggle ${metadata.private ? "on" : ""}`} role="switch" aria-checked={!!metadata.private} aria-label="Lock this table" disabled={metadata.owner!==self?.id} title={metadata.owner!==self?.id ? "Only the host can change privacy" : "Lock table with an invite code"} onClick={privacyToggle}><i/></button></div>}
        {seated && metadata.private && <button className="private-code" onClick={openInvite}><Copy size={14}/>Get your table invite code</button>}
      </Modal>}
      {modal === "conversation" && <Modal title="Conversation" onClose={() => setModal(null)}><div className="campus-conversation">
        <div className="chat-scope"><button className={chatChannel==="room" ? "active" : ""} onClick={() => setChatChannel("room")}>Room chat</button><button disabled={!self?.table} className={chatChannel==="table" ? "active" : ""} onClick={() => setChatChannel("table")}><LockSimple size={13}/>Table chat</button></div>
        <div className="chat-messages" role="log" aria-label="Conversation messages" aria-live="polite">
          {!messages.length && <div className="welcome-message"><HandWaving size={28}/><strong>Start a conversation.</strong><p>{chatChannel==="table" ? "Only people at your table can see these messages." : "Say hello to the people in this room."}</p></div>}
          {messages.map(m => <div className={`chat-message ${m.userId===self?.id ? "mine" : ""}`} key={m.id}><span className="message-avatar" style={{background:m.color}}>{m.name.slice(0,1)}</span><div><div className="message-meta"><strong>{m.name}</strong><time>{new Date(m.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time></div><p>{m.text}</p></div></div>)}<div ref={chatEnd}/>
        </div>
        <form className="message-form" onSubmit={sendMessage}><div className="message-input"><input aria-label="Message" placeholder={chatChannel==="table" ? "Message your table…" : "Message the room…"} value={message} onChange={e => setMessage(e.target.value)} maxLength={1000} disabled={!connected}/><button type="submit" aria-label="Send message" disabled={!connected || sending || !message.trim()}><PaperPlaneTilt size={20}/></button></div><div className="message-hint"><LockSimple size={12}/>{chatChannel==="table" ? "Just between your table." : "Visible to everyone in this room."}</div></form>
      </div></Modal>}
      {modal === "table-people" && <Modal title="At your table" subtitle="Your call is shared only with these coworkers." onClose={() => setModal(null)}>{[self,...tablePeers].filter(Boolean).map(u => <div className="person-row" key={u.id}><MiniAvatar profile={u}/><div><strong>{u.id === self.id ? "You" : u.name}</strong><p>{u.job}</p></div>{u.mic ? <Microphone size={16}/> : <MicrophoneSlash size={16}/>}</div>)}</Modal>}
      {modal === "more" && <Modal title="Make yourself at home." subtitle="Your tools, whenever you need them." onClose={() => setModal(null)}>
        {self?.table && <div className="campus-extra-call"><button disabled={call.busy} onClick={() => call.toggle("sharing")}><Monitor size={19}/>{call.media.sharing ? "Stop sharing" : "Share screen"}</button><button onClick={() => setDeafened(v => !v)}><Headphones size={19}/>{deafened ? "Unmute call audio" : "Mute call audio"}</button></div>}
        <div className="campus-reactions" aria-label="Reactions">{REACTIONS.map(r => <button key={r.id} aria-label={r.text} title={r.text} onClick={() => {action("reaction",r.id);setModal(null);}}>{r.glyph}</button>)}</div>
        <div className="campus-extra-call"><button onClick={() => {sceneControls.current?.reset();setModal(null);}}><ArrowLeft size={18}/>Reset camera</button><button onClick={() => {document.querySelector(".campus-shell")?.requestFullscreen?.().catch(() => notify("Fullscreen is unavailable in this browser."));setModal(null);}}><Monitor size={18}/>Fullscreen</button></div>
        <div className="campus-tools">{[["devices",SlidersHorizontal,"Camera & microphone"],["people",Users,"Find people"],["tables",SquaresFour,"Choose a table"],["focus",Timer,focusRunning ? "Focus · " + focusTime : "Focus timer"],["sound",Headphones,"Soundscapes"],["schedule",CalendarBlank,"My schedule"],["workspace",Coffee,"Workspace"],["settings",GearSix,"Settings & account"],["help",Question,"Movement & help"]].map(([id,Icon,label]) => <button key={id} onClick={() => setModal(id)}><Icon size={23}/><span>{label}</span><CaretRight size={15}/></button>)}</div>
      </Modal>}

      {modal === 'moderation' && <Modal title="Workspace moderation" onClose={()=>setModal(null)}><ModerationPanel space={space} account={account} role={workspaceAccess?.membership.role} notify={notify}/></Modal>}
      {modal === 'report' && <Modal title="Report a concern" onClose={()=>setModal(null)}><ReportForm space={space} account={account} users={world.users} notify={notify} onDone={()=>setModal(null)}/></Modal>}
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {modal === "profile" && (
        <Modal
          title="A little more you."
          subtitle="Make your character feel at home, too."
          onClose={() => setModal(null)}
          wide
        >
          <CharacterEditor draft={draft} setDraft={setDraft} onSubmit={applyProfile} original={profile} />
        </Modal>
      )}
      {modal === "invite" && (
        <Modal
          title="Make room for your people."
          subtitle="A shared workspace is better with good company."
          onClose={() => setModal(null)}
        >
          <div className="invite-illustration">
            <MiniAvatar profile={profile} />
            <span>+</span>
            <UserPlus size={32} />
          </div>
          <label className="field-label">
            Workspace address
            <div className="copy-field">
              <input
                readOnly
                value={inviteURL.toString()}
                aria-label="Workspace address"
              />
              <button
                onClick={() =>
                  copy(
                    inviteURL.toString(),
                    "Workspace address copied. Private workspaces also require an invitation.",
                  )
                }
                aria-label="Copy workspace address"
              >
                <Copy size={18} />
              </button>
            </div>
          </label>
          <WorkspaceInvite space={space} role={workspaceAccess?.membership.role} notify={notify}/>
          {["localhost", "127.0.0.1"].includes(location.hostname) && (
            <div className="notice">
              <Info size={17} />
              <p>
                This localhost address works only on this computer. A shared
                HTTPS address is needed for coworkers on other devices.
              </p>
            </div>
          )}
          {self?.table && ownMetadata.private && (
            <div className="table-invite">
              <LockSimple size={20} />
              <div>
                <strong>Your private table code</strong>
                <p>{hostCode || "Loading…"}</p>
              </div>
              <button
                className="icon-button"
                aria-label="Copy private table code"
                onClick={() => hostCode && copy(hostCode)}
              >
                <Copy size={19} />
              </button>
            </div>
          )}
          <button
            className="primary-button"
            onClick={() =>
              copy(inviteURL.toString(), "Workspace address copied.")
            }
          >
            Copy workspace address <Copy size={17} />
          </button>
        </Modal>
      )}
      {privateJoin && (
        <Modal
          title="A conversation, just for a few."
          subtitle="This table is private. Ask a member for its invite code."
          onClose={() => setPrivateJoin(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              joinSeat(privateJoin.table, privateJoin.seat, privateCode);
            }}
          >
            <label className="field-label">
              Table invite code
              <input
                autoComplete="off"
                value={privateCode}
                onChange={(e) => setPrivateCode(e.target.value)}
                placeholder="Enter your code"
                required
                maxLength={50}
              />
            </label>
            {codeError && (
              <p className="form-error" role="alert">
                {codeError}
              </p>
            )}
            <button className="primary-button">
              Join the conversation <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "tables" && (
        <Modal
          title="Find your kind of company."
          subtitle="Choose a table, then choose your seat."
          onClose={() => setModal(null)}
        >
          <div className="table-picker">
            {tables.map((t) => {
              const count = roomUsers.filter((u) => u.table === t.id).length;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelected(t.id);
                    setModal(null);
                    setModal("seat");
                  }}
                >
                  <span
                    className="table-icon"
                    style={{ "--table-color": t.color }}
                  >
                    <Users size={24} />
                  </span>
                  <div>
                    <strong>{t.name}</strong>
                    <p>
                      {world.tables[room.id]?.[t.id]?.private
                        ? "Private table · code required"
                        : `${6 - count} open seats · table-only audio`}
                    </p>
                  </div>
                  <ArrowUpRight size={18} />
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {modal === "people" && (
        <Modal
          title="Your people are here."
          subtitle="Find a name, a skill, or a new connection."
          onClose={() => setModal(null)}
        >
          <div className="search-field">
            <MagnifyingGlass size={19} />
            <input
              aria-label="Search coworkers"
              placeholder="Search by name or job…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="field-label">My availability<select value={self?.status||'available'} onChange={e=>socketRef.current?.emit('status',e.target.value)}><option value="available">Available</option><option value="focus">Focusing</option><option value="away">Away</option></select></label>
          <div className="people-search-results">
            {filteredPeople.length ? (
              filteredPeople.map((u) => (
                <div className="person-row" key={u.id}>
                  <MiniAvatar profile={u} />
                  <div>
                    <strong>{u.name}</strong>
                    <p>{u.job} · {u.status === 'focus' ? 'Focusing' : u.status === 'away' ? 'Away' : 'Available'}</p>
                    <small>{ROOMS.find(r=>r.id===u.room)?.name}{u.table ? ` · ${roomTables(u.room).find(t=>t.id===u.table)?.name}` : ''}</small>
                  </div>
                  {u.id!==self?.id&&<div className="person-actions"><button onClick={()=>changeRoom(u.room)} disabled={u.room===self?.room}>Go to room</button>{u.table&&<button disabled={u.status!=='available'} onClick={async()=>{const result=await action('request-join',u.id);if(result.ok)notify('Request sent to the table host.');}}>Request to join</button>}</div>}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <Users size={28} />
                <p>No one matches that search.</p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          title="Your space. Your pace."
          subtitle="A few little things to make yourself comfortable."
          onClose={() => setModal(null)}
        >
          <div className="settings-group">
            <h3>Account</h3>
            <div className="auth-account-row">
              <div>
                <strong>{account.fullName}</strong>
                <p>@{account.username}</p>
              </div>
              <button onClick={onLogout} disabled={loggingOut}>
                <SignOut size={18} />
                {loggingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
            {authError && (
              <p className="auth-error" role="alert">
                {authError}
              </p>
            )}
          </div>
          <div className="settings-group">
            <h3>Appearance</h3>
            <div className="theme-options">
              {[
                { id: "light", icon: Sun, text: "Light" },
                { id: "dark", icon: Moon, text: "Dark" },
                { id: "system", icon: Monitor, text: "System" },
              ].map((t) => (
                <button
                  key={t.id}
                  className={settings.theme === t.id ? "selected" : ""}
                  onClick={() => setSettings({ ...settings, theme: t.id })}
                >
                  <t.icon size={22} />
                  {t.text}
                </button>
              ))}
            </div>
          </div>
          <GraphicsSettings value={settings.graphics} active={activeGraphics} onChange={graphics => setSettings(s => ({...s, graphics}))}/>
          <div className="setting-row">
            <div>
              <strong>Mute incoming call audio</strong>
              <p>Keep your side of the table quiet.</p>
            </div>
            <button
              className={`toggle ${deafened ? "on" : ""}`}
              role="switch"
              aria-checked={deafened}
              aria-label="Mute incoming call audio"
              onClick={() => setDeafened((v) => !v)}
            >
              <i />
            </button>
          </div>
          <div className="notice">
            <LockSimple size={18} />
            <p>
              Your mic and camera start off. Media is shared only with people at
              your table and stops when you leave.
            </p>
          </div>
          <p className="settings-device-note">
            Use your browser’s site settings to select a microphone or camera
            and manage device permissions.
          </p>
        </Modal>
      )}
      {modal === "focus" && (
        <Modal
          title="A little room to focus."
          subtitle="One thing at a time. You’ve got this."
          onClose={() => setModal(null)}
        >
          <div className="focus-clock">
            <Timer size={26} />
            <span>{focusTime}</span>
            <p>
              {focusRunning
                ? "You’re in the zone. We’ll keep an eye on the time."
                : "25 minutes for something that matters."}
            </p>
          </div>
          <div className="focus-presets">
            {[25, 45, 60].map((minutes) => (
              <button
                key={minutes}
                disabled={focusRunning}
                className={focusSeconds === minutes * 60 ? "selected" : ""}
                onClick={() => setFocusSeconds(minutes * 60)}
              >
                {minutes} min
              </button>
            ))}
          </div>
          <button className="primary-button" onClick={toggleFocus}>
            {focusRunning ? (
              <Pause size={18} />
            ) : (
              <Play size={18} weight="fill" />
            )}
            {focusRunning ? "Pause focus session" : "Find my flow"}
          </button>
          <button
            className="text-button"
            onClick={() => {
              setFocusRunning(false);
              setFocusSeconds(1500);
              socketRef.current?.emit("status", "available");
            }}
          >
            Reset timer
          </button>
        </Modal>
      )}
      {modal === "sound" && (
        <Modal
          title="Set the tone."
          subtitle="A soft backdrop for your next bright idea."
          onClose={() => setModal(null)}
        >
          {room.id==='lounge'?<><div className="sound-description"><h3>The lounge, on a softer note.</h3><p>Mellow keys, warm bass, and brushed drums. Plays only for you and softens during table conversations.</p></div><LoungeMusicControls music={loungeMusic}/></>:<><div className={`sound-art ${ambient ? "playing" : ""}`}>
            <Leaf size={56} weight="duotone" />
            <span />
            <span />
            <span />
          </div>
          <div className="sound-description">
            <h3>A quiet breeze</h3>
            <p>
              A quiet breeze, footsteps that follow the ground, and birds outdoors.
              Plays only for you and softens during calls.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => setAmbient((v) => !v)}
          >
            {ambient ? <Pause size={18} /> : <Play size={18} weight="fill" />}
            {ambient ? "Pause soundscape" : "Play soundscape"}
          </button>
          </>}
        </Modal>
      )}
      {modal === "schedule" && (
        <Modal
          title="Something to look forward to."
          subtitle="Your personal plan for time together."
          onClose={() => setModal(null)}
        >
          <div className="schedule-list">
            {events.length === 0 ? (
              <div className="empty-state">
                <CalendarBlank size={32} />
                <strong>A little breathing room.</strong>
                <p>Add a coffee catch-up or a focused work session.</p>
              </div>
            ) : (
              events.map((event) => (
                <div
                  className={`schedule-event ${event.time < Date.now() ? "past" : ""}`}
                  key={event.id}
                >
                  <span className="event-date">
                    {new Date(event.time).toLocaleDateString([], {
                      month: "short",
                    })}
                    <strong>{new Date(event.time).getDate()}</strong>
                  </span>
                  <div>
                    <strong>{event.title}</strong>
                    <p>
                      {new Date(event.time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {ROOMS.find((r) => r.id === event.room)?.name}
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${event.title}`}
                    onClick={() => {
                      const next = events.filter((e) => e.id !== event.id);
                      setEvents(next);
                      save(`cg-events:${account.id}`, next);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
          <form className="schedule-form" onSubmit={addEvent}>
            <label>
              Session name
              <input
                value={eventTitle}
                maxLength={80}
                required
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="Friday coffee catch-up"
              />
            </label>
            <label>
              Start time
              <input
                type="datetime-local"
                value={eventTime}
                required
                onChange={(e) => setEventTime(e.target.value)}
              />
            </label>
            <button className="primary-button">
              Add to my schedule <Plus size={17} />
            </button>
            <p>Saved on this device. Invite your teammates separately.</p>
          </form>
        </Modal>
      )}
      {modal === "workspace" && (
        <Modal
          title="A place to call your own."
          subtitle="Create a separate workspace for your team."
          onClose={() => setModal(null)}
        >
          <WorkspacePicker/>
          <button className="text-button" onClick={()=>setModal('report')}>Report a coworker</button>
          {['owner','moderator'].includes(workspaceAccess?.membership.role) && <button className="primary-button" onClick={()=>setModal('moderation')}>Manage members & reports</button>}
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Welcome to your new workday."
          subtitle="Less distance. A little more connection."
          onClose={() => setModal(null)}
        >
          <div className="help-steps">
            <div>
              <span>01</span>
              <div>
                <h3>Take a little wander.</h3>
                <p>
                  Use W A S D or the arrow keys to walk in the direction you’re
                  looking. Drag the office view to look around, scroll to zoom,
                  and use Q / R to turn the camera. Press E near an empty chair to sit. On touch screens, use the
                  direction pad to walk. Click the floor to walk to a spot, or
                  walk into a doorway or use Rooms at the top. Press Space or the Jump button to
                  jump.
                </p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <h3>Pull up a seat.</h3>
                <p>
                  Click a chair in the office, or choose a seat in the table
                  panel. Calls and table chat are shared only with your table.
                  Press Space, Stand up, or Leave table to get up beside your
                  chair.
                </p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <h3>Be a little more you.</h3>
                <p>
                  Open My character to choose your look, name, and job. Turn on
                  your microphone or camera when you’re ready.
                </p>
              </div>
            </div>
            <div>
              <span>04</span>
              <div>
                <h3>Bring your people.</h3>
                <p>
                  Copy your workspace link. The first person at a table is its
                  host and can lock it with a private invite code.
                </p>
              </div>
            </div>
          </div>
          <button className="primary-button" onClick={() => setModal(null)}>
            Sounds like my kind of place <ArrowRight size={17} />
          </button>
        </Modal>
      )}
    </div>
  );
}

function CubeIcon() {
  return <SquaresFour size={14} weight="fill" />;
}
