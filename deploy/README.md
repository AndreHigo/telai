# Deploy remoto

O app precisa ser servido por HTTPS para que a captura de tela funcione fora de `localhost`.

O servidor emite logs JSON no stdout. Para uma investigação temporária, defina `MIRANTE_LOG_LEVEL=debug` no `.env` e acompanhe `docker compose logs -f mirante`; depois retorne para `info`. Os logs são redigidos e não incluem credenciais, tokens ou dados de mídia. O Compose já limita os logs a cinco arquivos de 10 MiB.

1. Copie `.env.example` para `.env` e altere os valores. O banco e os usuários ficam no SQLite interno montado em `data/`.
2. Execute `docker compose -f deploy/docker-compose.yml up -d --build`.
3. Coloque o Nginx ou Caddy na frente do container.
4. Configure DNS e certificado TLS para o domínio.
5. Se precisar atravessar NAT restrito, suba o Coturn e preencha `TURN_URL`/`TURN_SECRET`; para conexões diretas com IP público, o P2P funciona somente com STUN.

O endpoint `https://seu-dominio/healthz` deve responder `{"ok":true}` depois do proxy e do container estarem ativos.

## SMTP e e-mails transacionais

O Telai usa um relay SMTP autenticado para enviar convites por e-mail quando o
usuário convidado possui e-mail cadastrado. O envio é assíncrono: se o provedor
estiver indisponível, o convite interno continua funcionando e o erro aparece
nos logs sem expor senha ou conteúdo da mensagem.

Preencha no `deploy/.env`:

```dotenv
SMTP_HOST=smtp.sender.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario-smtp-do-provedor
SMTP_PASS=senha-ou-chave-smtp
SMTP_FROM=no-reply@telai.tv.br
SMTP_REPLY_TO=suporte@telai.tv.br
```

O domínio e o endereço remetente precisam ser verificados no provedor. Depois
do deploy, um administrador do site pode consultar `GET /api/admin/email/status`
ou testar a conexão com `GET /api/admin/email/status?verify=1`. Para enviar uma
mensagem de teste, use `POST /api/admin/email/test` com
`{"to":"seu-email-de-teste@exemplo.com"}`. O endpoint é protegido pelo mesmo
allowlist administrativo do painel e pelos limites de API.

O servidor registra uma linha JSON por requisição e mantém métricas em memória em `/metrics`. Esse endpoint é apenas local no Mirante; o exemplo de Caddy bloqueia seu acesso público. Os logs de acesso do Caddy ficam em `/var/log/caddy/telai-access.log` e têm rotação limitada a 5 arquivos de 50 MiB.

Os endpoints `/download` e `/updates/*.exe` têm limite padrão de 20 solicitações por IP a cada minuto. Ajuste `MIRANTE_DOWNLOAD_RATE_LIMIT_PER_MIN` somente se necessário; isso não substitui CDN ou armazenamento de artefatos para uma escala comercial.

## Proteção contra abuso

As APIs `/api/*`, `/ice-config` e `/runtime-config` têm limite padrão de 240
leituras por rota e 90 operações de escrita por rota, por IP/minuto. Isso evita
que, por exemplo, uma atualização de preferência bloqueie a criação de um
convite. Também existe um teto agregado de 900 requisições por IP/minuto.
Cadastro fica
limitado a 5 tentativas por IP/15 minutos, OAuth a 20 por IP/10 minutos e o
login combina 12 tentativas por minuto com bloqueio de 5 falhas por combinação
IP/usuário durante 15 minutos (e 30 falhas por IP no mesmo período). O
WebSocket `/signal` aceita no máximo 30 novas conexões por IP/minuto, 20
conexões simultâneas por IP e 240 mensagens de controle a cada 10 segundos.

Esses limites são aplicados no processo do Telai e podem ser ajustados no
`.env` pelas variáveis `MIRANTE_*RATE*` presentes em `.env.example`. Como a
instalação padrão usa uma única instância atrás do Caddy, eles protegem o
ambiente atual. Se houver mais de uma réplica, coloque também um limitador
compartilhado no proxy/CDN (Redis ou serviço de edge), pois buckets em memória
não são compartilhados entre processos.

## Migrar uma VPS existente de relay para P2P

Na instalação atual, faça uma cópia do `.env`, altere apenas `MEDIA_MODE=p2p` e recrie o container. O Caddy e o domínio permanecem iguais:

```bash
cp /opt/mirante/deploy/.env /opt/mirante/deploy/.env.bak
sed -i 's/^MEDIA_MODE=.*/MEDIA_MODE=p2p/' /opt/mirante/deploy/.env
docker compose --env-file /opt/mirante/deploy/.env \
  -f /opt/mirante/deploy/docker-compose.yml \
  up -d --build --no-deps mirante
curl https://seu-dominio/healthz
```

Nas atualizações normais, use `bash /opt/mirante/deploy/update-vps.sh`. Ele
reconstrói somente o serviço `mirante`; o Caddy instalado no host e o Coturn
existente não são reiniciados. Só mexa no Coturn quando a configuração TURN
for alterada.

O resultado esperado contém `"mediaMode":"p2p"`. Como o container agora escuta em `127.0.0.1:8787`, o firewall público dessa porta pode ser removido; mantenha `80/443` e abra as portas do Coturn somente se ele estiver habilitado.

O tráfego de mídia tenta ser direto entre os participantes. O TURN só entra como relay quando NAT/firewall impede a conexão direta. O segredo TURN nunca deve ser enviado ao navegador; o app gera credenciais temporárias em `/ice-config`.

Se o host atualizar a página ou perder o WebSocket, `HOST_RECONNECT_GRACE_MS` mantém a sala reservada por padrão por 45 segundos. Ao voltar, ele deve clicar em “Retomar transmissão” e escolher novamente a tela/câmera; essa nova permissão é exigida pelo navegador.

## Publicação com HTTPS e TURN

Para uma VPS Debian/Ubuntu com Docker instalado:

1. Aponte o registro DNS `A` de `DOMAIN` para o IP da VPS.
2. Copie `.env.public.example` para `.env` e defina `DOMAIN`, `MEDIA_MODE=p2p` e um `TURN_SECRET` longo.
3. Copie `Caddyfile.example` para `Caddyfile`.
4. Crie `/opt/mirante/release/` e copie para lá o instalador, o `.blockmap` e o `latest.yml` gerados. O Compose público monta essa pasta no container como somente leitura.
5. Abra as portas TCP `80`, `443`, `3478`, UDP `3478` e UDP `49160-49200` no firewall da VPS quando o Coturn estiver habilitado.
6. Execute `docker compose --env-file deploy/.env -f deploy/docker-compose.public.yml up -d --build`.

O Caddy emite e renova o certificado HTTPS automaticamente. O domínio usado em `DOMAIN` precisa ser o mesmo que está no DNS. Depois, teste `https://DOMAIN/healthz` e abra o app em `https://DOMAIN`.
