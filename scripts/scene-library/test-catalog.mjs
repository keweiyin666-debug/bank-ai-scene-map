import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validatePublishedCatalog} from './catalog-contract.mjs';
import {stableJSON} from './canonical-json.mjs';

const release=JSON.parse(fs.readFileSync('银行AI场景地图内容库/data/published-catalog.json','utf8'));
const base=`银行AI场景地图内容库/releases/${release.releaseId}/`;
const catalog=JSON.parse(fs.readFileSync(base+'catalog.json','utf8'));
const manifest=JSON.parse(fs.readFileSync(base+'manifest.json','utf8'));
const html=fs.readFileSync(fs.existsSync('output/bank-ai-scene-map/index.html')?'output/bank-ai-scene-map/index.html':'index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const nodes=new Map();
const node=id=>nodes.get(id)||nodes.set(id,{innerHTML:'',textContent:'',dataset:{},classList:{toggle(){}},addEventListener(){}}).get(id);
const context=vm.createContext({console,URL,URLSearchParams,window:{location:{search:''}},Map,Set,AbortController,setTimeout,clearTimeout,document:{getElementById:node,querySelectorAll:()=>[]}});
vm.runInContext(script.replace('    startSceneLibrary();',''),context);
const run=code=>vm.runInContext(code,context);
assert.deepEqual(JSON.parse(run('JSON.stringify(embeddedCatalog)')),catalog);
assert.equal(createHash('sha256').update(stableJSON(catalog)).digest('hex'),manifest.catalogSha256);
assert.equal(createHash('sha256').update(html).digest('hex'),manifest.htmlSha256);
assert.equal(run('allScenes().length'),manifest.scenes);
assert.equal(run('allScenes().every(s=>s.sourceBatches.length>0)'),true);
validatePublishedCatalog(catalog);
assert.equal(run("isOlderCatalogRelease('2026-10-21-v0.6.0','2026-10-22-v0.6.1')"),true);
assert.equal(run("isOlderCatalogRelease('2026-10-22-v0.6.2','2026-10-22-v0.6.10')"),true);
assert.equal(run("isOlderCatalogRelease('2026-10-22-v0.6.10','2026-10-22-v0.6.2')"),false);
assert.equal(run("isOlderCatalogRelease('2026-10-22-v0.6.1','2026-10-22-v0.6.1')"),false);
context.olderCloud=structuredClone(catalog);
context.olderCloud.releaseId='2026-10-21-v0.6.0';
run('assetCloudRequest=async()=>[{schema_version:olderCloud.schemaVersion,release_id:olderCloud.releaseId,payload:olderCloud}];');
assert.equal(await run('refreshPublishedCatalog()'),false);
assert.equal(run('activeCatalog.releaseId'),release.releaseId);
assert.equal(node('catalogStatus').dataset.source,'embedded');
assert.match(node('catalogStatus').textContent,/后台仍为旧版/);
for(const mutate of [c=>c.domains[0].sections[0].scenes.push(c.domains[0].sections[0].scenes[0]),c=>c.schemaVersion=3,c=>c.pipeline.batches[0].newScenes=100,c=>c.domains[0].sections[0].scenes[0].sourceBatches=['B99'],c=>c.domains[0].sections[0].scenes[0].abilities.D01='evil',c=>c.departmentRelations[0].sceneId='missing',c=>c.departmentRelations.push(c.departmentRelations[0]),c=>c.departmentReview.status='proposed']){
  const bad=structuredClone(catalog);mutate(bad);assert.throws(()=>validatePublishedCatalog(bad));
}
// A new backend card (not embedded in HTML) appears in navigation, search and details' model.
context.cloud=structuredClone(catalog);
context.cloud.releaseId='backend-only-test';
const newScene=structuredClone(catalog.domains[0].sections[0].scenes[0]);newScene.id='BA01-P99-S01';newScene.title='后台新增验证';
context.cloud.domains[0].sections[0].scenes.push(newScene);context.cloud.pipeline.batches[0].newScenes++;
run(`assetCloudRequest=async()=>[{schema_version:cloud.schemaVersion,release_id:cloud.releaseId,payload:cloud}];`);
assert.equal(await run('refreshPublishedCatalog()'),true);
assert.equal(run('allScenes().length'),manifest.scenes+1);
const firstDomainCount=catalog.domains[0].sections.reduce((n,s)=>n+s.scenes.length,0);
run("setOrganizationView('domain')");
assert.ok(node('domainList').innerHTML.includes(`>${firstDomainCount+1}</span>`));
run("state.query='后台新增验证'");assert.equal(run('currentScenes().length'),1);
assert.match(node('pipelineContent').innerHTML,/backend-only-test/);
assert.equal(node('catalogStatus').dataset.source,'cloud');
assert.match(run('cardTemplate(currentScenes()[0])'),/后台新增验证/);
// All dynamic catalog text is escaped by card/group/detail renderers.
run(`var malicious={...currentScenes()[0],title:'<img src=x onerror=alert(1)>'};`);
assert.ok(!run('cardTemplate(malicious)').includes('<img'));
assert.ok(run('cardTemplate(malicious)').includes('&lt;img'));
// Failed/malformed cloud data never partially replaces a valid catalog.
const before=run('JSON.stringify(domains)');
run('assetCloudRequest=async()=>[{schema_version:1,release_id:"bad",payload:{schemaVersion:1}}]');
assert.equal(await run('refreshPublishedCatalog()'),false);assert.equal(run('JSON.stringify(domains)'),before);
assert.equal(node('catalogStatus').dataset.source,'embedded');
run('assetCloudRequest=async()=>{throw Error("offline")}');
assert.equal(await run('refreshPublishedCatalog()'),false);assert.equal(run('JSON.stringify(domains)'),before);
// Initial offline state retains the complete embedded snapshot.
run('domains=embeddedCatalog.domains;activeCatalog=embeddedCatalog;');
assert.equal(await run('refreshPublishedCatalog()'),false);assert.equal(run('allScenes().length'),manifest.scenes);
// An open drawer/draft is not destroyed by an arriving response.
run('assetCloudRequest=async()=>[{schema_version:cloud.schemaVersion,release_id:cloud.releaseId,payload:cloud}];currentDetailScene=allScenes()[0];contentEditor={draft:{before:"未保存"}};');
assert.equal(await run('refreshPublishedCatalog()'),false);assert.equal(run('allScenes().length'),manifest.scenes);assert.equal(run('contentEditor.draft.before'),'未保存');
// Department and domain views share the same IDs, display data and filter state.
run('currentDetailScene=null;contentEditor=null;state.view="department";state.department="all";state.query="";');
assert.equal(run('currentScenes().length'),manifest.scenes);
assert.equal(run('new Set(currentScenes().map(s=>s.id)).size'),manifest.scenes);
const mapped=catalog.departmentRelations.filter(r=>r.departmentId==='DP03'&&r.status==='approved');
run('state.department="DP03";render();');
assert.equal(run('currentScenes().length'),new Set(mapped.map(r=>r.sceneId)).size);
assert.ok(run('new Set(currentScenes().map(s=>s.domainId)).size')>1);
run('state.type="digitalTalent";state.ability="D01";state.query="客户";setOrganizationView("domain");setOrganizationView("department");');
assert.equal(run('state.department'),'DP03');assert.equal(run('state.query'),'客户');
assert.equal(run('state.type'),'digitalTalent');assert.equal(run('state.ability'),'D01');
assert.equal(run('currentScenes().every(s=>departmentScope(s)&&matches(s)&&matchesQuery(s))'),true);
run('state.departmentQuery="个人金融";renderDomainNavigation();');
assert.match(node('domainList').innerHTML,/零售金融部/);assert.ok(!node('domainList').innerHTML.includes('公司金融部'));
run('state.departmentQuery="";state.type="all";state.ability="all";state.query="";');
assert.match(run('sectionTemplate(domains[0].sections[0],[allScenes()[0]])'),/局部相关/);
assert.ok(!run('sectionTemplate(domains[0].sections[0],[allScenes()[0]])').includes('class="closure"'));
run('window.location.search="?view=domain&domain=BA03";readOrganizationContext();');
assert.equal(run('state.view'),'domain');assert.equal(run('state.domain'),'BA03');
// v1 has no department facts: all cards remain accessible via all/pending.
context.legacy=structuredClone(catalog);context.legacy.schemaVersion=1;
delete context.legacy.departments;delete context.legacy.departmentRelations;delete context.legacy.departmentReview;
validatePublishedCatalog(context.legacy);
run('activeCatalog=legacy;domains=legacy.domains;state.view="department";state.department="pending";');
assert.equal(run('currentScenes().length'),manifest.scenes);
console.log('PASS: hashes, lineage, backend additions, dual views, unique counts, department aliases, partial L3, filters, v1 fallback, escaping, offline and draft protection.');
