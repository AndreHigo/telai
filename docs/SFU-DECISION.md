# Decisão de arquitetura de mídia

## Estado atual

O Telai continua com P2P como transporte padrão para chamadas e transmissões
pequenas, com TURN usado como recuperação quando a conexão direta falha. O
relay WebM permanece como caminho alternativo controlado por configuração. A
interface não depende desses detalhes: o contrato compartilhado expõe somente
modo e perfil de qualidade.

Os testes locais de 26/09/2026 aprovaram os fluxos P2P e relay com 1 e 5
viewers sintéticos. Os cenários P2P de 10 e 20 viewers foram marcados como
inconclusivos porque o Electron encerrou o harness antes do resultado final;
isso não é uma aprovação de capacidade da VPS.

## Alternativas analisadas

### LiveKit

O LiveKit é um SFU completo, com sinalização, NAT traversal, adaptação e
controles de qualidade integrados. Em uma instalação de nó único não exige
Redis; Redis entra quando a implantação passa a distribuir salas entre nós.
Isso reduz o trabalho de protocolo, mas introduz um servidor separado em Go,
um protocolo/SDK próprio e uma nova fronteira operacional para o Telai.

Referências oficiais: [arquitetura do LiveKit SFU](https://docs.livekit.io/reference/internals/livekit-sfu/),
[self-hosting](https://docs.livekit.io/transport/self-hosting/) e
[benchmark de self-hosting](https://docs.livekit.io/transport/self-hosting/benchmark/).

### mediasoup

O mediasoup é uma biblioteca Node.js integrada ao processo da aplicação, com
workers nativos C++ que executam o SFU. Ele é deliberadamente baixo nível e
agnóstico de sinalização; isso combina melhor com o gateway `/signal` do Telai
e permite manter a identidade visual e o protocolo de presença próprios.
Como contrapartida, o Telai precisaria implementar transporte, produtores,
consumidores, renegociação, permissões, observabilidade e compatibilidade de
deploy, além de lidar com o build dos workers nativos.

Referências oficiais: [visão geral do mediasoup](https://mediasoup.org/documentation/overview/),
[escalabilidade](https://mediasoup.org/documentation/v3/scalability/) e
[design integrado ao Node.js](https://mediasoup.org/documentation/v3/mediasoup/design/).

## Decisão provisória

Não adicionar LiveKit, mediasoup, Redis ou um novo serviço ao runtime agora.
Para a VPS leve e o estágio atual do Telai, a sequência segura é:

1. manter P2P para salas pequenas;
2. concluir a medição do servidor em uma máquina independente, incluindo TURN
   forçado e voz com 2, 5 e 10 participantes;
3. criar um protótipo isolado de uma sala mediasoup com o mesmo contrato de
   mídia, sem alterar o shell visual;
4. comparar o protótipo com o baseline P2P por CPU, memória, bitrate, RTT,
   primeiro frame, recuperação e custo operacional;
5. só então decidir se o SFU deve substituir o P2P para salas grandes.

O primeiro candidato para integração é mediasoup, por se encaixar no backend
Node.js e não impor um protocolo de sinalização ou uma UI. LiveKit continua
como alternativa se o custo de manter a camada SFU própria superar o custo
operacional de um serviço separado.

## Gate para implementação

Nenhuma troca de transporte será considerada concluída sem:

- fallback funcional para P2P/TURN;
- autorização por grupo e sala preservada;
- áudio, vídeo, tela, câmera, janela e troca de fonte validados;
- métricas antes/depois comparáveis;
- rollback para o transporte atual sem alterar a identidade visual;
- teste fora do Electron sintético, em pelo menos duas redes independentes.
