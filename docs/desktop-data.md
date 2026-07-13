# Desktop Data Directory

Desktop packages keep runtime data outside the installed application directory.
This prevents downloaded models, edited configs, logs, and ModelScope cache files
from being removed when the app is overwritten or upgraded.

## Packaged App Paths

The packaged Electron app uses `PC_SERVER_DATA_DIR` as the backend data root.
If `PC_SERVER_DATA_DIR` is not set, the app uses a stable `ClawMate` directory
under Electron's platform user data base:

```text
macOS:   ~/Library/Application Support/ClawMate
Windows: %APPDATA%\ClawMate
Linux:   $XDG_CONFIG_HOME/ClawMate or ~/.config/ClawMate
```

The backend receives these paths from Electron:

```text
PC_SERVER_ROOT=<data-root>
PC_SERVER_MODELS_DIR=<data-root>/models
PC_SERVER_CONFIGS_DIR=<data-root>/configs
PC_SERVER_LOGS_DIR=<data-root>/logs
MODELSCOPE_CACHE=<data-root>/modelscope-cache
```

## Directory Layout

```text
ClawMate/
  configs/
    models.json
  models/
    <model-id>/
  logs/
  modelscope-cache/
```

`configs/models.json` keeps the same relative `local_dir` values as the bundled
catalog, for example `models/qwen3.5-0.8b-q4-k-m`. The backend resolves these
paths against `PC_SERVER_ROOT`, so downloaded models stay inside the persistent
data root.

## Config Seeding

Packaged apps still include default configs under the application resources
directory:

```text
<app resources>/configs
```

On startup, the desktop shell copies missing bundled config files into
`<data-root>/configs`. Existing files are never overwritten. This means user
changes survive app updates, while newly added default config files can still be
seeded on future launches.

If an app update changes an existing bundled config file, an existing user config
with the same path is preserved. To adopt the new default, merge it manually or
delete the user copy before launching the app.

## Legacy Migration

Older builds stored packaged runtime data next to the executable under:

```text
<install-dir>/pc-server-data
```

On startup, the desktop shell copies any missing files from that legacy directory
into the persistent data root. It does not overwrite files that already exist in
the persistent data root.

This migration can only preserve legacy data if the old installation directory
still exists. Once an old app bundle or install directory has already been
deleted by an update, files inside it cannot be recovered by the new app.
