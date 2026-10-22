begin;
create table if not exists public.scene_map_tags (
  scene_id text primary key references public.scene_map_assets(scene_id),
  tags jsonb not null default '{}'::jsonb check (jsonb_typeof(tags) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
alter table public.scene_map_tags enable row level security;
revoke all on public.scene_map_tags from public, anon, authenticated;
grant select on public.scene_map_tags to anon, authenticated;
drop policy if exists scene_map_tags_public_read on public.scene_map_tags;
create policy scene_map_tags_public_read on public.scene_map_tags
  for select to anon, authenticated using (true);
create table if not exists scene_map_private.tag_history (
  scene_id text not null, revision bigint not null, tags jsonb not null,
  saved_at timestamptz not null, replaced_at timestamptz not null default now(),
  primary key(scene_id,revision)
);
alter table scene_map_private.tag_history enable row level security;
revoke all on scene_map_private.tag_history from public, anon, authenticated;
insert into public.scene_map_tags(scene_id)
select scene_id from public.scene_map_assets on conflict(scene_id) do nothing;

create or replace function public.scene_map_save_tags(
  p_scene_id text, p_expected_revision bigint, p_changes jsonb
) returns public.scene_map_tags
language plpgsql security definer set search_path = ''
as $function$
declare
  entry record;
  current_row public.scene_map_tags;
  result_row public.scene_map_tags;
  next_tags jsonb;
begin
  if p_scene_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or octet_length(p_changes::text) > 500 then
    raise sqlstate 'PT400' using message = '场景、版本或标签格式不正确';
  end if;
  for entry in select key,value from jsonb_each(p_changes) loop
    if entry.key not in ('digitalTalent','flagship','benchmark')
      or (entry.value <> 'null'::jsonb and jsonb_typeof(entry.value) <> 'boolean') then
      raise sqlstate 'PT400' using message = '只允许修改三个布尔展示标签';
    end if;
  end loop;
  if not exists (
    select 1 from public.scene_map_catalog,
    lateral jsonb_array_elements(payload->'domains') domain_entry,
    lateral jsonb_array_elements(domain_entry->'sections') section_entry,
    lateral jsonb_array_elements(section_entry->'scenes') scene_entry
    where catalog_id='bank-main' and scene_entry->>'id'=p_scene_id
  ) then
    raise sqlstate 'PT404' using message = '该场景不在已发布目录中';
  end if;
  select * into current_row from public.scene_map_tags where scene_id=p_scene_id for update;
  if not found then raise sqlstate 'PT404' using message = '该场景尚未登记'; end if;
  if current_row.revision <> p_expected_revision then
    raise sqlstate 'PT409' using message = '标签已被其他人更新，请重新加载后再修改';
  end if;
  next_tags := jsonb_strip_nulls(current_row.tags || p_changes);
  if current_row.tags = next_tags then return current_row; end if;
  insert into scene_map_private.tag_history(scene_id,revision,tags,saved_at)
  values(current_row.scene_id,current_row.revision,current_row.tags,current_row.updated_at);
  update public.scene_map_tags set tags=next_tags,revision=revision+1,updated_at=now()
  where scene_id=p_scene_id returning * into result_row;
  delete from scene_map_private.tag_history
  where scene_id=p_scene_id and revision < result_row.revision-50;
  return result_row;
end
$function$;
revoke all on function public.scene_map_save_tags(text,bigint,jsonb) from public;
grant execute on function public.scene_map_save_tags(text,bigint,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
