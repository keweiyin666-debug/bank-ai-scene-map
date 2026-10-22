import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Exercise the actual single-file application without browser or cloud writes.
const html=fs.readFileSync(fs.existsSync('output/bank-ai-scene-map/index.html')?'output/bank-ai-scene-map/index.html':'index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const handlers={};
const nodes=new Map();
const node=id=>nodes.get(id)||nodes.set(id,{innerHTML:'',textContent:'',focus(){},addEventListener(type,fn){handlers[type]=fn;}}).get(id);
const context=vm.createContext({console,URL,Map,Set,AbortController,setTimeout,clearTimeout,
  document:{getElementById:node,querySelector(){return null;}},confirm:()=>true});
vm.runInContext(script.replace('    startSceneLibrary();',''),context);
const run=code=>vm.runInContext(code,context);
const baseline=run('JSON.stringify(domains)');
const release=JSON.parse(fs.readFileSync('银行AI场景地图内容库/data/published-catalog.json','utf8'));
const counts=release.domains.flatMap(d=>d.sections.flatMap(s=>s.scenes));
assert.equal(run('allScenes().length'),counts.length);
assert.equal(run('new Set(allScenes().map(s=>s.id)).size'),counts.length);
assert.equal(run('allScenes().filter(s=>s.digitalTalent).length'),counts.filter(s=>s.digitalTalent).length);

run(`var testScene=allScenes()[0]; var testID=testScene.id;
sharedContentRows.set(testID,cleanContentRow({scene_id:testID,revision:2,content:{
definition:'<img src=x onerror=alert(1)>',before:'原流程\\n第二行',after:'新流程',feedback:'我能看到变化',
efficiency:'效率新值',quality:'质量新值',management:'经营新值',title:'禁止改名'}}));
var projected=allScenes()[0];`);
assert.equal(run('projected.title'),run('testScene.title'));
assert.equal(run('projected.metrics[0].nature'),run('testScene.metrics[0].nature'));
assert.equal(run('projected.definition'),'<img src=x onerror=alert(1)>');
assert.equal(run('JSON.stringify(domains)'),baseline,'overlay cannot rewrite source evidence');
for(const section of ['overview','change','value']){
  const rendered=run(`contentViewTemplate(projected,'${section}')`);
  assert.ok(!rendered.includes('<img src=x'));
  if(section==='overview')assert.ok(rendered.includes('&lt;img'));
  if(section==='change')assert.ok(rendered.includes('原流程\n第二行')&&rendered.includes('新流程'));
  if(section==='value')assert.ok(rendered.includes('效率新值')&&rendered.includes('我能看到变化'));
}
const card=run('cardTemplate(projected)');
for(const value of ['&lt;img','原流程\n第二行','新流程','我能看到变化','效率新值','质量新值','经营新值'])assert.ok(card.includes(value));
for(const content of [{before:''},{before:17},{before:'x'.repeat(2001)}]){
  context.badContent=content;
  assert.throws(()=>run('cleanContentRow({scene_id:testID,revision:0,content:badContent})'));
}

run(`render=()=>{};renderContentPanels=()=>{};renderContentEditor=()=>{};renderAssetPanel=()=>{};
currentDetailScene=projected;contentCloudState='ready';bindContentPanels();`);
const editEvent={target:{closest:selector=>selector==='[data-edit-content]'?{dataset:{editContent:'change'}}:null}};
await handlers.click(editEvent);
const initialAfter=run('contentEditor.initial.after');
await handlers.input({target:{name:'before',value:'只改Before',closest:()=>true}});
const controls=[{},{}];
const form={matches:()=>true,querySelectorAll:()=>controls,querySelector:()=>({textContent:''})};
const submit={target:form,preventDefault(){}};
run(`var sentChanges;assetCloudRequest=async(path,options)=>{
sentChanges=JSON.parse(options.body);return {scene_id:testID,revision:3,content:{before:sentChanges.p_changes.before}};};`);
await handlers.submit(submit);
assert.equal(run('JSON.stringify(sentChanges.p_changes)'),JSON.stringify({before:'只改Before'}));
assert.equal(run('sentChanges.p_expected_revision'),2);
assert.equal(run('contentEditor'),null);
assert.ok(run('cardTemplate(allScenes()[0])').includes('只改Before'));

// Conflict preserves the draft; Cancel re-reads the new revision before reopening.
run('currentDetailScene=allScenes()[0]');
await handlers.click(editEvent);
await handlers.input({target:{name:'after',value:initialAfter+'（草稿）',closest:()=>true}});
run(`assetCloudRequest=async()=>{throw Object.assign(new Error('conflict'),{status:409})};`);
await handlers.submit(submit);
assert.equal(run('contentEditor.draft.after'),initialAfter+'（草稿）');
assert.equal(run('contentEditor.error'),true);
assert.match(run('contentNotice'),/填写已保留/);
run(`assetCloudRequest=async()=>[{scene_id:testID,revision:9,content:{after:'他人最新值'}}];`);
await handlers.click({target:{closest:s=>s==='[data-cancel-content]'?{}:null}});
assert.equal(run('contentEditor'),null);
run('currentDetailScene=allScenes()[0]');
await handlers.click(editEvent);
assert.equal(run('contentEditor.revision'),9);
assert.equal(run('contentEditor.initial.after'),'他人最新值');
await handlers.input({target:{name:'after',value:'网络失败时保留草稿',closest:()=>true}});
run(`assetCloudRequest=async()=>{throw new Error('network failed')};`);
await handlers.submit(submit);
assert.equal(run('contentEditor.draft.after'),'网络失败时保留草稿');
assert.equal(run('contentSaving'),false);

// Missing registration affects one scene only; 54-row responses remain usable.
run(`currentDetailScene=null;assetCloudRequest=async()=>[{scene_id:testID,revision:0,links:{}}];`);
assert.equal(await run('refreshSharedAssetLinks()'),true);
assert.equal(run('assetCloudState'),'ready');
assert.equal(run('sharedAssetRows.size'),1);
assert.equal(run('JSON.stringify(domains)'),baseline);
console.log('PASS: published scenes, linked renderers, escaping, validation, partial save, conflict reload, network draft retention, missing-scene isolation.');

