#!/bin/bash
# Tomelin Gestão Financeira — instala como serviço systemd na VPS
# Uso: sudo bash install.sh
# A aplicação vai rodar em http://IP:8788 (diretamente, sem proxy)

set -e
PORT=${PORT:-8788}
DEST=${DEST:-/opt/tomelin-financeiro}
SERVICE="tomelin-financeiro"
REPO="https://github.com/jacksontomelin/financeiro-tomelin.git"

echo "[1/6] Instalando dependências do sistema..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv git

echo "[2/6] Clonando/atualizando repositório em $DEST..."
if [ -d "$DEST/.git" ]; then
  cd "$DEST" && git pull
else
  git clone "$REPO" "$DEST"
  cd "$DEST"
fi

echo "[3/6] Criando ambiente virtual e instalando pacotes Python..."
python3 -m venv "$DEST/venv"
"$DEST/venv/bin/pip" install -q --upgrade pip
"$DEST/venv/bin/pip" install -q -r "$DEST/requirements.txt"

echo "[4/6] Configurando .env..."
ENV_FILE="$DEST/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << ENVEOF
DATABASE_URL=postgresql+psycopg2://tomelin:tomelin@localhost:5432/tomelin
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
ADMIN_NOME=Jackson Tomelin
ADMIN_EMAIL=admin@tomelin.com.br
ADMIN_SENHA=tomelin123
WHATSAPP_ATIVO=false
WHATSAPP_API_URL=
WHATSAPP_API_TOKEN=
WHATSAPP_GRUPO=
TIMEZONE=America/Sao_Paulo
EMPRESA_NOME=Tomelin Gestão Financeira
EMPRESA_CIDADE=Blumenau/SC
ENVEOF
  echo "  .env criado em $ENV_FILE — edite as variáveis antes de continuar."
fi

echo "[5/6] Configurando serviço systemd..."
cat > "/etc/systemd/system/$SERVICE.service" << UNIT
[Unit]
Description=Tomelin Gestão Financeira
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$DEST
EnvironmentFile=$DEST/.env
ExecStart=$DEST/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

echo "[6/6] Iniciando serviço..."
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
sleep 3
systemctl is-active "$SERVICE" && echo "✅ $SERVICE rodando na porta $PORT" || echo "❌ Falhou — veja: journalctl -u $SERVICE -n 30"

IP=$(hostname -I | awk '{print $1}')
echo ""
echo "  Webhook URL: http://$IP:$PORT/api/whatsapp/webhook"
echo "  Painel:      http://$IP:$PORT"
echo "  Logs:        journalctl -u $SERVICE -f"
echo ""
echo "  Para atualizar depois: cd $DEST && git pull && systemctl restart $SERVICE"
