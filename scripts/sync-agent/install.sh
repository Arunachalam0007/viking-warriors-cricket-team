#!/bin/zsh
# Installs the CricHeroes sync helper on this Mac as a background service (launchd).
# It starts at login, restarts if it stops, and logs to ~/Library/Logs/viking-warriors-sync.log.
#   npm run sync:agent:install     install or update
#   npm run sync:agent:uninstall   remove
set -euo pipefail

LABEL="com.vikingwarriors.sync-agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/viking-warriors-sync.log"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ "${1:-}" == "uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Sync helper removed."
  exit 0
fi

NODE="$(command -v node)"
[[ -f "$REPO/.env.local" ]] || { echo "Missing $REPO/.env.local (the helper needs DATABASE_URL and the Google keys)"; exit 1; }

# XML-escape the paths (the repo path may contain &)
esc() { print -r -- "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(esc "$NODE")</string>
    <string>$(esc "$REPO/node_modules/tsx/dist/cli.mjs")</string>
    <string>--conditions=react-server</string>
    <string>scripts/sync-agent.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$(esc "$REPO")</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$(esc "$LOG")</string>
  <key>StandardErrorPath</key><string>$(esc "$LOG")</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Sync helper installed and running."
echo "  Log:    tail -f \"$LOG\""
echo "  Remove: npm run sync:agent:uninstall"
