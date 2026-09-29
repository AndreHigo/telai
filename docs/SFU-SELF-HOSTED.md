# SFU self-hosted do Telai

Esta base prepara o Telai para usar um SFU sem ativá-lo. O padrão continua
`MEDIA_MODE=p2p` e `TELAI_SFU_ENABLED=false`; nenhuma sala existente muda de
transporte até que a integração do cliente e o benchmark sejam concluídos.

## Desenho

```text
Telai API + PostgreSQL  -> usuários, permissões, streams e tokens
LiveKit self-hosted     -> mídia WebRTC das lives públicas
Coturn                  -> fallback para NAT/firewalls restritos
P2P do Telai            -> chamadas e compartilhamentos pequenos
HLS/CDN futuro          -> milhares de espectadores passivos
```

O primeiro provedor recomendado é LiveKit self-hosted por oferecer o servidor
SFU pronto. Mediasoup continua uma alternativa quando precisarmos de controle
mais baixo nível e aceitarmos implementar mais componentes.

## Preparação local

1. Copie `deploy/livekit/.env.example` para `deploy/livekit/.env`.
2. Escolha uma versão do servidor que será testada e fixe `LIVEKIT_VERSION`.
3. Copie `livekit.yaml.example` para `livekit.yaml`, troque a chave/segredo e
   configure o IP público da VPS quando o servidor for implantado.
4. Inicie somente no ambiente de teste:

```powershell
docker compose --env-file deploy/livekit/.env -f deploy/livekit/docker-compose.yml up -d
```

O arquivo Compose ainda não é ativado pelo Compose principal do Telai.

## Configuração do Telai após a VPS existir

No `.env` do Telai, configure os segredos somente no backend:

```dotenv
TELAI_SFU_ENABLED=true
TELAI_SFU_PROVIDER=livekit
TELAI_SFU_ENDPOINT=wss://rtc.telai.tv.br
TELAI_SFU_API_KEY=...
TELAI_SFU_API_SECRET=...
TELAI_SFU_ROOM_PREFIX=telai-
```

Enquanto `TELAI_SFU_ENABLED` for `false`, o `/healthz` informa o SFU como
desligado e o fluxo atual P2P permanece intacto. Quando habilitado, o backend
exige endpoint, chave e segredo antes de iniciar, evitando uma configuração
parcial silenciosa.

## Antes de ativar em produção

- apontar DNS e TLS para `rtc.telai.tv.br`;
- liberar TCP 7880/7881 e o intervalo UDP configurado;
- configurar TURN e testar redes restritas;
- implementar o adapter `MediaProvider` no cliente e a emissão de tokens;
- testar P2P para grupo pequeno e SFU somente para live pública;
- medir CPU, RAM, banda, RTT, jitter, perda e reconexão em 1/5/10/20/50 viewers;
- preparar rollback mantendo `TELAI_SFU_ENABLED=false`.

O Egress/gravação não faz parte da primeira etapa. Se for ativado depois, deve
ser dimensionado como serviço separado porque composição e gravação consomem
CPU e memória adicionais.
