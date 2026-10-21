import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CENTER,contains,districtAt,distance,prepare,groupPlaces,variantSummary,query,safeUrl,stateFromUrl,urlFromState,normalize} from '../site/search.mjs';
const load=name=>JSON.parse(fs.readFileSync(new URL(`../site/data/${name}.json`,import.meta.url)));
const places=prepare(load('places')),districts=load('districts').features,meta=load('metadata');
const state={q:'',category:'',district:'',radius:'0',sort:'distance',center:CENTER};

test('migration retains all places and accounts for explicitly excluded records',()=>{
  const all=places;
  assert.equal(all.length,meta.places);assert.equal(districts.length,meta.districts);
  if(!meta.revisions?.length)assert.equal(all.length+meta.excludedDocuments,meta.sourceCounts.places);
  assert.equal(new Set(all.map(p=>p.id)).size,all.length);assert.equal(meta.rejected,0);
  for(const p of all){assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lon));assert.ok(p.source.properties);}
  assert.equal(all.filter(p=>!p.source.name).length,meta.unnamed);
});
test('category and free text find all migrated playgrounds and Wickelplätze',()=>{
  assert.equal(query(places,{...state,category:'playground'},districts).length,meta.types.playground);
  const textMatches=query(places,{...state,q:'Spielplatz'},districts);
  assert.equal(textMatches.filter(p=>p.source.type==='playground').length,meta.types.playground);
  assert.ok(textMatches.every(p=>p.search.includes('spielplatz')));
  assert.equal(query(places,{...state,category:'babychange'},districts).length,meta.types.babychange);
  assert.equal(query(places,{...state,category:'kindergarden'},districts).length,meta.types.kindergarden);
  const found=query(places,{...state,q:'Ludgeristraße'},districts);assert.ok(found.length>0);
  assert.ok(query(places,{...state,q:'[.*('},districts).length===0);
  assert.equal(normalize('Münster Straße'),'munster strasse');
});
test('geo distance is in meters and radius applies to every result',()=>{
  assert.equal(distance(CENTER,CENTER),0);
  assert.ok(Math.abs(distance([0,0],[0,1])-111195)<10);
  const found=query(places,{...state,radius:'0.5',category:'playground'},districts);
  assert.ok(found.length>0);for(const p of found)assert.ok(p.distance<=500);
  assert.ok(found.every((p,i)=>!i||p.distance>=found[i-1].distance));
});
test('polygon holes, edges, multipolygons and outside points',()=>{
  const g={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[3,3],[7,3],[7,7],[3,7],[3,3]]]};
  assert.ok(contains(g,1,1));assert.ok(!contains(g,5,5));assert.ok(contains(g,0,0));assert.ok(!contains(g,11,1));
  assert.ok(contains({type:'MultiPolygon',coordinates:[g.coordinates]},1,1));
  assert.ok(districtAt(districts,CENTER[0],CENTER[1]));
});
test('district search returns points only inside selected geometry',()=>{
  const selected=districts.find(d=>d.properties.Name==='Gievenbeck');
  const found=query(places,{...state,district:selected.id,category:'playground'},districts);
  assert.ok(found.length>0);for(const p of found)assert.ok(contains(selected.geometry,p.lon,p.lat));
});
test('Termine are physically absent and obsolete URL parameters cannot enable them',()=>{
  assert.equal(places.length,meta.places);
  assert.equal(meta.excludedDocuments,13423);
  assert.ok(places.every(p=>p.source.type!=='event'));
  assert.ok(!fs.existsSync(new URL('../site/data/events.json',import.meta.url)));
  assert.ok(!fs.existsSync(new URL('../dist/data/events.json',import.meta.url)));
  const old=stateFromUrl('https://example.test/?category=event&archive=1&sort=date');
  assert.equal(old.category,'');assert.equal(old.sort,'distance');assert.ok(!('archive' in old));
  assert.ok(!urlFromState('https://example.test/?archive=1',old).searchParams.has('archive'));
  const app=fs.readFileSync(new URL('../site/app.mjs',import.meta.url),'utf8');
  assert.ok(!app.includes('events.json'));assert.ok(!app.includes('ensureEvents'));
  const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.ok(!/Termine|Archiv/.test(html));
});
test('same facility is shown once without losing distinct products or source IDs',()=>{
  const grouped=groupPlaces(places);
  const found=query(grouped,{...state,category:'sport',q:'Sportanlage Pleistermühlenweg'},districts);
  assert.equal(found.length,1);assert.equal(found[0].variants.length,2);
  assert.deepEqual(new Set(found[0].variants.map(v=>v.sourceId)),new Set(['364','430']));
  const products=new Set(found[0].variants.map(v=>v.source.properties.Produkt));
  assert.ok(products.has('Bezirkssportanlage'));assert.ok(products.has('Sondersportanlage'));
  assert.ok(variantSummary(found[0]).includes('Bouleanlagen'));
  assert.equal(query(grouped,{...state,category:'sport',q:'Pleistermühlenweg Bouleanlagen'},districts).length,1);
});
test('nearby, unnamed and different-category facilities remain separate',()=>{
  const first={id:'1',lat:51.9,lon:7.6,source:{name:'Pleisterschule',type:'school',properties:{}}};
  const nearby={...first,id:'2',lat:51.9001};const sport={...first,id:'3',source:{...first.source,type:'sport'}};
  const unnamed1={...first,id:'4',source:{type:'school'}},unnamed2={...unnamed1,id:'5'};
  assert.equal(groupPlaces(prepare([first,nearby,sport,unnamed1,unnamed2])).length,5);
});
test('unsafe URLs are rejected, hostile URL state is bounded',()=>{
  for(const v of ['javascript:alert(1)','data:text/html,evil','file:///etc/passwd','/local'])assert.equal(safeUrl(v),null);
  assert.ok(safeUrl('https://stadt-muenster.de'));
  const invalid=stateFromUrl('https://example.test/?lat=Infinity&lon=7&radius=100&category=evil&sort=evil');
  assert.deepEqual(invalid.center,CENTER);assert.equal(invalid.radius,'0');assert.equal(invalid.category,'');
});
test('share URLs preserve filters and round the search center',()=>{
  const url=urlFromState('https://example.test/?old=1',{...state,q:'Münster',category:'wc',district:'13',radius:'2',center:[51.961234567,7.625987654],selected:'_doc:hello'});
  const decoded=stateFromUrl(url.href);assert.equal(decoded.q,'Münster');assert.equal(decoded.category,'wc');assert.equal(decoded.selected,'_doc:hello');
  assert.deepEqual(decoded.center,[51.961,7.626]);assert.ok(!url.searchParams.has('old'));
});
test('runtime has no Elasticsearch or PHP calls and all required routes exist',()=>{
  const app=fs.readFileSync(new URL('../site/app.mjs',import.meta.url),'utf8');
  assert.ok(!app.includes('data.mein-ms.de'));assert.ok(!app.includes('/_search'));assert.ok(!app.includes('.php'));
  for(const p of ['index.html','aktuelles/index.html','impressum/index.html','copyright/index.html','datenschutz/index.html'])assert.ok(fs.existsSync(new URL('../dist/'+p,import.meta.url)));
});
