# mobiinfer Patches

This directory stores local patches for `3rdparty/mobiinfer`.

Apply patches from the mobiinfer source directory:

```powershell
cd E:\WAIC\pc_server\3rdparty\mobiinfer
git apply ..\..\patches\mobiinfer\0001-fix-windows-error-macro-in-log-utils.patch
```

Check whether a patch is already applied:

```powershell
cd E:\WAIC\pc_server\3rdparty\mobiinfer
git apply --reverse --check ..\..\patches\mobiinfer\0001-fix-windows-error-macro-in-log-utils.patch
```

Apply the full Windows `mnncli` build patch set in order:

```powershell
cd E:\WAIC\pc_server\3rdparty\mobiinfer
git apply ..\..\patches\mobiinfer\0001-fix-windows-error-macro-in-log-utils.patch
git apply ..\..\patches\mobiinfer\0002-fix-windows-mnncli-build.patch
git apply ..\..\patches\mobiinfer\0003-fix-windows-mtok-binary-tokenizer-offset.patch
```

## Patch List

### 0001-fix-windows-error-macro-in-log-utils.patch

Fixes an MSVC build failure in `apps/frameworks/model_downloader/cpp/include/log_utils.hpp`.

On Windows, headers can define `ERROR` as a macro. If that macro is visible before `log_utils.hpp` is parsed, it rewrites the `LogLevel::ERROR` enum member and causes syntax errors in MSVC. The patch undefines `ERROR` before declaring the downloader logging namespace.

After applying or refreshing this patch, verify with:

```powershell
cd E:\WAIC\pc_server
.\scripts\windows\build-mobiinfer.ps1 -OpenSslRoot "E:\Software\OpenSSL-Win64" -SkipSmokeTest
```

If mobiinfer is updated, re-check whether upstream has fixed the conflict before reapplying this patch.

### 0002-fix-windows-mnncli-build.patch

Fixes the remaining MSVC build issues for `apps/mnncli` after `0001` is applied.

The patch enables C++20 for `mnncli` and `model_downloader`, uses the MSVC static runtime to match the static MNN build, enables `CPPHTTPLIB_OPENSSL_SUPPORT` for the downloader on Windows, links `mnncli` to the OpenSSL `VC/x64/MT` static libraries explicitly, uses `/EHsc` for MSVC exception handling, adapts `LOG_ERROR` overload dispatch, and uses `_mkdir` on Windows.

Verified on Windows with:

```powershell
cd E:\WAIC\pc_server
cmd /c "call ""E:\Software\Visual Studio Community 2026\product\Common7\Tools\VsDevCmd.bat"" -arch=x64 -host_arch=x64 && powershell -ExecutionPolicy Bypass -File scripts\windows\build-mobiinfer.ps1 -OpenSslRoot ""E:\Software\OpenSSL-Win64"" -InstallDir ""E:\WAIC\pc_server\desktop\resources\mnn"" -SkipSmokeTest"
desktop\resources\mnn\mnncli.exe --help
```

### 0003-fix-windows-mtok-binary-tokenizer-offset.patch

Fixes the Windows runtime failure where `mnncli serve ... --config config.json` exits with `Error: bad allocation` while loading `tokenizer.mtok`.

Root cause: `.mtok` has an ASCII header followed by a binary payload. The tokenizer opened it in text mode, read header lines, then reused text-mode `tellg()` as a byte offset in a separately opened binary stream. On Windows this offset can be wrong because text streams translate newlines. For the tested model, the actual binary payload starts at byte `118`, while text-mode `tellg()` returned `121`, causing binary fields to be read from the wrong position and eventually allocating a bogus huge buffer.

The patch opens `.mtok` in binary mode from the start and continues reading the binary payload from the same stream after the header.

Verified with the default model config:

```powershell
cd E:\WAIC\pc_server
3rdparty\mobiinfer\apps\mnncli\build_mnncli_win\mnncli.exe serve mnn_mobi_gptq_new_sym_e2e_2B_w8a8_half_rl_n64_s512_visual --config models\mnn_mobi_gptq_new_sym_e2e_2B_w8a8_half_rl_n64_s512_visual\config.json --host 127.0.0.1 --port 18144
```

Expected result: no `bad allocation`; `/v1/models` responds with HTTP 200 while the process is running.
