// Shared by the release builder and the inline browser runtime. No dependencies.
export function validatePublishedCatalog(value) {
  const fail=message=>{throw new Error('场景目录校验失败：'+message);};
  const obj=(v,keys)=>{
    if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('对象或字段不合法');
  };
  const txt=(v,max=20000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('文本缺失或过长');};
  const list=(v,max=2000)=>{if(!Array.isArray(v)||v.length>max)fail('列表不合法');};
  const id=(v,prefix)=>{if(typeof v!=='string'||!/^BA\d{2}(?:-[A-Z0-9]+)*$/.test(v)||(prefix&&!v.startsWith(prefix+'-')))fail('编码不合法');};
  obj(value,['schemaVersion','releaseId','pipeline','domains','departments','departmentRelations','departmentReview','audiences','audienceRelations','audienceReview']);
  if(![1,2,3].includes(value.schemaVersion))fail('不支持的数据版本');
  if(value.schemaVersion<3&&['audiences','audienceRelations','audienceReview'].some(k=>value[k]!==undefined))fail('旧版目录不能夹带行级使用对象');
  if(value.schemaVersion===1&&['departments','departmentRelations','departmentReview'].some(k=>value[k]!==undefined))fail('旧版目录不能夹带部门字段');
  if(!/^[a-zA-Z0-9._-]{1,80}$/.test(value.releaseId))fail('发布版本不合法');
  const p=value.pipeline;
  obj(p,['version','updatedAt','summary','method','boundary','batches']);
  for(const key of ['version','updatedAt','summary','method','boundary'])txt(p[key]);
  list(p.batches,100);if(!p.batches.length)fail('缺少来源批次');
  const batches=new Set();
  for(const b of p.batches){
    obj(b,['id','name','projectType','materials','result','newScenes']);
    if(!/^B\d{2,4}$/.test(b.id)||batches.has(b.id))fail('来源批次编码重复或不合法');
    batches.add(b.id);
    for(const key of ['name','projectType','materials','result'])txt(b[key]);
    if(!Number.isSafeInteger(b.newScenes)||b.newScenes<0)fail('新增数量不合法');
  }
  list(value.domains,100);if(!value.domains.length)fail('缺少业务域');
  const ids=new Set(),sections=new Set(),scenes=new Set(),groups=new Set();
  for(const d of value.domains){
    obj(d,['id','mark','name','desc','sections']);
    if(!/^BA\d{2}$/.test(d.id)||ids.has(d.id))fail('业务域重复或不合法');
    ids.add(d.id);for(const key of ['mark','name','desc'])txt(d[key]);list(d.sections);
    for(const sec of d.sections){
      obj(sec,['id','name','desc','group','scenes']);id(sec.id,d.id);
      if(sections.has(sec.id))fail('业务环节重复');sections.add(sec.id);
      txt(sec.name);txt(sec.desc);list(sec.scenes);
      if(sec.group){
        const g=sec.group;obj(g,['id','title','desc','flagship','closure']);id(g.id,d.id);
        if(groups.has(g.id))fail('场景群重复');groups.add(g.id);
        txt(g.title);txt(g.desc);if(typeof g.flagship!=='boolean')fail('场景群标签不合法');
        list(g.closure,50);g.closure.forEach(x=>txt(x));
        if(sec.scenes.length<2)fail('场景群至少承接两个场景');
      }
      for(const s of sec.scenes){
        obj(s,['id','title','definition','decision','maturity','version','flagship','benchmark','digitalTalent','gateway','values','abilities','role','trigger','task','dataScope','outputs','collaboration','manualCheck','before','after','feedback','metrics','quantBasis','scope','boundary','assets','sourceBatches']);
        id(s.id,d.id);if(scenes.has(s.id))fail('场景编码重复');scenes.add(s.id);
        for(const key of ['title','definition','maturity','version','role','trigger','task','dataScope','outputs','collaboration','manualCheck','before','after','feedback','scope'])txt(s[key]);
        for(const key of ['boundary','quantBasis'])if(s[key]!==undefined)txt(s[key]);
        for(const key of ['flagship','benchmark','digitalTalent','gateway'])if(typeof s[key]!=='boolean')fail('标签须为布尔值');
        if(!['AI-L1','AI-L2','AI-L3'].includes(s.decision))fail('AI参与等级不合法');
        obj(s.abilities,['D01','D02','D03','D04']);
        for(const k of ['D01','D02','D03','D04'])if(!['done','partial','planned','na'].includes(s.abilities[k]))fail('四问状态不合法');
        list(s.values,3);if(!s.values.length)fail('缺少价值维度');s.values.forEach(x=>txt(x));
        list(s.metrics,3);if(s.metrics.length!==3)fail('价值须为三项');
        s.metrics.forEach((m,i)=>{
          obj(m,['dimension','nature','text']);
          if(m.dimension!==['效率','质量/风险','经营/管理'][i]||!/^V0[0-4](?:\s|$)/.test(m.nature))fail('价值维度或证据性质不合法');txt(m.text);
        });
        obj(s.assets,['方案 PPT','看板 Demo','Dora 体验','短视频','方案文档']);
        for(const k of ['看板 Demo','Dora 体验','短视频'])txt(s.assets[k]);
        if(s.assets['方案 PPT']!==undefined)txt(s.assets['方案 PPT']);
        if(s.assets['方案文档']!==undefined)txt(s.assets['方案文档']);
        list(s.sourceBatches,100);if(!s.sourceBatches.length)fail('场景缺少来源批次');
        if(new Set(s.sourceBatches).size!==s.sourceBatches.length||s.sourceBatches.some(x=>!batches.has(x)))fail('来源批次引用不合法');
      }
    }
  }
  if(!scenes.size||p.batches.reduce((n,b)=>n+b.newScenes,0)!==scenes.size)fail('来源净增数量与场景总数不一致');
  if(value.schemaVersion>=2){
    list(value.departments,100);list(value.departmentRelations,10000);
    obj(value.departmentReview,['version','status','note','record']);
    for(const key of ['version','note','record'])txt(value.departmentReview[key]);
    if(!['proposed','approved'].includes(value.departmentReview.status))fail('部门审核状态不合法');
    const depts=new Set(),pairs=new Set(),owners=new Set();
    for(const d of value.departments){
      obj(d,['id','name','aliases','scope']);
      if(!/^DP\d{2,3}$/.test(d.id)||depts.has(d.id))fail('部门编码重复或不合法');
      depts.add(d.id);txt(d.name,120);txt(d.scope);list(d.aliases,30);d.aliases.forEach(a=>txt(a,120));
    }
    for(const r of value.departmentRelations){
      obj(r,['sceneId','departmentId','role','basis','status','condition']);
      if(!scenes.has(r.sceneId)||!depts.has(r.departmentId))fail('部门关系悬空引用');
      const pair=r.sceneId+'/'+r.departmentId;
      if(pairs.has(pair))fail('同一部门与场景关系重复');pairs.add(pair);
      if(!['owner','collaborator'].includes(r.role)||!['material-fact','consultant-recommendation'].includes(r.basis)||!['approved','proposed'].includes(r.status))fail('部门关系类型、依据或审核状态不合法');
      txt(r.condition);
      if(r.status==='approved'&&value.departmentReview.status!=='approved')fail('未经审核的部门关系不能发布');
      if(r.role==='owner'){
        if(owners.has(r.sceneId))fail('通用映射只能有一个建议主责');owners.add(r.sceneId);
      }
    }
  }
  if(value.schemaVersion===3){
    list(value.audiences,100);list(value.audienceRelations,10000);
    obj(value.audienceReview,['version','status','note','record']);
    for(const key of ['version','note','record'])txt(value.audienceReview[key]);
    if(!['proposed','approved'].includes(value.audienceReview.status))fail('使用对象审核状态不合法');
    const audiences=new Set(),pairs=new Set();
    for(const audience of value.audiences){
      obj(audience,['id','name','aliases','scope']);
      if(!/^MG\d{2,3}$/.test(audience.id)||audiences.has(audience.id))fail('行级使用对象编码重复或不合法');
      audiences.add(audience.id);txt(audience.name,120);txt(audience.scope);
      list(audience.aliases,30);audience.aliases.forEach(alias=>txt(alias,120));
    }
    for(const relation of value.audienceRelations){
      obj(relation,['sceneId','audienceId','users','condition','basis','status']);
      if(!scenes.has(relation.sceneId)||!audiences.has(relation.audienceId))fail('使用对象关系悬空引用');
      const pair=relation.sceneId+'/'+relation.audienceId;
      if(pairs.has(pair))fail('使用对象与场景关系重复');pairs.add(pair);
      txt(relation.users);txt(relation.condition);
      if(!['material-fact','consultant-recommendation'].includes(relation.basis)||!['approved','proposed'].includes(relation.status))fail('使用对象关系依据或审核状态不合法');
      if(relation.status==='approved'&&value.audienceReview.status!=='approved')fail('未经审核的使用对象关系不能发布');
    }
  }
  return value;
}
