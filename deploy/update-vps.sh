#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${TELAI_ENV_FILE:-$PROJECT_DIR/deploy/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Arquivo de ambiente não encontrado: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

BASE_URL="${TELAI_BASE_URL:-}"
if [[ -z "$BASE_URL" && -n "${DOMAIN:-}" ]]; then
  BASE_URL="https://${DOMAIN}"
fi
DELAY_SECONDS="${MAINTENANCE_DELAY_SECONDS:-60}"
DURATION_SECONDS="${MAINTENANCE_DURATION_SECONDS:-600}"

MAINTENANCE_TOKEN="${TELAI_MAINTENANCE_TOKEN:-${MIRANTE_MAINTENANCE_TOKEN:-}}"
if [[ -n "$MAINTENANCE_TOKEN" ]]; then
  if [[ -z "$BASE_URL" ]]; then
    echo "TELAI_MAINTENANCE_TOKEN foi definido, mas DOMAIN ou TELAI_BASE_URL não foi configurado." >&2
    exit 1
  fi
  if ! [[ "$DELAY_SECONDS" =~ ^[0-9]+$ ]] || (( DELAY_SECONDS < 10 || DELAY_SECONDS > 3600 )); then
    echo "MAINTENANCE_DELAY_SECONDS precisa estar entre 10 e 3600." >&2
    exit 1
  fi
  if ! [[ "$DURATION_SECONDS" =~ ^[0-9]+$ ]] || (( DURATION_SECONDS < 60 || DURATION_SECONDS > 86400 )); then
    echo "MAINTENANCE_DURATION_SECONDS precisa estar entre 60 e 86400." >&2
    exit 1
  fi
  echo "Anunciando atualização para os usuários: ${DELAY_SECONDS}s."
  curl --fail --silent --show-error --request POST "$BASE_URL/api/admin/maintenance" \
    --header "Content-Type: application/json" \
    --header "X-Telai-Maintenance-Token: $MAINTENANCE_TOKEN" \
    --data "{\"delaySeconds\":${DELAY_SECONDS},\"durationSeconds\":${DURATION_SECONDS}}"
  echo
  sleep "$DELAY_SECONDS"
else
  echo "Aviso de manutenção não enviado: TELAI_MAINTENANCE_TOKEN não configurado."
  echo "Continuando com a atualização somente do serviço mirante."
fi
# O deploy normal atualiza somente a aplicação. O Caddy do host e o TURN
# existente permanecem intactos; não há motivo para recriá-los a cada release.
docker compose --env-file "$ENV_FILE" \
  -f "$PROJECT_DIR/deploy/docker-compose.yml" \
  up -d --build --no-deps mirante
HEALTH_URL="${TELAI_HEALTH_URL:-${BASE_URL:-http://127.0.0.1:8787}}"
HEALTH_URL="${HEALTH_URL%/}"
HEALTH_ATTEMPTS="${TELAI_HEALTH_ATTEMPTS:-12}"
HEALTH_WAIT_SECONDS="${TELAI_HEALTH_WAIT_SECONDS:-5}"
if ! [[ "$HEALTH_ATTEMPTS" =~ ^[0-9]+$ ]] || (( HEALTH_ATTEMPTS < 1 || HEALTH_ATTEMPTS > 60 )); then
  echo "TELAI_HEALTH_ATTEMPTS precisa estar entre 1 e 60." >&2
  exit 1
fi
if ! [[ "$HEALTH_WAIT_SECONDS" =~ ^[0-9]+$ ]] || (( HEALTH_WAIT_SECONDS < 1 || HEALTH_WAIT_SECONDS > 60 )); then
  echo "TELAI_HEALTH_WAIT_SECONDS precisa estar entre 1 e 60." >&2
  exit 1
fi
for (( attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++ )); do
  if curl --fail --silent --show-error --max-time 10 "$HEALTH_URL/healthz"; then
    echo
    exit 0
  fi
  if (( attempt < HEALTH_ATTEMPTS )); then
    echo "Health check ainda indisponível; aguardando ${HEALTH_WAIT_SECONDS}s (tentativa ${attempt}/${HEALTH_ATTEMPTS})." >&2
    sleep "$HEALTH_WAIT_SECONDS"
  fi
done
echo "Falha no health check após ${HEALTH_ATTEMPTS} tentativas: $HEALTH_URL/healthz" >&2
docker compose --env-file "$ENV_FILE" -f "$PROJECT_DIR/deploy/docker-compose.yml" ps mirante >&2 || true
exit 1
