export function displayStorey(m) {
  if (m.name === 'Decke ueber Erdgeschoss') return 'Dachgeschoss';
  if (/^Decke ueber Keller$|^Daemmung Decke (Keller|Waschkueche)$/.test(m.name)) return 'Erdgeschoss';
  return m.geschoss || 'ohne Zuordnung';
}
const names = {IfcWall:'Wände', IfcSlab:'Decken und Böden', IfcRoof:'Dach', IfcBeam:'Balken', IfcCovering:'Dämmung', IfcChimney:'Schornstein', IfcStairFlight:'Treppen', IfcDoor:'Türen', IfcWindow:'Fenster', IfcOutlet:'Steckdosen', IfcSwitchingDevice:'Schalter', IfcLightFixture:'Beleuchtung', IfcCableSegment:'Leitungen', IfcPipeSegment:'Rohre', IfcSensor:'Sensoren'};
Object.assign(names, {IfcCableCarrierSegment:'Kabelkanäle', IfcCommunicationsAppliance:'Netzwerkgeräte', IfcElectricFlowStorageDevice:'Stromspeicher', IfcJunctionBox:'Verteilerdosen', IfcSanitaryTerminal:'Sanitär', IfcSolarDevice:'Solaranlage', IfcSpaceHeater:'Heizkörper', IfcUnitaryControlElement:'Regelung', IfcValve:'Ventile'});
export function groupPath(m) {
  const category = m.typ === 'IfcFurniture' ? 'Einrichtung' : /Ifc(Wall|Slab|Roof|Beam|Column|Covering|Chimney|Stair|StairFlight|Door|Window)$/.test(m.typ) ? 'Baukörper' : 'Haustechnik';
  const heating = m.psets?.Pset_Heizkoerper;
  const group = heating ? `Heizung ${heating.Raum || ''}`.trim() : m.psets?.Pset_Fotoeinrichtung?.Raum || names[m.typ] || (m.typ || 'Sonstige').replace(/^Ifc/, '');
  return [displayStorey(m), category, group];
}
export function buildTree(elements) {
  const root = {id:'Haus', label:'Gesamtes Haus', children:[], keys:[]};
  for (const e of elements) {
    let node = root; node.keys.push(e.key);
    for (const label of groupPath(e.meta)) {
      let child = node.children.find(c => c.label === label);
      if (!child) { child = {id:`${node.id}/${label}`, label, children:[], keys:[]}; node.children.push(child); }
      child.keys.push(e.key); node = child;
    }
    node.children.push({id:e.key, label:e.meta.name || 'Unbenanntes Bauteil', children:[], keys:[e.key]});
  }
  const rank = {Dachgeschoss:0, Erdgeschoss:1, Kellergeschoss:2};
  root.children.sort((a,b) => (rank[a.label]??3)-(rank[b.label]??3) || a.label.localeCompare(b.label,'de'));
  return root;
}
export function checkboxState(keys, hidden) {
  const visible = keys.filter(k => !hidden.has(k)).length;
  return {checked:visible === keys.length && visible > 0, mixed:visible > 0 && visible < keys.length};
}
