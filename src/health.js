// Hearts, containers, lives ("Comebacks"), and "Knocked Out" (never death).
import { bus, DIFF, settings } from './core.js';

export class Heart {
  constructor() { this.reset(true); }
  reset(full) {
    const d = DIFF[settings.difficulty];
    this.containers = d.maxHearts;        // heart containers (max)
    this.hp = this.containers;            // in hearts; halves allowed
    if (full) { this.comebacks = d.lives; this.sparks = 0; this.shards = 0; }
    this.invuln = 0;
    bus.emit('hud', this);
  }
  damage(amount) {
    if (this.invuln > 0 || this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = 1.2; // brief grace window
    bus.emit('hurt', amount); bus.emit('hud', this);
    if (this.hp <= 0) this.knockout();
  }
  heal(amount) { this.hp = Math.min(this.containers, this.hp + amount); bus.emit('hud', this); }
  addSparks(n) { // currency; every 100 sparks = extra Comeback
    this.sparks += n;
    while (this.sparks >= 100) { this.sparks -= 100; this.comebacks++; bus.emit('extraComeback'); }
    bus.emit('hud', this);
  }
  addShard() { // 4 Heart Shards = new heart container (earned by brave/kind choices)
    this.shards++;
    if (this.shards >= 4) { this.shards = 0; this.containers++; this.hp = this.containers; bus.emit('newContainer'); }
    bus.emit('hud', this);
  }
  knockout() {
    this.comebacks--;
    bus.emit('knockout', this.comebacks);
    if (this.comebacks < 0) { bus.emit('gameOverRestart'); this.reset(true); this.invuln = 3; bus.emit('respawn'); bus.emit('hud', this); }
    else { this.hp = this.containers; this.invuln = 3; bus.emit('respawn'); bus.emit('hud', this); }
  }
  update(dt) { if (this.invuln > 0) this.invuln -= dt; }
}
