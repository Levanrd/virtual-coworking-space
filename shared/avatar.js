export const APPEARANCE_DEFAULTS = { gender: 'male', outfit: 'hoodie', pants: '#4d505d' };
export const GENDERS = ['male', 'female'];
export const OUTFITS = ['hoodie', 'shirt'];
export function appearanceKey(user) {
  return [user.color, user.skin, user.hair, user.hairstyle, user.gender || 'male', user.outfit || 'hoodie', user.pants || '#4d505d'].join(':');
}
