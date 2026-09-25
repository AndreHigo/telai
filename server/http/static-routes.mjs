import fs from "node:fs";
import path from "node:path";

export function createStaticRoutes({
  json,
  publicDir,
  desktopArtifactPath,
  desktopArtifactName,
  desktopReleaseDir,
  allowLargeArtifactRequest,
  currentUser,
}) {
  return async function handleStaticRoutes(request, response, requestUrl) {
    const seoPages = {
      "/": "seo/index.html",
      "/compartilhar-tela": "seo/compartilhar-tela.html",
      "/transmissao-ao-vivo": "seo/transmissao-ao-vivo.html",
      "/salas-de-voz-e-comunidades": "seo/salas-de-voz-e-comunidades.html",
    };
    const seoPage = seoPages[requestUrl.pathname.replace(/\/$/, "") || "/"];
    if (seoPage && ["GET", "HEAD"].includes(request.method) && (requestUrl.pathname !== "/" || !await currentUser(request))) {
      const seoPath = path.resolve(publicDir, seoPage);
      fs.readFile(seoPath, (error, content) => {
        if (error) {
          response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
          return;
        }
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" });
        if (request.method === "HEAD") response.end();
        else response.end(content);
      });
      return true;
    }

    const legalPages = {
      "/privacidade": "privacidade.html",
      "/termos-de-uso": "termos-de-uso.html",
    };
    const legalPage = legalPages[requestUrl.pathname.replace(/\/$/, "")];
    if (legalPage && ["GET", "HEAD"].includes(request.method)) {
      const legalPath = path.resolve(publicDir, legalPage);
      fs.readFile(legalPath, (error, content) => {
        if (error) {
          response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Cache-Control": "no-store" }).end("Not found");
          return;
        }
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "X-Robots-Tag": "noindex, follow",
        });
        if (request.method === "HEAD") response.end();
        else response.end(content);
      });
      return true;
    }

    if (requestUrl.pathname === "/download" && ["GET", "HEAD"].includes(request.method)) {
      if (!allowLargeArtifactRequest(request)) {
        response.setHeader("Retry-After", "60");
        json(response, 429, { error: "Muitas solicitações de download. Tente novamente em um minuto." });
        return true;
      }
      const externalUrl = String(process.env.MIRANTE_DESKTOP_DOWNLOAD_URL || "").trim();
      if (externalUrl && /^https?:\/\//i.test(externalUrl)) {
        response.writeHead(302, { Location: externalUrl, "Cache-Control": "no-store" }).end();
        return true;
      }
      fs.stat(desktopArtifactPath, (error, stats) => {
        if (error || !stats.isFile()) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("Instalador ainda não publicado.");
          return;
        }
        response.writeHead(200, {
          "Content-Type": "application/vnd.microsoft.portable-executable",
          "Content-Disposition": `attachment; filename="${desktopArtifactName}"`,
          "Content-Length": stats.size,
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
        });
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        fs.createReadStream(desktopArtifactPath).on("error", () => response.destroy()).pipe(response);
      });
      return true;
    }

    if (requestUrl.pathname.startsWith("/updates/") && ["GET", "HEAD"].includes(request.method)) {
      let updateName;
      try {
        updateName = decodeURIComponent(requestUrl.pathname.slice("/updates/".length));
      } catch {
        response.writeHead(400, { "Cache-Control": "no-store" }).end("Nome de atualização inválido.");
        return true;
      }
      if (!/^(latest\.yml|latest\.yaml|(?:Telai|Mirante-TV)-Setup-[0-9.]+\.exe(?:\.blockmap)?)$/.test(updateName)) {
        response.writeHead(404, { "Cache-Control": "no-store" }).end();
        return true;
      }
      if (/\.exe$/i.test(updateName) && !allowLargeArtifactRequest(request)) {
        response.setHeader("Retry-After", "60");
        json(response, 429, { error: "Muitas solicitações de atualização. Tente novamente em um minuto." });
        return true;
      }
      const updatePath = path.join(desktopReleaseDir, updateName);
      fs.stat(updatePath, (error, stats) => {
        if (error || !stats.isFile()) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("Atualização ainda não publicada.");
          return;
        }
        const contentType = updateName.endsWith(".yml") || updateName.endsWith(".yaml")
          ? "text/yaml; charset=utf-8"
          : updateName.endsWith(".blockmap")
            ? "application/json; charset=utf-8"
            : "application/vnd.microsoft.portable-executable";
        response.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": stats.size,
          "Cache-Control": updateName.startsWith("latest.") ? "no-store" : "public, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        });
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        fs.createReadStream(updatePath).on("error", () => response.destroy()).pipe(response);
      });
      return true;
    }

    const isFriendlyStreamRoute = !requestUrl.pathname.startsWith("/api/")
      && !/\.[a-z0-9]+$/i.test(requestUrl.pathname)
      && /^\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?\/?$/.test(requestUrl.pathname);
    const isSvelteRoute = requestUrl.pathname === "/svelte" || requestUrl.pathname === "/svelte/";
    const isAppRoute = requestUrl.pathname === "/"
      || requestUrl.pathname === "/login"
      || isSvelteRoute
      || isFriendlyStreamRoute;
    const hasSvelteBuild = fs.existsSync(path.join(publicDir, "svelte", "index.html"));
    const relativePath = isAppRoute && hasSvelteBuild
      ? "svelte/index.html"
      : requestUrl.pathname.replace(/^\//, "");
    const filePath = path.resolve(publicDir, relativePath);
    const relativeToPublic = path.relative(publicDir, filePath);
    if (relativeToPublic.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToPublic)) {
      response.writeHead(403).end("Forbidden");
      return true;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
        return;
      }
      const extension = path.extname(filePath);
      const contentType = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".svg": "image/svg+xml",
        ".txt": "text/plain; charset=utf-8",
        ".xml": "application/xml; charset=utf-8",
      }[extension] || "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" }).end(content);
    });
    return true;
  };
}
