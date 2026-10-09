import {connectionQuality, cameraBudget} from './mediaQuality.js';
import { useCallback, useEffect, useRef, useState } from "react";
import { reportClientError } from './ErrorBoundary.jsx';

export default function useMedia(socketRef, self, users, notify, {relayOnly = false} = {}) {
  const peers = useRef(new Map());
  const [devices,setDevices]=useState({mic:'',camera:''});
  const deviceRef=useRef(devices);deviceRef.current=devices;
  const [health,setHealth]=useState({});
  const [speaking,setSpeaking]=useState({});
  const constraints=kind=>kind==='mic' ? {audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(deviceRef.current.mic?{deviceId:{exact:deviceRef.current.mic}}:{})},video:false}
    : {audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:24},...(deviceRef.current.camera?{deviceId:{exact:deviceRef.current.camera}}:{})}};
  const baseStream = useRef(new MediaStream());
  const screenStream = useRef(new MediaStream());
  const selfRef = useRef(self);
  selfRef.current = self;
  useEffect(
    () => () => {
      // A pending device permission request may finish after signing out.
      // Invalidate its table membership so the capture guard stops those tracks.
      selfRef.current = null;
    },
    [],
  );
  const configRef = useRef({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  const [media, setMedia] = useState({
    mic: false,
    camera: false,
    sharing: false,
  });
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const [remote, setRemote] = useState({});
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const busyRef = useRef(false);
  const captureEpoch = useRef(0);
  const refreshConfig = useCallback(async () => {
    const response = await fetch('/api/rtc-config', {cache:'no-store'});
    if(!response.ok) throw new Error('Call configuration unavailable');
    const config = await response.json();
    if(!Array.isArray(config.iceServers)) throw new Error('Invalid call configuration');
    configRef.current = {iceServers:config.iceServers, iceTransportPolicy:relayOnly ? 'relay' : config.iceTransportPolicy || 'all'};
    return configRef.current;
  }, [relayOnly]);
  useEffect(() => {
    let active = true;
    const load=()=>refreshConfig().then(()=>{if(active)setConfigReady(true);}).catch(()=>{if(active)notify('Call setup is unavailable. Retrying shortly.');});
    load();
    const timer=setInterval(load,30000);
    return ()=>{active=false;clearInterval(timer);};
  }, [refreshConfig]);
  const publish = useCallback((next) => {
    mediaRef.current = next;
    setMedia(next);
    socketRef.current?.emit("media", next);
    setRevision((v) => v + 1);
  }, []);
  function replace(kind, track) {
    for (const entry of peers.current.values())
      entry[kind].sender.replaceTrack(track).catch(() => {});
  }
  const stop = useCallback(() => {
    captureEpoch.current++;
    baseStream.current.getTracks().forEach((track) => {
      track.stop();
      baseStream.current.removeTrack(track);
    });
    screenStream.current.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
      screenStream.current.removeTrack(track);
    });
    for (const entry of peers.current.values()) {clearTimeout(entry.recoveryTimer);entry.pc.close();}
    peers.current.clear();
    setRemote({});
    setHealth({});setSpeaking({});
    publish({ mic: false, camera: false, sharing: false });
  }, [publish]);
  const tableKey = self?.table ? `${self.id}:${self.room}:${self.table}:${self.tableSession || ''}` : null;
  useEffect(() => {
    stop();
    return stop;
  }, [tableKey, stop]);

  const getPeer = useCallback((id, generation = 'initial', retries = 0) => {
    if (peers.current.has(id)) return peers.current.get(id);
    const pc = new RTCPeerConnection(configRef.current);
    const entry = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      settingAnswer: false,
      pendingCandidates: [],
      polite: (selfRef.current?.id || "") > id,
      retries,
      generation,
      iceErrors: [],
    };
    entry.audio = pc.addTransceiver("audio", {
      direction: "sendrecv",
      streams: [baseStream.current],
    });
    entry.camera = pc.addTransceiver("video", {
      direction: "sendrecv",
      streams: [baseStream.current],
    });
    entry.screen = pc.addTransceiver("video", {
      direction: "sendrecv",
      streams: [screenStream.current],
    });
    entry.audio.sender.replaceTrack(
      baseStream.current.getAudioTracks()[0] || null,
    );
    entry.camera.sender.replaceTrack(
      baseStream.current.getVideoTracks()[0] || null,
    );
    entry.screen.sender.replaceTrack(
      screenStream.current.getVideoTracks()[0] || null,
    );
    peers.current.set(id, entry);
    pc.onicecandidateerror = event => {
      if(!entry.iceErrors.includes(event.errorCode)) {
        entry.iceErrors.push(event.errorCode);
        if(event.errorCode===486 || event.errorCode===508) notify('The call relay is busy. Reconnecting shortly.');
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate)
        socketRef.current?.emit("signal", {
          to: id,
          generation: entry.generation,
          candidate: event.candidate,
        });
    };
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        socketRef.current?.emit("signal", {
          to: id,
          generation: entry.generation,
          description: pc.localDescription,
          streamIds: {
            base: baseStream.current.id,
            screen: screenStream.current.id,
          },
        });
      } catch (error) {
        if (pc.signalingState !== "closed")
          console.warn("Media negotiation:", error.message);
      } finally {
        entry.makingOffer = false;
      }
    };
    pc.ontrack = (event) => {
      if (peers.current.get(id) !== entry || pc.signalingState === 'closed') return;
      const stream = event.streams[0];
      if (!stream) return;
      // Glare rollback can reassign transceiver mids. MSID remains stable and
      // separates screen sharing from the camera/audio stream in either direction.
      const isScreen = stream.id === entry.remoteStreamIds?.screen;
      setRemote((prev) => ({
        ...prev,
        [id]: { ...prev[id], [isScreen ? "screen" : "stream"]: stream },
      }));
    };
    const recover = async () => {
        if(peers.current.get(id)!==entry || pc.connectionState==='closed' || pc.connectionState==='connected') return;
        if(entry.retries>=2) {entry.exhausted=true;reportClientError('media_failed');notify('A table call could not reconnect. Leave and rejoin the table to try again.');return;}
        entry.retries++;
        try {
          const config=await refreshConfig();
          if(peers.current.get(id)!==entry || pc.connectionState==='closed') return;
          if(!entry.polite) {
            // A relay loss can fail DTLS as well as ICE. Rebuild both transports,
            // keeping capture tracks, and reject late signaling from the old call.
            const nextGeneration=crypto.randomUUID();
            socketRef.current?.emit('signal',{to:id,restart:nextGeneration});
            clearTimeout(entry.recoveryTimer);
            pc.close();peers.current.delete(id);
            setRemote(prev=>{const next={...prev};delete next[id];return next;});
            getPeer(id,nextGeneration,entry.retries);
            return;
          }
        } catch {notify('Call recovery could not reach the server. Check your connection.');}
        clearTimeout(entry.recoveryTimer);
        entry.recoveryTimer=setTimeout(recover,20000);
    };
    pc.onconnectionstatechange = () => {
      clearTimeout(entry.recoveryTimer);
      if(pc.connectionState === 'connected') {
        if(entry.retries>0) notify('Table call reconnected.');
        entry.retries=0;entry.exhausted=false;return;
      }
      if(!['failed','disconnected','connecting'].includes(pc.connectionState)) return;
      entry.recoveryTimer=setTimeout(recover,pc.connectionState==='failed'?1000:pc.connectionState==='disconnected'?5000:15000);
    };
    // Lost initial offers can leave connectionState at "new", which emits no
    // "connecting" event. Recover that path too instead of waiting forever.
    entry.recoveryTimer=setTimeout(recover,15000);
    return entry;
  }, []);

  const participantIds = users
    .filter(
      (u) =>
        self?.table &&
        u.id !== self.id &&
        u.room === self.room &&
        u.table === self.table,
    )
    .map((u) => u.id)
    .sort()
    .join(",");
  useEffect(() => {
    if(!configReady) return;
    const ids = participantIds ? participantIds.split(",") : [];
    for (const [id, entry] of peers.current)
      if (!ids.includes(id)) {
        clearTimeout(entry.recoveryTimer);
        entry.pc.close();
        peers.current.delete(id);
        setRemote((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    ids.forEach(id=>getPeer(id));
  }, [participantIds, tableKey, getPeer, configReady]);
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onSignal = async ({ from, description, candidate, streamIds, generation = 'initial', restart }) => {
      if (!configReady || !selfRef.current?.table || !participantIds.split(",").includes(from))
        return;
      if(restart) {
        const old=peers.current.get(from);
        // The lexicographically smaller peer coordinates recovery.
        if((selfRef.current?.id || '') < from || !/^[a-f0-9-]{36}$/.test(restart)) return;
        if(old?.generation===restart) return;
        if(old) {clearTimeout(old.recoveryTimer);old.pc.close();peers.current.delete(from);}
        setRemote(prev=>{const next={...prev};delete next[from];return next;});
        getPeer(from,restart,(old?.retries || 0)+1);
        return;
      }
      const entry = getPeer(from);
      if(generation !== entry.generation) return;
      const { pc } = entry;
      try {
        if (description) {
          const ready =
            !entry.makingOffer &&
            (pc.signalingState === "stable" || entry.settingAnswer);
          const collision = description.type === "offer" && !ready;
          entry.ignoreOffer = !entry.polite && collision;
          if (entry.ignoreOffer) return;
          if (streamIds) entry.remoteStreamIds = streamIds;
          entry.settingAnswer = description.type === "answer";
          await pc.setRemoteDescription(description);
          entry.settingAnswer = false;
          for (const c of entry.pendingCandidates.splice(0))
            await pc.addIceCandidate(c);
          if (description.type === "offer") {
            await pc.setLocalDescription();
            socket.emit("signal", {
              to: from,
              generation: entry.generation,
              description: pc.localDescription,
              streamIds: {
                base: baseStream.current.id,
                screen: screenStream.current.id,
              },
            });
          }
        } else if (candidate && !entry.ignoreOffer) {
          if (pc.remoteDescription) await pc.addIceCandidate(candidate);
          else entry.pendingCandidates.push(candidate);
        }
      } catch (error) {
        if (!entry.ignoreOffer && pc.signalingState !== "closed")
          console.warn("Call signaling:", error.message);
      }
    };
    socket.on("signal", onSignal);
    return () => socket.off("signal", onSignal);
  }, [participantIds, tableKey, getPeer, configReady]);

  async function toggle(kind) {
    if (!selfRef.current?.table) {
      notify("Pull up a seat to start a table call.");
      return;
    }
    if (busyRef.current) return;
    if (!navigator.mediaDevices) {
      notify("Camera and microphone need HTTPS or localhost.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const currentKey = `${selfRef.current.id}:${selfRef.current.room}:${selfRef.current.table}:${selfRef.current.tableSession || ''}`;
    const currentEpoch = captureEpoch.current;
    try {
      if (mediaRef.current[kind]) {
        const stream =
          kind === "sharing" ? screenStream.current : baseStream.current;
        const tracks =
          kind === "mic" ? stream.getAudioTracks() : stream.getVideoTracks();
        tracks.forEach((track) => {
          track.onended = null;
          track.stop();
          stream.removeTrack(track);
        });
        replace(
          kind === "mic" ? "audio" : kind === "sharing" ? "screen" : "camera",
          null,
        );
        publish({ ...mediaRef.current, [kind]: false });
      } else {
        const captured =
          kind === "sharing"
            ? await navigator.mediaDevices.getDisplayMedia({
                video: {frameRate:{ideal:10,max:15},width:{max:1920},height:{max:1080}},
                audio: false,
              })
            : await navigator.mediaDevices.getUserMedia(constraints(kind));
        const now = selfRef.current;
        if (
          !now?.table ||
          `${now.id}:${now.room}:${now.table}:${now.tableSession || ''}` !== currentKey ||
          currentEpoch !== captureEpoch.current
        ) {
          captured.getTracks().forEach((t) => t.stop());
          return;
        }
        const target =
          kind === "sharing" ? screenStream.current : baseStream.current;
        const track = captured.getTracks()[0];
        target.addTrack(track);
        replace(
          kind === "mic" ? "audio" : kind === "sharing" ? "screen" : "camera",
          track,
        );
        track.onended = () => {
          target.removeTrack(track);
          replace(
            kind === "mic" ? "audio" : kind === "sharing" ? "screen" : "camera",
            null,
          );
          publish({ ...mediaRef.current, [kind]: false });
        };
        publish({ ...mediaRef.current, [kind]: true });
      }
    } catch (error) {
      if (error.name === "NotAllowedError")
        notify(
          kind === "sharing"
            ? "Screen sharing was canceled."
            : "Device access was declined. Allow access in your browser to turn it on.",
        );
      else if (error.name === "NotFoundError")
        notify(
          "No device was found. Connect a microphone or camera and try again.",
        );
      else
        notify(
          `Could not start ${kind === "mic" ? "your microphone" : kind === "sharing" ? "screen sharing" : "your camera"}. ${error.message}`,
        );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  // Poll each peer without overlapping requests. Quality changes use hysteresis.
  useEffect(()=>{
    let active=true,timer;
    async function sample() {
      const next={},voices={};
      await Promise.all([...peers.current].map(async ([id,entry])=>{
        try {
          const stats=await entry.pc.getStats();
          if(!active || peers.current.get(id)!==entry)return;
          let rtt=0,lost=0,received=0;
          stats.forEach(report=>{
            if(report.type==='candidate-pair' && report.state==='succeeded')rtt=Math.max(rtt,report.currentRoundTripTime||0);
            if(report.type==='inbound-rtp') {
              lost+=Math.max(0,report.packetsLost||0);received+=report.packetsReceived||0;
              if(report.kind==='audio' && report.audioLevel>.025) voices[id]=true;
            }
            if(report.type==='media-source' && report.kind==='audio' && report.audioLevel>.025 && selfRef.current) voices[selfRef.current.id]=true;
          });
          const old=entry.lastSample||{lost,received};entry.lastSample={lost,received};
          const dl=Math.max(0,lost-old.lost),dr=Math.max(0,received-old.received),loss=dl/Math.max(1,dl+dr);
          const quality=entry.exhausted?'offline':connectionQuality({state:entry.pc.connectionState,rtt,loss});
          next[id]={quality,rtt:Math.round(rtt*1000),loss:Math.round(loss*100)};
          entry.goodSamples=quality==='good'?(entry.goodSamples||0)+1:0;
          if(quality==='poor'||quality==='fair'||entry.goodSamples>=3)entry.quality=quality;
          const budget=cameraBudget(entry.quality||'fair',peers.current.size);
          const signature=JSON.stringify(budget);
          if(entry.camera.sender.track && entry.budget!==signature) {
            const parameters=entry.camera.sender.getParameters();
            if(parameters.encodings?.length) {
              Object.assign(parameters.encodings[0],budget);
              await entry.camera.sender.setParameters(parameters);entry.budget=signature;
            }
          }
          if(entry.screen.sender.track && !entry.screenBudget) {
            const parameters=entry.screen.sender.getParameters();
            if(parameters.encodings?.length) {
              Object.assign(parameters.encodings[0],{maxBitrate:800000,maxFramerate:15});
              await entry.screen.sender.setParameters(parameters);entry.screenBudget=true;
            }
          }
        } catch { /* A closing peer or unsupported sender option must not end a call. */ }
      }));
      if(active){setHealth(next);setSpeaking(voices);timer=setTimeout(sample,1000);}
    }
    sample();return()=>{active=false;clearTimeout(timer);};
  },[]);
  async function selectDevice(kind,id) {
    if(!['mic','camera'].includes(kind)||busyRef.current)return;
    const before=deviceRef.current;
    deviceRef.current={...before,[kind]:id};setDevices(deviceRef.current);
    if(!mediaRef.current[kind])return;
    busyRef.current=true;setBusy(true);
    const epoch=captureEpoch.current;
    let captured;
    try {
      const stream=await navigator.mediaDevices.getUserMedia(constraints(kind));captured=stream;
      if(epoch!==captureEpoch.current){stream.getTracks().forEach(t=>t.stop());return;}
      const track=stream.getTracks()[0];
      const old=kind==='mic'?baseStream.current.getAudioTracks():baseStream.current.getVideoTracks();
      await Promise.allSettled([...peers.current.values()].map(entry=>entry[kind==='mic'?'audio':'camera'].sender.replaceTrack(track)));
      if(epoch!==captureEpoch.current){stream.getTracks().forEach(t=>t.stop());return;}
      old.forEach(t=>{t.onended=null;t.stop();baseStream.current.removeTrack(t);});
      baseStream.current.addTrack(track);
      track.onended=()=>{baseStream.current.removeTrack(track);replace(kind==='mic'?'audio':'camera',null);publish({...mediaRef.current,[kind]:false});};
      setRevision(v=>v+1);
    } catch {
      captured?.getTracks().forEach(t=>t.stop());
      deviceRef.current=before;setDevices(before);notify('Could not switch devices. Your previous selection is still active.');
    } finally {busyRef.current=false;setBusy(false);}
  }
  return {
    devices,selectDevice,health,speaking,
    async diagnostics() {
      const result=[];
      for(const [id,{pc,iceErrors}] of peers.current) {
        const stats=await pc.getStats();
        let pair;
        stats.forEach(s=>{if(s.type==='transport' && s.selectedCandidatePairId) pair=stats.get(s.selectedCandidatePairId);});
        const localCandidates=[],remoteCandidates=[];
        stats.forEach(s=>{if(s.type==='local-candidate')localCandidates.push(s.candidateType);if(s.type==='remote-candidate')remoteCandidates.push(s.candidateType);});
        const local=stats.get(pair?.localCandidateId),remote=stats.get(pair?.remoteCandidateId);
        result.push({id,state:pc.connectionState,signaling:pc.signalingState,iceState:pc.iceConnectionState,gathering:pc.iceGatheringState,localCandidates,remoteCandidates,iceErrors,localCandidate:local?.candidateType,remoteCandidate:remote?.candidateType,protocol:local?.protocol,relayProtocol:local?.relayProtocol,bytesReceived:pair?.bytesReceived || 0,bytesSent:pair?.bytesSent || 0});
      }
      return result;
    },
    media,
    toggle,
    stop,
    busy,
    remote,
    localStream: baseStream.current,
    localScreen: screenStream.current,
    revision,
  };
}
