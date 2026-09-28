import { projectReducer, normalize } from '../src/state/projectReducer.js';
import { makeInk, normalizeInks } from '../src/engine/ink.js';

let pass=0, fail=0;
const ok=(n,c,e)=>{ if(c){pass++;console.log('  \x1b[32m✓\x1b[0m '+n);} else {fail++;console.log('  \x1b[31m✗\x1b[0m '+n+(e?'  → '+e:''));} };
const R=(s,a)=>projectReducer(s,a);
const base=()=>normalize({scenes:[{name:'S',start:0,end:5,layers:[],texts:[],annots:[]}]});
const sc=(s)=>s.scenes[0];

console.log('\n\x1b[1mlegacy migration\x1b[0m');
const old=normalize({scenes:[{name:'OLD',start:0,end:4,layers:[],texts:[]}]});
ok('a project saved before this feature still opens', !!old.scenes[0]);
ok('…and gets an empty annot list', Array.isArray(old.scenes[0].annots) && old.scenes[0].annots.length===0);
ok('a scene with no layers at all survives', normalize({scenes:[{start:0,end:3}]}).scenes.length===1);

console.log('\n\x1b[1mannot lifecycle\x1b[0m');
let s=base();
const a=makeInk({tool:'ellipse',pts:[{x:.3,y:.3},{x:.7,y:.7}]});
s=R(s,{type:'annot/add',id:sc(s).id,annot:a});
ok('add puts it on the scene', sc(s).annots.length===1);
ok('add keeps the id', sc(s).annots[0].id===a.id);
ok('add fills in anim defaults', !!sc(s).annots[0].anim && sc(s).annots[0].anim.type==='draw');

const id=a.id;
s=R(s,{type:'annot/update',id:sc(s).id,annotId:id,patch:{color:'#ff4d4d'}});
ok('update patches the colour', sc(s).annots[0].color==='#ff4d4d');
ok('update leaves the anim alone', sc(s).annots[0].anim.type==='draw');
s=R(s,{type:'annot/update',id:sc(s).id,annotId:id,patch:{anim:{dur:2}}});
ok('a partial anim patch merges', sc(s).annots[0].anim.dur===2 && sc(s).annots[0].anim.type==='draw');
s=R(s,{type:'annot/update',id:sc(s).id,annotId:id,patch:{width:999}});
ok('update clamps the width', sc(s).annots[0].width<=90);

const b=makeInk({tool:'arrow',pts:[{x:.1,y:.1},{x:.2,y:.2}],name:'B'});
s=R(s,{type:'annot/add',id:sc(s).id,annot:b});
ok('second add stacks on top', sc(s).annots.length===2 && sc(s).annots[1].id===b.id);
s=R(s,{type:'annot/move',id:sc(s).id,annotId:b.id,dir:-1});
ok('move reorders', sc(s).annots[0].id===b.id);
s=R(s,{type:'annot/move',id:sc(s).id,annotId:b.id,dir:-1});
ok('move clamps at the ends', sc(s).annots.length===2);
s=R(s,{type:'annot/delete',id:sc(s).id,annotId:id});
ok('delete removes one', sc(s).annots.length===1);
s=R(s,{type:'annot/clear',id:sc(s).id});
ok('clear empties the scene', sc(s).annots.length===0);
s=R(s,{type:'annot/add',id:sc(s).id,annot:{tool:'pen',pts:[]}});
ok('an empty stroke is rejected', sc(s).annots.length===0);

console.log('\n\x1b[1mscene ops keep annots consistent\x1b[0m');
let p=normalize({scenes:[{name:'A',start:0,end:4,layers:[],texts:[]},{name:'B',start:4,end:8,layers:[],texts:[]}]});
const A=p.scenes[0].id;
const ann=makeInk({tool:'ellipse',pts:[{x:.3,y:.3},{x:.7,y:.7}]});
p=R(p,{type:'annot/add',id:A,annot:ann});
p=R(p,{type:'scene/duplicate',id:A});
const clone=p.scenes[1];
ok('duplicate copies the annotations', clone.annots.length===1);
ok('…with a FRESH id so they stay independent', clone.annots[0].id!==ann.id);
ok('…and the same shape', JSON.stringify(clone.annots[0].pts)===JSON.stringify(ann.pts));
p=R(p,{type:'annot/delete',id:A,annotId:ann.id});
ok('deleting from the original leaves the copy intact', p.scenes[0].annots.length===0 && p.scenes[1].annots.length===1);
p=R(p,{type:'scene/delete',id:A});
ok('scene delete takes the clone with it and spares the rest',
   p.scenes.length===2 && p.scenes[0].name.indexOf('কপি')>-1 && p.scenes[0].annots.length===1 && p.scenes[1].name==='B');

console.log('\n\x1b[1mJSON round-trip\x1b[0m');
const {image,...savable}=p;
const file=JSON.stringify({version:2,...savable});
const back=normalize(JSON.parse(file));
ok('annotations survive save → load', back.scenes[0].annots.length===1);
ok('animation settings survive', back.scenes[0].annots[0].anim.type==='draw' && back.scenes[0].annots[0].anim.dur>0);
ok('points survive at full precision', back.scenes[0].annots[0].pts.length===2);
ok('a file with a corrupt annot list degrades gracefully',
   normalize({scenes:[{start:0,end:3,annots:['nope',{tool:'pen'},null,{tool:'ellipse',pts:[{x:.2,y:.2},{x:.8,y:.8}]}]}]}).scenes[0].annots.length===1);

console.log('\n'+(fail?'\x1b[31m':'\x1b[32m')+pass+' passed, '+fail+' failed\x1b[0m\n');
process.exit(fail?1:0);
