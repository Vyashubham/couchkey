// Tiny typed event emitter. Listener errors are isolated so one bad
// subscriber can't break event delivery to the others.

export class TypedEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  constructor(private readonly onListenerError: (event: keyof Events, err: unknown) => void = () => undefined) {}

  on<E extends keyof Events>(event: E, listener: (payload: Events[E]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as (p: Events[E]) => void)(payload);
      } catch (err) {
        this.onListenerError(event, err);
      }
    }
  }

  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
