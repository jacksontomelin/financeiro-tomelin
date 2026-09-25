# Configuração de PostgreSQL — 3 Opções

## Opção 1: Postgres no mesmo container (desenvolvimento/testes)

Usa o `docker-compose.yml` padrão que já inclui Postgres:

```bash
cp .env.example .env
# edita .env com a senha do Postgres
docker-compose up -d
```

**Quando usar:** desenvolvimento local, testes, prototipagem.

**Dados:** guardados em volume Docker `pgdata` da aplicação.

---

## Opção 2: Postgres em container separado (RECOMENDADO para produção)

Use o `docker-compose.postgres.yml` dedicado:

### Passo 1: Suba apenas o Postgres em uma VPS/máquina

```bash
# Crie um diretório pra guardar o Postgres
mkdir -p /opt/tomelin-postgres
cd /opt/tomelin-postgres

# Copie o arquivo docker-compose.postgres.yml de lá
# ou crie um novo .env:
cat > .env << EOF
POSTGRES_USER=tomelin
POSTGRES_PASSWORD=SENHA_MUITO_FORTE_DE_32_CHARS
POSTGRES_DB=tomelin
EOF

# Suba o Postgres
docker-compose -f docker-compose.postgres.yml up -d

# Verifique
docker-compose ps
docker-compose logs postgres
```

**Resultado:** Postgres rodando em `postgres.sua-vps.com.br:5432` (ou `IP_POSTGRES:5432`).

### Passo 2: Na outra VPS, configure a app pra apontar pro Postgres remoto

```bash
cd /opt/tomelin-financeiro
cp .env.example .env

# Edite .env:
DATABASE_URL=postgresql+psycopg2://tomelin:SENHA_MUITO_FORTE@IP_POSTGRES:5432/tomelin
```

Se estiver no Coolify, coloque essa URL nas **Environment Variables** da aplicação.

### Passo 3: Suba a aplicação

```bash
docker-compose up -d
```

Agora a app se conecta ao Postgres remoto.

**Quando usar:** produção, alta disponibilidade, separação de responsabilidades.

**Vantagens:**
- Banco separado — mais segurança, fácil fazer backup
- App pode reiniciar sem perder dados
- Escalabilidade — múltiplas apps apontando pro mesmo banco
- Monitoria do banco independente

---

## Opção 3: PostgreSQL gerenciado (Amazon RDS, Heroku, Azure Database)

Se você usar um Postgres gerenciado (ex.: AWS RDS):

```bash
# Seu .env fica assim:
DATABASE_URL=postgresql+psycopg2://admin:SENHA@postgres-xxx.c9akciq32.us-east-1.rds.amazonaws.com:5432/tomelin
```

Pronto — a app se conecta direto ao banco na nuvem.

---

## Checklist de Segurança

- [ ] `POSTGRES_PASSWORD` é **mínimo 32 caracteres** aleatórios
- [ ] Firewall: porta 5432 aberta **apenas pro container da app** (não expor na internet)
- [ ] Se Postgres remoto: use **SSL/TLS** (RDS faz automático)
- [ ] Backup diário do `pgdata` volume ou do banco
- [ ] Senha armazenada no `.env` (nunca em git)

---

## Backup e Restore

### Backup (dentro do container)

```bash
# Se Postgres está em container local
docker-compose exec postgres pg_dump -U tomelin tomelin > backup.sql

# Se Postgres está separado
docker run --rm -v $(pwd):/backups postgres:16-alpine \
  pg_dump -U tomelin -h postgres.sua-vps.com.br -d tomelin > backup.sql
```

### Restore

```bash
docker-compose exec -T postgres psql -U tomelin tomelin < backup.sql
```

---

## Problemas Comuns

### "Connection refused"

```bash
# Verifique se Postgres está rodando
docker-compose ps

# Verifique firewall
telnet IP_POSTGRES 5432

# Logs do Postgres
docker-compose -f docker-compose.postgres.yml logs postgres
```

### "Invalid password"

Revise a `DATABASE_URL` no `.env` — deve ter:
- Usuário correto: `tomelin`
- Senha exata: copie/paste, sem espaços
- Host correto: `localhost` ou `IP_POSTGRES`
- Porta: `:5432` (padrão)

### Dados sumiram depois de reiniciar

Você deletou o volume Docker. Próxima vez, use:

```bash
docker-compose down  # container é deletado, mas dados ficam no volume
docker-compose up -d  # mesmo volume é reutilizado
```

Se deletou o volume por acaso:

```bash
docker volume ls  # procura por tomelin ou pgdata
docker volume rm seu-volume  # delete se errado
```

---

## Performance

Para Postgres remoto com muitos lançamentos:

- Aumente o `max_connections` no Postgres
- Use **connection pooling** (PgBouncer)
- Faça índices nas colunas de data/status/categoria
- Backup regular

---

**Resumo:** Use **Opção 2** (Postgres separado) para produção. Simples de manter, fácil de fazer backup, seguro.

