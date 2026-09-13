#!/usr/bin/env bash
# PostToolUse (Edit|Write) em src/ ou test/: roda guardrails + npm test e devolve falhas ao agente.
# exit 2 = o stderr vira feedback para o Claude.
set -uo pipefail
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write((JSON.parse(d).tool_input||{}).file_path||"")}catch{}})')"
case "$FILE" in */src/*|*/test/*|*/package.json) ;; *) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-.}"
G="$(node tools/guardrails.js 2>&1)"; GS=$?
T="$(npm test --silent 2>&1)"; TS=$?
if [ $GS -ne 0 ] || [ $TS -ne 0 ]; then
  echo "🔴 após editar $(basename "$FILE"):" >&2
  [ $GS -ne 0 ] && printf '%s\n' "$G" | grep -E "^\s*\[|violaç" | head -n 15 >&2
  [ $TS -ne 0 ] && printf '%s\n' "$T" | grep -E "FAIL|×|Error|error TS|expected|Received|Expected|Tests " | head -n 15 >&2
  exit 2
fi
echo "🟢 guardrails e npm test verdes após editar $(basename "$FILE")."
exit 0
