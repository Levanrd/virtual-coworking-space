export const ROOMS = [

  {

    id: "studio",

    name: "The studio",

    subtitle: "Good company. Great work.",

    description: "A shared space for your next big thing.",

    icon: "studio",

    color: "#b6a8d3",

    capacity: 24,

  },

  {

    id: "focus",

    name: "Focus room",

    subtitle: "Find your flow.",

    description: "A quieter corner for getting things done.",

    icon: "focus",

    color: "#a8c1ae",

    capacity: 24,

  },

  {

    id: "lounge",

    name: "The lounge",

    subtitle: "Take a well-earned breather.",

    description: "Coffee, conversations, and a little connection.",

    icon: "lounge",

    color: "#cfac92",

    capacity: 24,

  },

  {

    id: "terrace",

    name: "Garden terrace",

    subtitle: "A little fresh perspective.",

    description: "Make room for inspiration, surrounded by green.",

    icon: "terrace",

    color: "#9fb5a0",

    capacity: 24,

  },

];

ROOMS.push(

  {id:'courtyard',name:'The courtyard',subtitle:'Meet under the sky.',description:'A stone piazza, open-air tables, and paths to somewhere new.',icon:'terrace',color:'#b6baa1',capacity:24},

  {id:'cafe',name:'Corner café',subtitle:'Coffee and company.',description:'A shaded street café for informal conversations.',icon:'lounge',color:'#c7a47e',capacity:24},

  {id:'park',name:'Pocket park',subtitle:'Take the scenic route.',description:'Meandering paths and picnic tables beneath the trees.',icon:'terrace',color:'#90ae83',capacity:24},

  {id:'retreat',name:'Nature retreat',subtitle:'A quieter horizon.',description:'A woodland clearing for quiet work and a longer breath.',icon:'terrace',color:'#88a8a4',capacity:24},

);

export const TABLES = [

  {

    id: "design",

    name: "Design corner",

    topic: "A little creativity, a lot of possibility.",

    x: -3.6,

    z: -2.3,

    seats: 6,

    color: "#ac95ce",

  },

  {

    id: "builders",

    name: "The builders’ club",

    topic: "Build something worth sharing.",

    x: 3.5,

    z: -2.3,

    seats: 6,

    color: "#dfb488",

  },

  {

    id: "quiet",

    name: "Deep work",

    topic: "Head down. Ideas up.",

    x: -3.6,

    z: 3,

    seats: 6,

    color: "#9bbaaa",

  },

  {

    id: "open",

    name: "Open company",

    topic: "Pull up a chair. Everyone is welcome.",

    x: 3.5,

    z: 3,

    seats: 6,

    color: "#d49d9d",

  },

];

export const SEAT_OFFSETS = [

  [-1.1, -1.05, 0],

  [0, -1.05, 0],

  [1.1, -1.05, 0],

  [-1.1, 1.05, Math.PI],

  [0, 1.05, Math.PI],

  [1.1, 1.05, Math.PI],

];

// Shared by the renderer, movement controller and authoritative server.

export const ROOM_DESIGNS = {

  studio: { label:'Create together', hint:'Project tables · shared ideas', action:'Find a project table', accent:'#ab8bc1', background:'#dce3dd', sun:'#fff4dc', intensity:2.6,

    names:['Design workshop','Build bench','Sketchbook','Project commons'], positions:[[-5,-4],[4,-4],[-5,2],[-5,7]], fixtures:[{type:'project-wall',x:-9.6,z:-3,w:.35,d:3.7},{type:'project-wall',x:.6,z:6,w:.35,d:3.7}] },

  focus: { label:'A little space to think', hint:'Individual desks · quiet company', action:'Start a focus session', accent:'#91ad9c', background:'#dce4e2', sun:'#e5f1ef', intensity:1.8,

    names:['The reading room','Quiet study','Window desks','Deep work'], positions:[[-4.8,-3.2],[4.8,-3.2],[-4.8,3.2],[4.8,3.2]],

    fixtures:[{type:'bookcase',x:0,z:-8.3,w:3.2,d:.55,angle:0}] },

  lounge: { label:'Stay for a conversation', hint:'Soft seats · coffee · table conversations', action:'Find a conversation', accent:'#c69b73', background:'#d5c4af', sun:'#ffd9ad', intensity:1.8,

    names:['Coffee circle','The fireside','The snug','Good company'], positions:[[-5.3,-2.6],[5.3,-2.6],[-5.3,2.6],[5.3,2.6]],

    fixtures:[{type:'coffee-bar',x:-3,z:-5.8,w:3,d:.6,angle:0},{type:'fireplace',x:5.5,z:-5.95,w:2.7,d:.5,angle:0}] },

  terrace: { label:'Work under an open sky', hint:'Garden tables · fresh air · open space', action:'Find a garden table', accent:'#7c9d68', background:'#c7e0e8', sun:'#fff2cf', intensity:2.8,

    names:['Herb garden','Under the pergola','Sunlit deck','Olive grove'], positions:[[-4.5,-3],[4.5,-3],[-4.5,3],[4.5,3]],

    fixtures:[{type:'planter',x:-8,z:3,w:.55,d:3.6},{type:'planter',x:8,z:-3,w:.55,d:3.6}] },

};

for (const [id, label, names, accent, surface] of [

  ['courtyard','A little room to wander',['Morning light','The meeting point','Piazza table','Under the awning'],'#a6aa8a','stone'],

  ['cafe','Coffee at the corner',['The regulars','Coffee & ideas','Window company','Afternoon break'],'#c69b73','stone'],

  ['park','Take your work outside',['Maple picnic','Green company','The long lunch','Garden study'],'#7c9d68','grass'],

  ['retreat','Find a quieter horizon',['Woodland desk','Forest company','Slow mornings','The clearing'],'#84a29a','wood'],

]) ROOM_DESIGNS[id] = {outdoor:true,surface,label,hint:id==='cafe'?'Open-air café · table conversations':'Outdoor tables · fresh air · quiet paths',action:'Find an outdoor table',accent,background:'#c7e0e8',sun:'#fff0d0',intensity:2.3,names,positions:[[-5,-4],[5,-4],[-5,4],[5,4]],fixtures:[{type:'planter',x:-10,z:-5,w:.6,d:3},{type:'planter',x:10,z:5,w:.6,d:3}]};

ROOM_DESIGNS.courtyard.fixtures.push({type:'fountain',x:0,z:0,w:2.5,d:2.5});
for(const id of ['courtyard','cafe','park','retreat']) ROOM_DESIGNS[id].fixtures.push(...[-1,1].flatMap(side=>[-7,7].map(z=>({type:'plant',x:side*9.6,z,w:.6,d:.6}))));
const roomTableCache = new Map();

export function roomTables(roomId = 'studio') {

  const id = ROOM_DESIGNS[roomId] ? roomId : 'studio';

  if (!roomTableCache.has(id)) {

    const design = ROOM_DESIGNS[id];

    roomTableCache.set(id, TABLES.map((table, index) => ({...table,

      name:design.names[index], topic:design.hint, color:design.accent,

      x:design.positions[index][0], z:design.positions[index][1],

      seatOffsets:['lounge','cafe'].includes(id) ? Array.from({length:6}, (_,i) => {

        const angle = Math.PI / 6 + i * Math.PI / 3;

        return [Math.sin(angle)*1.45, Math.cos(angle)*1.45, angle+Math.PI];

      }) : SEAT_OFFSETS,

    })));

  }

  return roomTableCache.get(id);

}

ROOM_DESIGNS.terrace.fixtures.push(...[2.2,6.8].flatMap(x=>[-4.9,-1.1].map(z=>({type:'pergola-post',x,z,w:.14,d:.14}))));

for(const room of ['focus','lounge']) ROOM_DESIGNS[room].fixtures.push(...[-1,1].flatMap(side=>[-5.65,5.65].map(z=>({type:'plant',x:side*7.1,z,w:.55,d:.55}))));

export function seatPosition(tableId, seat, roomId = 'studio') {

  const table = roomTables(roomId).find((t) => t.id === tableId);

  const offset = table?.seatOffsets[seat];

  return table && offset

    ? { x: table.x + offset[0], z: table.z + offset[1], rotation: offset[2] }

    : { x: 0, z: 5.8, rotation: Math.PI };

}

