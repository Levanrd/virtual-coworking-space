import * as THREE from 'three';
import {ROOM_DESIGNS} from '../shared/world.js';

// Lightweight destination architecture visible through each doorway. Keep the
// middle aisle open: the room handoff happens inside the threshold, not in front.
export function buildPortalInterior(root, portal, {box,cyl,plant}) {
  const garden=portal.id==='terrace'||!!ROOM_DESIGNS[portal.id]?.outdoor, lounge=portal.id==='lounge', studio=portal.id==='studio';
  const wood=garden?'#b69a72':lounge?'#987756':'#c9b692';
  const wall=lounge?'#dbc0a1':studio?'#e9e0cf':'#dbe2d5';
  const trim=garden?'#859272':lounge?'#896b4f':'#9baa98';
  const g=new THREE.Group();g.name=`View into ${portal.name}`;g.position.x=portal.x;root.add(g);
  box(g,[4.86,.10,17],[0,-.05,-15.5],wood,'wood',0);
  // A continuous inset runner/deck leads the eye beyond the foreground opening.
  if(!garden)box(g,[1.5,.014,14],[0,.005,-15],lounge?'#c2ad8e':'#b9c5b3','fabric',0);
  else for(let z=-7.4;z>-24;z-=.55)box(g,[4.8,.008,.016],[0,.006,z],'#887b60','paint',0);

  if(!garden) {
    for(const side of [-1,1]) {
      box(g,[.1,4.35,17],[side*2.45,2.175,-15.5],wall,'paint',0);
      box(g,[.13,.12,17],[side*2.38,.09,-15.5],trim,'wood',0);
      // Recessed wall panels give the side walls scale without a dead-end backdrop.
      for(const z of [-11,-16,-21]) {
        box(g,[.025,1.9,2.3],[side*2.385,2.55,z],lounge?'#b89572':'#b0beae','fabric',0);
        box(g,[.03,.035,2.4],[side*2.36,3.53,z],trim,'wood',0);
      }
    }
    box(g,[4.9,.08,17],[0,4.35,-15.5],lounge?'#e6cfaf':'#eeeade','paint',0).castShadow=false;
    for(const z of [-9.2,-14.4,-19.6]) {
      box(g,[4.8,.13,.12],[0,4.21,z],trim,'wood',0);
      cyl(g,.012,.65,[0,3.89,z],'#7b725f','metal');
      cyl(g,lounge?.32:.24,.16,[0,3.5,z],lounge?'#ead3af':'#f2edda');
      cyl(g,.20,.018,[0,3.41,z],'#fff0ca');
    }
    // Full-height opening onto a distant courtyard, not a wall behind the furniture.
    box(g,[4.9,.55,.15],[0,.275,-24],wall,'paint',0);
    box(g,[4.9,.15,.15],[0,4.22,-24],trim,'wood',0);
    for(const x of [-2.35,-.8,.8,2.35])box(g,[.045,3.6,.06],[x,2.36,-24],trim,'metal',0);
  } else {
    for(const z of [-9,-14,-19,-23]) {
      for(const x of [-2.18,2.18])box(g,[.12,3.7,.12],[x,1.85,z],'#a68d69','wood');
      box(g,[4.65,.17,.16],[0,3.74,z],'#a68d69','wood');
    }
    for(const x of [-2.18,2.18])box(g,[.15,.18,16],[x,3.7,-15.5],'#a68d69','wood');
    for(let z=-8;z>-23.5;z-=1.05)box(g,[4.6,.08,.085],[0,3.9,z],'#c0a882','wood');
    for(const x of [-2.35,2.35])box(g,[.05,.055,16],[x,1,-15.5],'#687b5f','metal');
    box(g,[4.8,.055,.05],[0,1,-24],'#687b5f','metal');
  }

  for(const side of [-1,1]) {
    plant(g,side*1.95,-8.75,garden?1.05:.8);
    plant(g,side*1.94,-21.7,garden?1.55:1.15);
    if(lounge) {
      // Sofas run along the walls, leaving an inviting aisle between them.
      for(const z of [-12,-17.5]) {
        const color=side<0?'#c29a7d':'#9da787';
        box(g,[.77,.23,2.25],[side*1.89,.43,z],color,'fabric',.09);
        box(g,[.18,.62,2.25],[side*2.22,.75,z],color,'fabric',.09);
        for(const dz of [-1.06,1.06])box(g,[.83,.44,.17],[side*1.89,.60,z+dz],color,'fabric',.065);
        for(const dz of [-.62,.62])box(g,[.14,.4,.49],[side*2.10,.83,z+dz],side<0?'#e1c7a2':'#c6cead','fabric',.05);
        cyl(g,.29,.07,[side*1.14,.55,z],'#cfb58c','wood');
        cyl(g,.07,.5,[side*1.14,.26,z],'#927653','wood');
        cyl(g,.045,.09,[side*1.14,.63,z],'#f4e6d0');
      }
    } else if(garden) {
      for(const z of [-12,-17.5]) {
        box(g,[.62,.54,1.5],[side*2,.27,z],'#cab18b','wood');
        plant(g,side*2,z,.9).position.y=.43;
      }
      cyl(g,.43,.08,[side*1.6,.8,-14.7],'#c8ad7f','wood');
      cyl(g,.09,.75,[side*1.6,.38,-14.7],'#6f7d5b','metal');
    } else {
      for(const z of [-11.5,-16.3,-20]) {
        box(g,[.85,.08,1.75],[side*1.94,1,z],wood,'wood');
        for(const dz of [-.65,.65])box(g,[.055,.95,.055],[side*1.94,.48,z+dz],trim,'metal');
        box(g,[.53,.12,.56],[side*1.10,.53,z],studio?'#b5a4c5':'#a5b49e','fabric',.04);
        box(g,[.10,.52,.56],[side*.86,.8,z],studio?'#b5a4c5':'#a5b49e','fabric',.04);
        cyl(g,.04,.46,[side*1.10,.26,z],trim,'metal');
        box(g,[.35,.025,.44],[side*1.87,1.06,z],'#b2b9b0','metal');
        box(g,[.025,.30,.44],[side*2.04,1.21,z],'#617169','metal');
        box(g,[.006,.24,.37],[side*2.024,1.21,z],'#d0e0d3');
        if(studio)for(let i=0;i<3;i++)box(g,[.018,.23,.22],[side*2.36,2.1+i*.35,z+i*.3],['#c8b8d2','#dfc698','#b2c5a3'][i]);
        else box(g,[.83,.32,.035],[side*1.95,1.2,z-.8],'#a5b49e','fabric');
      }
    }
  }
  // Layered planting and skyline beyond the far glazing / terrace railing.
  box(g,[4.9,.10,7],[0,-.14,-27.5],'#98aa83','paint',0);
  for(const x of [-1.9,1.9])plant(g,x,-26.5,1.8);
  for(const [x,h] of [[-1.8,3.5],[1.1,5.6]])box(g,[1.3,h,1.4],[x,h/2-1,-32],garden?'#b1c6c9':'#c6d3cc','paint',0).castShadow=false;
  return g;
}
