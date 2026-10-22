import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {stableJSON} from './canonical-json.mjs';
import {validatePublishedCatalog} from './catalog-contract.mjs';
const release=JSON.parse(fs.readFileSync('银行AI场景地图内容库/data/published-catalog.json','utf8'));
const dir=`银行AI场景地图内容库/releases/${release.releaseId}/`;
const html=fs.readFileSync(fs.existsSync('output/bank-ai-scene-map/index.html')?'output/bank-ai-scene-map/index.html':'index.html','utf8');
const [,url,key]=html.match(/assetCloudConfig=\{url:'([^']+)',publishableKey:'([^']+)'\}/);
const get=async p=>{const r=await fetch(url+'/rest/v1/'+p,{headers:{apikey:key},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status+' '+p);return r.json();};
const assets=await get('scene_map_assets?select=scene_id,links,revision,updated_at&order=scene_id&limit=1000');
const content=await get('scene_map_content?select=scene_id,content,revision,updated_at&order=scene_id&limit=1000');
let tags;
try{tags=await get('scene_map_tags?select=scene_id,tags,revision,updated_at&order=scene_id&limit=1000');}
catch(error){if(!process.argv.includes('--snapshot')||!error.message.startsWith('HTTP 404 '))throw error;tags=null;}
const snapshot={assets,content,tags};
const snapFile=dir+'shared-before.json';
if(process.argv.includes('--snapshot')){
  if(fs.existsSync(snapFile))throw Error('Pre-migration snapshot exists; not overwriting');
  fs.writeFileSync(snapFile,JSON.stringify(snapshot,null,2)+'\n');
  const [current]=await get('scene_map_catalog?catalog_id=eq.bank-main&select=release_id,content_sha256');
  console.log(JSON.stringify({snapshot:'saved locally; do not upload',current,assetRows:assets.length,contentRows:content.length,tagRows:tags?.length??'not-enabled',nonemptyAssets:assets.filter(x=>Object.keys(x.links).length).length}));
}else{
  const before=JSON.parse(fs.readFileSync(snapFile,'utf8'));
  for(const [table,field] of [['assets','links'],['content','content'],['tags','tags']]){
    const oldRows=before[table]||[],newRows=snapshot[table];
    if(!Array.isArray(newRows))throw Error('Shared service missing: '+table);
    const oldMap=new Map(oldRows.map(row=>[row.scene_id,row]));
    const newMap=new Map(newRows.map(row=>[row.scene_id,row]));
    for(const [id,row] of oldMap)if(stableJSON(row)!==stableJSON(newMap.get(id)))throw Error('Existing shared '+table+' changed: '+id+'; investigate concurrent edits, never overwrite');
    for(const row of newRows)if(!oldMap.has(row.scene_id)&&(row.revision!==0||Object.keys(row[field]).length))throw Error('New shared row is not empty: '+table+' / '+row.scene_id);
  }
  const [row]=await get('scene_map_catalog?catalog_id=eq.bank-main&select=schema_version,release_id,content_sha256,payload');
  validatePublishedCatalog(row.payload);
  const manifest=JSON.parse(fs.readFileSync(dir+'manifest.json','utf8'));
  const hash=createHash('sha256').update(stableJSON(row.payload)).digest('hex');
  if(hash!==manifest.catalogSha256||hash!==row.content_sha256||row.release_id!==manifest.releaseId)throw Error('Backend differs from release');
  const ids=row.payload.domains.flatMap(d=>d.sections.flatMap(s=>s.scenes)).map(s=>s.id).sort();
  for(const rows of [assets,content,tags])if(JSON.stringify(rows.map(r=>r.scene_id).sort())!==JSON.stringify(ids))throw Error('Catalog and shared record IDs differ');
  console.log(JSON.stringify({status:'PASS',release:row.release_id,scenes:ids.length,catalogSha256:hash,existingSharedData:'unchanged'}));
}
