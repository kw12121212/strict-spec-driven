# dsh-plugin-strict-spec

[English](README.md)

在 DeepSeek Harness（dsh）中只读查看严格工作流文档的插件。它把 Session
所在 workspace 的 `.strict-spec-driven/` 目录展示为文档树，并为每种严格 YAML
制品提供专属视图。

本包以 GitHub Release tarball 形式分发（Apache-2.0），消费端机器只需 dsh CLI
与 Release URL；npm registry 路径为可选，仅在实际发布后可用。

## 展示内容

- **两个入口。** 左侧边栏的 *Strict 文档* 行打开整页视图，页面提供 Session
  选择器，按 workspace 分组列出 Session 并记住上次的选择。右侧边栏引导中的
  *Strict 文档* 条目在对话旁打开一个绑定当前 Session 的标签页。
- **文档树。** 制品族按固定顺序出现——config、architecture、roadmap、changes、
  scenes、specs、tech、lessons、SOPs、design system——workspace 中不存在的族会被
  省略。归档分组默认折叠，展开时才读取。里程碑与计划变更显示其声明的状态，活跃
  变更显示任务完成度，被宿主目录列举上限截断的目录显示截断标记。文档树支持键盘
  导航。
- **专属视图**：变更制品（proposal、design、tasks、questions，以及 delta spec、
  delta scene、delta tech）、路线图制品（索引、里程碑、计划变更）、规范与场景
  （强调需求关键字，场景步骤的覆盖链接可打开对应需求）、项目上下文（config、
  architecture、技术标准、lessons、SOP、design system）。视图未布局的字段会追加
  在附加字段区，其他制品类型以通用结构化视图打开，因此不会隐藏任何内容。
- **实时刷新。** 已加载的目录和当前打开的文档会随磁盘文件变化自动更新。
- 对没有 `.strict-spec-driven/` 的 workspace 显示**空状态**；无法解析的 YAML
  显示带原始文本的解析错误视图。

## 只读保证

查看器不提供任何写入、编辑或删除严格工作流文件的控件，查看操作也不会改变任何
文件。视图按原样展示声明的字段值，从不计算路线图状态或校验结果。修改严格制品
仍照常通过 `strict-spec-cli` 进行。

## 内置严格工具链

插件自带严格工作流的工具链，因此装好插件即可使用 —— 不需要单独运行
`install.sh`，也不需要全局安装 `strict-spec-cli` 或注册技能包：

- 内置工具链开关**默认开启**。开启期间，插件把随插件打包的严格技能包注册
  到宿主的技能注册表，并且这些技能所给出的命令直接运行插件内置的
  `strict-spec-cli`（通过 dsh 宿主自身的 node 运行时调用）。插件不会向任何
  `bin` 目录写入内容，也不做任何 `PATH` 查找：内置 CLI 只在 Agent 会话内可用，
  终端中不可用。
- 开启期间，**外部副本优先**：项目或用户技能根目录下的同名严格技能（例如之前
  `install.sh` 安装的）优先于插件的内置副本，会话运行外部副本的正文与其声明的
  CLI。这是 dsh 技能注册表的设计分层——预设的本地发现注册在比本插件（部署级
  注册）更近的层，同层之内文件系统各根的 rank 也都高于 bundled 档——因此不需要
  任何预设覆盖或其他部署技巧。
- 内置副本是**零安装兜底**：没有外部副本的技能名自然落到插件的内置副本，什么
  都没装的机器仍能仅凭插件列出并运行全部严格技能。若在某台同时装有外部副本的
  机器上想让内置副本获胜，请移除外部副本（`bash install.sh --uninstall`
  可清除全局注册）。
- **无需加载即可在目录中区分内外副本**：内置条目的描述末尾带有来源标记，如
  `— built-in (dsh plugin 0.2.1)`，标明插件名与实际服务的版本；外部条目无标记。
- 整套工具链是**一个开关**，因为技能与 CLI 本是一体：被服务的技能正文是内置
  CLI 在会话中的唯一入口。关闭开关后内置技能消失，外部安装（如有）重新生效，
  查看器不受影响照常工作。`install.sh` 与全局安装路径在任何情况下都保持可用。

通过 profile 的 `cordis.patch.yml` 中插件行的 config 翻转开关 —— 无需重新安装：

```yaml
- id: ui-strict-spec
  name: dsh-plugin-strict-spec
  config:
    builtinTooling: false
```

省略 `config` 块（或整条记录）时开关保持默认值，即开启。

## 支持的 dsh 版本

插件声明的 `engines.dsh` 为 `>=0.2.1-rc.2 <0.2.2`，并在 dsh `0.2.1-rc.2` 上
测试。在该范围之外的 dsh 版本中，插件不注册任何文档界面，而不是显示部分可用的
查看器。

## 安装到 Web 客户端

按 URL 安装已发布的 Release tarball —— 无需检出仓库、无需构建、无需 npm 账号。
从仓库的 [Releases 页面](https://github.com/kw12121212/strict-spec-driven/releases)
选最新的 `plugin-v*` 标签安装其 tarball（以 0.3.0 为例）：

```sh
dsh plugin --profile web add https://github.com/kw12121212/strict-spec-driven/releases/download/plugin-v0.4.0/dsh-plugin-strict-spec-0.4.0.tgz
```

若存在 registry 发布，按名称安装亦可：

```sh
dsh plugin --profile web add dsh-plugin-strict-spec
```

随后重启 dsh 宿主（systemd 用户服务：`systemctl --user restart dsh-web.service`），
再从想阅读的工作区启动 web 客户端。升级时按同法安装新版本的 Release URL 并重启宿主。

### 开发安装

构建产物不提交到仓库，从本仓库的全新 clone 开始，复制下面这一块即可一次完成
构建与安装（在仓库根目录执行）：

```sh
cd plugins/dsh-strict-spec
bun install
bun run build
dsh plugin --profile web add "link:$(pwd)"
```

这会生成 `dist/client.js` 和 `dist/host.js`，并通过 npm 安装的 `dsh` 命令添加
插件。也可以从构建好的 checkout 打包 tarball 安装：

```sh
dsh plugin --profile web add "$(pwd)/$(npm pack --silent)"
```

`link:` 安装会跟随 checkout 之后的重新构建——拉取更新后在
`plugins/dsh-strict-spec` 中再次执行 `bun run build` 即可；tarball 安装是固定
副本，需要重新打包并再次 add 才能替换。然后在要查看的 workspace 中启动 Web
客户端：

```sh
cd /path/to/your/project
dsh web
```

使用 `dsh plugin --profile web remove dsh-plugin-strict-spec` 卸载插件。

## 升级 dsh 宿主

插件固定在其构建时所针对的 dsh 版本上（见上文 `engines.dsh`），按照本仓库
narrow-engines-dsh-pin 技术标准，放宽该范围本身就是一次独立的 planned
change——绝不在其他变更里顺手改动。升级 dsh 宿主之后：

1. 用 `dsh --version` 核对当前版本是否仍在固定范围内。
2. 找不到 *Strict 文档* 面板？这是版本范围在起作用，不是安装坏了：超出范围时
   插件刻意不注册任何文档界面。
3. 规划一次独立变更，把 `plugins/dsh-strict-spec/package.json` 的
   `engines.dsh` 提升到新的补丁线，针对该版本重新测试查看器，并随变更落地
   所需的适配修正。
4. 在该变更的 checkout 中重新构建（在 `plugins/dsh-strict-spec` 内执行
   `bun install && bun run build`）；tarball 安装需要重新打包并再次 add，
   `link:` 安装持续指向 checkout，只需重新构建。
5. 重启 `dsh web`（Desktop 需先完全退出）让 profile 重新组合，然后刷新页面。

本 SOP 中今天可执行的命令——构建、`link:` 安装到隔离 profile、启动宿主、在
浏览器中加载两个入口——均已对 dsh 0.2.1-rc.2 实测验证；面向未来版本的步骤
（第 3–4 步针对超出范围的宿主）在该版本发布之前无法实际运行。

## 安装到 Desktop profile

`desktop` profile 归 DeepSeek Harness Desktop 应用所有，通过 npm 安装的 `dsh`
会拒绝管理它。请改用 Desktop 安装包自带的 `dsh` 命令：

1. 先打开一次 DeepSeek Harness Desktop，让它初始化自己的 profile，然后完全
   退出。
2. 使用 Desktop 自带的 `dsh`，针对 desktop profile 执行同样的 `add` 命令，
   可使用任一种安装来源：

   ```sh
   dsh plugin --profile desktop add "link:/path/to/strict-spec-driven/plugins/dsh-strict-spec"
   ```

3. 重新启动 Desktop。

安装期间请保持 Desktop 关闭；卸载时同样使用 `remove dsh-plugin-strict-spec`。

以上 Desktop 步骤依据 dsh 0.2.1-rc.2 关于 Desktop 专属 profile 的文档编写，尚未
端到端实际运行验证；Web 客户端安装是已验证的路径。
