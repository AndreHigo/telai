# Gateway de eventos de comunidade

O Telai mantém dois canais WebSocket com responsabilidades separadas:

- `/signal`: sinalização WebRTC, voz, transmissão, relay binário e chat da live;
- `/events`: eventos autenticados de comunidade, sem SDP, ICE ou payload binário.

O cliente abre `/events` quando entra em um grupo e envia:

- `subscribe-group` com `groupId` para assinar a comunidade;
- `group-presence` periodicamente para renovar a presença;
- `unsubscribe-group` ao trocar de comunidade.

O servidor entrega `group-subscribed`, `group-presence` e `group-message`. Cada
mensagem de controle recebe uma sequência monotônica por conexão, e o cliente
descarta eventos repetidos ou atrasados.

O endpoint HTTP de overview aceita `includeMessages=0`. O refresh periódico
continua atualizando salas, membros e streams, mas não repete o histórico de
mensagens; novas mensagens chegam pelo gateway de eventos. A autorização de
assinatura é validada no servidor com a associação atual do usuário ao grupo.

O protocolo é coberto por `pnpm run test:events` e a entrega na interface por
`pnpm run test:events-ui`, enquanto voz e transmissão continuam cobertos pelos
testes existentes de WebSocket e mídia.
