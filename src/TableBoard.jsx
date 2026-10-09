import {useRef,useState} from 'react';
import {ArrowUpRight,Trash,DownloadSimple} from '@phosphor-icons/react';
import {blankBoard} from '../shared/collaboration.js';
export default function TableBoard({board,self,host,action}) {
  const data=board||blankBoard(),[text,setText]=useState(''),[url,setUrl]=useState(''),[type,setType]=useState('note'),[goal,setGoal]=useState(data.goal),[stroke,setStroke]=useState([]),[color,setColor]=useState('#8765b5'),[busy,setBusy]=useState(false),[pending,setPending]=useState([]);
  const current=useRef(null),svg=useRef(null),queue=useRef(Promise.resolve()),nextEdit=useRef(0);
  const edit=operation=>{
    const job=queue.current.catch(()=>{}).then(async()=>{
      const delay=Math.max(0,nextEdit.current-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      nextEdit.current=Date.now()+160;
      return action('board-edit',{...operation,session:self.tableSession});
    });queue.current=job;return job;
  };
  const point=e=>{const rect=svg.current.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))];};
  async function add(e){e.preventDefault();setBusy(true);try{const result=await edit({type,text,url});if(result.ok){setText('');setUrl('');}}finally{setBusy(false);}}
  function exportBoard(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='common-ground-table-board.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
  return <div className="table-board">
    <p className="tool-hint">Shared only with this table. It clears when the last person leaves. Export anything you want to keep.</p>
    {host===self.id?<form className="board-goal" onSubmit={async e=>{e.preventDefault();await edit({type:'goal',text:goal});}}><label className="field-label">Session goal<input value={goal} maxLength={160} onChange={e=>setGoal(e.target.value)} placeholder="What are we working toward?"/></label><button>Set goal</button></form>:<p className="session-goal">{data.goal||'The host can set a shared session goal.'}</p>}
    <div className="board-toolbar"><strong>Shared whiteboard</strong><div>{['#8765b5','#426950','#b26c45','#34333c'].map(c=><button key={c} aria-label={`Draw in ${c}`} aria-pressed={color===c} style={{'--ink':c}} onClick={()=>setColor(c)}/> )}</div><button onClick={()=>{const last=data.strokes.findLast(s=>s.author===self.id);if(last)edit({type:'remove',list:'strokes',id:last.id});}}>Undo mine</button>{host===self.id&&<button onClick={()=>edit({type:'clear'})}>Clear drawings</button>}</div>
    <svg ref={svg} className="whiteboard" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-label="Shared drawing canvas. Use sticky notes below for keyboard-accessible collaboration." onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);current.current=[point(e)];setStroke(current.current);}} onPointerMove={e=>{if(!current.current)return;const next=point(e),last=current.current.at(-1);if(Math.hypot(next[0]-last[0],next[1]-last[1])<.004)return;if(current.current.length<160){current.current.push(next);setStroke([...current.current]);}}} onPointerCancel={()=>{current.current=null;setStroke([]);}} onPointerUp={async()=>{const points=current.current;current.current=null;setStroke([]);if(points?.length>1){const id=crypto.randomUUID();setPending(previous=>[...previous,{id,points,color}]);try{await edit({type:'stroke',points,color});}finally{setPending(previous=>previous.filter(s=>s.id!==id));}} }}>
      {[...data.strokes,...pending].map(s=><polyline key={s.id} points={s.points.map(([x,y])=>`${x*1000},${y*500}`).join(' ')} stroke={s.color}/>)}<polyline points={stroke.map(([x,y])=>`${x*1000},${y*500}`).join(' ')} stroke={color}/>
    </svg>
    <form onSubmit={add} className="board-add"><label className="field-label">Add to the table<select value={type} onChange={e=>setType(e.target.value)}><option value="note">Sticky note</option><option value="link">Resource link</option></select></label><label className="field-label">{type==='note'?'Note':'Link title'}<input required value={text} onChange={e=>setText(e.target.value)} maxLength={type==='note'?300:80}/></label>{type==='link'&&<label className="field-label">Web address<input type="url" required placeholder="https://" value={url} onChange={e=>setUrl(e.target.value)} maxLength={1000}/></label>}<button disabled={busy||!text.trim()}>Add {type}</button></form>
    <div className="board-items">{['notes','links'].flatMap(list=>data[list].map(item=><article key={item.id}>{list==='links'?<a href={item.url} target="_blank" rel="noopener noreferrer">{item.text}<ArrowUpRight size={16}/></a>:<p>{item.text}</p>}{(item.author===self.id||host===self.id)&&<button aria-label={`Remove ${item.text}`} onClick={()=>edit({type:'remove',list,id:item.id})}><Trash size={16}/></button>}</article>))}</div>
    <button className="board-export" onClick={exportBoard}><DownloadSimple size={18}/>Export this session</button>
  </div>;
}
