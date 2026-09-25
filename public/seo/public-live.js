(() => {
  const grid = document.getElementById("public-live-grid");
  const empty = document.getElementById("public-live-empty");
  const status = document.getElementById("public-live-status");
  const refreshPublicLives = async () => {
    try {
      empty.classList.remove("public-live-error");
      const response = await fetch("/api/streams", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar as transmissões públicas.");
      const payload = await response.json();
      const streams = Array.isArray(payload.streams) ? payload.streams.filter((stream) => stream.visibility === "public" && stream.publicPath?.startsWith("/")) : [];
      grid.replaceChildren();
      if (!streams.length) {
        grid.hidden = true;
        empty.hidden = false;
        status.textContent = "Nenhum canal público está ao vivo agora.";
        return;
      }
      empty.hidden = true;
      grid.hidden = false;
      status.textContent = `${streams.length} canal${streams.length === 1 ? "" : "is"} público${streams.length === 1 ? "" : "s"} ao vivo`;
      for (const stream of streams) {
        const link = document.createElement("a");
        link.className = "public-live-card";
        link.href = stream.publicPath;
        link.setAttribute("aria-label", `Assistir live de ${stream.channelName || "canal público"}`);
        const top = document.createElement("div");
        top.className = "public-live-card-top";
        const badge = document.createElement("span");
        badge.className = "public-live-badge";
        badge.innerHTML = "<i></i> ao vivo";
        const count = document.createElement("span");
        count.className = "public-live-count";
        const viewerCount = Number.isFinite(Number(stream.viewerCount)) ? Number(stream.viewerCount) : 0;
        count.textContent = viewerCount > 0
          ? `${viewerCount} ${viewerCount === 1 ? "pessoa" : "pessoas"} assistindo`
          : "Assistir agora";
        top.append(badge, count);
        const identity = document.createElement("div");
        identity.className = "public-live-identity";
        const avatar = document.createElement("span");
        avatar.className = "public-live-avatar";
        if (stream.channelAvatarData) {
          const image = document.createElement("img");
          image.src = stream.channelAvatarData;
          image.alt = "";
          avatar.append(image);
        } else avatar.textContent = (stream.channelName || "M").slice(0, 1);
        const channel = document.createElement("strong");
        channel.textContent = stream.channelName || "Canal público";
        identity.append(avatar, channel);
        const title = document.createElement("small");
        title.textContent = stream.title || "Transmissão ao vivo";
        const watch = document.createElement("span");
        watch.className = "public-live-watch";
        watch.textContent = "Assistir transmissão →";
        link.append(top, identity, title, watch);
        grid.append(link);
      }
    } catch {
      grid.hidden = true;
      empty.hidden = false;
      status.textContent = "As transmissões públicas estão temporariamente indisponíveis.";
      empty.classList.add("public-live-error");
      empty.querySelector("strong").textContent = "Não foi possível atualizar as lives agora.";
      empty.querySelector("p").textContent = "Tente novamente em alguns instantes.";
    }
  };
  refreshPublicLives();
  window.setInterval(refreshPublicLives, 10000);
})();
