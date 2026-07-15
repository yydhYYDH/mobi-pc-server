# MobiInfer 运行时

此目录存放预编译的 MobiInfer `mnncli` 运行时文件。后端和打包脚本会在此目录中查找可执行文件，例如：

```text
3rdparty/mobiinfer/apps/mnncli/build_mnncli_linux_x64/mnncli
3rdparty/mobiinfer/apps/mnncli/build_mnncli_win_x64/mnncli.exe
3rdparty/mobiinfer/apps/mnncli/build_mnncli_darwin_arm64/mnncli
```

## 源码与二进制文件

本仓库不提供 MobiInfer 源码，仅提供当前支持平台的预编译 `mnncli` 二进制文件。受测试机器和环境限制，我们无法提供所有操作系统和架构对应的二进制文件。

