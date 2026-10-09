import {ROOM_DESIGNS} from '../shared/world.js';
// Local soundscape only: this never captures a microphone or joins a voice channel.
export function createWorldAudio(room) {
  let context,master,allowed=false,lastStep=0,lastBird=0,closed=false;
  const surface=ROOM_DESIGNS[room]?.surface || (room==='focus'?'stone':'wood');
  function unlock() {
    if(!allowed||closed)return;
    try {
      if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.12;master.connect(context.destination);}
      if(context.state==='suspended')context.resume().catch(()=>{});
    } catch { /* Sound is optional on browsers without Web Audio. */ }
  }
  window.addEventListener('pointerup',unlock);window.addEventListener('keydown',unlock);
  function tone(frequency,duration,volume,type='sine',end=frequency) {
    if(!context||context.state!=='running')return;
    const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,now);oscillator.frequency.exponentialRampToValueAtTime(end,now+duration);
    gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    oscillator.connect(gain);gain.connect(master);oscillator.start();oscillator.stop(now+duration);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  return {
    enabled(value){if(value===allowed)return;allowed=value;if(master)master.gain.setTargetAtTime(value?.12:0,context.currentTime,.12);},
    step(speed,blocked,time){
      if(!allowed)return;
      if(ROOM_DESIGNS[room]?.outdoor&&time-lastBird>14000){lastBird=time;tone(1800,.18,.14,'sine',2800);}
      if(blocked||speed<.5||time-lastStep<330)return;
      lastStep=time;tone(surface==='stone'?210:surface==='grass'?65:110,.085,surface==='grass'?.2:.4,'triangle',45);
    },
    dispose(){closed=true;window.removeEventListener('pointerup',unlock);window.removeEventListener('keydown',unlock);context?.close().catch(()=>{});},
  };
}
