'use strict';
// Limit network preparations independently of how often the dial moves.
class RadioPreparationQueue {
  constructor(limit = 2) { this.limit = limit; this.active = 0; this.pending = []; }
  run(work, priority, wanted) {
    const promise = new Promise((resolve, reject) => this.pending.push({ work, priority, wanted, resolve, reject }));
    queueMicrotask(() => this.drain());
    return promise;
  }
  drain() {
    this.pending = this.pending.filter(task => {
      if (task.wanted()) return true;
      task.reject(new DOMException('Cancelado', 'AbortError')); return false;
    });
    while (this.active < this.limit && this.pending.length) {
      this.pending.sort((a, b) => a.priority() - b.priority());
      const task = this.pending.shift(); this.active++;
      Promise.resolve().then(task.work).then(task.resolve, task.reject).finally(() => { this.active--; this.drain(); });
    }
  }
}
if (typeof module === 'object' && module.exports) module.exports = RadioPreparationQueue;
else window.RadioPreparationQueue = RadioPreparationQueue;
