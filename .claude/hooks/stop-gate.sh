#!/usr/bin/env bash
# Stop hook. Quando o agente tenta encerrar, roda guardrails (análise estática, regras hard) E npm test.
# Falhou? exit 2 => o Claude NÃO para e recebe o motivo. Circuit breaker em MAX_VOLTAS.
set -uo pipefail
MAX_VOLTAS="${MAX_VOLTAS:-3}"
cd "${CLAUDE_PROJECT_DIR:-.}"
COUNT_FILE=".claude/.loop-count"
G="$(node tools/guardrails.js 2>&1)"; GS=$?
T="$(npm test --silent 2>&1)"; TS=$?
if [ $GS -eq 0 ] && [ $TS -eq 0 ]; then
  rm -f "$COUNT_FILE"
  echo "🟢 stop-gate: guardrails 0 violações e npm test verde, pode encerrar."
  exit 0
fi
N=$(( $(cat "$COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$N" > "$COUNT_FILE"
if [ "$N" -gt "$MAX_VOLTAS" ]; then
  rm -f "$COUNT_FILE"
  echo "⚠️  stop-gate: circuit breaker após $MAX_VOLTAS voltas. Ainda há violações ou testes vermelhos; devolvendo para o humano." >&2
  exit 0
fi
echo "🔁 stop-gate: volta $N/$MAX_VOLTAS. Não encerre: corrija e rode npm run verify de novo." >&2
[ $GS -ne 0 ] && printf '%s\n' "$G" | grep -E "^\s*\[|violaç" | head -n 15 >&2
[ $TS -ne 0 ] && printf '%s\n' "$T" | grep -E "FAIL|×|Error|error TS|expected|Received|Expected|Tests " | head -n 15 >&2
exit 2
