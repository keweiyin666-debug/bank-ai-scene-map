-- 专用项目 Scene Library of bank 的增量迁移。保留所有已有链接及版本。
begin;
insert into public.scene_map_assets (scene_id,scene_title) values
('BA01-P03-S03','业绩归属与绩效核算'),
('BA01-P04-S01','授权范围内业务自助取数'),
('BA05-P02-S02','同业存款集合竞价管理'),
('BA06-P01-S04','网点资源匹配与布局评估'),
('BA10-P02-S03','网点现金需求汇总与调配'),
('BA10-P02-S04','EVA价值驱动与波动诊断'),
('BA10-P03-S01','EAST规则筛查与数据质量核验'),
('BA12-P02-S02','敏感数据申请与授权审计'),
('BA12-P02-S03','数据字段与码值目录维护')
on conflict (scene_id) do nothing;

create table if not exists public.scene_map_content (
  scene_id text primary key references public.scene_map_assets(scene_id),
  content jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
alter table public.scene_map_content enable row level security;
revoke all on public.scene_map_content from public, anon, authenticated;
grant select on public.scene_map_content to anon, authenticated;
drop policy if exists scene_map_content_public_read on public.scene_map_content;
create policy scene_map_content_public_read on public.scene_map_content
  for select to anon, authenticated using (true);

create table if not exists scene_map_private.content_history (
  scene_id text not null,
  revision bigint not null,
  content jsonb not null,
  saved_at timestamptz not null,
  replaced_at timestamptz not null default now(),
  primary key(scene_id,revision)
);
alter table scene_map_private.content_history enable row level security;
revoke all on scene_map_private.content_history from public, anon, authenticated;
insert into public.scene_map_content(scene_id)
select scene_id from public.scene_map_assets on conflict(scene_id) do nothing;

create or replace function public.scene_map_save_content(
  p_scene_id text, p_expected_revision bigint, p_changes jsonb
) returns public.scene_map_content
language plpgsql security definer set search_path = ''
as $function$
declare
  entry record;
  current_row public.scene_map_content;
  result_row public.scene_map_content;
  next_content jsonb;
begin
  if p_scene_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or octet_length(p_changes::text) > 60000 then
    raise sqlstate 'PT400' using message = '场景、版本或文案格式不正确';
  end if;
  for entry in select key,value from jsonb_each(p_changes) loop
    if entry.key not in ('definition','before','after','feedback','efficiency','quality','management') then
      raise sqlstate 'PT400' using message = '只允许修改概览、对照、价值和用户反馈';
    end if;
    -- null 表示恢复HTML基线；不允许空字符串、对象或超长文本。
    if entry.value <> 'null'::jsonb and
      (jsonb_typeof(entry.value) <> 'string' or length(btrim(entry.value #>> '{}')) not between 1 and 2000) then
      raise sqlstate 'PT400' using message = '文案须为1至2000字纯文本';
    end if;
  end loop;
  select * into current_row from public.scene_map_content where scene_id=p_scene_id for update;
  if not found then
    raise sqlstate 'PT404' using message = '该场景尚未登记';
  end if;
  if current_row.revision <> p_expected_revision then
    raise sqlstate 'PT409' using message = '内容已被其他人更新，请重新加载后再修改';
  end if;
  next_content := jsonb_strip_nulls(current_row.content || p_changes);
  if current_row.content = next_content then return current_row; end if;
  insert into scene_map_private.content_history(scene_id,revision,content,saved_at)
  values(current_row.scene_id,current_row.revision,current_row.content,current_row.updated_at);
  update public.scene_map_content set content=next_content,revision=revision+1,updated_at=now()
  where scene_id=p_scene_id returning * into result_row;
  delete from scene_map_private.content_history
  where scene_id=p_scene_id and revision < result_row.revision-50;
  return result_row;
end
$function$;
revoke all on function public.scene_map_save_content(text,bigint,jsonb) from public;
grant execute on function public.scene_map_save_content(text,bigint,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
