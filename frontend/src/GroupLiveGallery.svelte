<script>
  import { onDestroy, onMount } from "svelte";

  export let streams = [];
  export let currentUserId = "";
  export let watchingStreamId = "";
  export let streamUrl = () => "";
  export let onWatch = () => {};
  export let onClose = () => {};

  let featureFrame;
  let featureFullscreen = false;

  $: watchedStream = streams.find((stream) => stream.id === watchingStreamId && stream.createdBy !== currentUserId) || null;

  function watch(stream) {
    if (stream?.createdBy !== currentUserId) onWatch(stream.id);
  }

  function handleViewerMessage(event) {
    if (event.origin !== window.location.origin || event.source !== featureFrame?.contentWindow) return;
    if (event.data?.type !== "telai-viewer-fullscreen") return;
    featureFullscreen = Boolean(event.data.active);
  }

  function handleFullscreenKeydown(event) {
    if (!featureFullscreen || event.key !== "Escape") return;
    featureFullscreen = false;
    featureFrame?.contentWindow?.postMessage({ type: "telai-viewer-fullscreen", active: false }, window.location.origin);
  }

  function closeFeature() {
    featureFullscreen = false;
    onClose();
  }

  onMount(() => {
    window.addEventListener("message", handleViewerMessage);
    window.addEventListener("keydown", handleFullscreenKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("message", handleViewerMessage);
    window.removeEventListener("keydown", handleFullscreenKeydown);
  });
</script>

<section class:voice-live-gallery-watching={Boolean(watchedStream)} class="voice-live-gallery" aria-label="Transmissões ativas nesta sala">
  {#if watchedStream}
    <section class:voice-live-feature-fullscreen={featureFullscreen} class="voice-live-feature">
      <header class="voice-live-feature-heading">
        <div>
          <span class="voice-live-badge"><span class="live-pulse"></span> ao vivo nesta sala</span>
          <strong>{watchedStream.channelName} está transmitindo</strong>
        </div>
        <button class="voice-live-close" type="button" on:click={closeFeature}>Fechar live</button>
      </header>
      <iframe bind:this={featureFrame} class="voice-live-feature-frame" src={streamUrl(watchedStream, true)} title={`Live de ${watchedStream.channelName || "participante"}`} allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
    </section>
    {#if streams.length > 1}
      <div class="voice-live-thumbnails" aria-label="Outras transmissões da sala">
        {#each streams as stream}
          {#if stream.createdBy === currentUserId}
            <div class="voice-live-thumb voice-live-thumb-own" aria-label="Sua transmissão está ativa">
              <span class="voice-live-thumb-placeholder"><span class="live-pulse"></span></span>
              <span><strong>Sua live</strong><small>transmissão ativa</small></span>
            </div>
          {:else}
            <button class:active={stream.id === watchedStream.id} class="voice-live-thumb" type="button" on:click={() => watch(stream)} aria-label={`Ampliar live de ${stream.channelName || "participante"}`}>
              <span class="voice-live-thumb-preview" aria-hidden="true"><span class="live-pulse"></span><small>ao vivo</small></span>
              <span class="voice-live-thumb-caption"><strong>{stream.channelName}</strong><small>Ampliar</small></span>
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  {:else}
    <div class="voice-live-grid">
      {#each streams as stream}
        {#if stream.createdBy === currentUserId}
          <div class="voice-live-tile voice-live-tile-own" aria-label="Sua transmissão está ativa">
            <div class="voice-live-tile-placeholder"><span class="live-pulse"></span><strong>Sua live está ativa</strong><small>A tela não é exibida para você</small></div>
          </div>
        {:else}
          <button class="voice-live-tile" type="button" on:click={() => watch(stream)} aria-label={`Assistir live de ${stream.channelName || "participante"}`}>
            <span class="voice-live-tile-preview" aria-hidden="true"><span class="voice-live-tile-preview-icon">▶</span><span>Transmissão ativa</span></span>
            <span class="voice-live-tile-overlay"><strong>{stream.channelName} está ao vivo</strong><small>Clique para ampliar</small></span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</section>
