export function createViewportController({
  breakpoint = 1100,
  getCompactViewport,
  matchMedia,
  setState,
}) {
  function sync() {
    const nextCompactViewport = Boolean(matchMedia(`(max-width: ${breakpoint}px)`).matches);
    if (nextCompactViewport === getCompactViewport()) return false;
    setState({
      compactViewport: nextCompactViewport,
      ...(nextCompactViewport ? {} : { showGlobalSidebar: false }),
    });
    return true;
  }

  return { sync };
}
