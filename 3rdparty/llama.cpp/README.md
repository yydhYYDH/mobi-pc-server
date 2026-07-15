# llama.cpp 运行时

此目录存放 [llama.cpp](https://github.com/ggml-org/llama.cpp) 的预编译的 `llama-server` 运行时文件。后端和打包脚本会在此目录中查找可执行文件，例如：

```text
3rdparty/llama.cpp/build/bin/llama-server
3rdparty/llama.cpp/build-linux-x64-cuda/bin/llama-server
3rdparty/llama.cpp/build-linux-x64-cpu/bin/llama-server
3rdparty/llama.cpp/build-windows-x64/bin/llama-server.exe
```

## 拉取预编译文件

此目录中的部分二进制文件由 Git LFS 管理。克隆仓库后，请在仓库根目录执行以下命令以拉取它们：

```bash
git lfs pull
```

## 自行编译

受测试机器和环境限制，我们无法提供所有操作系统、架构及硬件加速方式对应的二进制文件。若当前平台没有可用的预编译运行时，可从 [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) 获取源码并自行编译，然后将编译产物替换到此目录中对应平台和架构的 `bin` 目录。

请使用同一次构建生成的完整运行时文件替换现有内容，而不只替换 `llama-server`：它还依赖同目录中的 `llama`、`ggml` 等动态库。确保文件名和目录结构与后端或打包脚本查找的位置一致。
