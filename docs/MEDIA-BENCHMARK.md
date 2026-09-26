# Benchmark de mídia do Telai

Este documento separa a validação funcional atual do benchmark de capacidade. O resultado abaixo é local, executado nesta branch, e não representa a VPS nem produção.

## Baseline funcional atual

O transporte padrão continua P2P (`MEDIA_MODE=p2p`) com TURN disponível como fallback. A validação Electron executada em 26/09/2026 cobriu:

- captura real de câmera, tela, janela e caminho legado de captura;
- tela em até 1280×720 a 30 FPS no fluxo testado;
- publicação de áudio do microfone junto com vídeo;
- troca de fonte durante a transmissão sem encerrar a live;
- remoção e reativação de câmera e microfone;
- recepção de vídeo no espectador, dois viewers simultâneos e multistream;
- chat do transmissor e do espectador;
- encerramento limpo da transmissão;
- reconexão automática da sala de voz após queda controlada do WebSocket.

Também foi validado localmente o caminho alternativo `MEDIA_MODE=relay`. Nesse
modo o viewer recebe WebM por `MediaSource`, então não há peers RTC nem métricas
de `RTCStatsReport`; a suíte valida frame, chat, multistream e encerramento pelo
relay. O aviso de autoplay durante a troca de `MediaSource` foi recuperado pelo
player e não impediu a entrega do vídeo.

Comandos reproduzíveis:

```text
npm run test:media
npm run test:voice-reconnect
```

`npm run test:media` também coleta duas amostras RTC do espectador no fluxo de
transmissão pública. A coleta é ativada somente pelo parâmetro interno
`qaStats=1` usado pelo harness e não cria telemetria adicional para usuários
normais.

O harness aceita `TELAI_MEDIA_VIEWER_COUNT` entre 1 e 20. O padrão continua
sendo 2 viewers para manter a regressão rápida. Em PowerShell, por exemplo:

```powershell
$env:TELAI_MEDIA_VIEWER_COUNT = "5"
npm run test:media
Remove-Item Env:TELAI_MEDIA_VIEWER_COUNT
```

O resultado inclui tempo de carregamento, CPU e RSS do processo Electron que
executou o teste durante a abertura dos viewers. É uma comparação local do
harness, não uma medição isolada do servidor.

Na última execução local com 5 viewers, o segundo sample do viewer sintético
registrou RTT de 1 ms, jitter de 0 ms, perda de 0 pacotes, 2 streams de mídia
e aproximadamente 106,35 kbps recebidos. O carregamento dos 5 viewers levou
782 ms, com aproximadamente 60% de CPU e 145 MB de RSS no processo Electron do
harness. Isso confirma que a medição funciona; não é uma meta de produção nem
uma medição da VPS.

Para repetir o smoke test relay em PowerShell:

```powershell
$env:MEDIA_MODE = "relay"
npm run test:media
Remove-Item Env:MEDIA_MODE
```

Para medir a matriz P2P local completa, o comando executa cenários isolados de
1, 5, 10 e 20 viewers e imprime uma tabela JSON sem criar arquivos temporários:

```powershell
npm run test:media:matrix
```

Na execução local de 26/09/2026, os cenários de 1 e 5 viewers concluíram com
todos os frames e codecs esperados. Os cenários de 10 e 20 viewers fizeram o
Electron encerrar o harness antes de emitir o resultado final; por isso eles
ficam registrados como limite/inconclusivos, não como capacidade aprovada da
VPS. Durante esses cenários, alguns diagnósticos auxiliares receberam `429`
por rate limit, sem interromper os fluxos de mídia que chegaram a concluir.
Esse resultado é suficiente para não aumentar o limite P2P por suposição, mas
ainda não substitui um teste de servidor dedicado ou uma SFU.

Resumo da última execução da matriz; CPU e RSS são do processo Electron do
harness, não do servidor:

| modo | viewers | carregamento | CPU | RSS | resultado |
| --- | ---: | ---: | ---: | ---: | --- |
| P2P | 1 | 877 ms | 14,4% | 139,8 MiB | passou |
| P2P | 5 | 932 ms | 26,8% | 140,4 MiB | passou |
| relay | 1 | 228 ms | 20,6% | 143,7 MiB | passou |
| relay | 5 | 344 ms | 59,0% | 141,0 MiB | passou |
| P2P | 10 | — | — | — | Electron encerrou sem resultado |
| P2P | 20 | — | — | — | Electron encerrou sem resultado |

É possível selecionar cenários ou medir o caminho relay:

```powershell
$env:TELAI_MEDIA_MATRIX = "1,5"
$env:TELAI_MEDIA_MATRIX_MODE = "relay"
npm run test:media:matrix
Remove-Item Env:TELAI_MEDIA_MATRIX, Env:TELAI_MEDIA_MATRIX_MODE
```

## O que ainda não está medido

A suíte atual confirma fluxo e regressão e agora coleta métricas de múltiplos
viewers sintéticos, mas ainda não é um teste de capacidade da VPS. Antes de
trocar P2P por SFU, o benchmark deve registrar, por cenário:

- CPU e memória do servidor e do Electron;
- RTT, jitter, perda de pacotes e bitrate por peer;
- tempo até o primeiro frame e tempo de recuperação após queda;
- custo do transmissor com 1, 5, 10 e 20 viewers;
- comportamento com TURN forçado;
- qualidade em 720p30 e 1080p60, quando o hardware suportar;
- voz com 2, 5 e 10 participantes.

## Critério para a próxima decisão

Manter P2P enquanto a VPS suportar os cenários-alvo sem crescimento linear de CPU, instabilidade ou degradação perceptível. Avaliar LiveKit ou mediasoup somente com uma execução controlada desses cenários. A interface do Telai não deve depender da tecnologia escolhida.

Redis/event bus e uma SFU continuam fora do runtime padrão até existir uma necessidade comprovada de escala ou fila distribuída.
