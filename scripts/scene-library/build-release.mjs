import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validatePublishedCatalog} from './catalog-contract.mjs';
import {stableJSON} from './canonical-json.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const lib=path.join(root,'银行AI场景地图内容库');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=text=>createHash('sha256').update(text).digest('hex');
const catalog=JSON.parse(read('银行AI场景地图内容库/data/published-catalog.json'));
const batchRules=JSON.parse(read('银行AI场景地图内容库/data/source-batches.json'));
if(!Array.isArray(batchRules)||batchRules.some(b=>!catalog.pipeline.batches.some(x=>x.id===b.batchId)||!Array.isArray(b.sourcePrefixes)||!b.sourcePrefixes.length||b.sourcePrefixes.some(p=>typeof p!=='string'||!p)))throw new Error('来源批次映射不合法');
const index=read('银行AI场景地图内容库/08_L4场景卡片索引.md');
const sources=new Map(index.split('\n').filter(line=>/^\|\s*BA\d{2}-/.test(line)).map(line=>{
  const cols=line.split('|').slice(1,-1).map(x=>x.trim());
  return [cols[0],{source:cols[1],title:cols[2],document:cols.at(-1)}];
}));
const scenes=catalog.domains.flatMap(d=>d.sections.flatMap(s=>s.scenes));
for(const scene of scenes){
  const source=sources.get(scene.id);
  if(!source||source.title!==scene.title)throw new Error(`索引与发布投影不一致：${scene.id}`);
  const document=source.document.match(/\]\(([^)]+)\)/)?.[1];
  if(!document||!fs.existsSync(path.resolve(lib,document)))throw new Error(`场景源文档缺失：${scene.id}`);
  const tokens=source.source.split(/[、，,]/).map(x=>x.trim()).filter(Boolean);
  for(const token of tokens){
    const matched=batchRules.filter(b=>b.sourcePrefixes.some(p=>token.startsWith(p)));
    if(matched.length!==1)throw new Error(`来源必须唯一对应批次：${scene.id} / ${token}`);
  }
  scene.sourceBatches=batchRules.filter(b=>tokens.some(t=>b.sourcePrefixes.some(p=>t.startsWith(p)))).map(b=>b.batchId);
}
if(sources.size!==scenes.length)throw new Error('索引与发布场景集合不同，须明确处理未发布条目后调整构建范围');
validatePublishedCatalog(catalog);
const pipelineDoc=read('银行AI场景地图内容库/14_场景库流水线说明.md');
if(!pipelineDoc.includes(`流水线版本：${catalog.pipeline.version}`)||!pipelineDoc.includes(`发布批次：${catalog.releaseId}`))throw new Error('流水线说明版本/发布批次未同步');
for(const b of catalog.pipeline.batches)if(!pipelineDoc.includes(b.id))throw new Error(`流水线说明缺少${b.id}`);
const fingerprint=sha(stableJSON(catalog));
const literal=JSON.stringify(catalog).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const validator=read('scripts/scene-library/catalog-contract.mjs').replace('export function ','function ');
const template=read('scripts/scene-library/page-template.html');
if(!template.includes('__PUBLISHED_CATALOG__')||!template.includes('__CATALOG_VALIDATOR__'))throw new Error('页面模板占位缺失');
const html=template.replace('__PUBLISHED_CATALOG__',()=>literal).replace('__CATALOG_VALIDATOR__',()=>validator);
const out=path.join(lib,'releases',catalog.releaseId);fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
const siteOutput=process.argv.includes('--site-output')?path.join(root,'index.html'):path.join(root,'output/bank-ai-scene-map/index.html');
fs.mkdirSync(path.dirname(siteOutput),{recursive:true});
fs.writeFileSync(siteOutput,html);

// Only the approved public projection enters Supabase. Existing links/content never reset.
const sql=`begin;
create table if not exists public.scene_map_catalog (
  catalog_id text primary key check (catalog_id = 'bank-main'),
  schema_version integer not null check (schema_version in (1,2)),
  release_id text not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.scene_map_catalog drop constraint if exists scene_map_catalog_schema_version_check;
alter table public.scene_map_catalog add constraint scene_map_catalog_schema_version_check check (schema_version in (1,2));
-- Serialize releases and refuse a stale SQL file overwriting a newer catalog.
lock table public.scene_map_catalog in exclusive mode;
do $release_guard$
declare current_release text;
begin
  select release_id into current_release from public.scene_map_catalog where catalog_id='bank-main';
  if current_release is not null and current_release <> '${catalog.releaseId}' then
    if current_release !~ '^\\d{4}-\\d{2}-\\d{2}-v\\d+\\.\\d+\\.\\d+$' then
      raise exception 'Unrecognized current release; review before replacing';
    end if;
    if (left(current_release,10),string_to_array(split_part(current_release,'-v',2),'.')::int[]) >
       (left('${catalog.releaseId}',10),string_to_array(split_part('${catalog.releaseId}','-v',2),'.')::int[]) then
      raise exception 'Refusing to replace a newer catalog';
    end if;
  end if;
  if exists(select 1 from public.scene_map_catalog where catalog_id='bank-main' and release_id='${catalog.releaseId}' and content_sha256 <> '${fingerprint}') then
    raise exception 'Release identity already used with another fingerprint';
  end if;
end $release_guard$;
alter table public.scene_map_catalog enable row level security;
revoke all on public.scene_map_catalog from public, anon, authenticated;
grant select on public.scene_map_catalog to anon, authenticated;
drop policy if exists scene_map_catalog_public_read on public.scene_map_catalog;
create policy scene_map_catalog_public_read on public.scene_map_catalog for select to anon, authenticated using (true);
create schema if not exists scene_map_private;
create table if not exists scene_map_private.catalog_history (
  content_sha256 text primary key, release_id text not null, payload jsonb not null,
  saved_at timestamptz not null, replaced_at timestamptz not null default now()
);
alter table scene_map_private.catalog_history enable row level security;
revoke all on scene_map_private.catalog_history from public, anon, authenticated;
insert into scene_map_private.catalog_history(content_sha256,release_id,payload,saved_at)
select content_sha256,release_id,payload,updated_at from public.scene_map_catalog
where catalog_id='bank-main' and content_sha256 <> '${fingerprint}' on conflict do nothing;

-- The whole catalog and pipeline switch together, in one transaction.
insert into public.scene_map_catalog(catalog_id,schema_version,release_id,content_sha256,payload)
values('bank-main',${catalog.schemaVersion},'${catalog.releaseId}','${fingerprint}',$scene_catalog$${JSON.stringify(catalog)}$scene_catalog$::jsonb)
on conflict(catalog_id) do update set schema_version=excluded.schema_version,
release_id=excluded.release_id,content_sha256=excluded.content_sha256,payload=excluded.payload,updated_at=now()
where scene_map_catalog.content_sha256 <> excluded.content_sha256;
insert into public.scene_map_assets(scene_id,scene_title)
select s->>'id',s->>'title' from public.scene_map_catalog,
lateral jsonb_array_elements(payload->'domains') d,
lateral jsonb_array_elements(d->'sections') sec,
lateral jsonb_array_elements(sec->'scenes') s
where catalog_id='bank-main' on conflict(scene_id) do nothing;
insert into public.scene_map_content(scene_id)
select s->>'id' from public.scene_map_catalog,
lateral jsonb_array_elements(payload->'domains') d,
lateral jsonb_array_elements(d->'sections') sec,
lateral jsonb_array_elements(sec->'scenes') s
where catalog_id='bank-main' on conflict(scene_id) do nothing;
insert into public.scene_map_tags(scene_id)
select s->>'id' from public.scene_map_catalog,
lateral jsonb_array_elements(payload->'domains') d,
lateral jsonb_array_elements(d->'sections') sec,
lateral jsonb_array_elements(sec->'scenes') s
where catalog_id='bank-main' on conflict(scene_id) do nothing;
notify pgrst, 'reload schema';
commit;
select release_id,content_sha256,
 (select count(*) from jsonb_array_elements(payload->'domains') d,
 jsonb_array_elements(d->'sections') sec,jsonb_array_elements(sec->'scenes')) as scene_count
from public.scene_map_catalog where catalog_id='bank-main';
`;
if(JSON.stringify(catalog).includes('$scene_catalog$'))throw new Error('SQL定界符冲突');
fs.writeFileSync(path.join(out,'apply-catalog.sql'),sql);
fs.writeFileSync(path.join(out,'apply-with-tags.sql'),read('银行AI场景地图内容库/migrations/20261022_shared_tags.sql')+'\n'+sql);
const manifest={releaseId:catalog.releaseId,schemaVersion:catalog.schemaVersion,pipelineVersion:catalog.pipeline.version,scenes:scenes.length,domains:catalog.domains.length,sections:catalog.domains.flatMap(d=>d.sections).length,digitalTalent:scenes.filter(s=>s.digitalTalent).length,flagship:scenes.filter(s=>s.flagship).length,catalogSha256:fingerprint,htmlSha256:sha(html),pipelineDocSha256:sha(pipelineDoc),sourceProjectionSha256:sha(read('银行AI场景地图内容库/data/published-catalog.json')),deploymentStatus:'generated-not-yet-verified'};
manifest.departments=catalog.departments?.length||0;
manifest.departmentRelations=catalog.departmentRelations?.length||0;
manifest.approvedRelations=catalog.departmentRelations?.filter(r=>r.status==='approved').length||0;
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
