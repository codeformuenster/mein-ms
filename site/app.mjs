import {CENTER,CATEGORIES,category,normalize,nameOf,distance,districtAt,prepare,groupPlaces,variantSummary,query,safeUrl,stateFromUrl,urlFromState} from './search.mjs';
import {icon} from './icons.mjs';

const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const textValue=value=>typeof value==='object'?JSON.stringify(value):String(value??'');
const plain=value=>{
  // Strip markup without creating image/iframe nodes that could load remote resources.
  const decoder=document.createElement('textarea');
  decoder.innerHTML=String(value??'').replace(/<[^>]*>/g,' ');
  return decoder.value;
};
const fmtDistance=d=>d<1000?`${Math.round(d/10)*10} m`:`${(d/1000).toLocaleString('de-DE',{maximumFractionDigits:1})} km`;
const state=stateFromUrl(location.href);
let places=[],districts=[],metadata=null,results=[],pageSize=30,map=null,layer=null,districtLayer=null,centerMarker=null;
let searchVersion=0,selected=null,lastFocus=null,locationStatus='';
const markers=new Map();
const preferred=['playground','kindergarden','wc','pool','library','babychange'];

function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
async function fetchJson(path){const response=await fetch(new URL(path,import.meta.url),{cache:'no-cache'});if(!response.ok)throw new Error(`Datei ${path} nicht erreichbar (${response.status}).`);return response.json();}
function props(p){return Object.fromEntries(Object.entries(p.source.properties||{}).map(([k,v])=>[normalize(k),v]));}
function address(p){const v=props(p);return p.source.address?.street||v.adresse||[v.strname||v.str_name||v.strasse||v.straße||v.street,v.hsnr,v.hsnr_zus].filter(Boolean).join(' ')||v.location||'';}
function makeIcon(c,extra=''){const node=el('span',`icon-wrap ${extra}`);node.dataset.color=c.color;node.innerHTML=icon(c.icon);return node;}
function formatCount(n){return n.toLocaleString('de-DE');}
function updateControls(){
  $('search').value=state.q;$('district').value=state.district;$('radius').value=state.radius;$('sort').value=state.sort;
  document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===state.category)));
  const c=state.category?category(state.category):null;
  $('results-heading').replaceChildren(document.createTextNode(c?c.name:'Orte entdecken'),$('result-count'));
  $('scope-label').textContent=districts.find(d=>d.id===state.district)?.properties.Name.toLocaleUpperCase('de-DE')|| (state.radius!=='0'?'IN DEINER NÄHE':'GANZ MÜNSTER');
}
function renderCategories(){
  for(const c of CATEGORIES){
    const prominent=preferred.includes(c.id);const b=el('button',prominent?'category-tile':'category-chip');b.type='button';b.dataset.category=c.id;b.dataset.color=c.color;
    if(prominent){b.append(makeIcon(c),el('span','',c.name));}else{b.append(document.createTextNode(c.name),el('small','',formatCount(places.filter(p=>p.source.type===c.id).length)));}
    b.setAttribute('aria-pressed',String(state.category===c.id));
    b.addEventListener('click',()=>{state.category=state.category===c.id?'':c.id;state.selected='';refresh();});
    (prominent?$('category-grid'):$('more-categories')).append(b);
  }
}
function rememberedUrl(){
  // Do not put a device location into browser history. Share includes rounded center on request.
  const publicState={...state,center:state.privateLocation?CENTER:state.center};
  const u=urlFromState(location.href,publicState);
  history.replaceState(null,'',u);
}
async function refresh({sync=true,fit=false}={}){
  const version=++searchVersion;
  updateControls();pageSize=30;
  $('results').setAttribute('aria-busy','true');
  try{
    if(version!==searchVersion)return;
    results=query(places,state,districts);
    $('result-count').textContent=formatCount(results.length);
    let notice=locationStatus;
    if(!state.category&&!state.q)notice=notice||'Abfalleimer findest du über die Kategorie oder die Suche.';
    message(notice);renderResults();renderMap();
    if(sync)rememberedUrl();
    if(fit && map){const d=districts.find(d=>d.id===state.district);if(districtLayer)map.fitBounds(districtLayer.getBounds(),{padding:[30,30]});else if(d)map.setView([d.center.coordinates[1],d.center.coordinates[0]],14);}
  }catch(error){if(version===searchVersion){message(`Die Daten konnten nicht geladen werden. ${error.message} Bitte lade die Seite neu.`,true);$('results').replaceChildren();$('load-more').hidden=true;}}
  finally{if(version===searchVersion)$('results').setAttribute('aria-busy','false');}
}
function renderResults(){
  const root=$('results');root.replaceChildren();
  if(!results.length){const empty=el('div','empty-state');empty.append(el('strong','','Hier ist es gerade ruhig.'),el('span','','Versuche eine andere Kategorie, einen größeren Umkreis oder einen anderen Stadtteil.'));root.append(empty);}
  const fragment=document.createDocumentFragment();
  for(const p of results.slice(0,pageSize)){
    const c=category(p.source.type),b=el('button','result-card');b.type='button';b.dataset.place=p.id;b.dataset.color=c.color;b.setAttribute('aria-label',`${nameOf(p)}, ${c.name}, ${fmtDistance(p.distance)} entfernt. Details öffnen.`);
    const copy=el('span','result-copy');copy.append(el('span','result-type',c.name),el('span','result-name',nameOf(p)),el('span','result-address',address(p)||'Münster'));
    if((p.variants?.length||0)>1)copy.append(el('span','result-address',variantSummary(p)||'Mehrere Angaben zu diesem Ort'));
    const right=el('span','result-distance',fmtDistance(p.distance));right.append(el('span','result-arrow','↗'));
    b.append(makeIcon(c),copy,right);b.addEventListener('click',()=>showDetail(p));fragment.append(b);
  }
  root.append(fragment);$('load-more').hidden=results.length<=pageSize;$('load-more').textContent=`Weitere Orte anzeigen (${formatCount(results.length-Math.min(results.length,pageSize))} weitere)`;
  $('map-count').textContent=`${formatCount(results.length)} ${results.length===1?'Ort':'Orte'} gefunden`;
}
function initMap(){
  if(!window.L){message('Die Kartenbibliothek fehlt. Die Liste bleibt nutzbar.',true);return;}
  const L=window.L;
  map=L.map('map',{zoomControl:false,preferCanvas:true,minZoom:6,maxZoom:18}).setView(state.center,14);
  L.control.zoom({position:'bottomright'}).addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
  const BasemapLayer=L.TileLayer.extend({getTileUrl(coords){return L.Util.template(this._url,{z:String(coords.z).padStart(2,'0'),y:coords.y,x:coords.x});}});
  const tiles=new BasemapLayer('https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png',{
    minZoom:0,maxZoom:18,tileSize:256,crossOrigin:'anonymous',
    attribution:'© GeoBasis-DE / <a href="https://www.bkg.bund.de" target="_blank" rel="noopener noreferrer">BKG</a> '+new Date().getFullYear()+' <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>',
  }).addTo(map);
  let tileErrorCount=0;
  tiles.on('tileerror',()=>{if(++tileErrorCount===3)message('Die Hintergrundkarte ist gerade nicht erreichbar. Die Suche und alle Ortsinformationen bleiben verfügbar.',true);});
  layer=L.layerGroup().addTo(map);
  map.on('moveend',()=>{renderPins();$('search-area').hidden=false;});
  map.on('click',event=>{const d=districtAt(districts,event.latlng.lat,event.latlng.lng);if(d){const box=el('div');box.append(el('strong','',d.properties.Name));const b=el('button','','Diesen Stadtteil entdecken');b.addEventListener('click',()=>{state.district=d.id;state.radius='0';state.center=[d.center.coordinates[1],d.center.coordinates[0]];map.closePopup();refresh({fit:true});});box.append(b);L.popup().setLatLng(event.latlng).setContent(box).openOn(map);}});
}
function renderMap(){
  if(!map)return;
  if(districtLayer){districtLayer.remove();districtLayer=null;}
  const d=districts.find(d=>d.id===state.district);
  if(d)districtLayer=L.geoJSON(d,{style:{color:'#45674b',weight:2,fillColor:'#c2d5a4',fillOpacity:.12},interactive:false}).addTo(map);
  if(centerMarker){centerMarker.remove();centerMarker=null;}
  if(state.radius!=='0'){
    centerMarker=L.circle(state.center,{radius:Number(state.radius)*1000,color:'#3b6952',weight:1,dashArray:'4 5',fillOpacity:.025,interactive:false}).addTo(map);
  }
  renderPins();
}
function renderPins(){
  if(!map||!layer)return;
  layer.clearLayers();markers.clear();
  const bounds=map.getBounds().pad(.1),groups=new Map();
  for(const p of results){
    if(!bounds.contains([p.lat,p.lon]))continue;
    const point=map.latLngToContainerPoint([p.lat,p.lon]);const key=`${Math.floor(point.x/45)}:${Math.floor(point.y/45)}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);
  }
  for(const group of groups.values()){
    const p=group[0],c=category(p.source.type),cluster=group.length>1;
    const lat=group.reduce((v,p)=>v+p.lat,0)/group.length,lon=group.reduce((v,p)=>v+p.lon,0)/group.length;
    const html=`<span class="pin-face" data-color="${cluster?'green':c.color}">${cluster?`<b>${group.length}</b>`:icon(c.icon)}</span>`;
    const marker=L.marker([lat,lon],{icon:L.divIcon({className:`map-pin ${cluster?'cluster':''}`,html,iconSize:[34,39],iconAnchor:[17,34]}),title:cluster?`${group.length} Orte – zum Vergrößern anklicken`:nameOf(p),keyboard:true}).addTo(layer);
    marker.on('click',()=>{
      if(!cluster){showDetail(p);return;}
      if(map.getZoom()<18 && Math.max(...group.map(p=>p.lat))-Math.min(...group.map(p=>p.lat))+Math.max(...group.map(p=>p.lon))-Math.min(...group.map(p=>p.lon))>.00005){map.fitBounds(L.latLngBounds(group.map(p=>[p.lat,p.lon])),{padding:[50,50],maxZoom:18});}
      else{const box=el('div');box.append(el('strong','',`${group.length} Orte hier`));for(const item of group.slice(0,25)){const b=el('button','',nameOf(item));b.addEventListener('click',()=>showDetail(item));box.append(b);}if(group.length>25)box.append(el('p','', 'Weitere Orte findest du in der Ergebnisliste.'));marker.bindPopup(box,{maxHeight:250}).openPopup();}
    });
    if(!cluster)markers.set(p.id,marker);
  }
}
const propertyLabels={name:'Name',adresse:'Adresse',strasse:'Straße',strname:'Straße',str_name:'Straße',hsnr:'Hausnummer',plz:'Postleitzahl',ort:'Ort',tel:'Telefon',homepage:'Website',url:'Website',link:'Website',link1:'Weitere Informationen',link2:'Weitere Informationen',opening_hours:'Öffnungszeiten',barrierefrei:'Barrierefrei',montag:'Montag',dienstag:'Dienstag',mittwoch:'Mittwoch',donnerstag:'Donnerstag',freitag:'Freitag',samstag:'Samstag',sonntag:'Sonntag',beschreibung:'Beschreibung',description:'Beschreibung',schooltype:'Schulart',groesse:'Größe (m²)',quelle:'Quelle',hinweis:'Hinweis',landesgefordert:'Landesgefördert', 'u3-platze':'Plätze für Kinder unter 3 Jahren', wheelchair:'Rollstuhlgerecht', operator:'Betreiber', phone:'Telefon', website:'Website', bereich:'Bereich', ball:'Ballspiel', skater:'Skaten', streetball:'Streetball', anzahl:'Anzahl', standpunkt:'Standort', objekt:'Ausstattung', recycling_type:'Sammelart', amenity:'Angebot', wlan_status:'WLAN-Status',zusatz_service:'Zusätzliche Angebote'};
function showDetail(p){
  selected=p;lastFocus=document.activeElement;state.selected=p.id;rememberedUrl();
  const c=category(p.source.type),s=p.source,v=props(p),root=$('detail-content');root.replaceChildren();
  root.append(makeIcon(c,'detail-icon'),el('p','eyebrow',c.name.toLocaleUpperCase('de-DE')));
  const title=el('h2','',nameOf(p));title.id='detail-title';root.append(title);
  root.append(el('p','detail-meta',[address(p),districtAt(districts,p.lat,p.lon)?.properties.Name,fmtDistance(distance(state.center,[p.lat,p.lon]))+' vom Suchmittelpunkt'].filter(Boolean).join(' · ')));
  const desc=s.description||v.description||v.beschreibung;if(desc)root.append(el('p','detail-description',plain(desc)));
  // Keep useful source fields visible for every category, including unknown future fields.
  const technical=/^(id|lfdnr|name|einrichtung name|rechtswert|hochwert|geokoordinate|koordinaten?|lat|lon|latitude|longitude|geometry)$/;
  const duplicate=/^(adresse|strasse|straße|strname|str_name|hsnr|hsnr_zus|plz|ort|beschreibung|description)$/;
  const extra=el('details','detail-properties');extra.append(el('summary','','Weitere Angaben'));
  const variants=p.variants?.length?p.variants:[p];
  for(const variant of variants){
    const dl=el('dl','detail-facts'),internal=el('dl');
    for(const [key,value] of Object.entries(variant.source.properties||{})){
      if(value===null||value==='')continue;
      const normalized=normalize(key);
      if(duplicate.test(normalized)||/^link\d*_txt$/.test(normalized))continue;
      const target=technical.test(normalized)?internal:dl;
      const label=({'U3-Plätze':'Plätze für Kinder unter 3 Jahren','Ü3-Plätze':'Plätze für Kinder ab 3 Jahren','Plätze Schulkinder':'Plätze für Schulkinder'})[key]||propertyLabels[normalized]||key.replace(/^recycling:/,'Recycling: ').replaceAll('_',' ');
      const dd=el('dd');const url=safeUrl(value);
      if(url){const link=el('a','',variant.source.properties?.[key+'_TXT']||'Weitere Informationen ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';dd.append(link);}
      else if(['barrierefrei','wheelchair'].includes(normalized)&&/^[JN]$/i.test(String(value)))dd.textContent=String(value).toUpperCase()==='J'?'Ja':'Nein';
      else if(/Plätze|^Anzahl$/.test(label)&&Number.isFinite(Number(value)))dd.textContent=Number(value).toLocaleString('de-DE');
      else dd.textContent=typeof value==='boolean'?(value?'Ja':'Nein'):textValue(value);
      target.append(el('dt','',label),dd);
    }
    if(dl.children.length){
      if(variants.length>1)root.append(el('h3','detail-variant',variant.source.properties?.Teilprodukt||variant.source.properties?.Produkt||'Angaben zum Ort'));
      root.append(dl);
    }
    internal.append(el('dt','','Datensatz-ID'),el('dd','',variant.sourceId));extra.append(internal);
  }
  root.append(extra,el('p','detail-meta','Übernommener Datenbestand. Öffnungszeiten und Angebote können sich geändert haben.'));
  const revision=metadata.revisions?.filter(r=>r.category===s.type).at(-1);
  if(revision){const note=el('p','detail-meta',`Quell-Dateistand: ${revision.sourceDataDate||'nicht bekannt'}. Übernommen: ${new Intl.DateTimeFormat('de-DE',{dateStyle:'medium'}).format(new Date(revision.updatedAt))}. Lizenz: ${revision.license}. `);const href=safeUrl(revision.source);if(href){const a=el('a','','Quelle');a.href=href;a.target='_blank';a.rel='noopener noreferrer';note.append(a);}root.append(note);}
  const actions=el('div','detail-actions');
  const sourceUrl=[s.url,v.url,v.homepage,v.website,v.link,v.link1].map(safeUrl).find(Boolean);
  if(sourceUrl){const link=el('a','','Website zum Ort ↗');link.href=sourceUrl;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
  const route=el('a','','Route planen ↗');route.href=`https://www.openstreetmap.org/directions?engine=fossgis_osrm_bike&route=;${p.lat},${p.lon}`;route.target='_blank';route.rel='noopener noreferrer';actions.append(route);
  const share=el('button','','Ort teilen');share.type='button';share.addEventListener('click',()=>copyLink(p.id,share));actions.append(share);root.append(actions);
  if(map){map.setView([p.lat,p.lon],Math.max(map.getZoom(),16),{animate:false});}
  if(!$('detail').open)$('detail').showModal();
}
async function copyLink(id,button){
  const u=urlFromState(location.href,{...state,selected:id||''});
  try{await navigator.clipboard.writeText(u.href);button.textContent='Link kopiert ✓';setTimeout(()=>button.textContent=id?'Ort teilen':'Suche teilen',2500);}
  catch{const input=el('input');input.value=u.href;input.readOnly=true;input.setAttribute('aria-label','Link zum Kopieren');button.after(input);input.focus();input.select();}
}

$('search-icon').innerHTML=icon('search');
let debounce;
$('search').addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.q=$('search').value;state.selected='';refresh();},180);});
$('search-form').addEventListener('submit',event=>{event.preventDefault();clearTimeout(debounce);state.q=$('search').value;refresh();});
$('district').addEventListener('change',()=>{state.district=$('district').value;state.radius='0';state.privateLocation=false;const d=districts.find(d=>d.id===state.district);state.center=d?[d.center.coordinates[1],d.center.coordinates[0]]:CENTER;locationStatus='';refresh({fit:true});});
for(const field of ['radius','sort'])$(field).addEventListener('change',()=>{state[field]=$(field).value;refresh();});
$('all-categories').addEventListener('click',()=>{const open=$('more-categories').hidden;$('more-categories').hidden=!open;$('all-categories').setAttribute('aria-expanded',String(open));$('all-categories').textContent=open?'Weniger Kategorien −':'Alle Kategorien ＋';});
$('reset').addEventListener('click',()=>{clearTimeout(debounce);Object.assign(state,{q:'',category:'',district:'',radius:'0',sort:'distance',center:CENTER,selected:'',privateLocation:false});locationStatus='';if(map)map.setView(CENTER,14);refresh();});
$('load-more').addEventListener('click',()=>{pageSize+=30;renderResults();});
// Only close when both press and release occur outside the dialog rectangle.
for(const dialog of [$('detail'),$('about-dialog')]){
  const outside=event=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
  let startedOutside=false;
  dialog.addEventListener('pointerdown',event=>{startedOutside=event.target===dialog&&outside(event);});
  dialog.addEventListener('click',event=>{if(startedOutside&&event.target===dialog&&outside(event))dialog.close();startedOutside=false;});
}
$('close-detail').addEventListener('click',()=>$('detail').close());
$('detail').addEventListener('close',()=>{state.selected='';rememberedUrl();if(lastFocus?.isConnected)lastFocus.focus();});
$('about').addEventListener('click',()=>$('about-dialog').showModal());$('close-about').addEventListener('click',()=>$('about-dialog').close());
$('share-search').addEventListener('click',()=>copyLink('', $('share-search')));
$('search-area').addEventListener('click',()=>{const center=map.getCenter();state.center=[center.lat,center.lng];state.district='';state.radius='2';locationStatus='Suche im Umkreis von 2 km um die Kartenmitte.';refresh();$('search-area').hidden=true;});
for(const [id,isMap] of [['show-list',false],['show-map',true]])$(id).addEventListener('click',()=>{document.body.classList.toggle('mobile-map',isMap);$('show-list').setAttribute('aria-pressed',String(!isMap));$('show-map').setAttribute('aria-pressed',String(isMap));if(map){map.invalidateSize();renderPins();}});
$('locate').addEventListener('click',()=>{
  if(!navigator.geolocation){message('Dein Browser unterstützt die Standortsuche nicht. Wähle einen Stadtteil.',true);return;}
  $('locate').disabled=true;message('Standort wird ermittelt …');
  navigator.geolocation.getCurrentPosition(position=>{
    $('locate').disabled=false;const center=[position.coords.latitude,position.coords.longitude];
    if(distance(CENTER,center)>20000){message('Dein Standort liegt außerhalb von Münster. Wähle bitte einen Stadtteil.',true);return;}
    state.center=center;state.radius='2';state.district='';state.privateLocation=true;locationStatus='In deiner Nähe · 2 km Umkreis. Standort nur für diese Sitzung.';
    if(map)map.setView(center,15);refresh();
  },()=>{$('locate').disabled=false;message('Standort nicht verfügbar oder nicht freigegeben. Du kannst einen Stadtteil wählen.',true);},{timeout:10000,maximumAge:60000,enableHighAccuracy:false});
});
window.addEventListener('popstate',()=>{Object.assign(state,stateFromUrl(location.href));refresh({sync:false});});

async function start(){
  try{
    const [raw,geo,meta]=await Promise.all([fetchJson('./data/places.json'),fetchJson('./data/districts.json'),fetchJson('./data/metadata.json')]);
    places=groupPlaces(prepare(raw));districts=geo.features;metadata=meta;
    if(state.district&&!districts.some(d=>d.id===state.district))state.district='';
    for(const d of [...districts].sort((a,b)=>a.properties.Name.localeCompare(b.properties.Name,'de'))){const option=el('option','',d.properties.Name);option.value=d.id;$('district').append(option);}
    renderCategories();initMap();
    const requestedId=state.selected;
    await refresh();
    if(requestedId){const p=places.find(p=>p.id===requestedId||p.variants?.some(v=>v.id===requestedId));if(p)showDetail(p);else message('Der geteilte Ort ist in diesem Datenbestand nicht vorhanden.',true);}
  }catch(error){message(`Die Anwendung konnte nicht geladen werden. ${error.message} Bitte lade die Seite neu.`,true);$('results').setAttribute('aria-busy','false');}
}
start();
