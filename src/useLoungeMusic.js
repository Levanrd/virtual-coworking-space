import {useEffect,useRef,useState} from 'react';
import {readSaved,save} from './storage.js';
import {createLoungeMusic} from './loungeMusic.js';

export default function useLoungeMusic({active,ducked=false}) {
  const [preference,setPreference]=useState(()=>readSaved('cg-lounge-music',{enabled:true,volume:.25},
    value=>typeof value.enabled==='boolean'&&Number.isFinite(value.volume)&&value.volume>=0&&value.volume<=1));
  const [playing,setPlaying]=useState(false);
  const [unavailable,setUnavailable]=useState(false);
  const engine=useRef(null), current=useRef(null);
  current.current={active,ducked,...preference};
  function start() {
    const state=current.current;
    if(!state.active||!state.enabled)return;
    if(!engine.current) {
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx){setUnavailable(true);return;}
      try {engine.current=createLoungeMusic(new AudioCtx(),{onState:setPlaying});}
      catch {setUnavailable(true);return;}
    }
    engine.current.setVolume(state.volume);engine.current.setDucked(state.ducked);void engine.current.play();
  }
  useEffect(()=>{save('cg-lounge-music',preference);},[preference]);
  useEffect(()=>{
    if(active&&preference.enabled)start();else engine.current?.pause();
    // Retry suspended audio only after a genuine user gesture, never force autoplay.
    const unlock=event=>{
      // The play button owns its gesture; resuming on pointerdown would toggle it
      // back off when the following click sees the newly playing state.
      if(event.target?.closest?.('[aria-label="Lounge background music"]'))return;
      if(!playing)start();
    };
    window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
    return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);};
  },[active,preference.enabled,playing]);
  useEffect(()=>{engine.current?.setVolume(preference.volume);engine.current?.setDucked(ducked);},[preference.volume,ducked]);
  useEffect(()=>()=>{engine.current?.dispose();engine.current=null;},[]);
  function toggle() {
    const enabled=!playing;
    current.current={...current.current,enabled};
    setPreference(value=>({...value,enabled}));
    if(enabled)start();else engine.current?.pause();
  }
  return {playing,unavailable,volume:preference.volume,toggle,setVolume:volume=>setPreference(value=>({...value,volume}))};
}
