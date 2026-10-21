export const CENTER = [51.961389, 7.625308];
export const CATEGORIES = [
  ['playground','Spielplätze','Spielplatz spielen Kinder','play','orange'],
  ['kindergarden','Kitas','Kindergarten Kindertagesstätte Kinder','family','violet'],
  ['babychange','Still- & Wickelplätze','Stillen Wickeln Wickelraum Baby','family','rose'],
  ['wc','Öffentliche WCs','Toilette WC barrierefrei','wc','blue'],
  ['pool','Bäder','Schwimmbad schwimmen Freibad Hallenbad','water','blue'],
  ['library','Büchereien','Bibliothek Bücher lesen','book','purple'],
  ['bookbus','Bücherbus','Bücherbus Haltestelle lesen','book','purple'],
  ['sport','Sportstätten','Sport Sportplatz Sporthalle','sport','green'],
  ['school','Schulen','Schule Bildung','book','violet'],
  ['wifi','WLAN','WLAN Wifi Internet Hotspot','wifi','blue'],
  ['container','Recycling','Recycling Container Altglas Altkleider','recycle','green'],
  ['agencies','Ämter & Beratung','Amt Behörde Beratungsstelle Verwaltung','building','slate'],
  ['cemetery','Friedhöfe','Friedhof','leaf','green'],
  ['papierkorb','Abfalleimer','Papierkorb Müll Mülleimer','bin','slate'],
  ['construction','Baustellen','Baustelle Aufgrabung','construction','orange'],
  ['lunch','Mittagstische','Mittagessen Mittagstisch Essen','food','orange'],
  ['webcam','Webcams','Webcam Kamera','camera','slate'],
].map(([id,name,keywords,icon,color])=>({id,name,keywords,icon,color}));
export const category = id => CATEGORIES.find(c=>c.id===id) || {id,name:id||'Ort',keywords:'',icon:'pin',color:'slate'};
export const normalize = text => String(text ?? '').toLocaleLowerCase('de-DE').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export const nameOf = p => p.source.name || category(p.source.type).name;

export function distance(a, b) {
  const rad = n=>n*Math.PI/180;
  const dlat=rad(b[0]-a[0]), dlon=rad(b[1]-a[1]);
  const value=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(value),Math.sqrt(Math.max(0,1-value)));
}

function onSegment(p,a,b) {
  const cross=(p[1]-a[1])*(b[0]-a[0])-(p[0]-a[0])*(b[1]-a[1]);
  return Math.abs(cross)<1e-12 && p[0]>=Math.min(a[0],b[0])-1e-12 && p[0]<=Math.max(a[0],b[0])+1e-12 && p[1]>=Math.min(a[1],b[1])-1e-12 && p[1]<=Math.max(a[1],b[1])+1e-12;
}
function ringContains(point,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if(onSegment(point,a,b)) return 2;
    if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside?1:0;
}
export function contains(geometry,lon,lat) {
  const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:geometry.type==='Polygon'?[geometry.coordinates]:[];
  return polygons.some(rings=> {
    if(!ringContains([lon,lat],rings[0])) return false;
    return !rings.slice(1).some(r=>ringContains([lon,lat],r)===1);
  });
}
export const districtAt = (districts,lat,lon)=>districts.find(d=>contains(d.geometry,lon,lat));

export function prepare(items) {
  return items.map(p=>({...p, search:normalize([nameOf(p),category(p.source.type).name,category(p.source.type).keywords,
    p.source.description,JSON.stringify(p.source.address||{}),JSON.stringify(p.source.properties||{})].join(' '))}));
}
export function groupPlaces(items) {
  const groups=new Map();
  for(const p of items){
    // Only merge named records of the same category at the same point (sub-meter precision).
    // Different facilities nearby, different categories, and unnamed objects stay separate.
    const key=p.source.name?.trim()?JSON.stringify([p.source.type,normalize(p.source.name).trim(),p.lat.toFixed(6),p.lon.toFixed(6)]):p.id;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  }
  return [...groups.values()].map(variants=>{
    const first=[...variants].sort((a,b)=>a.id.localeCompare(b.id))[0];
    return {...first,variants,search:[...new Set(variants.map(p=>p.search))].join(' ')};
  });
}
export const variantSummary=p=>[...new Set((p.variants||[]).map(v=>v.source.properties?.Teilprodukt||v.source.properties?.Produkt).filter(Boolean))].join(' · ');
export function query(items,state,districts) {
  const terms=normalize(state.q).trim().split(/\s+/).filter(Boolean);
  const selected=districts.find(d=>d.id===state.district);
  const center=state.center||CENTER;
  return items.filter(p=> {
    if(state.category && p.source.type!==state.category) return false;
    if(!state.category && !state.q && p.source.type==='papierkorb') return false;
    if(terms.some(t=>!p.search.includes(t))) return false;
    if(selected && !contains(selected.geometry,p.lon,p.lat)) return false;
    if(Number(state.radius)>0 && distance(center,[p.lat,p.lon])>Number(state.radius)*1000) return false;
    return true;
  }).map(p=>({...p,distance:distance(center,[p.lat,p.lon])})).sort((a,b)=> {
    if(state.sort==='name') return nameOf(a).localeCompare(nameOf(b),'de');
    return a.distance-b.distance||nameOf(a).localeCompare(nameOf(b),'de');
  });
}

export function safeUrl(value) {
  try {const url=new URL(String(value));return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
export function stateFromUrl(url) {
  const p=new URL(url).searchParams;
  const lat=Number(p.get('lat')),lon=Number(p.get('lon'));
  const center=p.has('lat')&&p.has('lon')&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=51.7&&lat<=52.2&&lon>=7.2&&lon<=8?[lat,lon]:CENTER;
  return {q:(p.get('q')||'').slice(0,300),category:CATEGORIES.some(c=>c.id===p.get('category'))?p.get('category'):'',
    district:p.get('district')||'',radius:['0','0.5','1','2','5','10'].includes(p.get('radius'))?p.get('radius'):'0',
    sort:['distance','name'].includes(p.get('sort'))?p.get('sort'):'distance',center,
    selected:p.get('place')||''};
}
export function urlFromState(url,state) {
  const u=new URL(url);u.search='';
  for(const k of ['q','category','district']) if(state[k])u.searchParams.set(k,state[k]);
  if(state.radius!=='0')u.searchParams.set('radius',state.radius);
  if(state.sort!=='distance')u.searchParams.set('sort',state.sort);
  if(state.selected)u.searchParams.set('place',state.selected);
  // Precise device location stays in memory. Explicit share uses a rounded center.
  if(state.center && (state.center[0]!==CENTER[0]||state.center[1]!==CENTER[1])) {
    u.searchParams.set('lat',state.center[0].toFixed(3));u.searchParams.set('lon',state.center[1].toFixed(3));
  }
  return u;
}
