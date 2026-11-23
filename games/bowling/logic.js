export const LANE_HALF = 2.1;
export const BALL_RADIUS = 0.36;
export const PIN_RADIUS = 0.22;
export const START_Z = 7;
export const HEAD_PIN_Z = -17;
export const BACK_Z = -24;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function makeRack() {
  const pins = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      pins.push({
        id: pins.length,
        x: (column - row / 2) * 0.68,
        z: HEAD_PIN_Z - row * 0.7,
        vx: 0,
        vz: 0,
        standing: true,
        fall: 0,
        fallDirection: 0,
      });
    }
  }
  return pins;
}

function tenthFrameComplete(rolls) {
  if (rolls.length >= 3) return true;
  return rolls.length >= 2 && rolls[0] !== 10 && rolls[0] + rolls[1] < 10;
}

export function calculateScore(frames) {
  const flat = frames.flat();
  const totals = [];
  let cursor = 0;
  let running = 0;
  let resolved = true;

  for (let frame = 0; frame < 10; frame += 1) {
    const rolls = frames[frame] || [];
    let value = null;

    if (frame === 9) {
      if (tenthFrameComplete(rolls)) value = rolls.reduce((sum, pins) => sum + pins, 0);
    } else if (rolls[0] === 10) {
      if (flat.length >= cursor + 3) value = 10 + flat[cursor + 1] + flat[cursor + 2];
    } else if (rolls.length >= 2) {
      if (rolls[0] + rolls[1] === 10) {
        if (flat.length >= cursor + 3) value = 10 + flat[cursor + 2];
      } else {
        value = rolls[0] + rolls[1];
      }
    }

    if (value !== null && resolved) {
      running += value;
      totals.push(running);
    } else {
      totals.push(null);
      resolved = false;
    }
    cursor += rolls.length;
  }

  return { totals, total: running };
}

export class BowlingGame {
  constructor({ onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.reset();
  }

  reset() {
    this.frames = Array.from({ length: 10 }, () => []);
    this.frame = 0;
    this.state = 'ready';
    this.aim = 0;
    this.pins = makeRack();
    this.throwStanding = 10;
    this.ball = this.freshBall();
    this.elapsed = 0;
    this.settleTime = 0;
    this.lastThrow = null;
  }

  freshBall() {
    return { x: 0, z: START_Z, vx: 0, vz: 0, spin: 0, gutter: false, distance: 0 };
  }

  standingCount() {
    return this.pins.filter((pin) => pin.standing).length;
  }

  throwBall({ power = 0.75, aim = this.aim, spin = 0 } = {}) {
    if (this.state !== 'ready') return null;
    const p = clamp(power, 0.15, 1);
    const speed = 9 + p * 8;
    this.aim = clamp(aim, -1, 1);
    this.ball = {
      x: 0,
      z: START_Z,
      vx: this.aim * speed * 0.085,
      vz: -speed,
      spin: clamp(spin, -1, 1),
      gutter: false,
      distance: 0,
    };
    this.throwStanding = this.standingCount();
    this.state = 'rolling';
    this.elapsed = 0;
    this.settleTime = 0;
    this.onEvent({ type: 'throw', power: p, aim: this.aim, spin: this.ball.spin });
    return this.ball;
  }

  update(dt) {
    if (this.state !== 'rolling') return;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < steps && this.state === 'rolling'; i += 1) this.step(dt / steps);
  }

  step(dt) {
    const ball = this.ball;
    this.elapsed += dt;

    if (!ball.gutter) {
      ball.vx += ball.spin * 0.34 * dt;
      ball.spin *= Math.max(0, 1 - dt * 0.45);
    }
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    ball.distance += Math.hypot(ball.vx, ball.vz) * dt;

    if (!ball.gutter && Math.abs(ball.x) > LANE_HALF) {
      ball.gutter = true;
      ball.x = Math.sign(ball.x) * (LANE_HALF + 0.25);
      ball.vx = 0;
      ball.spin = 0;
      this.onEvent({ type: 'gutter' });
    }

    if (!ball.gutter) this.collideBallWithPins();
    this.movePins(dt);
    this.collidePins();

    const ballDone = ball.z < BACK_Z || (Math.hypot(ball.vx, ball.vz) < 0.3 && this.elapsed > 1);
    const pinsMoving = this.pins.some((pin) => !pin.standing && Math.hypot(pin.vx, pin.vz) > 0.12);
    if (ballDone && !pinsMoving) this.settleTime += dt;
    else this.settleTime = 0;

    if (this.settleTime > 0.25 || this.elapsed > 6) this.settleThrow();
  }

  collideBallWithPins() {
    const ball = this.ball;
    for (const pin of this.pins) {
      if (!pin.standing) continue;
      const dx = pin.x - ball.x;
      const dz = pin.z - ball.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= BALL_RADIUS + PIN_RADIUS) continue;
      const nx = distance > 0.0001 ? dx / distance : 0;
      const nz = distance > 0.0001 ? dz / distance : -1;
      const speed = Math.hypot(ball.vx, ball.vz);
      this.knockPin(pin, ball.vx * 0.55 + nx * speed * 0.65, ball.vz * 0.68 + nz * speed * 0.65);
      ball.vx -= nx * speed * 0.08;
      ball.vz *= 0.93;
    }
  }

  knockPin(pin, vx, vz) {
    if (!pin.standing) return;
    pin.standing = false;
    pin.vx = vx;
    pin.vz = vz;
    pin.fallDirection = Math.atan2(vx, -vz);
    this.onEvent({ type: 'pin', id: pin.id, speed: Math.hypot(vx, vz) });
  }

  movePins(dt) {
    for (const pin of this.pins) {
      if (pin.standing) continue;
      pin.fall = Math.min(1, pin.fall + dt * 5);
      pin.x += pin.vx * dt;
      pin.z += pin.vz * dt;
      const friction = Math.max(0, 1 - dt * 4.4);
      pin.vx *= friction;
      pin.vz *= friction;
      if (Math.hypot(pin.vx, pin.vz) < 0.08) {
        pin.vx = 0;
        pin.vz = 0;
      }
    }
  }

  collidePins() {
    for (const moving of this.pins) {
      if (moving.standing) continue;
      const speed = Math.hypot(moving.vx, moving.vz);
      if (speed < 0.35) continue;
      for (const target of this.pins) {
        if (!target.standing) continue;
        const dx = target.x - moving.x;
        const dz = target.z - moving.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= PIN_RADIUS * 2.15) continue;
        const nx = distance > 0.0001 ? dx / distance : 0;
        const nz = distance > 0.0001 ? dz / distance : -1;
        this.knockPin(target, moving.vx * 0.72 + nx * speed * 0.42, moving.vz * 0.72 + nz * speed * 0.42);
        moving.vx *= 0.78;
        moving.vz *= 0.78;
      }
    }
  }

  settleThrow() {
    if (this.state !== 'rolling') return;
    const knocked = this.throwStanding - this.standingCount();
    this.recordRoll(knocked, this.ball.gutter);
  }

  recordRoll(knocked, gutter = false) {
    if (this.state === 'complete') return null;
    const before = this.throwStanding;
    const count = clamp(Math.round(knocked), 0, before);
    let missing = count - (before - this.standingCount());
    for (const pin of this.pins) {
      if (missing <= 0) break;
      if (!pin.standing) continue;
      pin.standing = false;
      missing -= 1;
    }
    const rolls = this.frames[this.frame];
    const thrownFrame = this.frame;
    rolls.push(count);

    const kind = count === before
      ? (before === 10 ? 'strike' : 'spare')
      : (count === 0 && gutter ? 'gutter' : 'pins');

    if (this.frame < 9) {
      if (rolls[0] === 10 || rolls.length === 2) {
        this.frame += 1;
        this.resetRack();
      } else {
        this.clearFallen();
      }
    } else if (rolls.length === 1) {
      if (count === 10) this.resetRack();
      else this.clearFallen();
    } else if (rolls.length === 2) {
      if (rolls[0] === 10) {
        if (rolls[1] === 10) this.resetRack();
        else this.clearFallen();
      } else if (rolls[0] + rolls[1] === 10) {
        this.resetRack();
      } else {
        this.state = 'complete';
      }
    } else {
      this.state = 'complete';
    }

    if (this.state !== 'complete') this.state = 'ready';
    this.ball = this.freshBall();
    this.lastThrow = {
      type: 'result',
      frame: thrownFrame,
      roll: rolls.length - 1,
      knocked: count,
      remaining: before - count,
      kind,
      complete: this.state === 'complete',
    };
    this.onEvent({ ...this.lastThrow, score: calculateScore(this.frames) });
    return this.lastThrow;
  }

  resetRack() {
    this.pins = makeRack();
    this.throwStanding = 10;
  }

  clearFallen() {
    this.pins = this.pins.filter((pin) => pin.standing);
    this.throwStanding = this.pins.length;
  }

  score() {
    return calculateScore(this.frames);
  }
}
