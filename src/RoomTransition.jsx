import {useEffect,useRef} from 'react';
import {ROOMS,ROOM_DESIGNS} from '../shared/world.js';

export default function RoomTransition({transition}) {
  const element=useRef(null);
  const visible=!!transition;
  useEffect(()=>{
    if(!visible)return;
    const previous=document.activeElement;
    element.current?.focus({preventScroll:true});
    return ()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[visible]);
  if(!transition)return null;
  const room=ROOMS.find(r=>r.id===transition.roomId);
  return <div ref={element} className={`room-transition ${transition.phase}`} role="status" aria-live="polite"
    tabIndex={-1} onKeyDown={e=>{if(e.key==='Tab')e.preventDefault();}}
    style={{'--destination-color':ROOM_DESIGNS[room.id].accent}}>
    <div className="room-transition-content"><span className="room-transition-mark" aria-hidden="true"/>
      <small>Common Ground</small><strong>Entering {room.name.toLowerCase()}</strong>
      <span>{ROOM_DESIGNS[room.id].label}</span>
    </div>
  </div>;
}
