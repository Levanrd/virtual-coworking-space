// Wait for both the server acknowledgement and a rendered destination frame.
export function createRoomTransition({onChange, onTimeout = () => {}, reduced = () => false, schedule = setTimeout, cancel = clearTimeout}) {
  let active = null;
  const timers = new Set();
  function later(fn, delay) {
    const id = schedule(() => {timers.delete(id);fn();}, delay);
    timers.add(id);return id;
  }
  function reveal(token) {
    if (active !== token || token.revealing) return;
    token.revealing = true;
    onChange({roomId:token.roomId,phase:'revealing'});
    later(() => {if(active===token){active=null;onChange(null);}}, reduced()?0:340);
  }
  function ready(roomId) {
    if (!active || active.roomId !== roomId) return;
    active.ready = true;
    if(active.accepted)reveal(active);
  }
  async function start(roomId, currentRoom, commit) {
    if(active)return {error:'A room transition is already in progress.'};
    if(roomId===currentRoom)return {ok:true};
    const token={roomId,ready:false,accepted:false,revealing:false};active=token;
    onChange({roomId,phase:'covering'});
    await new Promise(resolve=>{token.resume=resolve;later(resolve,reduced()?0:260);});
    if(active!==token)return {error:'Room transition cancelled.'};
    onChange({roomId,phase:'loading'});
    const watchdog=later(()=>{
      if(active===token&&!token.revealing){onTimeout();reveal(token);}
    },10000);
    try {
      const result=await commit();
      if(active!==token)return result;
      if(!result?.ok)reveal(token);
      else {token.accepted=true;if(token.ready)reveal(token);}
      return result;
    } catch(error) {
      reveal(token);
      return {error:error?.message || 'Unable to change rooms.'};
    } finally {
      // Keep the watchdog until the destination has rendered, even after an ACK.
      if(active!==token || token.revealing){cancel(watchdog);timers.delete(watchdog);}
    }
  }
  function dispose() {
    const previous=active;active=null;
    timers.forEach(cancel);timers.clear();previous?.resume?.();
  }
  return {start,ready,dispose};
}
