export function readSaved(key, fallback, validate = () => true) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value != null && validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const validSettings = value => !!value && ['system', 'light', 'dark'].includes(value.theme) &&
  (value.graphics === undefined || ['auto', 'low', 'balanced', 'high'].includes(value.graphics));
export const validProfile = value => !!value &&
  typeof value.name === 'string' && value.name.length <= 30 &&
  typeof value.job === 'string' && value.job.length <= 50 &&
  ['color', 'skin', 'hair'].every(key => typeof value[key] === 'string' && /^#[a-f0-9]{6}$/i.test(value[key])) &&
  ['short', 'bob', 'bun'].includes(value.hairstyle) &&
  (value.gender === undefined || ['male', 'female'].includes(value.gender)) &&
  (value.outfit === undefined || ['hoodie', 'shirt'].includes(value.outfit)) &&
  (value.pants === undefined || /^#[a-f0-9]{6}$/i.test(value.pants));
export const validEvents = value => Array.isArray(value) && value.every(event =>
  event && typeof event.id === 'string' && typeof event.title === 'string' &&
  Number.isFinite(event.time) && Math.abs(event.time) <= 8640000000000000 &&
  ['studio', 'focus', 'lounge', 'terrace'].includes(event.room));
