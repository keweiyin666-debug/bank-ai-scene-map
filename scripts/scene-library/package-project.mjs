import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const target=path.resolve(process.argv[2]||'');
if(!process.argv[2]||target===root||!fs.existsSync(path.join(target,'.git')))throw Error('请提供独立Git发布工作区，禁止覆盖源项目');
const library='银行AI场景地图内容库';
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const copy=relative=>{const dest=path.join(target,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,relative),dest);};
const write=(relative,text)=>{const dest=path.join(target,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);};
const release=JSON.parse(read(library+'/data/published-catalog.json')).releaseId;
const catalog=JSON.parse(read(library+'/releases/'+release+'/catalog.json'));
const scenes=catalog.domains.flatMap(d=>d.sections.flatMap(sec=>sec.scenes.map(s=>({s,d,sec}))));
for(const file of fs.readdirSync(path.join(root,'scripts/scene-library')).filter(f=>/\.(mjs|html)$/.test(f)))copy('scripts/scene-library/'+file);
for(const file of fs.readdirSync(path.join(root,library)).filter(f=>/^\d\d_.*\.md$/.test(f)&&!['10','11','13','14'].includes(f.slice(0,2))))copy(library+'/'+file);
for(const file of ['department-mapping.json','organization-audiences.json','published-catalog.json','source-batches.json'])copy(library+'/data/'+file);
for(const file of fs.readdirSync(path.join(root,library,'migrations')).filter(f=>f.endsWith('.sql')))copy(library+'/migrations/'+file);
for(const file of ['catalog.json','apply-catalog.sql','apply-with-tags.sql','manifest.json'])copy(library+'/releases/'+release+'/'+file);
for(const file of ['SKILL.md','agents/openai.yaml','references/workflow.md','references/batch-ingestion.md','references/knowhow-asset-enrichment.md'])copy('.agents/skills/bank-ai-scene-map-manager/'+file);
write('index.html',read('output/bank-ai-scene-map/index.html'));
write('README.md',read('README.scene-map.md'));
const sourceIndex=read(library+'/08_L4场景卡片索引.md');
const indexRows=new Map(sourceIndex.split('\n').filter(line=>/^\|\s*BA\d{2}-/.test(line)).map(line=>{const cols=line.split('|').slice(1,-1).map(x=>x.trim());return [cols[0],cols];}));
const names=new Map(catalog.departments.map(d=>[d.id,d.name]));
const relations=id=>catalog.departmentRelations.filter(r=>r.sceneId===id);
const index=['# L4场景卡片索引（公开维护投影）','',`> ${release}；${scenes.length}个唯一L4。源编码保持，客户名单、内部定位与原文证据留本地。`,'','| L4编码 | 来源编码 | 场景 | 独立卡片 |','|---|---|---|---|'];
for(const {s,d,sec} of scenes){
  const source=indexRows.get(s.id);if(!source)throw Error('缺少源索引：'+s.id);
  const relative=source.at(-1).match(/\]\(([^)]+)\)/)?.[1];if(!relative)throw Error('缺少源卡链接');
  index.push(`| ${s.id} | ${source[1]} | ${s.title} | [独立卡片](${relative}) |`);
  const rows=[['主业务域',d.id+' '+d.name],['L2',sec.id+' '+sec.name],['L3',sec.group?.id||'无'],['主要使用角色',s.role],['触发时点',s.trigger],['业务任务',s.task],['定义',s.definition],['Before',s.before],['After',s.after],['用户反馈（预期体验）',s.feedback],...s.metrics.map(m=>[m.dimension+'价值（'+m.nature+'）',m.text]),['数据范围',s.dataScope],['输出',s.outputs],['人工确认',s.manualCheck],['协作与动作',s.collaboration],['实现范围',s.scope],['能力边界',s.boundary||'按授权、证据及人工确认执行'],['四问能力',JSON.stringify(s.abilities)],['AI参与等级',s.decision],['来源批次',s.sourceBatches.join('、')]];
  const escape=text=>String(text).replace(/\|/g,'／').replace(/\n/g,' ');
  const audienceRelations=(catalog.audienceRelations||[]).filter(relation=>relation.sceneId===s.id);
  const audienceLines=audienceRelations.length?['','## 行级服务对象','',...audienceRelations.map(relation=>`- ${relation.users}；${relation.condition}（${relation.status}，顾问建议）`),'','行级使用对象唯一源：[organization-audiences.json](../data/organization-audiences.json)；不等同于部门职责。']:[];
  write(library+'/'+relative,[`# ${s.id} ${s.title}`,'','> 公开维护投影，不包含客户原件或内部证据。正式新增事实须回到本地完整源卡审核。','','| 字段 | 内容 |','|---|---|',...rows.map(([key,value])=>`| ${key} | ${escape(value)} |`),'','## 部门关系','',...relations(s.id).map(r=>`- ${names.get(r.departmentId)}：${r.role==='owner'?'主责':'协同'}；顾问建议；${r.status}。适用：${r.condition}`),'','关系唯一源：[department-mapping.json](../data/department-mapping.json)。',...audienceLines,''].join('\n'));
}
write(library+'/08_L4场景卡片索引.md',index.join('\n')+'\n');
const pipeline=['# 场景库流水线说明（公开维护版）','',`流水线版本：${catalog.pipeline.version}；发布批次：${release}。`,'','物料→事实/判断分离→按角色与任务提取L4→去重→主L1/L2与必要L3→使用对象与落实部门分别分析→用户审核→源卡及索引→流水线、HTML、后台同版发布。','',catalog.pipeline.summary,catalog.pipeline.boundary,'','## 来源与项目类型','',...catalog.pipeline.batches.flatMap(b=>[`### ${b.id} ${b.name}`,'',`- 项目类型：${b.projectType}`,`- 原始材料类型与范围：${b.materials}`,`- 提炼结果：${b.result}`,`- 唯一L4净增：${b.newScenes}。`,'']),`当前${scenes.length}张卡、${catalog.departments.length}个部门、${catalog.departmentRelations.length}条落实关系，另有${catalog.audiences?.length||0}个行级入口、${catalog.audienceRelations?.length||0}条使用对象关系。数量分别统计，不代表任一客户真实组织架构。`, '', '客户与原件映射的完整审计版留本地；公开版按B01—B06批次及项目类型追溯，不公布客户名单或内网物料。',''];
write(library+'/14_场景库流水线说明.md',pipeline.join('\n'));
for(const [prefix,title,batch] of [['10','昆山BI大赛场景物料归纳与重叠分析','B03'],['11','魔数工坊51项材料入库与归并台账','B04'],['13','knowhow试点入库台账','B05']]){
  const info=catalog.pipeline.batches.find(b=>b.id===batch);
  write(`${library}/${prefix}_${title}.md`,`# ${title}（公开摘要）\n\n${info.materials}\n\n${info.result}\n\n内部客户、作者、原件路径及证据全文未提交；完整映射在本地原项目同名台账中保留。净增、补强与来源数分别统计，公开逐卡批次见08号索引。\n`);
}
write('.gitignore','**/shared-before.json\n**/*快照*\n.env\n.env.*\nnode_modules/\n.DS_Store\noutput/\n');
write('.nojekyll','');
console.log(JSON.stringify({target,release,scenes:scenes.length,scope:'public-maintenance-projection; no originals or shared snapshots'}));
