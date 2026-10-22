import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync(fs.existsSync('output/bank-ai-scene-map/index.html')?'output/bank-ai-scene-map/index.html':'index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const handlers={},nodes=new Map();
const node=id=>nodes.get(id)||nodes.set(id,{innerHTML:'',textContent:'',focus(){},addEventListener(type,handler){handlers[type]=handler;}}).get(id);
const context=vm.createContext({console,URL,Map,Set,AbortController,setTimeout,clearTimeout,
  document:{getElementById:node,querySelector(){return null;},querySelectorAll(){return [];}}});
vm.runInContext(script.replace('    startSceneLibrary();',''),context);
const run=code=>vm.runInContext(code,context);
const baseline=run('JSON.stringify(domains)');
run(`var testScene=allScenes().find(scene=>scene.digitalTalent),testID=testScene.id;
sharedTagRows.set(testID,cleanTagRow({scene_id:testID,revision:2,tags:{digitalTalent:false,flagship:true,benchmark:true}}));
state.domain=testScene.domainId;state.type='digitalTalent';`);
assert.equal(run('currentScenes().some(scene=>scene.id===testID)'),false);
for(const type of ['flagship','benchmark']){
  run(`state.type='${type}';render();`);
  assert.equal(run('currentScenes().some(scene=>scene.id===testID)'),true);
  assert.equal(node('resultCount').textContent,run('currentScenes().length')+' 个具体场景');
}
const projectedCard=run('cardTemplate(allScenes().find(scene=>scene.id===testID))');
assert.ok(projectedCard.includes('王牌场景')&&projectedCard.includes('标杆案例')&&!projectedCard.includes('数字人才'));
assert.equal(run('JSON.stringify(domains)'),baseline);
for(const tags of [{digitalTalent:null},{flagship:1},{unknown:true},[]]){
  context.badTags=tags;
  assert.throws(()=>run('cleanTagRow({scene_id:testID,revision:0,tags:badTags})'));
}
run(`currentDetailScene=allScenes().find(scene=>scene.id===testID);tagCloudState='ready';bindTagPanel();`);
const click=selector=>({target:{closest:match=>match===selector?{}:null}});
const change=async(name,checked)=>handlers.change({target:{name,checked,closest:()=>true}});
const submit={target:{matches:()=>true,querySelectorAll:()=>[{},{}],querySelector:()=>({})},preventDefault(){}};
await handlers.click(click('[data-edit-tags]'));
await change('digitalTalent',true);
run(`var sent;assetCloudRequest=async(path,options)=>{
sent={path,...JSON.parse(options.body)};
return {scene_id:testID,revision:3,tags:{digitalTalent:true,flagship:true,benchmark:true}};};`);
await handlers.submit(submit);
assert.equal(run('sent.path'),'rpc/scene_map_save_tags');
assert.equal(run('JSON.stringify(sent.p_changes)'),JSON.stringify({digitalTalent:true}));
assert.equal(run('sent.p_expected_revision'),2);
assert.equal(run('tagEditor'),null);
assert.equal(run('Object.keys(tagFields).every(key=>allScenes().find(scene=>scene.id===testID)[key])'),true);
assert.ok(node('sceneTagPanel').innerHTML.includes('数字人才'));
await handlers.click(click('[data-edit-tags]'));
for(const key of ['digitalTalent','flagship','benchmark'])await change(key,false);
run(`assetCloudRequest=async(path,options)=>{
sent=JSON.parse(options.body);return {scene_id:testID,revision:4,tags:sent.p_changes};};`);
await handlers.submit(submit);
assert.equal(run('Object.values(allScenes().find(scene=>scene.id===testID)).length>0'),true);
assert.equal(run('tagBadgesTemplate(allScenes().find(scene=>scene.id===testID))'),'');
assert.equal(run('currentScenes().some(scene=>scene.id===testID)'),false);
await handlers.click(click('[data-edit-tags]'));
await change('benchmark',true);
run(`assetCloudRequest=async()=>{throw Object.assign(new Error('conflict'),{status:409})};`);
await handlers.submit(submit);
assert.equal(run('tagEditor.draft.benchmark'),true);
assert.match(run('tagNotice'),/选择已保留/);
assert.equal(run('tagSaving'),false);
run(`assetCloudRequest=async()=>[{scene_id:testID,revision:9,tags:{flagship:true}}];`);
await handlers.click(click('[data-cancel-tags]'));
await handlers.click(click('[data-edit-tags]'));
assert.equal(run('tagEditor.revision'),9);
assert.equal(run('tagEditor.initial.flagship'),true);
await change('benchmark',true);
run(`assetCloudRequest=async()=>{throw new Error('network failed')};`);
await handlers.submit(submit);
assert.equal(run('tagEditor.draft.benchmark'),true);
assert.equal(run('sharedTagRows.get(testID).revision'),9);
run("tagEditor=null;currentDetailScene=null;tagNotice='';tagError=false");
assert.equal(await run('refreshSharedSceneTags()'),false);
assert.equal(run('sharedTagRows.get(testID).revision'),9);
run(`assetCloudRequest=async()=>[{scene_id:testID,revision:9,tags:{flagship:true}}];`);
assert.equal(await run('refreshSharedSceneTags()'),true);
assert.match(run(`tagPanelTemplate(allScenes().find(scene=>scene.id!==testID))`),/尚未登记/);
assert.equal(run('JSON.stringify(domains)'),baseline);
assert.equal(run('sharedContentRows.size'),0);
assert.equal(run('sharedAssetRows.size'),0);
assert.equal(run("domains.find(domain=>domain.id==='BA03').sections[0].id"),'BA03-P04');
for(const id of ['BA03-P04-S01','BA03-P04-S02'])assert.equal(run(`allScenes().filter(scene=>scene.id==='${id}').length`),1);
assert.equal(run('allScenes().length'),65);
console.log('PASS: tag projection, multi-select/clear, card/detail/filter/count sync, partial CAS, conflict/network drafts, reload, missing-row isolation, evidence preservation, CBS classification.');
