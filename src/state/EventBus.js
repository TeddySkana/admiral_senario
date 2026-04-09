export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const handlers = this.listeners.get(type);

    if (!handlers) {
      return;
    }

    handlers.delete(handler);

    if (handlers.size === 0) {
      this.listeners.delete(type);
    }
  }

  emit(type, payload) {
    const handlers = this.listeners.get(type);
    const wildcardHandlers = this.listeners.get('*');

    if (handlers) {
      for (const handler of handlers) {
        handler(payload, type);
      }
    }

    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        handler(payload, type);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}
