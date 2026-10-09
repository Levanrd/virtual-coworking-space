import {useId} from 'react';
import {GRAPHICS_LEVELS, graphicsMode} from './graphicsQuality.js';

export default function GraphicsSettings({value, active, onChange}) {
  const id = useId(), mode = graphicsMode(value);
  return <div className="settings-group graphics-settings">
    <label htmlFor={id}>3D graphics</label>
    <select id={id} value={mode} onChange={event => onChange(event.target.value)} aria-describedby={`${id}-hint`}>
      <option value="auto">Automatic (recommended)</option>
      <option value="low">Low · lighter rendering</option>
      <option value="balanced">Balanced · everyday use</option>
      <option value="high">High · sharper detail</option>
    </select>
    <p id={`${id}-hint`}>Automatic adjusts resolution and shadows to keep movement responsive. Choose Low if your device gets warm.</p>
    <p className="graphics-status" role="status">{active ? `${GRAPHICS_LEVELS[active]?.label || 'Balanced'} quality active` : 'Quality adapts when the room opens'}{mode === 'auto' ? ' · automatic' : ''}</p>
  </div>;
}
