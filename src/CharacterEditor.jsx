import { useState } from 'react';
import { Check, GenderMale, GenderFemale, Shuffle, ArrowCounterClockwise } from '@phosphor-icons/react';
import CharacterPreview from './CharacterPreview.jsx';
import { APPEARANCE_DEFAULTS } from '../shared/avatar.js';
import './characterEditor.css';

const COLORS = ['#8b73c4','#7b9f87','#ca9473','#b77f8b','#718ba7','#51556b','#cfb46a','#d6c6af'];
const SKINS = ['#f2d4b9','#e5b18c','#c48c63','#a16c4e','#754b37','#50362c'];
const HAIRS = ['#49352e','#24252d','#986b45','#caa879','#945345','#e5ded2'];
const PANTS = ['#4d505d','#32445b','#817868','#d6c6af'];
const colorNames = ['Lavender','Sage','Clay','Rose','Denim','Slate','Ochre','Oat'];
function Swatches({ title, values, names, value, onChange }) {
  return <fieldset><legend>{title}</legend><div className="swatches">{values.map((color, i) => <button type="button" key={color} style={{ background: color }} className={value === color ? 'active' : ''} aria-label={`${title}: ${names[i]}`} aria-pressed={value === color} title={names[i]} onClick={() => onChange(color)}>{value === color && <Check size={15} weight="bold" />}</button>)}</div></fieldset>;
}
export default function CharacterEditor({ draft, setDraft, onSubmit, original }) {
  const [saving, setSaving] = useState(false);
  const profile = { ...APPEARANCE_DEFAULTS, ...draft };
  const update = patch => setDraft(value => ({ ...value, ...patch }));
  function shuffle() {
    const pick = values => values[Math.floor(Math.random() * values.length)];
    update({ color: pick(COLORS), hair: pick(HAIRS), hairstyle: pick(['short','bob','bun']), pants: pick(PANTS), outfit: pick(['hoodie','shirt']) });
  }
  return <form className="profile-editor character-editor" onSubmit={async event => { event.preventDefault(); if (saving) return; setSaving(true); try { await onSubmit(event); } finally { setSaving(false); } }} aria-busy={saving}>
    <div className="avatar-studio-column"><CharacterPreview profile={profile} /><p className="avatar-preview-note">Your campus character, from every angle.</p></div>
    <fieldset className="character-edit-fields" disabled={saving}>
      <div className="character-editor-actions"><span>Make it yours</span><button type="button" onClick={shuffle}><Shuffle size={16} />Shuffle style</button><button type="button" aria-label="Undo character changes" title="Undo changes" onClick={() => setDraft({ ...original })}><ArrowCounterClockwise size={17} /></button></div>
      <fieldset className="gender-field"><legend>Gender</legend><div className="gender-options">{[['male','Male',GenderMale],['female','Female',GenderFemale]].map(([value,label,Icon]) => <button type="button" key={value} aria-pressed={profile.gender === value} className={profile.gender === value ? 'selected' : ''} onClick={() => update({ gender: value })}><Icon size={23} /><span>{label}</span>{profile.gender === value && <Check size={15} />}</button>)}</div></fieldset>
      <div className="character-identity"><label>Your name<input required maxLength={30} value={profile.name} onChange={event => update({ name: event.target.value })} placeholder="What should we call you?" /></label><label>What you do<input maxLength={50} value={profile.job} onChange={event => update({ job: event.target.value })} placeholder="Designer, developer, big thinker…" /></label></div>
      <div className="character-appearance-row"><Swatches title="Outfit color" values={COLORS} names={colorNames} value={profile.color} onChange={color => update({ color })} /><label>Outfit<select aria-label="Outfit" value={profile.outfit} onChange={event => update({ outfit: event.target.value })}><option value="hoodie">Cozy hoodie</option><option value="shirt">Everyday shirt</option></select></label></div>
      <div className="character-appearance-row"><Swatches title="Skin tone" values={SKINS} names={['Porcelain','Sand','Golden','Amber','Umber','Deep']} value={profile.skin} onChange={skin => update({ skin })} /><Swatches title="Trousers" values={PANTS} names={['Charcoal','Navy','Stone','Cream']} value={profile.pants} onChange={pants => update({ pants })} /></div>
      <div className="hair-options"><label>Hair style<select aria-label="Hair style" value={profile.hairstyle} onChange={event => update({ hairstyle: event.target.value })}><option value="short">Short & sweet</option><option value="bob">Classic bob</option><option value="bun">The top knot</option></select></label><label>Hair color<select aria-label="Hair color" value={profile.hair} onChange={event => update({ hair: event.target.value })}>{HAIRS.map((hair,i) => <option value={hair} key={hair}>{['Chestnut','Midnight','Warm brown','Honey blonde','Auburn','Silver'][i]}</option>)}</select></label></div>
      <p className="character-save-hint">Preview freely. Save when it feels like you.</p>
      <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving character…' : 'Save my character'}<Check size={17} /></button>
    </fieldset>
  </form>;
}
