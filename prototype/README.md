# WTRP redesign prototype

这是一次可丢弃的本地视觉原型，未接入生产数据，也没有修改 `../index.html`、`../style.css` 或 `../app.js`。

直接双击 `wtrp-redesign.html` 即可预览；也可以在 `wtrp` 目录执行：

```powershell
python -m http.server 4173
```

然后打开 `http://localhost:4173/prototype/wtrp-redesign.html?variant=a`。

方案：

- `variant=a`：指挥台式，青绿色研究主线和玻璃面板。
- `variant=b`：蓝图档案式，更接近游戏科技树的硬朗金属布局。
- `variant=c`：移动优先式，卡片更紧凑，计算栏变为浮动摘要。
- `variant=d`：ATLAS 档案馆式，完全改为米白纸张、朱红标记和档案登记卡，计算栏是研究订单票据。
- `variant=e`：NIGHTFALL 夜战指挥图，黑曜石背景、雷达扫描层、作战路线节点和任务终端式计算栏。
- `variant=f`：NOCTURNE 极简暗色，炭黑、暖灰和低饱和金色，去掉科技装饰与发光效果，强调留白和排版。

底部切换条支持左右切换方案；顶部“桌面 / 手机”支持同一设计的尺寸预览。点击卡片可选中，点击堆叠卡片可展开，右侧“查看完整研发链”可展开链路。

`variant=d` 使用原型目录内的 `atlas-background.jpg` 作为沉浸式档案封面素材；该素材只属于原型，不会被生产页面引用。
