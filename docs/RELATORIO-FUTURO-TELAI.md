# Relatório de futuro do Telai

**Data:** 28/09/2026  
**Branch de trabalho:** `codex/refactor-telai`  
**Objetivo:** preparar o Telai para continuar leve, preservar sua identidade visual e evoluir de chamadas/transmissões pequenas para eventos com mais de 2.000 espectadores.

## 1. Resumo executivo

O Telai não deve tentar resolver todos os cenários com uma única tecnologia de mídia.
O caminho sustentável é separar interação em tempo real de distribuição de audiência:

```text
Telai Control Plane
autenticação · grupos · permissões · chat · moderação · tokens
             │
             ├── P2P para salas pequenas
             ├── SFU para voz, câmera e participantes interativos
             └── ingestão + transcodificação + CDN para grandes audiências
```

Para uma transmissão pública com 2.000 espectadores, a prioridade não é apenas uma
SFU. É uma cadeia de transmissão com ingestão, perfis adaptativos e CDN. Uma live de
720p a 2,5 Mbps representa aproximadamente 5 Gbps de saída se todos os espectadores
receberem o fluxo diretamente; em 1080p a 6 Mbps, aproximadamente 12 Gbps. Esses
números são estimativas de capacidade, não metas já validadas.

A arquitetura recomendada é:

1. manter P2P para chamadas pequenas;
2. adicionar uma camada de provider de mídia no cliente e no backend;
3. usar SFU para participantes ativos e salas interativas;
4. usar HLS/LL-HLS distribuído por CDN para audiência passiva em massa;
5. manter API, banco, chat e permissões no Telai, sem acoplar a interface ao fornecedor de mídia.

## 2. O que já existe no Telai

### Funcionalidades e mídia

- Captura real de câmera, tela, janela e fallback legado.
- Áudio e vídeo P2P.
- TURN como fallback de conectividade.
- Negociação local observada com Opus e VP8.
- Perfis de qualidade com bitrate, framerate e escala de resolução.
- Reconexão automática de voz.
- Métricas de RTT, jitter, perda, bitrate e frames.
- Multistream e chat de transmissão.
- PostgreSQL local migrado e validado, mantendo SQLite como padrão enquanto o cutover não for autorizado.

### Estrutura de código

O shell visual foi preservado e várias responsabilidades já foram extraídas de
`App.svelte`, incluindo captura, transmissão, voz, sinalização, presença,
preferências e carregamento de componentes.

O próximo objetivo estrutural é terminar a divisão do shell sem transformar cada
pequena função em um pacote artificial. A regra deve ser extrair domínios com estado,
ciclo de vida, contratos e testes próprios.

### O que ainda não está provado

- Capacidade de uma transmissão com 2.000 espectadores.
- Capacidade de uma VPS específica sob carga de mídia.
- Qualidade em duas redes reais independentes.
- Simulcast/SVC em produção.
- SFU integrado ao Telai.
- Cutover do banco de produção para PostgreSQL.

## 3. Cenários que precisam ser tratados separadamente

### 3.1 Chamada pequena

Até poucos participantes, P2P continua sendo o caminho mais leve. O servidor cuida
da autenticação e sinalização, enquanto os clientes trocam mídia diretamente.

### 3.2 Sala interativa

Em uma sala com apresentadores, convidados e voz bidirecional, uma SFU é mais
adequada. A SFU encaminha os tracks e pode escolher camadas de qualidade sem
misturar ou transcodificar todo o conteúdo.

### 3.3 Transmissão pública grande

Para centenas ou milhares de espectadores que apenas assistem, o fluxo deve ser:

```text
Transmissor → ingestão RTMPS/WHIP → transcodificação → HLS/LL-HLS → CDN → espectadores
```

WebRTC/SFU pode continuar existindo para o palco interativo, mas não deve obrigar a
VPS do Telai a enviar milhares de cópias individuais quando uma CDN pode distribuir
segmentos HTTP.

## 4. O que estudar

### 4.1 Protocolos e transporte

- WebRTC, RTP, RTCP, ICE, STUN, TURN, DTLS e SRTP.
- P2P, SFU, MCU e arquitetura híbrida.
- RTMP/RTMPS para ingestão compatível com OBS.
- WHIP/WHEP para ingestão e reprodução WebRTC.
- HLS, LL-HLS, MPEG-DASH e comportamento de CDN.
- Diferença entre latência ultrabaixa, baixa latência e distribuição escalável.
- UDP, TCP fallback, portas de mídia e firewall.

### 4.2 Vídeo

- H.264/AVC, VP8, VP9 e AV1.
- Opus para voz e AAC quando necessário para pipelines HLS.
- CBR, VBR, keyframe interval e GOP.
- Bitrate ladder: 1080p, 720p, 480p e 360p.
- Adaptação de bitrate.
- Simulcast: múltiplas camadas simultâneas.
- SVC: camadas espaciais e temporais dentro do encoder.
- Keyframes, PLI, FIR, NACK e retransmissão.
- Custo de transcodificação e quando usar GPU.

### 4.3 Áudio

- Opus, canais, bitrate e FEC.
- Echo cancellation, auto gain e noise suppression nativos do WebRTC.
- Limitações de Electron/Chromium em dispositivos reais.
- Latência de captura e reprodução.
- Detecção de fala e estado autoritativo de speaking.
- Mixagem de microfone, áudio de sistema e áudio de jogo.
- Quando uma solução de supressão externa realmente compensa.

### 4.4 Backend e sistemas distribuídos

- Separação entre control plane e media plane.
- Tokens curtos e permissões de publicação/assinatura.
- Idempotência e reprocessamento de eventos.
- WebSocket horizontal com Redis ou NATS.
- Filas para transcodificação, gravação e geração de thumbnails.
- Rate limit por usuário, IP, sala e evento.
- Backpressure e proteção contra espectadores ou bots abusivos.
- Consistência de presença e reconexão.

### 4.5 Banco e armazenamento

- PostgreSQL como fonte de verdade.
- Índices para grupos, mensagens, streams, permissões e auditoria.
- Pool de conexões e limites por serviço.
- Read replicas quando houver leitura suficiente para justificar.
- Redis somente quando cache, presença ou pub/sub realmente exigirem.
- Object storage para gravações, anexos e segmentos.
- CDN sem transformar vídeo ao vivo em conteúdo persistido no banco.
- Backup testado e restauração periódica.

### 4.6 Electron e frontend

- Separação entre shell visual, stores, controllers e serviços de mídia.
- Lazy loading sem aumentar o bundle inicial.
- Media permissions, dispositivos e troca de câmera/microfone.
- Aceleração gráfica e comportamento com GPU indisponível.
- Ciclo de vida de `MediaStream`, `MediaStreamTrack`, `RTCPeerConnection` e janelas.
- Testes de Electron com fake devices e testes reais separados.
- Preservação de acessibilidade, responsividade e identidade visual.

### 4.7 Segurança

- Stream keys rotativas e revogáveis.
- Tokens WebRTC curtos, com audiência, sala e permissões limitadas.
- Autorização no servidor, nunca apenas no frontend.
- Proteção contra replay de tokens.
- Limites de ingestão por conta.
- Proteção de chat, uploads, webhooks e bots.
- Isolamento do SFU e TURN da API.
- TLS, HSTS, CSP, cookies seguros e rotação de segredos.
- Auditoria de ações de moderadores.
- Retenção e exclusão de gravações.

### 4.8 Operação

- Docker Compose para instalações pequenas.
- Host networking quando a solução WebRTC exigir portas UDP diretas.
- Load balancer para sinalização HTTP/WebSocket.
- Prometheus, Grafana e logs estruturados.
- Alertas de CPU, memória, banda, perda, RTT e falhas de ingestão.
- Deploy gradual e rollback.
- Teste de restauração de banco.
- Teste de desastre e perda de nó.
- Custos de banda, transcodificação, CDN e armazenamento.

## 5. Decisões recomendadas

### 5.1 Não substituir P2P imediatamente

P2P continua útil para chamadas pequenas e mantém o Telai leve. O cliente deve
escolher o provider com base no tipo de sala, não com base em uma reescrita visual.

### 5.2 Não usar SFU para toda a audiência passiva

Uma SFU é excelente para interação, mas uma CDN é mais adequada para fan-out de uma
transmissão pública. LiveKit documenta uma arquitetura SFU self-hosted e opções
distribuídas; também destaca que capacidade é limitada por CPU e banda. ([LiveKit
self-hosting](https://docs.livekit.io/transport/self-hosting/), [deploy do
LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/))

### 5.3 LiveKit como primeira prova de SFU

LiveKit reduz a quantidade de protocolo de mídia que o Telai teria de implementar.
Mediasoup continua uma alternativa válida caso o controle fino e a integração Node
sejam mais importantes que a velocidade de entrega. A documentação do mediasoup
explica que um worker usa um núcleo e que transmissões one-to-many maiores podem
exigir múltiplos routers, pipe transports e reencoder. ([escalabilidade do
mediasoup](https://mediasoup.org/documentation/v3/scalability/))

### 5.4 Adapter próprio contra lock-in

O Telai não deve espalhar chamadas do SDK de um fornecedor por todos os componentes.
Criar contratos próprios, por exemplo:

```text
MediaProvider
├── createRoom()
├── createPublisherToken()
├── createViewerToken()
├── publish()
├── subscribe()
├── leave()
└── getQualitySnapshot()
```

O provider P2P atual e o futuro provider SFU devem implementar o mesmo contrato
necessário pela interface.

## 6. Roadmap técnico

### Etapa A — Fundação local

- Finalizar os cortes seguros do `App.svelte`.
- Criar `MediaProvider` no frontend e backend.
- Separar claramente transmissão pública de chamada interativa.
- Criar papéis de transmissor, palco e espectador.
- Emitir tokens de mídia pelo Telai.
- Manter P2P como fallback funcional.
- Adicionar métricas por sessão e por provider.

**Critério de conclusão:** a UI funciona sem saber se a sala usa P2P ou SFU.

### Etapa B — Protótipo de mídia

- Subir LiveKit localmente.
- Integrar uma sala experimental atrás do adapter.
- Validar áudio, câmera, tela, reconexão e permissões.
- Preservar o shell visual atual.
- Testar provider P2P e provider SFU lado a lado.

**Critério de conclusão:** uma sala local pode trocar de provider por configuração,
sem duplicar regras visuais ou de autorização.

### Etapa C — Transmissão pública escalável

- Adicionar ingestão RTMPS ou WHIP.
- Gerar perfis 1080p, 720p, 480p e 360p.
- Empacotar HLS/LL-HLS.
- Integrar CDN com URLs assinadas.
- Adicionar fallback de qualidade.
- Separar chat, presença e vídeo.

**Critério de conclusão:** espectadores passivos não consomem uma conexão WebRTC
individual com o transmissor.

### Etapa D — Teste de capacidade

Executar cenários de 100, 500, 1.000 e 2.000 espectadores, medindo:

- banda de entrada e saída;
- CPU e memória do ingest, transcoders e SFU;
- primeiro frame;
- rebuffering;
- bitrate efetivo;
- RTT, jitter e perda;
- reconexão;
- mensagens por segundo no chat;
- custo por hora e por espectador.

**Critério de conclusão:** os limites de capacidade são medidos, documentados e
repetíveis; nenhum número é considerado garantido apenas por estimativa.

### Etapa E — Produção inicial

- VPS da API separada da mídia.
- Banco PostgreSQL com backup e restore testado.
- Serviço de mídia com banda adequada.
- TURN separado ou isolado.
- CDN contratada para audiência pública.
- Observabilidade e alertas ativos.
- Deploy canário e rollback.

### Etapa F — Crescimento

- Múltiplos nós de SFU quando uma sala ou região exigir.
- Redis/NATS para coordenação apenas quando necessário.
- Object storage e retenção de gravações.
- Multi-região se houver audiência geograficamente distribuída.
- Autoscaling baseado em banda e conexões, não somente em CPU.
- Planejamento de incidentes e capacidade.

## 7. Capacidade e infraestrutura

### Telai control plane

Para uma primeira implantação separada da mídia, a referência inicial é 4–8 vCPU e
8–16 GB de RAM, com PostgreSQL protegido por pool, backup e limites. Essa faixa é
um ponto de partida para teste, não uma garantia de capacidade.

### Media plane

Para 2.000 espectadores, deve-se planejar rede de múltiplos Gbps e validar o perfil
real de vídeo. Uma porta de 1 Gbps não deve ser considerada suficiente para uma live
WebRTC direta em 2.000 espectadores.

### CDN

A CDN transfere o custo de fan-out para uma rede de distribuição. Isso não torna a
transmissão gratuita: a conta passa a incluir tráfego de saída, requisições,
transcodificação, armazenamento e regiões atendidas.

### GPU

Encaminhamento SFU normalmente não exige GPU. Transcodificação simultânea de vários
perfis pode justificar GPU ou workers especializados, mas isso deve ser medido antes
da compra.

## 8. Métricas e metas propostas

Estas são metas para discussão, não resultados atuais do Telai:

| Área | Métrica proposta |
|---|---|
| Disponibilidade | 99,9% para control plane |
| Entrada na live | p95 abaixo de 5–8 s em HLS/LL-HLS |
| WebRTC interativo | p95 de conexão abaixo de 3 s |
| Qualidade | perda abaixo de 1% em rede normal |
| Reprodução | rebuffering abaixo de 1% do tempo assistido |
| Chat | p95 abaixo de 500 ms em operação normal |
| Recuperação | reconectar sem recarregar a página |
| Observabilidade | cada sessão com provider, região e qualidade identificáveis |

## 9. Riscos que precisam ser evitados

- Tentar atender 2.000 espectadores com P2P.
- Colocar API, PostgreSQL, SFU, TURN e transcoder na mesma VPS pequena.
- Confundir teste local do Electron com capacidade de produção.
- Habilitar simulcast sem medir encoder, banda e seleção de camadas.
- Fazer cutover PostgreSQL sem backup restaurável.
- Espalhar dependências do SDK SFU por toda a interface.
- Confiar somente em CPU e ignorar banda de saída.
- Fazer o chat depender do mesmo caminho de falha da mídia.
- Publicar sem health check, métricas e rollback.
- Alterar a identidade visual como consequência de uma mudança de transporte.

## 10. Lista de estudos prioritários

### Prioridade imediata

1. Control plane versus media plane.
2. SFU versus CDN para audiência grande.
3. HLS/LL-HLS, ingestão e transcodificação.
4. Tokens, permissões e papéis de mídia.
5. WebRTC, TURN e simulcast.
6. Observabilidade de mídia.

### Prioridade seguinte

1. LiveKit self-hosted.
2. Mediasoup e pipe transports.
3. Redis/NATS para presença e chat distribuído.
4. PostgreSQL em produção e estratégia de backup.
5. CDN, object storage e custos de banda.
6. Testes de carga com browsers/headless WebRTC.

### Prioridade de escala

1. Multi-região.
2. Autoscaling.
3. Failover de ingestão.
4. Gravação e VOD.
5. Moderação em escala.
6. Proteção contra abuso e DDoS.

## 11. Conclusão

O futuro do Telai não exige copiar a aparência do Discord ou da Kick. Exige
separar corretamente os domínios:

- Telai para identidade, comunidade, permissões e experiência.
- P2P para o caminho leve.
- SFU para interação em tempo real.
- CDN para audiência em massa.
- PostgreSQL para persistência.
- Observabilidade e testes para decidir quando escalar.

O próximo passo técnico recomendado é implementar o contrato `MediaProvider` e um
protótipo local de SFU, sem trocar a interface visual nem remover o P2P atual.
