// A consumer-side model of createBinder of the plugin API for the view tests. bind connects a click of an element to the command
// run(name, params, element), with the params of the call evaluated at each run when they are a function, as the SDK does.
// check(name) is called for each binding, so a name that is not declared throws at bind time.
export function createBinder(run, { check, changed = () => {} }) {
  if (typeof check !== "function") throw new Error("createBinder requires check");
  return {
    // run(name, params) runs a declared command, as the binder of the SDK does.
    run(name, params) {
      check(name);
      return run(name, params);
    },
    bind(element, name, params = {}, { event = "click", failed } = {}) {
      check(name);
      element.dataset.command = name;
      if (typeof params !== "function" && params && Object.keys(params).length > 0) element.dataset.params = JSON.stringify(params);
      const listener = (e) => {
        const done = run(name, typeof params === "function" ? params(e) : params, element);
        return failed ? Promise.resolve(done).catch(failed) : done;
      };
      element.addEventListener(event, listener);
      changed();
      return element;
    },
  };
}
