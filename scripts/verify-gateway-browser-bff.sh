#!/usr/bin/env bash
# Manual smoke check: skill-gateway BFF paths used by the browser (no agent-core URL needed).
# Prerequisites: skill-gateway on :18080, agent-core on :3000 (for greeting proxy only).
set -euo pipefail
GW="${GATEWAY_URL:-http://127.0.0.1:18080}"

echo "GET $GW/api/health"
curl -sS -o /dev/null -w "%{http_code}\n" "$GW/api/health" || true

echo "POST $GW/api/skills (no X-Agent-Token) — expect 200 or 4xx validation, not 401"
code=$(curl -sS -o /tmp/skill_create.json -w "%{http_code}" -X POST "$GW/api/skills" \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke-verify-'$(date +%s)'","description":"smoke","type":"EXTENSION","executionMode":"CONFIG","configuration":"{\"kind\":\"api\",\"preset\":\"current-time\",\"operation\":\"current-time\",\"method\":\"GET\",\"endpoint\":\"https://example.com\"}","enabled":true,"requiresConfirmation":false}')
echo "HTTP $code"
if [[ "$code" == "401" ]]; then
  echo "FAIL: browser Skill create should not require X-Agent-Token"
  exit 1
fi

echo "POST $GW/api/skills/compute — expect 401 without token (execution path)"
code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$GW/api/skills/compute" \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1,2]}')
echo "HTTP $code"
if [[ "$code" != "401" ]]; then
  echo "WARN: expected 401 for /api/skills/compute without token, got $code"
fi

echo "Done. Greeting proxy: POST $GW/api/user/{id}/greeting (requires existing user id)."
