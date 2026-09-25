export function json(response, status, body) {
  response
    .writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    })
    .end(JSON.stringify(body));
}

export async function readJson(request, maxLength = 16 * 1024) {
  let raw = "";
  for await (const part of request) {
    raw += part;
    if (Buffer.byteLength(raw, "utf8") > maxLength) throw new Error("body-too-large");
  }
  return JSON.parse(raw || "{}");
}
