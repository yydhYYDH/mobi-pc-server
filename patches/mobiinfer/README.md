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
