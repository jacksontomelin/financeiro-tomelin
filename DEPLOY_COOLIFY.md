# Deploy do Tomelin no Coolify (KingHost VPS)

## Pré-requisitos
- VPS com Coolify instalado (recomendado: Ubuntu 22.04+)
- Docker e Docker Compose funcionando
- Acesso SSH à VPS
- Domínio configurado (opcional, mas recomendado)

## Passo 1: Clonar o repositório na VPS

```bash
cd /opt  # ou onde você preferir guardar aplicações
git clone https://github.com/jacksontomelin/financeiro-tomelin.git
cd financeiro-tomelin
```

## Passo 2: Configurar variáveis de ambiente

Copie o arquivo de exemplo e preencha com seus dados:

```bash
cp .env.example .env
nano .env  # ou seu editor preferido
```

**Variáveis críticas a mudar:**

| Variável | Padrão | O que fazer |
|----------|--------|------------|
| `POSTGRES_PASSWORD` | `tomelin` | **MUDE** para senha forte (min 16 chars) |
| `SECRET_KEY` | `troque...` | **GERE** com: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `ADMIN_SENHA` | `tomelin123` | **MUDE** para senha do login inicial |
| `WHATSAPP_ATIVO` | `false` | Deixe `false` se não usar, ou `true` + configure URL/token |
| `WHATSAPP_API_URL` | vazio | Se usar: `https://zap.unicontroller.com.br` (seu gateway) |
| `FIPE_ATIVO` | `false` | Deixe `false` ou `true` + configure sua API FIPE |

## Passo 3: Subir os containers

```bash
docker-compose up -d
```

Verifique o status:

```bash
docker-compose ps
docker-compose logs -f app  # ver logs da aplicação
```

A aplicação sobe em `http://localhost:8000`.

## Passo 4: Configurar domínio no Coolify

Se estiver usando Coolify:
1. Acesse o painel do Coolify
2. Crie uma **Application** apontando para o arquivo `docker-compose.yml`
3. Configure **Port Mapping**: `8000:8000`
4. Adicione um **Domain** (ex.: `financeiro.seupapai.com.br`)
5. Ative SSL (automático via Let's Encrypt)

## Passo 5: Login inicial

Acesse `https://seu-dominio` e faça login com:
- **Email:** admin@tomelin.com.br (ou o que você configurou em `ADMIN_EMAIL`)
- **Senha:** a senha que você colocou em `ADMIN_SENHA`

## Configurações pós-deploy

### WhatsApp (alertas automáticos)

Para receber alertas de vencimentos, recibos automáticos e fechamento do dia no WhatsApp:

1. Tenha um **gateway WhatsApp** rodando (ex.: seu UniZap em `zap.unicontroller.com.br`)
2. No `.env`, configure:
   ```
   WHATSAPP_ATIVO=true
   WHATSAPP_API_URL=https://zap.unicontroller.com.br
   WHATSAPP_API_TOKEN=seu_bearer_token_aqui
   WHATSAPP_GRUPO=120363123456789@g.us  # ou nome do grupo
   ```
3. Reinicie: `docker-compose restart app`

### FIPE (valor automático de veículos)

Se usar sua API **FIPEConsulta**:

1. No `.env`:
   ```
   FIPE_ATIVO=true
   FIPE_API_URL=https://fipe.unicontroller.com.br
   FIPE_API_TOKEN=seu_token_aqui
   FIPE_ENDPOINT=/api/fipe/{codigo}
   ```
2. Reinicie: `docker-compose restart app`
3. No cadastro de cada veículo, escolha "Automático pela FIPE" e informe o código
4. Use o botão "Atualizar FIPE" pra consultar/sincronizar

### Backup do banco de dados

O volume `pgdata` guarda os dados. Para backup:

```bash
docker-compose exec db pg_dump -U tomelin tomelin > backup.sql
```

Para restaurar:

```bash
docker-compose exec -T db psql -U tomelin tomelin < backup.sql
```

## Troubleshooting

### Erro: `Unixodbc not found` ou `psycopg2`

Já está no Dockerfile. Se persistir, reconstrua:

```bash
docker-compose down
docker-compose up -d --build
```

### Porta 8000 já em uso

Mude no `docker-compose.yml`:

```yaml
ports:
  - "8001:8000"  # usa 8001 em vez de 8000
```

### Postgres não inicializa

Verifique permissões do volume:

```bash
sudo chown -R 999:999 /var/lib/docker/volumes/*pgdata*
docker-compose restart db
```

### Logs da aplicação

```bash
docker-compose logs app -f --tail 50
```

## Parar e remover containers

```bash
# parar sem remover dados
docker-compose stop

# remover containers (dados no volume permanecem)
docker-compose down

# remover TUDO incluindo volumes (cuidado!)
docker-compose down -v
```

## URLs importantes

- **App:** https://seu-dominio
- **API docs:** https://seu-dominio/docs (Swagger UI)
- **API redoc:** https://seu-dominio/redoc
- **Health check:** https://seu-dominio/api/health

## Suporte

Qualquer problema, verifique:
1. Status dos containers: `docker-compose ps`
2. Logs: `docker-compose logs app`
3. Variáveis `.env` preenchidas
4. Permissões de firewall (porta 8000 aberta)
5. Postgres rodando: `docker-compose logs db`

---

**Criado em:** 2026-09-25  
**Versão:** 1.0 (MVP completo)  
**Repositório:** https://github.com/jacksontomelin/financeiro-tomelin
