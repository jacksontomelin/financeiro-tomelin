# Tomelin Gestão Financeira

Sistema de gestão financeira **self-hosted**, sem dependências de serviços pagos ou APIs externas de IA. Backend em **FastAPI + PostgreSQL**, frontend em **JavaScript puro (PWA)** — instala como app no celular e roda no computador. Gráficos SVG desenhados à mão, no estilo visual do ecossistema UniController, com as cores da marca Tomelin (azul-marinho, dourado e verde).

---

## O que faz

- **Painel** com KPIs (saldo, a receber, a pagar, resultado do mês), fluxo mensal (receitas × despesas) e despesas por categoria — tudo em SVG, sem bibliotecas.
- **Contas a pagar e a receber** com baixa, estorno, parcelas, recorrência, filtros (status, categoria, busca) e exportação CSV.
- **Vencimentos** com destaque de atrasados e próximos, e **popup de aviso** ao abrir o sistema quando há contas vencendo.
- **Cadastros**: contas/carteiras (com saldo consolidado), categorias (receita/despesa com cor e ícone) e contatos (clientes/fornecedores).
- **Veículos (patrimônio)**: cada carro/moto com valor **automático pela FIPE (via FIPEConsulta)** ou **valor fixo** — você escolhe por veículo. Controla **financiamento** (parcelas pagas/faltantes, saldo devedor, barra de progresso) e tem **campos personalizados** (seguro, IPVA, Renavam… você decide o que controlar).
- **Relatórios**: **balancete** contábil (receitas e despesas por categoria + resultado), **patrimônio** (contas + veículos − financiamentos = patrimônio líquido) e **projeção** dos próximos 6 meses. Exporta **balancete e patrimônio em PDF** com a identidade Tomelin.
- **Recibos em PDF**: ao dar baixa (ou a qualquer momento) gera um **recibo em PDF** com o logo; também **envia o recibo pelo WhatsApp** no grupo de controle.
- **Fechamento do dia**: no horário configurado (`FECHAMENTO_HORA`, padrão 20h), envia ao grupo do WhatsApp um resumo com **todas as contas pagas/recebidas no dia** e o total — fica em silêncio se não houve movimento (`FECHAMENTO_DIARIO`).
- **Logos das empresas**: cada **contato** (Havan, Magalu, Celesc…) e **conta/cartão** (Sicoob, Nubank…) pode ter um **logo** — você faz upload (a imagem é reduzida e guardada no próprio sistema, sem serviço externo) ou cola uma URL. O logo aparece na lista de contatos, nos cards de contas e ao lado dos lançamentos do fornecedor.
- **Juros e multas**: campo de **juros/multa** no lançamento e na baixa, com **card de juros** no painel (pago no ano, no mês e ainda a pagar) para controlar o custo financeiro.
- **Integração WhatsApp estilo Sentinela**: envia alertas para um grupo de controle e **aceita comandos** no próprio grupo (por número ou palavra: saldo, vencer, resumo, apagar, areceber, patrimonio, juros). Fica em silêncio quando não há nada a avisar.
- **PWA**: instalável no celular (ícone, splash, offline do shell) e responsivo no desktop.

### Configurar a FIPE (FIPEConsulta)
No `.env` (ou variáveis do Coolify):

| Variável | Para que serve |
|---|---|
| `FIPE_ATIVO` | `true` para ligar a consulta automática |
| `FIPE_API_URL` | URL da sua API FIPEConsulta (ex.: `https://fipe.unicontroller.com.br`) |
| `FIPE_API_TOKEN` | token Bearer, se a API exigir |
| `FIPE_ENDPOINT` | caminho da consulta; `{codigo}` é trocado pelo código do veículo (padrão `/api/fipe/{codigo}`) |

No cadastro do veículo escolha **"Automático pela FIPE"** e informe o **código FIPE**; o botão **Atualizar FIPE** consulta e grava o valor. Sem a API configurada, você ainda pode informar o valor FIPE manualmente ou usar **valor fixo**. Os PDFs usam `EMPRESA_NOME`, `EMPRESA_DOC` e `EMPRESA_CIDADE` no cabeçalho/rodapé.

### Login padrão
```
admin@tomelin.com.br  /  tomelin123
```
> Troque `ADMIN_EMAIL` e `ADMIN_SENHA` (e o `SECRET_KEY`) antes de subir em produção.

---

## Deploy no Coolify (KingHost VPS)

1. **Novo recurso → Docker Compose** e aponte para este repositório (ou cole o `docker-compose.yml`).
2. Em **Environment Variables**, preencha a partir do `.env.example` — no mínimo:
   - `POSTGRES_PASSWORD` (senha do banco)
   - `SECRET_KEY` (chave aleatória grande)
   - `ADMIN_EMAIL` / `ADMIN_SENHA`
3. O compose sobe dois serviços: `db` (PostgreSQL 16) e `app` (FastAPI na porta **8000**). Aponte o domínio do Coolify para a porta `8000` do serviço `app`.
4. Deploy. Na primeira subida o sistema **cria as tabelas, o usuário admin e dados de exemplo** automaticamente.
5. Healthcheck já configurado em `/api/health`.

> Rodando fora do Coolify: `docker compose up -d --build`. Para um Postgres já existente, defina `DATABASE_URL` direto e ignore o serviço `db`.

---

## WhatsApp (estilo Sentinela)

> **Recibo automático:** toda vez que uma conta é marcada como paga (na baixa, ou já criada como paga), o sistema envia o **recibo** para o grupo do WhatsApp automaticamente. Controle pela variável `RECIBO_WHATSAPP_AUTO` (`true`/`false`); precisa do WhatsApp ativo (`WHATSAPP_ATIVO=true`).

Não embute Baileys — reaproveita o **seu gateway** (o mesmo do `whatsapp.jackson` / `zap.unicontroller.com.br`). Configure:

| Variável | Para que serve |
|---|---|
| `WHATSAPP_ATIVO` | `true` para ligar o envio |
| `WHATSAPP_API_URL` | URL base do gateway (ex.: `https://zap.unicontroller.com.br`) |
| `WHATSAPP_ENDPOINT_ENVIAR` | rota de envio no gateway (padrão `/api/enviar`) |
| `WHATSAPP_API_TOKEN` | token Bearer, se o gateway exigir |
| `WHATSAPP_GRUPO` | id/nome do grupo de controle |
| `ALERTA_HORA` | hora do alerta diário (0–23, padrão 8) |
| `ALERTA_DIAS_ANTES` | antecedência dos vencimentos (padrão 3 dias) |
| `RESUMO_SEMANAL` | `true` envia um resumo toda segunda |

O envio manda um payload tolerante (`grupo`/`group`/`para`/`to` + `mensagem`/`message`/`texto`/`text`), então funciona com a maioria dos formatos de gateway.

### Receber comandos
Aponte o webhook do seu gateway (mensagens do grupo) para:
```
POST https://SEU-DOMINIO/api/whatsapp/webhook
```
O sistema lê `grupo` e `texto` de vários formatos de payload, e só responde ao grupo configurado em `WHATSAPP_GRUPO`.

### Comandos disponíveis (número ou palavra)
| | Comando | Resposta |
|---|---|---|
| 1 | `saldo` | saldo das contas |
| 2 | `vencimentos` | atrasados + próximos 7 dias |
| 3 | `resumo` | resumo do mês |
| 4 | `apagar` | contas a pagar |
| 5 | `areceber` | contas a receber |
| 0 | `menu` | mostra o menu |

Teste o envio pela tela **Integrações → WhatsApp** (botão "Enviar teste") ou:
```
POST /api/whatsapp/teste   (autenticado)
```

---

## Stack

- **Backend**: FastAPI, SQLAlchemy 2.0, PostgreSQL, APScheduler (alertas), JWT (python-jose), bcrypt.
- **Frontend**: HTML/CSS/JS puro, PWA (manifest + service worker), gráficos SVG próprios.
- **Infra**: Docker + Docker Compose, pronto para Coolify.

### Estrutura
```
app/
  main.py          # FastAPI, scheduler, serve a PWA
  config.py        # variáveis de ambiente
  models.py        # Usuario, Conta, Categoria, Contato, Lancamento
  service.py       # cálculos financeiros + textos do WhatsApp
  whatsapp.py      # envio + processamento de comandos
  seed.py          # admin + categorias + dados de exemplo
  routers/         # auth, contas, categorias, contatos, lancamentos, dashboard, whatsapp
  static/          # index.html, app.js, styles.css, sw.js, manifest, ícones
Dockerfile
docker-compose.yml
.env.example
```

---
Feito para o ecossistema UniController — *Unindo tudo. Controlando tudo.*
