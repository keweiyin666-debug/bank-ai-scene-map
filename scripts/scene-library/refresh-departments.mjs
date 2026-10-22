import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const lib=path.join(root,'银行AI场景地图内容库');
const read=p=>JSON.parse(fs.readFileSync(path.join(lib,p),'utf8'));
const source=read('data/department-mapping.json'),catalog=read('data/published-catalog.json');
const records=catalog.domains.flatMap(d=>d.sections.flatMap(sec=>sec.scenes.map(s=>({s,d,sec}))));
const ids=new Set(records.map(({s})=>s.id)),departments=new Map(source.departments.map(d=>[d.id,d]));
if(source.departments.length!==departments.size||!['proposed','approved'].includes(source.reviewStatus))throw Error('部门字典/审核状态不合法');
const assignments=new Map();
for(const a of source.assignments){
  if(!ids.has(a.sceneId)||assignments.has(a.sceneId)||!departments.has(a.owner)||a.collaborators.some(id=>!departments.has(id)||id===a.owner)||new Set(a.collaborators).size!==a.collaborators.length||!a.rationale||!a.condition)throw Error('逐卡关系不合法：'+a.sceneId);
  assignments.set(a.sceneId,a);
}
if(assignments.size!==ids.size)throw Error('必须逐卡完成部门分析，不按业务域整体继承');
catalog.schemaVersion=2;
catalog.departments=source.departments;
catalog.departmentRelations=source.assignments.flatMap(a=>[a.owner,...a.collaborators].map((departmentId,i)=>({sceneId:a.sceneId,departmentId,role:i===0?'owner':'collaborator',basis:'consultant-recommendation',status:source.reviewStatus,condition:a.condition})));
catalog.departmentReview={version:source.version,status:source.reviewStatus,note:source.basis,record:source.reviewRecord};
fs.writeFileSync(path.join(lib,'data/published-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
const name=id=>departments.get(id).name;
const row=text=>String(text).replace(/\|/g,'／').replace(/\n/g,' ');
const lines=['# 部门字典与65张场景逐卡映射','',`> 版本：${source.version}；审核状态：${source.reviewStatus}。${source.basis}`,`> 审核记录：${source.reviewRecord}`,'','本文件由 `data/department-mapping.json` 与既有场景投影生成。修改源关系后执行 `node scripts/scene-library/refresh-departments.mjs`；不得直接修改生成表。未获批关系不进入正式部门导航。','', '## 1. 部门字典','', '| 编码 | 部门 | 名称别名（须核职责） | 职责与边界 |','|---|---|---|---|',...source.departments.map(d=>`| ${d.id} | ${d.name} | ${d.aliases.join('、')} | ${d.scope} |`),'','## 2. 逐卡分析与审核范围','', '| L4 | 场景 | 建议主责 | 建议协同 | 判断依据（顾问建议） | 适用条件/待核点 |','|---|---|---|---|---|---|'];
for(const {s} of records){const a=assignments.get(s.id);lines.push(`| ${s.id} | ${row(s.title)} | ${name(a.owner)} | ${a.collaborators.map(name).join('、')||'无'} | ${row(a.rationale)} | ${row(a.condition)} |`);}
lines.push('','## 3. 部门 → L2 → 可选L3 → L4','', '以下为逐卡关系派生的审核索引；一个部门只显示实际关联的L4。括号里的主责/协同不是源客户组织事实。');
for(const d of source.departments){const matches=records.filter(({s})=>{const a=assignments.get(s.id);return a.owner===d.id||a.collaborators.includes(d.id);});lines.push('',`### ${d.id} ${d.name}（${matches.length}个唯一L4）`,'');if(!matches.length){lines.push('无足够逐卡依据；保留字典，不在导航显示空项。');continue;}for(const {s,d:domain,sec} of matches){const a=assignments.get(s.id);lines.push(`- ${domain.name} / ${sec.id} ${sec.name}${sec.group?` / ${sec.group.id} ${sec.group.title}`:''} → ${s.id} ${s.title}（${a.owner===d.id?'主责':'协同'}）`);}}
lines.push('','## 4. 来源与覆盖','',`- 核对范围：${records.length}张既有卡片，未新增、复制或重编号L4。`, `- 建议关系：${catalog.departmentRelations.length}条；关系数不等于场景数。`, '- 每条判断以对应独立源卡的使用角色、任务与人工确认点为依据；索引见[08号文件](08_L4场景卡片索引.md)。', '- 首版为通用银行职能映射，不是逐家银行组织树。条线归属不明确、跨行职责不同的条件逐卡保留，不能把顾问建议转述为客户事实。','');
fs.writeFileSync(path.join(lib,'17_部门字典与逐卡映射.md'),lines.join('\n'));
const cardDir=path.join(lib,'L4场景卡片'),files=fs.readdirSync(cardDir);
for(const {s} of records){
  const matches=files.filter(f=>f.startsWith(s.id+'_')&&f.endsWith('.md'));
  if(matches.length!==1)throw Error('独立卡片文件不唯一：'+s.id);
  const file=path.join(cardDir,matches[0]),a=assignments.get(s.id);
  const marker='<!-- department-mapping:generated -->';
  const existing=fs.readFileSync(file,'utf8').split(marker)[0].trimEnd();
  const projection=`\n\n${marker}\n## 部门组织关系\n\n- 建议主责：${name(a.owner)}；协同：${a.collaborators.map(name).join('、')||'无'}。\n- 依据性质：顾问建议；判断：${a.rationale}\n- 适用条件：${a.condition}\n- 审核状态：${source.reviewStatus}；${source.reviewRecord}\n- 唯一关系台账：[department-mapping.json](../data/department-mapping.json)（按本L4编码定位）；[部门派生索引](../17_部门字典与逐卡映射.md)。本节为生成投影，不独立维护另一套关系。\n`;
  fs.writeFileSync(file,existing+projection);
}
console.log(JSON.stringify({scenes:records.length,departments:departments.size,relationships:catalog.departmentRelations.length,status:source.reviewStatus}));
