// Development-only room preview; no account, socket, or shared workspace changes.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import WorldScene from '../src/WorldScene.jsx';
import RoomGuide from '../src/RoomGuide.jsx';
import useLoungeMusic from '../src/useLoungeMusic.js';
import LoungeMusicControls from '../src/LoungeMusicControls.jsx';
import GraphicsSettings from '../src/GraphicsSettings.jsx';
import {readSaved,save,validSettings} from '../src/storage.js';
import {ROOMS, roomTables} from '../shared/world.js';
import {standPosition} from '../shared/navigation.js';
import {roomArrival,floorPlan} from '../shared/architecture.js';
import '../src/styles.css';
import '../src/campus.css';

const noop = () => {};
function Preview() {
  const [settings,setSettings]=useState(()=>readSaved('cg-preview-settings',{theme:'system',graphics:'auto'},validSettings));
  const [active,setActive]=useState(null);
  const [showGraphics,setShowGraphics]=useState(false);
  const [roomId, setRoom] = useState('lounge');
  const [self, setSelf] = useState({id:'preview',name:'Furniture check',color:'#a18bc8',skin:'#d9b38c',hair:'#49352e',hairstyle:'short',...roomArrival('lounge')});
  const changeRoom=id=>{setRoom(id);setSelf(s=>({...s,table:null,seat:null,...roomArrival(id,roomId),motionVersion:(s.motionVersion||0)+1}));};
  const user={...self,room:roomId};
  const music=useLoungeMusic({active:roomId==='lounge',ducked:!!self.table});
  return <>
    <div style={{position:'fixed',top:16,left:16,zIndex:100,background:'#fff8ed',padding:12,borderRadius:12}}>
      <label>Preview room <select aria-label="Preview room" value={roomId} onChange={e=>changeRoom(e.target.value)}>
        {ROOMS.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}
      </select></label>
      <button onClick={()=>setSelf(s=>({...s,table:'design',seat:0,motionVersion:(s.motionVersion||0)+1}))}>Test seat</button>
      <button onClick={()=>setSelf(s=>({...s,table:null,seat:null,...roomArrival(roomId),motionVersion:(s.motionVersion||0)+1}))}>Reset position</button>
      <button onClick={()=>setShowGraphics(v=>!v)}>Graphics settings</button>
      <span>{floorPlan(roomId).name}</span>
      <span role="status">{self.table?`Seated at ${roomTables(roomId).find(t=>t.id===self.table).name}`:'Exploring'}</span>
    </div>
    {showGraphics&&<div role="dialog" aria-label="Graphics settings" style={{position:'fixed',top:90,right:16,zIndex:101,width:'min(340px, calc(100vw - 32px))',padding:20,background:'#fff8ed',borderRadius:16}}>
      <GraphicsSettings value={settings.graphics} active={active} onChange={graphics=>{const next={...settings,graphics};setSettings(next);save('cg-preview-settings',next);}}/>
      <button onClick={()=>setShowGraphics(false)}>Close graphics settings</button>
    </div>}
    <div className="campus-world" style={{position:'fixed',inset:0}}>
      <WorldScene room={ROOMS.find(r=>r.id===roomId)} users={[user]} self={user} tables={{}} reactions={{}}
        graphics={settings.graphics} onQualityChange={setActive}
        onSelect={noop} onSeat={(table,seat)=>setSelf(s=>({...s,table,seat,motionVersion:(s.motionVersion||0)+1}))}
        onStand={()=>{setSelf(s=>({...s,...standPosition(s.table,s.seat,roomId),table:null,seat:null,motionVersion:(s.motionVersion||0)+1}));return Promise.resolve({ok:true});}}
        onMove={noop} onJump={()=>Promise.resolve({ok:true})} onRoom={changeRoom} onHelp={noop}/>
    </div>
    <RoomGuide room={roomId} people={1} onAction={noop}>{roomId==='lounge'&&<LoungeMusicControls music={music}/>}</RoomGuide>
  </>;
}
const root=createRoot(document.getElementById('root'));
root.render(<Preview/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
