export function connectionQuality({state, rtt=0, loss=0}) {
  if(state !== 'connected') return state === 'failed' ? 'offline' : 'connecting';
  return loss > .08 || rtt > .6 ? 'poor' : loss > .025 || rtt > .25 ? 'fair' : 'good';
}
export function cameraBudget(quality, peers=1) {
  const ceiling=Math.floor(1800000/Math.max(1,peers));
  return quality === 'poor' ? {maxBitrate:Math.min(180000,ceiling),maxFramerate:12,scaleResolutionDownBy:2}
    : quality === 'fair' ? {maxBitrate:Math.min(350000,ceiling),maxFramerate:20,scaleResolutionDownBy:1.5}
    : {maxBitrate:Math.min(650000,ceiling),maxFramerate:24,scaleResolutionDownBy:1};
}
