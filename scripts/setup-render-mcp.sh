#!/usr/bin/env bash
set -euo pipefail

CONFIG="${CODEX_CONFIG:-$HOME/.codex/config.toml}"
BACKUP="$CONFIG.render-mcp-backup-$(date +%Y%m%d%H%M%S)"

if [[ ! -f "$CONFIG" ]]; then
  echo "Codex config not found at $CONFIG" >&2
  exit 1
fi

printf "Paste your Render API key: "
stty -echo
read -r RENDER_API_KEY
stty echo
printf "\n"

if [[ -z "$RENDER_API_KEY" ]]; then
  echo "No API key provided." >&2
  exit 1
fi

cp "$CONFIG" "$BACKUP"

python3 - "$CONFIG" "$RENDER_API_KEY" <<'PY'
from pathlib import Path
import sys

config_path = Path(sys.argv[1])
api_key = sys.argv[2]
text = config_path.read_text()

block = f'''[mcp_servers.render]
url = "https://mcp.render.com/mcp"
http_headers = {{ Authorization = "Bearer {api_key}" }}
startup_timeout_sec = 30
'''

lines = text.splitlines()
out = []
skip = False

for line in lines:
    if line.strip() == "[mcp_servers.render]":
        skip = True
        continue
    if skip and line.startswith("[") and line.strip() != "[mcp_servers.render]":
        skip = False
    if not skip:
        out.append(line)

text = "\n".join(out).rstrip() + "\n\n"
marker = "# BEGIN OMC MANAGED MCP REGISTRY"
if marker in text:
    text = text.replace(marker, block + "\n" + marker, 1)
else:
    text += "\n" + block

config_path.write_text(text)
PY

echo "Render MCP configured in $CONFIG"
echo "Backup saved to $BACKUP"
echo "Restart Codex, then ask: Set my Render workspace to <workspace name>"
