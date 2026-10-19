# dsh-plugin-strict-spec

[English](README.md)

在 DeepSeek Harness（dsh）中只读查看严格工作流文档的插件。它把 Session
所在 workspace 的 `.strict-spec-driven/` 目录展示为文档树，并为每种严格 YAML
制品提供专属视图。

本包仅供本仓库内部使用，不会发布到 npm，也不会登记到任何插件市场；请从本地
checkout 或自行打包的 tarball 安装。

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

## 支持的 dsh 版本

插件声明的 `engines.dsh` 为 `>=0.2.1-rc.2 <0.2.2`，并在 dsh `0.2.1-rc.2` 上
测试。在该范围之外的 dsh 版本中，插件不注册任何文档界面，而不是显示部分可用的
查看器。

## 从本地 checkout 构建

构建产物不提交到仓库，安装前请先构建：

```sh
cd plugins/dsh-strict-spec
bun install
bun run build
```

这会生成 `dist/client.js` 和 `dist/host.js`。拉取更新后需重新构建。

## 安装到 Web 客户端

使用通过 npm 安装的 `dsh` 命令，可以链接到 checkout：

```sh
dsh plugin --profile web add "link:$(pwd)"
```

也可以从 checkout 打包出的 tarball 安装：

```sh
dsh plugin --profile web add "$(pwd)/$(npm pack --silent)"
```

`link:` 安装会跟随 checkout 之后的重新构建；tarball 安装是固定副本，需要重新
打包并再次 add 才能替换。然后在要查看的 workspace 中启动 Web 客户端：

```sh
cd /path/to/your/project
dsh web
```

使用 `dsh plugin --profile web remove dsh-plugin-strict-spec` 卸载插件。

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
