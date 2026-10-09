export const REACTION_DISPLAY = {
  nod: {glyph:'👍',label:'Nodding'},
  stretch: {glyph:'🙆',label:'Stretching'},
  wave: {glyph:'👋', label:'Waving'},
  heart: {glyph:'💜', label:'Sending love'},
  clap: {glyph:'👏', label:'Applauding'},
  coffee: {glyph:'☕', label:'Coffee break'},
};
export const REACTION_DURATION = 3500;

export function createReactionFeed(onChange, schedule = setTimeout, cancel = clearTimeout) {
  let active = {}, sequence = 0;
  const timers = new Map();
  const publish = () => onChange({...active});
  function remove(id) { cancel(timers.get(id)); timers.delete(id); delete active[id]; }
  return {
    receive(data) {
      if (!data || typeof data.id !== 'string' || !Object.hasOwn(REACTION_DISPLAY,data.reaction) || typeof data.room !== 'string') return;
      remove(data.id);
      const key = ++sequence;
      active[data.id] = {type:data.reaction, room:data.room, key};
      timers.set(data.id,schedule(() => {
        if (active[data.id]?.key !== key) return;
        remove(data.id); publish();
      },REACTION_DURATION));
      publish();
    },
    prune(users) {
      const rooms = new Map(users.map(user => [user.id,user.room]));
      let changed = false;
      for (const id of Object.keys(active)) if (rooms.get(id) !== active[id].room) {remove(id); changed = true;}
      if (changed) publish();
    },
    clear() { for (const id of timers.keys()) cancel(timers.get(id)); timers.clear(); active = {}; publish(); },
  };
}
