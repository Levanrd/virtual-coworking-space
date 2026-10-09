// One floor plan drives the mesh, collisions, door thresholds and arrival poses.

const curve=fn=>Array.from({length:64},(_,i)=>fn(i*Math.PI/32));

export const FLOOR_PLANS={

  studio:{name:'L-shaped atelier',height:5.2,outline:[[-10,-9],[10,-9],[10,1],[1,1],[1,11],[-10,11]],doors:[['focus',0,-9,0],['lounge',10,-4,-Math.PI/2],['terrace',-10,4,Math.PI/2]],spawn:{x:0,z:6,rotation:Math.PI}},

  focus:{name:'Oval reading room',height:4.35,outline:curve(t=>[11*Math.cos(t),9*Math.sin(t)]),doors:[['studio',0,9,Math.PI],['lounge',11,0,-Math.PI/2],['terrace',-11,0,Math.PI/2]],spawn:{x:0,z:6,rotation:Math.PI}},

  lounge:{name:'Twin-bay lounge',height:4.7,outline:curve(t=>[12*Math.cos(t),8*Math.sin(t)*(.68+.32*Math.abs(Math.cos(t)))]),doors:[['studio',-12,0,Math.PI/2],['focus',0,-5.44,0],['terrace',12,0,-Math.PI/2]],spawn:{x:0,z:1.2,rotation:Math.PI}},

  terrace:{name:'Sculpted garden deck',height:0,outline:curve(t=>[11*Math.cos(t)*(1+.08*Math.sin(2*t)),9*Math.sin(t)*(1+.08*Math.sin(3*t))]),doors:[['studio',0,-9.72,0],['focus',-11,0,Math.PI/2],['lounge',11,0,-Math.PI/2]],spawn:{x:0,z:6,rotation:Math.PI}},

};

FLOOR_PLANS.studio.doors.push(['courtyard',-5,11,Math.PI]);

FLOOR_PLANS.courtyard={name:'Open piazza',height:0,outline:[[-12,-10],[12,-10],[12,10],[-12,10]],doors:[['studio',0,-10,0],['cafe',12,0,-Math.PI/2],['park',0,10,Math.PI]],spawn:{x:0,z:3,rotation:Math.PI}};

FLOOR_PLANS.cafe={name:'Chamfered café garden',height:0,outline:[[-12,-7],[-9,-10],[9,-10],[12,-7],[12,7],[9,10],[-9,10],[-12,7]],doors:[['courtyard',-12,0,Math.PI/2],['park',12,0,-Math.PI/2]],spawn:{x:0,z:3,rotation:Math.PI}};

FLOOR_PLANS.park={name:'Curved pocket park',height:0,outline:curve(t=>[14*Math.cos(t),12*Math.sin(t)]),doors:[['courtyard',0,-12,0],['cafe',14,0,-Math.PI/2],['retreat',-14,0,Math.PI/2]],spawn:{x:0,z:3,rotation:Math.PI}};

FLOOR_PLANS.retreat={name:'Woodland clearing',height:0,outline:curve(t=>[14*Math.cos(t),12*Math.sin(t)*(1+.08*Math.sin(3*t))]),doors:[['park',14,0,-Math.PI/2]],spawn:{x:0,z:3,rotation:Math.PI}};

export const floorPlan=room=>FLOOR_PLANS[room]||FLOOR_PLANS.studio;

export function portalLocal(portal,x,z) {

  const dx=x-portal.x,dz=z-portal.z,c=Math.cos(portal.angle),s=Math.sin(portal.angle);

  return {x:dx*c-dz*s,z:dx*s+dz*c};

}

export function portalPoint(portal,x,z) {

  const c=Math.cos(portal.angle),s=Math.sin(portal.angle);

  return {x:portal.x+x*c+z*s,z:portal.z-x*s+z*c};

}

export function roomArrival(room,from) {

  const plan=floorPlan(room),door=plan.doors.find(d=>d[0]===from);

  if(!door)return {...plan.spawn};

  const [,x,z,angle]=door;

  return {...portalPoint({x,z,angle},0,2.1),rotation:angle};

}

export function insideFootprint(room,x,z,margin=.28) {

  if(!Number.isFinite(x)||!Number.isFinite(z))return false;

  const outline=floorPlan(room).outline;let inside=false;

  for(let i=0,j=outline.length-1;i<outline.length;j=i++) {

    const [ax,az]=outline[j],[bx,bz]=outline[i];

    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;

    const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));

    if(Math.hypot(x-ax-t*dx,z-az-t*dz)<margin)return false;

  }

  return inside;

}

