import {useEffect,useRef,useState} from 'react';
import {Microphone,MicrophoneSlash,Monitor,VideoCamera,PushPin} from '@phosphor-icons/react';
import './neighborhood.css';

function Preview({stream,label}) {
  const video=useRef(null);
  useEffect(()=>{video.current.srcObject=stream||null;video.current.play().catch(()=>{});return()=>{if(video.current)video.current.srcObject=null;};},[stream]);
  return <video ref={video} autoPlay playsInline muted aria-label={label}/>;
}
export function DeviceCheck({call}) {
  const [list,setList]=useState([]),[preview,setPreview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[level,setLevel]=useState(0);
  const capture=useRef(null),epoch=useRef(0),context=useRef(null),frame=useRef(null);
  const refresh=()=>navigator.mediaDevices?.enumerateDevices().then(setList).catch(()=>setError('Device list unavailable. Use HTTPS and allow device access.'));
  const stop=()=>{epoch.current++;capture.current?.getTracks().forEach(t=>t.stop());capture.current=null;context.current?.close();context.current=null;cancelAnimationFrame(frame.current);setPreview(null);setLevel(0);};
  useEffect(()=>{refresh();navigator.mediaDevices?.addEventListener('devicechange',refresh);return()=>{stop();navigator.mediaDevices?.removeEventListener('devicechange',refresh);};},[]);
  async function test(kind) {
    stop();setError('');setBusy(true);const token=epoch.current;
    try {
      const id=call.devices[kind];
      const stream=await navigator.mediaDevices.getUserMedia(kind==='mic'?{audio:{echoCancellation:true,noiseSuppression:true,...(id?{deviceId:{exact:id}}:{})}}:{video:{width:640,height:480,...(id?{deviceId:{exact:id}}:{})}});
      if(epoch.current!==token){stream.getTracks().forEach(t=>t.stop());return;}
      capture.current=stream;setPreview(stream);refresh();
      if(kind==='mic') {
        const ctx=new AudioContext();context.current=ctx;await ctx.resume();
        if(epoch.current!==token)return;
        const analyser=ctx.createAnalyser();analyser.fftSize=256;ctx.createMediaStreamSource(stream).connect(analyser);
        const data=new Uint8Array(analyser.fftSize);
        const tick=()=>{analyser.getByteTimeDomainData(data);setLevel(Math.min(1,Math.sqrt(data.reduce((sum,n)=>sum+((n-128)/128)**2,0)/data.length)*5));frame.current=requestAnimationFrame(tick);};tick();
      }
    } catch {if(epoch.current===token){stop();setError('Could not open that device. Check browser permissions and whether another app is using it.');}}
    finally {setBusy(false);}
  }
  return <div className="device-check">
    <p className="tool-hint">Tests stay on this device. Nothing is sent to your table.</p>
    {['mic','camera'].map(kind=><label className="field-label" key={kind}>{kind==='mic'?'Microphone':'Camera'}<select disabled={busy||call.busy} value={call.devices[kind]} onChange={e=>{stop();call.selectDevice(kind,e.target.value);}}><option value="">System default</option>{list.filter(d=>d.kind===(kind==='mic'?'audioinput':'videoinput')).map((d,i)=><option key={d.deviceId||i} value={d.deviceId}>{d.label||`${kind==='mic'?'Microphone':'Camera'} ${i+1}`}</option>)}</select></label>)}
    <div className="tool-actions"><button disabled={busy||call.media.mic} onClick={()=>test('mic')}><Microphone size={18}/>Test microphone</button><button disabled={busy||call.media.camera} onClick={()=>test('camera')}><VideoCamera size={18}/>Test camera</button><button onClick={stop}>Stop tests</button></div>
    {(call.media.mic||call.media.camera)&&<p className="tool-hint">Turn off a device in the call before testing it privately. Device selection can also switch a live call.</p>}
    {preview?.getVideoTracks().length>0&&<Preview stream={preview} label="Private camera preview"/>}
    {preview?.getAudioTracks().length>0&&<label className="mic-meter">Microphone level <meter min="0" max="1" value={level}/></label>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
export function Conference({call,self,peers}) {
  const [pinned,setPinned]=useState(null),[layout,setLayout]=useState('speaker');
  const entries=[{id:self.id,label:'You',stream:call.localStream,active:call.media.camera,mic:call.media.mic},...peers.map(u=>({id:u.id,label:u.name,stream:call.remote[u.id]?.stream,active:u.camera,mic:u.mic}))];
  if(call.media.sharing)entries.push({id:'self-screen',label:'Your screen',stream:call.localScreen,active:true,screen:true});
  peers.filter(u=>u.sharing).forEach(u=>entries.push({id:`${u.id}-screen`,label:`${u.name}’s screen`,stream:call.remote[u.id]?.screen,active:true,screen:true}));
  const focus=entries.find(e=>e.id===pinned)||entries.find(e=>e.screen)||entries.find(e=>call.speaking[e.id])||entries[0];
  return <div className="conference-view">
    <div className="tool-actions"><button aria-pressed={layout==='speaker'} onClick={()=>setLayout('speaker')}>Speaker / presentation</button><button aria-pressed={layout==='grid'} onClick={()=>setLayout('grid')}>Gallery</button>{pinned&&<button onClick={()=>setPinned(null)}>Unpin</button>}</div>
    <div className={`conference-grid ${layout}`}>
      {entries.map(entry=><button key={entry.id} className={`conference-tile ${focus.id===entry.id?'featured':''} ${call.speaking[entry.id]?'is-speaking':''} ${entry.screen?'screen':''}`} onClick={()=>{setPinned(entry.id);setLayout('speaker');}} aria-label={`Pin ${entry.label}`} aria-pressed={pinned===entry.id}>
        {entry.active&&entry.stream?<Preview stream={entry.stream} label={entry.label}/>:<span className="conference-initial">{entry.label.slice(0,1)}</span>}
        <span className="conference-caption">{entry.screen?<Monitor size={15}/>:entry.mic?<Microphone size={15}/>:<MicrophoneSlash size={15}/>} {entry.label} {pinned===entry.id&&<PushPin size={15}/>}<small>{call.health[entry.id]?.quality || ''}</small></span>
      </button>)}
    </div>
    <div className="tool-actions"><button disabled={call.busy} onClick={()=>call.toggle('mic')}>{call.media.mic?<Microphone size={18}/>:<MicrophoneSlash size={18}/>}Mic {call.media.mic?'on':'off'}</button><button disabled={call.busy} onClick={()=>call.toggle('camera')}><VideoCamera size={18}/>Camera {call.media.camera?'on':'off'}</button><button disabled={call.busy} onClick={()=>call.toggle('sharing')}><Monitor size={18}/>{call.media.sharing?'Stop sharing':'Share screen'}</button></div>
    <div className="call-health" aria-label="Connection details">{peers.map(peer=><span key={peer.id}>{peer.name}: {call.health[peer.id] ? `${call.health[peer.id].quality} · ${call.health[peer.id].rtt} ms · ${call.health[peer.id].loss}% loss` : 'Connecting…'}</span>)}</div>
    <p className="tool-hint">Only this table hears your call. Click a participant or screen to pin it. The world pauses while this view is open.</p>
  </div>;
}
