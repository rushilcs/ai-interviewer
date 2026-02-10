#!/usr/bin/env bash
set -euo pipefail

# --- Config (edit if needed) ---
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"

OPS_EMAIL="${OPS_EMAIL:-ops-admin@example.com}"
OPS_PASSWORD="${OPS_PASSWORD:-ops-admin-password}"

CANDIDATE_EMAIL="${CANDIDATE_EMAIL:-}"
EXPIRES_AT="${EXPIRES_AT:-}" # e.g. "2026-02-10T00:00:00.000Z"

# Requires: curl, jq
command -v curl >/dev/null || { echo "Missing curl"; exit 1; }
command -v jq   >/dev/null || { echo "Missing jq"; exit 1; }

echo "==> 0) Health check"
curl -s "$BACKEND_URL/health" | jq .

echo "==> 1) Ops login (get JWT)"
JWT="$(
  curl -s -X POST "$BACKEND_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg e "$OPS_EMAIL" --arg p "$OPS_PASSWORD" '{email:$e, password:$p}')" \
  | jq -r '.token'
)"
if [[ -z "$JWT" || "$JWT" == "null" ]]; then
  echo "Failed to login. Check OPS_EMAIL/OPS_PASSWORD."
  exit 1
fi
echo "JWT acquired."

echo "==> 2) Get role_id (Machine Learning Engineer / mle-v1)"
ROLE_ID="$(
  curl -s "$BACKEND_URL/api/roles" \
    -H "Authorization: Bearer $JWT" \
  | jq -r '.roles[] | select(.schema_version=="mle-v1") | .id' | head -n 1
)"
if [[ -z "$ROLE_ID" || "$ROLE_ID" == "null" ]]; then
  echo "Could not find role with schema_version mle-v1."
  exit 1
fi
echo "ROLE_ID=$ROLE_ID"

echo "==> 3) Create invite"

# Build JSON payload without jq ternaries (more compatible)
INVITE_PAYLOAD='{"role_id":"'"$ROLE_ID"'"'
if [[ -n "$CANDIDATE_EMAIL" ]]; then
  INVITE_PAYLOAD+=',"candidate_email":"'"$CANDIDATE_EMAIL"'"'
fi
if [[ -n "$EXPIRES_AT" ]]; then
  INVITE_PAYLOAD+=',"expires_at":"'"$EXPIRES_AT"'"'
fi
INVITE_PAYLOAD+='}'

INVITE_RES="$(
  curl -s -X POST "$BACKEND_URL/api/interview-invites" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "$INVITE_PAYLOAD"
)"
INVITE_ID="$(echo "$INVITE_RES" | jq -r '.invite_id')"
TOKEN="$(echo "$INVITE_RES" | jq -r '.token')"
INVITE_URL="$(echo "$INVITE_RES" | jq -r '.invite_url')"
echo "INVITE_ID=$INVITE_ID"
echo "TOKEN=$TOKEN"
echo "INVITE_URL=$INVITE_URL"

echo "==> 4) Talent session (creates interview if missing)"
SESSION_RES="$(
  curl -s "$BACKEND_URL/api/talent/session?token=$TOKEN"
)"
INTERVIEW_ID="$(echo "$SESSION_RES" | jq -r '.interview_id')"
echo "INTERVIEW_ID=$INTERVIEW_ID"
echo "$SESSION_RES" | jq .

echo "==> 5) Start interview"
START_RES="$(
  curl -s -X POST "$BACKEND_URL/api/talent/interviews/$INTERVIEW_ID/start?token=$TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}'
)"
echo "$START_RES" | jq .

echo "==> 6) Send one candidate message"
MSG_RES="$(
  curl -s -X POST "$BACKEND_URL/api/talent/interviews/$INTERVIEW_ID/messages?token=$TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"client_event_id":"msg-1","text":"I would evaluate with precision/recall and consider latency constraints."}'
)"
echo "$MSG_RES" | jq .

echo "==> 7) Ask assistant (allowed)"
ASSIST_OK="$(
  curl -s -X POST "$BACKEND_URL/api/talent/interviews/$INTERVIEW_ID/assistant/query?token=$TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"client_event_id":"a-1","text":"What is AUC and when should I use it?"}'
)"
echo "$ASSIST_OK" | jq .

echo "==> 8) Ask assistant (blocked)"
ASSIST_BLOCK="$(
  curl -s -X POST "$BACKEND_URL/api/talent/interviews/$INTERVIEW_ID/assistant/query?token=$TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"client_event_id":"a-2","text":"Write the full code solution for the coding section"}'
)"
echo "$ASSIST_BLOCK" | jq .

echo "==> 9) Ops list interviews"
curl -s "$BACKEND_URL/api/ops/interviews" \
  -H "Authorization: Bearer $JWT" | jq .

echo "==> 10) Ops trigger evaluation"
curl -s -X POST "$BACKEND_URL/api/ops/interviews/$INTERVIEW_ID/evaluate" \
  -H "Authorization: Bearer $JWT" | jq .

echo "==> 11) Ops fetch evaluation"
curl -s "$BACKEND_URL/api/ops/interviews/$INTERVIEW_ID/evaluation" \
  -H "Authorization: Bearer $JWT" | jq .

echo "==> 12) Ops fetch replay"
curl -s "$BACKEND_URL/api/ops/interviews/$INTERVIEW_ID/replay" \
  -H "Authorization: Bearer $JWT" | jq .

echo
echo "DONE."
echo "INTERVIEW_ID=$INTERVIEW_ID"
echo "TOKEN=$TOKEN"
echo "JWT=$JWT"