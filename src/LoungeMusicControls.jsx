import {MusicNote,Pause,Play,SpeakerLow} from '@phosphor-icons/react';

export default function LoungeMusicControls({music}) {
  return <div className="lounge-music" aria-label="Lounge background music">
    <div className="lounge-music-title"><MusicNote size={16}/><span>Cozy lo-fi <small>{music.unavailable?'Audio unavailable':music.playing?'Soft keys · 72 BPM':'A little rhythm for your break'}</small></span>
      <button type="button" onClick={music.toggle} disabled={music.unavailable} aria-label={music.playing?'Pause lounge music':'Play lounge music'} aria-pressed={music.playing}>
        {music.playing?<Pause size={16} weight="fill"/>:<Play size={16} weight="fill"/>}
      </button>
    </div>
    <label className="lounge-music-volume"><SpeakerLow size={15}/>
      <input aria-label="Lounge music volume" type="range" min="0" max="100" step="1" value={Math.round(music.volume*100)} onChange={event=>music.setVolume(Number(event.target.value)/100)} aria-valuetext={`${Math.round(music.volume*100)} percent`}/><output>{Math.round(music.volume*100)}%</output>
    </label>
  </div>;
}
