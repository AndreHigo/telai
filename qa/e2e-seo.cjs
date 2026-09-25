const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, `.tmp-seo-${process.pid}.sqlite`);
process.env.MIRANTE_DB_PATH = databasePath;
process.env.REQUIRE_LOGIN = "true";

async function main() {
  const { closeDatabaseForTests, startServer } = await import(pathToFileURL(path.join(rootDir, "server.mjs")).href);
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const checks = [
    ["/", "Telai — converse, compartilhe e fique ao vivo", "canonical"],
    ["/compartilhar-tela", "Compartilhar tela online", "canonical"],
    ["/transmissao-ao-vivo", "Transmissão ao vivo pelo navegador", "canonical"],
    ["/salas-de-voz-e-comunidades", "Salas de voz e comunidades online", "canonical"],
  ];
  try {
    for (const [route, title, marker] of checks) {
      const response = await fetch(`${baseUrl}${route}`);
      const body = await response.text();
      assert.equal(response.status, 200, `${route} não respondeu 200`);
      assert.match(response.headers.get("content-type") || "", /text\/html/);
      assert.match(body, new RegExp(`<title>${title}`), `${route} sem title SEO`);
      assert.match(body, new RegExp(marker), `${route} sem ${marker}`);
    }
    const roadmap = await fetch(`${baseUrl}/beta-roadmap.html`);
    const roadmapBody = await roadmap.text();
    assert.equal(roadmap.status, 200);
    assert.match(roadmapBody, /Roadmap para sair do beta/);
    assert.match(roadmapBody, /noindex,nofollow/);
    const robots = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Sitemap: https:\/\/telai\.tv\.br\/sitemap\.xml/);
    const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    const sitemapBody = await sitemap.text();
    assert.match(sitemapBody, /https:\/\/telai\.tv\.br\/compartilhar-tela/);
    assert.match(sitemapBody, /https:\/\/telai\.tv\.br\/salas-de-voz-e-comunidades/);
    console.log(JSON.stringify({ ok: true, routes: [...checks.map(([route]) => route), "/beta-roadmap.html"], robots: robots.status, sitemap: sitemap.status }));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; });
