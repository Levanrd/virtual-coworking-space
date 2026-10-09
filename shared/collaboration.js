export const blankBoard = () => ({ revision: 0, goal: '', notes: [], links: [], strokes: [] });
export function safeLink(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 1000 ? url.href : null; }
  catch { return null; }
}
// Operations merge independently; a stale editor cannot replace the whole board.
export function editBoard(board, operation, actor, host, id) {
  if (!operation || typeof operation !== 'object') return { error: 'Choose a board action.' };
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const owner = item => item.author === actor || host === actor;
  const { type } = operation;
  let patch;
  if (type === 'goal') {
    if (host !== actor) return { error: 'The table host sets the session goal.' };
    board.goal = text(operation.text, 160);
    patch={type:'goal',goal:board.goal};
  } else if (type === 'note' || type === 'link') {
    const list = type === 'note' ? board.notes : board.links;
    const value = text(operation.text, type === 'note' ? 300 : 80);
    if (!value || list.length >= 24) return { error: 'Add text, or remove an item from this full board.' };
    const url = type === 'link' ? safeLink(operation.url) : null;
    if (type === 'link' && !url) return { error: 'Use a complete http or https link without credentials.' };
    list.push({ id, author: actor, text: value, ...(url ? { url } : {}) });
    patch={type:'append',list:type==='note'?'notes':'links',item:list.at(-1)};
  } else if (type === 'stroke') {
    const points = operation.points;
    if (board.strokes.length >= 150) return { error: 'The whiteboard is full. Clear some drawings first.' };
    if (!Array.isArray(points) || points.length < 2 || points.length > 160 || points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 1))) return { error: 'Invalid drawing.' };
    board.strokes.push({ id, author: actor, points:points.map(p=>p.map(n=>Math.round(n*1000)/1000)), color: ['#8765b5','#426950','#b26c45','#34333c'].includes(operation.color) ? operation.color : '#8765b5' });
    patch={type:'append',list:'strokes',item:board.strokes.at(-1)};
  } else if (type === 'remove') {
    const list = ['notes', 'links', 'strokes'].includes(operation.list) ? board[operation.list] : null;
    const index = list?.findIndex(item => item.id === operation.id) ?? -1;
    if (index < 0 || !owner(list[index])) return { error: 'You can remove your own items; the host can remove any item.' };
    list.splice(index, 1);
    patch={type:'remove',list:operation.list,id:operation.id};
  } else if (type === 'clear') {
    if (host !== actor) return { error: 'Only the table host can clear drawings.' };
    board.strokes = [];patch={type:'clear'};
  } else return { error: 'Unknown board action.' };
  board.revision++;
  return { ok: true, patch:{...patch,revision:board.revision} };
}

export function applyBoardPatch(board, patch) {
  if(!board || patch.revision!==board.revision+1) return null;
  const next={...board,revision:patch.revision};
  if(patch.type==='goal')next.goal=patch.goal;
  else if(patch.type==='clear')next.strokes=[];
  else if(patch.type==='append')next[patch.list]=[...board[patch.list],patch.item];
  else if(patch.type==='remove')next[patch.list]=board[patch.list].filter(item=>item.id!==patch.id);
  return next;
}
