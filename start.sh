#!/bin/bash
set -e

echo "[start] iniciando uvicorn..."
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --proxy-headers \
  --forwarded-allow-ips "*" \
  --workers 1 &
APP_PID=$!

# aguarda app subir
echo "[start] aguardando app..."
for i in $(seq 1 30); do
  curl -sf http://localhost:8000/api/health > /dev/null 2>&1 && echo "[start] app OK" && break
  sleep 2
done

# inicia túnel cloudflare e captura a URL
echo "[start] iniciando túnel Cloudflare..."
TUNNEL_LOG=/tmp/tunnel.log

if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
  cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TUNNEL_TOKEN" > $TUNNEL_LOG 2>&1 &
else
  cloudflared tunnel --no-autoupdate --url http://localhost:8000 > $TUNNEL_LOG 2>&1 &
fi

TUNNEL_PID=$!

# aguarda a URL aparecer no log (até 30s)
echo "[start] aguardando URL do túnel..."
for i in $(seq 1 30); do
  sleep 2
  URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' $TUNNEL_LOG 2>/dev/null | head -1)
  if [ -n "$URL" ]; then
    WEBHOOK="${URL}/api/whatsapp/webhook"
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  TUNNEL URL — cole no gateway:                               ║"
    echo "║  $WEBHOOK"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    # salva no banco via API
    curl -sf -X POST http://localhost:8000/api/whatsapp/tunnel-url \
      -H "Content-Type: application/json" \
      -d "{\"url\":\"$WEBHOOK\"}" && echo "[start] URL salva no banco"
    break
  fi
done

if [ -z "$URL" ]; then
  echo "[start] AVISO: túnel não iniciou em 60s. Log:"
  cat $TUNNEL_LOG
fi

# mantém o container vivo
wait $APP_PID
