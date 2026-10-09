// Original 72 BPM lounge arrangement. Audio stays on this device, outside call streams.
export const LOUNGE_BPM = 72;
const STEP = 60 / LOUNGE_BPM / 2;
const CHORDS = [[50,57,60,64,69],[43,55,59,64,69],[48,55,59,62,67],[45,55,59,60,64]];
const MELODY = [76,null,72,null,69,null,72,null,74,null,71,null,69,null,67,null];
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export function createLoungeMusic(context, {onState = () => {}, every = setInterval, stopEvery = clearInterval, later = setTimeout, stopLater = clearTimeout} = {}) {
  const master = context.createGain();
  master.gain.value = 0;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 2400;
  filter.connect(master); master.connect(context.destination);
  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = noise.getChannelData(0);
  // Seeded noise keeps the arrangement reproducible.
  let seed = 41;
  for (let i=0;i<data.length;i++) {seed=(seed*16807)%2147483647;data[i]=seed/1073741823.5-1;}
  const voices = new Set();
  let timer = null, fadeTimer = null, next = 0, step = 0, enabled = false, disposed = false, volume = .25, ducked = false;
  function track(source, nodes, at, duration) {
    voices.add(source);
    source.onended = () => {voices.delete(source);source.disconnect();nodes.forEach(node=>node.disconnect());};
    source.start(at);source.stop(at+duration);
  }
  function tone(note, at, duration, level, type='sine') {
    const source=context.createOscillator(), gain=context.createGain();
    source.type=type;source.frequency.value=frequency(note);
    gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(level,at+.025);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(gain);gain.connect(filter);track(source,[gain],at,duration+.02);
  }
  function brush(at, level, duration, cutoff) {
    const source=context.createBufferSource(), band=context.createBiquadFilter(), gain=context.createGain();
    source.buffer=noise;band.type='highpass';band.frequency.value=cutoff;
    gain.gain.setValueAtTime(level,at);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(band);band.connect(gain);gain.connect(filter);track(source,[band,gain],at,duration+.01);
  }
  function schedule() {
    if(disposed||!enabled||context.state!=='running')return;
    // A throttled background tab must never play a backlog of missed notes.
    if(next<context.currentTime)next=context.currentTime+.04;
    while(next<context.currentTime+.2) {
      const bar=Math.floor(step/8), beat=step%8, chord=CHORDS[bar%4];
      const at=next+(beat%2 ? .045 : 0); // Gentle swing.
      if(beat===0)chord.slice(1).forEach((note,i)=>tone(note,at+i*.012,2.9,.043,'triangle'));
      if(beat===0||beat===4)tone(chord[0]-12,at,1.1,.14);
      if(beat===0||beat===5) {
        const kick=context.createOscillator(), gain=context.createGain();
        kick.frequency.setValueAtTime(105,at);kick.frequency.exponentialRampToValueAtTime(42,at+.16);
        gain.gain.setValueAtTime(.17,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.22);
        kick.connect(gain);gain.connect(filter);track(kick,[gain],at,.24);
      }
      if(beat===2||beat===6)brush(at,.038,.17,700);
      brush(at,.011,beat%2?.07:.045,4300);
      const note=MELODY[step%16];
      if(bar%8>=4&&note)tone(note,at+.015,1.2,.023,'triangle');
      step=(step+1)%64;next+=STEP;
    }
  }
  function level() {
    const now=context.currentTime;
    master.gain.cancelAndHoldAtTime(now);
    master.gain.linearRampToValueAtTime(enabled?volume*(ducked?.28:1):0,now+.8);
  }
  function clearVoices() {for(const voice of voices){try{voice.stop();}catch{ /* Already ended. */ }} }
  const stateChanged=()=>{onState(enabled&&context.state==='running');if(enabled&&context.state==='running')schedule();};
  context.addEventListener('statechange',stateChanged);
  async function play() {
    if(disposed)return;
    enabled=true;stopLater(fadeTimer);fadeTimer=null;
    try {await context.resume();} catch {onState(false);return;}
    if(disposed)return;
    if(!enabled){context.suspend().catch(()=>{});return;}
    if(timer===null){next=context.currentTime+.05;schedule();timer=every(schedule,80);}
    level();onState(context.state==='running');
  }
  function pause() {
    enabled=false;onState(false);stopEvery(timer);timer=null;stopLater(fadeTimer);
    level();
    fadeTimer=later(()=>{clearVoices();if(!disposed&&!enabled)context.suspend().catch(()=>{});},850);
  }
  return {
    play,pause,
    setVolume(value){volume=Number.isFinite(value)?Math.max(0,Math.min(1,value)):.25;level();},
    setDucked(value){ducked=!!value;level();},
    dispose(){disposed=true;enabled=false;stopEvery(timer);stopLater(fadeTimer);clearVoices();context.removeEventListener('statechange',stateChanged);context.close().catch(()=>{});},
  };
}
