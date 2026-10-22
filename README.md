# 银行 AI 场景地图

共享页面：[打开场景地图](https://keweiyin666-debug.github.io/bank-ai-scene-map/)。GitHub Pages继续以根`index.html`提供页面，无构建框架、无登录后台。

## 本次版本

`2026-10-22-v0.8.0`：65张稳定L4、13个业务域、26个标准部门（24个有场景）、157条落实关系；另有1个行级入口、2条使用对象关系。默认按组织，分列行级管理与业务/职能部门，首屏全部场景；组织下可展开L2并筛选，原业务域视角保留。服务对象与落实部门分开，无复制卡片或重编号，不代表某家银行组织架构。

发布状态：v0.8.0已完成三项同步。GitHub Pages通过HTTP/浏览器核验，原Supabase目录实际升级schema3/65张场景，与HTML及流水线v1.3同版同指纹；线上实际显示后台v0.8.0。迁移前65条资产、65条文案、65条标签的共享值、revision及更新时间逐项未变；实际核验见12号发布记录。

## 资料入口

- [管理与提炼规则](银行AI场景地图内容库/00_内容管理说明.md)、[双视角计划](银行AI场景地图内容库/16_部门与业务域双视角组织及调整计划.md)。
- [逐卡索引](银行AI场景地图内容库/08_L4场景卡片索引.md)、[部门字典与映射](银行AI场景地图内容库/17_部门字典与逐卡映射.md)。
- [来源流水线](银行AI场景地图内容库/14_场景库流水线说明.md)、[数据与发布协议](银行AI场景地图内容库/15_后台数据与三项同步发布协议.md)、[实际发布记录](银行AI场景地图内容库/12_场景库共享发布记录.md)。
- [可复用场景管理技能](.agents/skills/bank-ai-scene-map-manager/SKILL.md)；Consultant继续路由到此专业技能，不复制一套规则。

## 数据与共享编辑

原Supabase项目存一份完整目录（`scene_map_catalog`），HTML内置同版快照用于首屏与故障回退。七项文案、三个标签和四类链接分别按同一个稳定L4 ID保存在独立覆盖表，两种视图共用。访客免登录编辑；他人刷新后看到更新。公开publishable key不是管理密钥，写入仅允许受限RPC、白名单字段及revision冲突检查。开放编辑意味着访问者可更改展示内容，不应录入客户敏感信息。

## 维护与验证

运行环境Node.js 20+，无需npm依赖。从仓库根目录执行；本工作环境命令前加`rtk proxy`：

```sh
node scripts/scene-library/refresh-departments.mjs
node scripts/scene-library/build-release.mjs --site-output
node scripts/scene-library/test-catalog.mjs
node scripts/scene-library/test-shared-content.mjs
node scripts/scene-library/test-shared-tags.mjs
```

先核对源卡、批准关系与来源台账，再更新发布投影的`releaseId`及流水线版本；修改新内容必须换发布批次，不覆盖旧release证据。公开源卡是脱敏维护投影，缺失原始依据须回到本地完整源卡审查。页面组件只在`scripts/scene-library/page-template.html`维护，不手改生成HTML。

后台变更前运行`check-live.mjs --snapshot`保存本地共享数据快照，不能提交该文件。先发布兼容页面，再在原项目SQL Editor运行需要的增量迁移及本批`apply-catalog.sql`。最后运行`check-live.mjs`核对后台目录指纹、ID集合及原共享值/revision不变，再确认Pages HTTP200和浏览器实际后台来源。新克隆没有迁移前快照时不能假装完成共享保留验证，须从发布工作区安全取得本地快照或下批迁移前重新保存。

GitHub只包含公开维护资料。原始PPT/Excel、客户名单、作者/人员信息、内网原文证据、共享编辑快照、凭据及无关顾问项目不上传；完整客户/物料追溯仍保留本地。10/11/13/14号及L4源卡在此是公开副本；公开源卡与08索引可复现同一目录/HTML，不能替代原始客户证据。`package-project.mjs <独立Git工作区>`生成这套明确范围的公开包，不递归上传整个顾问工作目录。

回退使用Git历史与Supabase私有目录历史，恢复同版HTML/目录/流水线；不回退共享文案、标签、链接或revision，不强推。
