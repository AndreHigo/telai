/**
 * Keeps lazy Svelte component imports single-flight and observable.
 * The caller still owns the reactive component reference so this helper does
 * not change Svelte's update semantics or the visual shell.
 */
export function createLazyComponentLoader({ importer, assign, onError = () => {}, errorKind = "lazy_component_load_error" }) {
  if (typeof importer !== "function") throw new TypeError("importer precisa ser uma função");
  if (typeof assign !== "function") throw new TypeError("assign precisa ser uma função");

  let pending = null;

  function load() {
    if (pending) return pending;
    pending = Promise.resolve()
      .then(() => importer())
      .then((module) => {
        const component = module?.default ?? module;
        assign(component);
        return component;
      })
      .catch((error) => {
        onError(error, errorKind);
        return null;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  return { load };
}
