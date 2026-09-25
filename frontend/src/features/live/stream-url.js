export function streamViewerUrl(stream, embed = false) {
  const path = stream?.publicPath || `/?room=${encodeURIComponent(stream?.roomName || "")}&mode=viewer`;
  if (!embed) return path;
  return `${path}${path.includes("?") ? "&" : "?"}embed=1`;
}
