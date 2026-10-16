/** Per SSE connection: public state is already filtered for this viewer. */
export class StateDelta {
  fields = new Map();
  visitors = new Map();
  ready = false;
  encode(state) {
    const fields = new Map(Object.entries(state).filter(([key]) => key !== 'serverTime' && key !== 'visitors')
      .map(([key, value]) => [key, JSON.stringify(value)]));
    const visitors = new Map(state.visitors.map(visitor => [visitor.id, JSON.stringify(visitor)]));
    const patch = { serverTime: state.serverTime };
    for (const [key, value] of fields) if (this.fields.get(key) !== value) patch[key] = state[key];
    const changed = state.visitors.filter(visitor => this.visitors.get(visitor.id) !== visitors.get(visitor.id));
    const removed = [...this.visitors.keys()].filter(id => !visitors.has(id));
    if (changed.length) patch.visitors = changed;
    if (removed.length) patch.removedVisitors = removed;
    const event = this.ready ? 'state-patch' : 'state';
    const data = this.ready ? patch : state;
    this.ready = true; this.fields = fields; this.visitors = visitors;
    return { event, data };
  }
}
