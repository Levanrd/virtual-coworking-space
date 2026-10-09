// Development-only browser harness. Generates synthetic tracks; never opens a real mic,
// camera, screen picker, or speaker. Not included in the production build.
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import useMedia from "../src/useMedia.js";
import {DeviceCheck,Conference} from "../src/Conference.jsx";

navigator.mediaDevices.enumerateDevices=async()=>[
  {kind:'audioinput',deviceId:'synthetic-mic-2',label:'Synthetic microphone'},
  {kind:'videoinput',deviceId:'synthetic-camera-2',label:'Synthetic camera'},
];
let trackIndex = 0;
function fakeVideo(screen = false) {
  const canvas = document.createElement("canvas");
  canvas.width = screen ? 360 : 240;
  canvas.height = screen ? 220 : 160;
  const ctx = canvas.getContext("2d");
  let frame = 0;
  const color = trackIndex++ % 2 ? "#8cb69c" : "#a28bc7";
  const draw = () => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px sans-serif";
    ctx.fillText(
      screen ? "Synthetic shared screen" : "Synthetic camera",
      15,
      45,
    );
    ctx.font = "16px sans-serif";
    ctx.fillText(`Frame ${frame++}`, 15, 90);
  };
  draw();
  const timer = setInterval(draw, 100);
  const stream = canvas.captureStream(10);
  const track = stream.getVideoTracks()[0];
  const stop = track.stop.bind(track);
  track.stop = () => {
    clearInterval(timer);
    stop();
  };
  return stream;
}
function fakeAudio() {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const output = context.createMediaStreamDestination();
  oscillator.connect(output);
  oscillator.start();
  context.resume();
  const track = output.stream.getAudioTracks()[0];
  const stop = track.stop.bind(track);
  track.stop = () => {
    oscillator.stop();
    context.close();
    stop();
  };
  return output.stream;
}
const deferredCaptures = [];
let holdCapture = false;
let lastReleasedTracks = [];
navigator.mediaDevices.getUserMedia = async (constraints) => {
  const capture = () => constraints.video ? fakeVideo() : fakeAudio();
  if (holdCapture) {
    holdCapture = false;
    return new Promise(resolve => deferredCaptures.push(() => {
      const stream = capture();
      lastReleasedTracks = stream.getTracks();
      resolve(stream);
    }));
  }
  return capture();
};
navigator.mediaDevices.getDisplayMedia = async () => fakeVideo(true);

function MediaProbe({ stream, label }) {
  const video = useRef(null);
  const [size, setSize] = useState("Waiting for frames");
  const [tracks, setTracks] = useState("");
  useEffect(() => {
    const el = video.current;
    el.srcObject = stream || null;
    el.play().catch(() => {});
    const timer = setInterval(() => {
      setSize(
        el.videoWidth
          ? `${el.videoWidth} × ${el.videoHeight}`
          : "Waiting for frames",
      );
      setTracks(
        stream
          ?.getTracks()
          .map(
            (t) =>
              `${t.kind}: ${t.readyState}, ${t.muted ? "muted" : "receiving"}`,
          )
          .join(" | ") || "No stream",
      );
    }, 200);
    return () => clearInterval(timer);
  }, [stream]);
  return (
    <div>
      <strong>
        {label}: {size}
      </strong>
      <p>{tracks}</p>
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        style={{ width: 210, borderRadius: 8 }}
      />
    </div>
  );
}
function Client({ number, space }) {
  const socketRef = useRef(null);
  const [deviceCheck,setDeviceCheck]=useState(false),[conference,setConference]=useState(false);
  const [world, setWorld] = useState([]);
  const [id, setId] = useState(null);
  const [message, setMessage] = useState("");
  const [stopped, setStopped] = useState("");
  const [diagnostics,setDiagnostics]=useState([]);
  const [privateCode,setPrivateCode]=useState('');
  const self = world.find((u) => u.id === id);
  const call = useMedia(socketRef, self, world, setMessage, {relayOnly:new URLSearchParams(location.search).has('relay')});
  const lastTracks = useRef([]);
  useEffect(() => {
    const socket = io({ autoConnect: false });
    // Fault injection for the startup watchdog: lose only the initial SDP/ICE.
    // Restart-generation messages must still get through.
    if (new URLSearchParams(location.search).has('dropInitial')) {
      const emit = socket.emit.bind(socket);
      socket.emit = (event, payload, ...rest) => event === 'signal' && payload?.generation === 'initial'
        ? socket : emit(event, payload, ...rest);
    }
    socketRef.current = socket;
    socket.on("connect", () =>
      socket.emit(
        "enter",
        {
          space,
          profile: { name: `Synthetic client ${number}` },
        },
        (result) => {setId(result.id);if(result.error)setMessage(result.error);},
      ),
    );
    socket.on("world", (data) => setWorld(data.users));
    socket.on("connect_error", () =>
      setMessage("Sign in at the main app, then reload this harness."),
    );
    socket.on("disconnect", () => {
      setWorld([]);
      setId(null);
    });
    socket.connect();
    return () => socket.disconnect();
  }, []);
  const action = async (event, payload) => {
    const result = await socketRef.current
      .timeout(3000)
      .emitWithAck(event, payload);
    setMessage(result.error || "OK");
    if(result.code && result.ok)setPrivateCode(result.code);
  };
  async function toggle(kind) {
    await call.toggle(kind);
    lastTracks.current = [
      ...call.localStream.getTracks(),
      ...call.localScreen.getTracks(),
    ];
  }
  async function leave() {
    const tracks = [...lastTracks.current];
    await action("leave-table", null);
    setTimeout(
      () =>
        setStopped(
          tracks.every((t) => t.readyState === "ended")
            ? "All captured tracks ended"
            : "Tracks are still running",
        ),
      300,
    );
  }
  return (
    <section
      style={{
        border: "1px solid #ddd",
        padding: 20,
        borderRadius: 12,
        flex: 1,
      }}
      aria-label={`Synthetic client ${number}`}
    >
      <h2>Client {number}</h2>
      <button onClick={()=>setDeviceCheck(v=>!v)}>Toggle device check</button>
      {deviceCheck&&<DeviceCheck call={call}/>}
      <button onClick={()=>setConference(v=>!v)}>Toggle presentation</button>
      {conference&&self?.table&&<Conference call={call} self={self} peers={world.filter(u=>u.id!==id&&u.table===self.table&&u.room===self.room)}/>}

      <p>
        Connected: {id ? "yes" : "no"} · Table: {self?.table || "none"}
      </p>
      <button
        onClick={() =>
          action("join-table", { table: "design", seat: number - 1 })
        }
      >
        Join Design corner
      </button>{" "}
      <button
        onClick={() =>
          action("join-table", { table: "builders", seat: number - 1 })
        }
      >
        Join Builders
      </button>{" "}
      <button onClick={() => toggle("mic")}>
        Microphone {call.media.mic ? "on" : "off"}
      </button>{" "}
      <button onClick={() => toggle("camera")}>
        Camera {call.media.camera ? "on" : "off"}
      </button>{" "}
      <button onClick={() => toggle("sharing")}>
        Sharing {call.media.sharing ? "on" : "off"}
      </button>{" "}
      <button onClick={()=>call.selectDevice('camera','synthetic-camera-2')}>Switch camera</button>
      <button onClick={()=>call.selectDevice('mic','synthetic-mic-2')}>Switch microphone</button>
      <pre aria-label="Live call health">{JSON.stringify(call.health)}</pre>
      <button onClick={leave}>Leave table</button>
      <button onClick={()=>action('privacy',true)}>Make table private</button>
      <label>Table code<input value={privateCode} onChange={e=>setPrivateCode(e.target.value)}/></label>
      <button onClick={()=>action('join-table',{table:'design',seat:number-1,code:privateCode})}>Join with code</button>
      <button onClick={()=>socketRef.current.disconnect()}>Disconnect client</button>
      <button onClick={()=>socketRef.current.connect()}>Reconnect client</button>
      <button onClick={async()=>setDiagnostics(await call.diagnostics())}>Inspect connection</button>
      <pre aria-label="Connection diagnostics">{JSON.stringify(diagnostics,null,2)}</pre>
      <p>Result: {message}</p>
      <p>{stopped}</p>
      {Object.entries(call.remote).map(([peer, streams]) => (
        <div key={peer}>
          <MediaProbe stream={streams.stream} label="Remote camera" />
          <MediaProbe stream={streams.screen} label="Remote screen" />
        </div>
      ))}
    </section>
  );
}
function Harness() {
  const params=new URLSearchParams(location.search);
  const single=['1','2'].includes(params.get('single'))?Number(params.get('single')):null;
  const [space,setSpace]=useState(null),[error,setError]=useState('');
  const [captureResult,setCaptureResult]=useState('');
  useEffect(()=>{
    if (single && params.get('space')) {setSpace(params.get('space'));return;}
    const id=`media-check-${Date.now().toString(36)}`;
    fetch('/api/workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({space:id,name:'Synthetic media verification'})}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);setSpace(data.space);}).catch(e=>setError(e.message));
  },[]);
  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Synthetic table-call verification</h1>
      <p>
        All media is generated. Remote videos are muted. No physical devices are
        accessed.
      </p>
      {error&&<p role="alert">{error}. Sign in at the main app, then reload.</p>}
      <button onClick={()=>{holdCapture=true;setCaptureResult('Next capture will wait.');}}>Hold next device request</button>{' '}
      <button onClick={()=>{deferredCaptures.splice(0).forEach(resolve=>resolve());setTimeout(()=>setCaptureResult(lastReleasedTracks.length && lastReleasedTracks.every(t=>t.readyState==='ended')?'Deferred tracks ended':'Deferred tracks still live'),300);}}>Resolve device request</button>
      <p role="status">{captureResult}</p>
      <div style={{ display: "flex", gap: 20 }}>
        {space&&(single?<Client number={single} space={space}/>:<><Client number={1} space={space}/><Client number={2} space={space}/></>)}
      </div>
    </main>
  );
}
const root =
  import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<Harness />);
