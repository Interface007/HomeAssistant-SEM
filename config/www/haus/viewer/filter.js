import {byStorey, hiddenElements, hiddenStoreys, hiddenTypes, model, meta, roomLabels, wallLabels, deviceLabels} from 'haus/state.js';
import {walkStoreySel} from 'haus/walk.js';
import {buildTree, checkboxState, displayStorey} from 'haus/tree.js';
let elements = new Map();
const controls = [];
const expanded = new Set(['Haus','Haus/Erdgeschoss']);
export function renderLists(selectedStorey = '') {
  elements = new Map();
  model.traverse(o => {
    if (!o.isMesh) return;
    const key = o.userData.gid || o.uuid;
    if (!elements.has(key)) elements.set(key, {key, meta:meta[key] || {name:o.name, geschoss:o.userData.geschoss, typ:o.userData.gruppe}, meshes:[]});
    elements.get(key).meshes.push(o);
  });
  for (const e of elements.values()) {
    if (hiddenStoreys.has(e.meta.geschoss) || e.meshes.some(m => hiddenTypes.has(m.userData.gruppe))) hiddenElements.add(e.key);
  }
  hiddenStoreys.clear(); hiddenTypes.clear();
  controls.length = 0;
  document.getElementById('types').replaceChildren(renderNode(buildTree([...elements.values()])));
  walkStoreySel.replaceChildren();
  [...byStorey.keys()].sort().forEach(k => {
    const o = document.createElement('option'); o.value=k; o.textContent=k;
    if (k === selectedStorey || (!selectedStorey && /Erdgeschoss/i.test(k))) o.selected=true;
    walkStoreySel.append(o);
  });
  syncChecks();
}
function renderNode(node) {
  const wrapper=document.createElement('div'); wrapper.className='tree-node';
  const row=document.createElement('div'); row.className='tree-row';
  const branch=node.children.length>0;
  const toggle=document.createElement(branch?'button':'span'); toggle.className='tree-toggle';
  row.append(toggle);
  const label=document.createElement('label'); label.className='tree-label';
  const cb=document.createElement('input'); cb.type='checkbox';
  cb.onchange=()=>{ for(const key of node.keys) { if(cb.checked) hiddenElements.delete(key); else hiddenElements.add(key); } applyVisibility(); };
  const text=document.createElement('span'); text.textContent=node.label==='Dachgeschoss'?'DG / OG':node.label; text.title=node.label;
  label.append(cb,text); row.append(label);
  if(branch) {const count=document.createElement('span');count.className='count';count.textContent=node.keys.length;row.append(count);}
  wrapper.append(row); controls.push({cb,node});
  if(branch) {
    const children=document.createElement('div');children.className='tree-children';
    const update=()=>{const open=expanded.has(node.id);children.hidden=!open;toggle.textContent=open?'▾':'▸';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',`${node.label} ${open?'zuklappen':'aufklappen'}`);};
    toggle.type='button';toggle.onclick=()=>{expanded.has(node.id)?expanded.delete(node.id):expanded.add(node.id);update();};
    for(const child of node.children)children.append(renderNode(child));
    wrapper.append(children);update();
  }
  return wrapper;
}
function syncChecks(){for(const {cb,node} of controls){const s=checkboxState(node.keys,hiddenElements);cb.checked=s.checked;cb.indeterminate=s.mixed;}}
export function applyVisibility(){
  if(!model)return;
  const visibleStoreys=new Set();
  for(const e of elements.values()){const visible=!hiddenElements.has(e.key);for(const mesh of e.meshes)mesh.visible=visible;if(visible)visibleStoreys.add(displayStorey(e.meta));}
  for(const group of [wallLabels,roomLabels,deviceLabels])for(const sprite of group.children){sprite.visible=sprite.userData.gid?!hiddenElements.has(sprite.userData.gid):visibleStoreys.has(sprite.userData.geschoss);}
  syncChecks();
}
document.getElementById('showAll').onclick=()=>{hiddenElements.clear();applyVisibility();};
document.getElementById('showEG').onclick=()=>{hiddenElements.clear();for(const e of elements.values())if(displayStorey(e.meta)==='Dachgeschoss')hiddenElements.add(e.key);applyVisibility();document.getElementById('top').click();};
