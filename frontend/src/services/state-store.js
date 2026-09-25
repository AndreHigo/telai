export function createStateStore(defaults, initial = {}, createResetState = () => ({ ...defaults })) {
  let current = { ...defaults, ...initial };
  const subscribers = new Set();

  function getState() {
    return current;
  }

  function setState(next) {
    const patch = typeof next === "function" ? next(current) : next;
    if (!patch || typeof patch !== "object") return current;
    current = { ...current, ...patch };
    for (const subscriber of subscribers) subscriber(current);
    return current;
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== "function") return () => {};
    subscribers.add(subscriber);
    subscriber(current);
    return () => subscribers.delete(subscriber);
  }

  function reset() {
    return setState(createResetState());
  }

  return { getState, setState, subscribe, reset };
}
