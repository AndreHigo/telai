# Telai

Plataforma privada de comunidades, salas e transmissões de tela, janela, câmera e jogos.

## Produção

A produção usa somente o container Node do Telai, SQLite persistente e Docker Compose. O Caddy termina o HTTPS; Coturn é opcional e entra apenas quando o P2P não consegue atravessar o NAT.

```bash
cd /opt/mirante
cp deploy/.env.public.example deploy/.env
# edite deploy/.env e defina DOMAIN, MEDIA_MODE e os segredos necessários
docker compose --env-file deploy/.env -f deploy/docker-compose.public.yml up -d --build
```

O banco fica em `data/mirante-tv.sqlite`. Faça backup desse diretório e nunca o envie para o Git. O container monta `release/` somente para leitura, para disponibilizar o instalador e os metadados do atualizador.

### Privacidade e LGPD

O cadastro exige aceite dos Termos de Uso e da Política de Privacidade, registrando a versão e o horário do aceite na tabela `user_consents`. Os documentos ficam disponíveis em `/termos-de-uso` e `/privacidade`. Usuários autenticados encontram em Configurações > Minha conta os controles para baixar uma exportação JSON dos próprios dados ou solicitar a exclusão permanente da conta. A exclusão remove sessões, credenciais vinculadas, mensagens, lives e grupos que a conta possui; não deve ser usada sem confirmar esse impacto.

Defina `TELAI_LEGAL_POLICY_VERSION` no ambiente quando publicar uma nova versão dos documentos. A implementação técnica não substitui a revisão jurídica: antes do lançamento, confirme controlador/encarregado, contato, bases legais, prazos de retenção, operadores, transferências internacionais, backup criptografado e procedimento de atendimento aos titulares.

### Diagnóstico e logs

O servidor emite logs JSON estruturados no stdout, que podem ser consultados com `docker compose logs`. Use `MIRANTE_LOG_LEVEL=debug` temporariamente quando precisar investigar live, voz ou compartilhamento; o modo debug registra apenas eventos de ciclo de vida e erros, nunca credenciais, tokens, SDP, candidatos ICE, áudio, vídeo ou corpos de requisição. O endpoint local `/metrics` também mantém as últimas ocorrências e contadores de HTTP/WebSocket. O frontend envia somente erros de execução e contexto técnico reduzido para `/api/client-errors`.

Em produção, prefira ativar o debug por uma janela curta e voltar para `info` depois da reprodução do problema. O Compose mantém rotação de cinco arquivos de até 10 MiB por container.

No desktop, o processo principal grava em JSONL em `%APPDATA%\mirante-tv\logs\main.log`. Para uma reprodução local detalhada, abra o app com `$env:TELAI_DEBUG="1"; npm run desktop`; o mesmo sinal também pode ser ativado com `MIRANTE_DEBUG=1`. O log nativo registra falhas de carregamento, renderer/GPU, janela não responsiva, captura de tela, áudio auxiliar e encerramento, sem registrar conteúdo de mídia ou credenciais.

Verifique a instalação em `https://SEU_DOMINIO/healthz`. O domínio precisa apontar para a VPS e as portas 80/443 precisam estar disponíveis para o Caddy.

### Painel administrativo privado

O painel operacional fica em `/admin`, fora da navegação do produto e bloqueado para indexação. O acesso é decidido no backend por allowlist; configure pelo menos uma das variáveis abaixo no ambiente do servidor e reinicie o serviço:

```bash
TELAI_ADMIN_USERNAMES=seu_usuario
TELAI_ADMIN_USER_IDS=uuid-do-usuario
```

Use valores separados por vírgula quando houver mais de um administrador. Sem allowlist, nenhuma conta consegue acessar o painel. A primeira versão é somente leitura e não retorna senhas, hashes, tokens ou avatares completos.

### TURN opcional

Para redes com NAT restrito, defina `TURN_SECRET`, `TURN_REALM`, `TURN_EXTERNAL_IP` e `TURN_URL` no `deploy/.env`, libere UDP 3478 e o intervalo UDP configurado, e suba o overlay:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.public.yml -f deploy/docker-compose.turn.yml up -d --build
```

O modo recomendado continua sendo `MEDIA_MODE=p2p`; o TURN só deve retransmitir quando a conexão direta falhar.

## Desenvolvimento local

Requer Node.js 24 ou superior.

```powershell
pnpm install
pnpm run build:frontend
pnpm start
```

Abra `http://localhost:8787`. Toda a interface web e desktop usa o shell Svelte, compilado para `public/svelte`. O painel, grupos, voz, captura, player e chat compartilham as mesmas rotas e componentes; não existe uma interface paralela antiga.

## Aplicativo Windows

O instalador Electron abre o Telai em uma janela independente e usa a captura nativa do sistema. Para gerar uma versão:

```powershell
pnpm install
pnpm run dist
```

O comando compila o frontend e gera os artefatos em `release/`:

- `Telai-Setup-VERSAO.exe`
- `Telai-Setup-VERSAO.exe.blockmap`
- `latest.yml`

Para publicar uma atualização, aumente `version` no `package.json` e copie esses três arquivos para `/opt/mirante/release/` na VPS. O botão de download e o auto-updater usam esse diretório através do serviço principal.

Antes de atualizar a VPS, use `deploy/update-vps.sh` no checkout da VPS. O script anuncia a manutenção para todos os clientes, aguarda a contagem regressiva e então recria o Compose. Configure `TELAI_MAINTENANCE_TOKEN` no `deploy/.env`; o segredo nunca deve ser colocado no frontend ou no Git. Os tempos podem ser ajustados com `MAINTENANCE_DELAY_SECONDS` e `MAINTENANCE_DURATION_SECONDS`.

O app público usa `electron/config.json` com `appUrl` apontando para o domínio HTTPS e `startLocalServer` desativado. O servidor da VPS continua responsável por sinalização, autenticação, grupos e SQLite.

### Roadmap para sair do beta

A auditoria atual fica em [`public/beta-roadmap.html`](public/beta-roadmap.html). Ela registra o que foi validado localmente, o que ficou parcial e quais itens dependem de produção, fornecedores, outras máquinas ou decisão de produto. Ela não deve ser adicionada ao sitemap nem indexada.

O `deploy/update-vps.sh` pode ser executado sem token de manutenção: nesse modo ele atualiza somente a aplicação e não tenta reiniciar o Caddy. O token é opcional e serve apenas para exibir o aviso de manutenção aos clientes antes da troca.

Para abrir o desktop durante o desenvolvimento, use `pnpm run desktop` a partir da raiz do projeto. O Electron precisa receber a pasta do app (`electron .`) ou o executável empacotado; se um trecho JavaScript aparecer na mensagem “Unable to find Electron app”, ele foi passado ao Electron como se fosse o caminho da aplicação e o comando está incorreto.

## Contas e comunidades

O servidor mantém usuários, sessões, grupos, salas, permissões, mensagens e convites no SQLite interno. Google e Discord são provedores opcionais de login e vínculo; os segredos ficam somente no `deploy/.env`.

É possível criar salas de texto/chat e voz dentro dos grupos. As lives privadas são uma ação do grupo e não um terceiro tipo de sala. O catálogo público mostra apenas transmissões públicas ativas.

## Estrutura essencial

- `server.mjs`: API HTTP, WebSocket, autenticação, SQLite e sinalização WebRTC.
- `public/`: bundle Svelte compilado e arquivos públicos.
- `frontend/`: frontend Svelte + Vite + Tailwind.
- `electron/`: janela Windows, captura nativa e auto-update.
- `deploy/`: Dockerfile, Compose público, Caddy e configuração opcional do TURN.
- `data/`: banco SQLite local, fora do Git.
