import {ArrowUpRight, Leaf, Timer, Coffee, PencilSimple} from '@phosphor-icons/react';
import {ROOM_DESIGNS} from '../shared/world.js';

const icons={studio:PencilSimple,focus:Timer,lounge:Coffee,terrace:Leaf};
export default function RoomGuide({room,people=0,focusTime,focusRunning,onAction,children}) {
  const design=ROOM_DESIGNS[room], Icon=icons[room] || Leaf;
  return <section className="room-guide" aria-label={`${room} room guide`} style={{'--room-accent':design.accent}}>
    <div className="room-guide-heading"><Icon size={18}/><span>{design.label}</span></div>
    <p>{design.hint}</p>
    <button onClick={onAction}>
      <span>{room==='focus'&&focusRunning?`${focusTime} · Focus session`:design.action}</span><ArrowUpRight size={15}/>
    </button>
    <small>{people===1?'1 person here':`${people} people here`} · {room==='lounge'?'4 conversation circles':room==='focus'?'24 individual seats':'4 shared tables'}</small>
    {children}
  </section>;
}
