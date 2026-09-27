#!/bin/bash
# Inicia o app + túnel Cloudflare para expor o webhook publicamente

# 1) Sobe o uvicorn em background
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --proxy-headers \
  --forwarded-allow-ips "*" \
  --workers 1 &

APP_PID=$!

# 2) Aguarda o app responder
echo "[start] aguardando o app subir..."
for i in $(seq 1 30); do
  curl -sf http://localhost:8000/api/health > /dev/null 2>&1 && break
  sleep 2
done
echo "[start] app OK"

# 3) Se CLOUDFLARE_TUNNEL_TOKEN definido, usa túnel autenticado (URL fixa)
if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
  echo "[start] iniciando túnel Cloudflare autenticado..."
  cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TUNNEL_TOKEN" &
else
  # Túnel temporário (URL muda a cada restart — só para teste)
  echo "[start] iniciando túnel temporário (sem token)..."
  cloudflared tunnel --no-autoupdate --url http://localhost:8000 2>&1 | \
    grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | \
    while read url; do
      echo ""
      echo "╔══════════════════════════════════════════════════════╗"
      echo "║  WEBHOOK URL (cole no gateway):                      ║"
      echo "║  ${url}/api/whatsapp/webhook"
      echo "╚══════════════════════════════════════════════════════╝"
      echo ""
      # Salva a URL nas configurações do sistema
      sleep 5
      curl -sf -X POST http://localhost:8000/api/whatsapp/tunnel-url \
        -H "Content-Type: application/json" \
        -d "{\"url\":\"${url}/api/whatsapp/webhook\"}" || true
    done &
fi

# 4) Mantém o container vivo
wait $APP_PID
