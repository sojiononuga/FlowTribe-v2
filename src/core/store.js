/**
 * A minimal observable store.
 *
 * Application state lives here rather than inside components, so a value the
 * dashboard and the top bar both need — the current member, say — has one
 * home and one update path.
 *
 * Deliberately not Redux: no actions, no reducers, no middleware. Slices own
 * their own update functions. For an app with roughly a dozen pieces of shared
 * state, ceremony costs more than it returns.
 *
 * Subscriptions are synchronous. A `set` runs its listeners before returning,
 * which keeps the DOM consistent with state at every point and makes debugging
 * a matter of reading the stack rather than reconstructing a queue.
 *
 * @module core/store
 */

/**
 * @template T
 * @typedef {Object} Store
 * @property {() => T} get
 * @property {(patch: Partial<T>|((state: T) => Partial<T>)) => T} set
 * @property {(listener: (state: T, previous: T) => void) => Function} subscribe
 * @property {<S>(selector: (state: T) => S, listener: (value: S, previous: S) => void) => Function} watch
 * @property {() => void} reset
 */

/**
 * Create a store.
 *
 * @template T
 * @param {T} initialState
 * @param {Object} [options]
 * @param {string} [options.name]  Labels devtools logging.
 * @returns {Store<T>}
 */
export function createStore(initialState, options = {}) {
  const { name = 'store' } = options;

  let state = { ...initialState };
  const listeners = new Set();
  const initial = { ...initialState };

  function get() {
    return state;
  }

  function set(patch) {
    const previous = state;
    const changes = typeof patch === 'function' ? patch(state) : patch;

    if (!changes) return state;

    // Skip the notify pass when nothing actually changed. Without this, a
    // poll that returns identical data re-renders the UI on every tick.
    let changed = false;
    for (const key of Object.keys(changes)) {
      if (!Object.is(state[key], changes[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return state;

    state = { ...state, ...changes };

    if (globalThis.__FT_DEBUG__) {
      console.debug(`[${name}]`, changes, state);
    }

    // Copy before iterating: a listener may unsubscribe itself.
    for (const listener of Array.from(listeners)) {
      try {
        listener(state, previous);
      } catch (error) {
        console.error(`[${name}] listener failed`, error);
      }
    }

    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * Subscribe to one derived value. The listener runs only when that value
   * changes, so a component watching `member.fullName` is not woken by every
   * unrelated write.
   */
  function watch(selector, listener) {
    let current = selector(state);

    return subscribe((next) => {
      const value = selector(next);
      if (Object.is(value, current)) return;
      const previous = current;
      current = value;
      listener(value, previous);
    });
  }

  function reset() {
    set({ ...initial });
  }

  return { get, set, subscribe, watch, reset };
}

/**
 * Derive a read-only value from one or more stores.
 *
 * Used for values that are always a function of other state — "is this member
 * an admin?" — so the answer is computed in one place instead of being
 * recalculated, and possibly disagreed upon, at each call site.
 *
 * @param {Store<any>[]} stores
 * @param {Function} compute  Receives each store's state in order.
 * @returns {{ get: Function, subscribe: Function }}
 */
export function derived(stores, compute) {
  const read = () => compute(...stores.map((store) => store.get()));

  return {
    get: read,
    subscribe(listener) {
      let current = read();

      const unsubscribes = stores.map((store) =>
        store.subscribe(() => {
          const value = read();
          if (Object.is(value, current)) return;
          const previous = current;
          current = value;
          listener(value, previous);
        }),
      );

      return () => unsubscribes.forEach((fn) => fn());
    },
  };
}
