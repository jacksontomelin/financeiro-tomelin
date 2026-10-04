# Tomelin no Android (APK)

O sistema já está pronto para virar app Android. Há dois caminhos, ambos de código aberto.

## O que já está pronto no sistema

- **Manifesto completo** (`app/static/manifest.json`): nome, cores, tela cheia, retrato, atalhos do ícone, capturas de tela e categorias.
- **Ícones**: normais (192 e 512), adaptáveis com o logo na área segura (`icon-maskable-*.png`), monocromático para o tema de ícones do Android 13 (`icon-mono-512.png`) e o ícone da loja sem transparência (`icon-play-512.png`).
- **Atalhos** (segurar o ícone do app): Nova despesa, Nova receita, Vencimentos e Transferir. Abrem por endereço: `/?acao=despesa`, `/?acao=receita`, `/?tela=vencimentos`, `/?acao=transferir` (e `/?acao=nfe`).
- **Botão voltar do Android**: fecha o que estiver aberto (calendário, menu, janela), depois volta à tela anterior; no Painel pede um segundo toque para sair.
- **Sem internet**: o app abre do cache e mostra um aviso; fontes e ícones são servidos pelo próprio sistema (nada do Google Fonts).
- **Verificação do domínio** (`/.well-known/assetlinks.json`): responde quando as variáveis abaixo estão configuradas.
- **Endereço do servidor configurável** para o caminho Capacitor (`window.TOMELIN_API`).

## Requisito obrigatório: endereço com HTTPS

O APK só abre em tela cheia em um endereço **HTTPS com domínio próprio** (por exemplo `https://financeiro.seudominio.com.br`).
O endereço de teste atual (`http://...sslip.io`) não serve: sem HTTPS o Android não confia no site.
Aponte um domínio para o servidor e ative o certificado gratuito (Let's Encrypt) no painel de hospedagem.

## Caminho 1 (recomendado): TWA com Bubblewrap

O APK abre o próprio site em tela cheia. Atualizações do sistema chegam no app sem publicar nova versão na loja.

1. No computador, instale o Node.js e o Bubblewrap:
   ```
   npm i -g @bubblewrap/cli
   ```
2. Gere o projeto a partir do manifesto publicado:
   ```
   bubblewrap init --manifest https://financeiro.seudominio.com.br/manifest.json
   ```
   Sugestões: pacote `br.com.tomelin.financeiro`, cor da barra `#082D51`, ícone adaptável `icon-maskable-512.png`.
   Ele cria a chave que assina o APK. **Guarde a chave e a senha em lugar seguro**: sem elas não dá para atualizar o app na loja.
3. Veja a impressão digital da chave:
   ```
   bubblewrap fingerprint list
   ```
4. No servidor, defina as variáveis de ambiente e reinicie:
   ```
   ANDROID_PACKAGE=br.com.tomelin.financeiro
   ANDROID_SHA256=AA:BB:CC:...   (a impressão digital do passo 3)
   ```
   Confira em `https://financeiro.seudominio.com.br/.well-known/assetlinks.json`.
   Se publicar na Play Store com assinatura pelo Google, acrescente também a impressão digital mostrada no Play Console (separe por vírgula).
5. Gere o APK (e o pacote para a loja):
   ```
   bubblewrap build
   ```
   Saem `app-release-signed.apk` (instalar direto no celular) e `app-release-bundle.aab` (enviar à Play Store).

## Caminho 2: Capacitor (app nativo com recursos do celular)

Para usar câmera nativa, notificações push ou biometria.

1. Crie o projeto e copie os arquivos de `app/static` para a pasta `www`.
2. No `index.html` copiado, antes do `app.js`, informe o servidor:
   ```html
   <script>window.TOMELIN_API = "https://financeiro.seudominio.com.br"</script>
   ```
3. `npx cap add android` e `npx cap open android`, e gere o APK pelo Android Studio.

O servidor já aceita chamadas de outros endereços (CORS liberado, login por token), então o app nativo conversa com ele sem ajustes.

## Checklist antes de publicar

- [ ] Domínio com HTTPS funcionando.
- [ ] `ANDROID_PACKAGE` e `ANDROID_SHA256` no servidor; `assetlinks.json` respondendo.
- [ ] `SECRET_KEY` definida no servidor (ou deixe o sistema guardar a dele no banco, que já acontece sozinho).
- [ ] Senha de fábrica do admin trocada (o sistema obriga no primeiro acesso).
- [ ] Testar no celular: instalar, abrir sem internet, atalhos do ícone, botão voltar.
- [ ] Capturas de tela da loja: `app/static/telas/` (1080x2340 e 1920x1080).
