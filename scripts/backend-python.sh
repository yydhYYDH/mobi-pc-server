#!/usr/bin/env bash

pc_server_python_version_ok() {
  "$1" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
}

pc_server_find_python_create_bin() {
  local candidate
  for candidate in "${PC_SERVER_PYTHON_CREATE:-}" python3.13 python3.12 python3.11 python3.10 python3 python; do
    [[ -n "$candidate" ]] || continue
    if command -v "$candidate" >/dev/null 2>&1 && pc_server_python_version_ok "$candidate"; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

pc_server_ensure_backend_python() {
  local backend_dir="$1"
  local python_bin="${PC_SERVER_PYTHON:-}"
  local venv_dir="${PC_SERVER_BACKEND_VENV:-$backend_dir/.venv}"
  local conda_env_dir="${PC_SERVER_BACKEND_CONDA_ENV:-$backend_dir/.venv-conda}"

  if [[ -n "$python_bin" ]]; then
    if [[ ! -x "$python_bin" ]]; then
      echo "PC_SERVER_PYTHON is not executable: $python_bin" >&2
      return 1
    fi
    if ! pc_server_python_version_ok "$python_bin"; then
      echo "PC_SERVER_PYTHON must be Python 3.10 or newer: $python_bin" >&2
      return 1
    fi
    printf '%s\n' "$python_bin"
    return 0
  fi

  for python_bin in "$venv_dir/bin/python" "$conda_env_dir/bin/python"; do
    if [[ -x "$python_bin" ]] && pc_server_python_version_ok "$python_bin"; then
      printf '%s\n' "$python_bin"
      return 0
    fi
  done

  local create_bin
  if create_bin="$(pc_server_find_python_create_bin)"; then
    "$create_bin" -m venv "$venv_dir"
    python_bin="$venv_dir/bin/python"
    "$python_bin" -m pip install --upgrade "pip>=24.0" "setuptools>=68" wheel
    printf '%s\n' "$python_bin"
    return 0
  fi

  local conda_bin
  conda_bin="$(command -v conda || true)"
  if [[ -n "$conda_bin" ]]; then
    "$conda_bin" create -y -p "$conda_env_dir" python=3.11 pip
    python_bin="$conda_env_dir/bin/python"
    "$python_bin" -m pip install --upgrade "pip>=24.0" "setuptools>=68" wheel
    printf '%s\n' "$python_bin"
    return 0
  fi

  echo "Python 3.10+ was not found and conda is not available." >&2
  echo "Install Python 3.10+ or conda, or set PC_SERVER_PYTHON to a valid interpreter." >&2
  return 1
}
