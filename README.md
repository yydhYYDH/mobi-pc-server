<p align="center">
  <img src="assets/icon-128.jpg" width="128" alt="图标">
</p>

<p align="center">
  你的智伴：自主感知，自主决策与主动式服务，实现全时陪伴的数字分身
</p>

<p align="center">
  <a href="README.en.md">English</a> | <a href="README.md">中文</a>
</p>

-----
## 关于
你的智伴(ClawMate) 是一款面向 HarmonyOS NEXT 的端侧智能体应用，支持图库分析、个人画像、推荐事项和数字分身等能力，形成从“理解个人数据”到“执行真实手机操作”的完整移动智能体体验。

<p align="center">
<img src="assets/app.jpg" height="280" alt="app截屏">
<img src="assets/mobi-pc-server.png" width="280" alt="pc截屏">
</p>

本仓库提供鸿蒙和桌面应用的源码，并提供桌面应用的安装包。

## 安装
### 鸿蒙App

### 桌面应用
桌面应用可以直接从[Release页面](https://github.com/yydhYYDH/mobi-pc-server/releases)下载。

| Platform | Download |
|--|--|
|macOS (Apple Silicon) |	ClawMate-desktop-mac-arm64.dmg |
|Windows | ClawMate-desktop-windows-x64.exe |
|Linux | ClawMate-desktop-linux-x64.AppImage |

- Windows：运行 `.exe` 安装包。
- macOS：打开 `.dmg` ，将应用拖入 Applications。
- Linux：给 `.AppImage` 添加执行权限后直接运行。

Linux 示例：

```bash
chmod +x ClawMate-*-linux-*.AppImage
./ClawMate-*-linux-*.AppImage
```

安装后首次启动会把随包配置复制到用户数据目录。模型文件、日志和缓存会保存在系统用户数据目录，覆盖安装或升级应用时不会写入安装目录。
