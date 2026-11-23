// Skyboard networking hooks. Same transport idea as src/net.js: a tiny adapter (BroadcastChannel today,
// so two tabs on one machine can play together), swappable for a real server later without touching game code.
//
// Model: HOST-AUTHORITATIVE. The host runs the rules engine. After every rules call it broadcasts
//   { t:'bstate', id, seq, snap:<JSON game state>, ev:[events] }   -> guests mirror state + replay events
// Guests never mutate state. When it is their seat's turn they send
//   { t:'bact', id, fn:'act'|'choose'|'miniResult', arg }          -> host validates seat ownership, applies
// Joining: guest sends { t:'bjoin', id, hero }; host gives them the first free remote seat (player.owner = id).
//   { t:'bbye', id } frees the seat (it falls back to an AI teammate so the game never stalls).
export class BoardNet {
  constructor(room = 'skyboard') {
    this.id = Math.random().toString(36).slice(2, 10); this.role = null; this.seq = 0;
    this.onState = null; this.onAction = null; this.onJoin = null; this.onLeave = null;
    this.ch = ('BroadcastChannel' in globalThis) ? new BroadcastChannel('couchcape:board:' + room) : null;
    if (this.ch) this.ch.onmessage = e => this.onMsg(e.data);
  }
  host() { this.role = 'host'; return this; }
  join(hero) { this.role = 'guest'; this.send({ t: 'bjoin', id: this.id, hero }); return this; }
  send(m) { try { if (this.ch) this.ch.postMessage(m); } catch (e) { /* ignore transport errors */ } }
  broadcast(G, ev) { if (this.role === 'host') this.send({ t: 'bstate', id: this.id, seq: ++this.seq, snap: JSON.stringify(G), ev }); }
  sendAction(fn, arg) { if (this.role === 'guest') this.send({ t: 'bact', id: this.id, fn, arg }); }
  onMsg(m) {
    if (!m || m.id === this.id) return;
    if (this.role === 'host') {
      if (m.t === 'bjoin' && this.onJoin) this.onJoin(m.id, m.hero);
      else if (m.t === 'bact' && this.onAction) this.onAction(m);
      else if (m.t === 'bbye' && this.onLeave) this.onLeave(m.id);
    } else if (this.role === 'guest' && m.t === 'bstate' && m.seq > (this.lastSeq || 0)) { this.lastSeq = m.seq; if (this.onState) this.onState(m); }
  }
  leave() { this.send({ t: 'bbye', id: this.id }); if (this.ch) this.ch.close(); this.ch = null; }
}
