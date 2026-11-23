import test from 'node:test';
import assert from 'node:assert/strict';
import { BowlingGame, calculateScore, makeRack } from './logic.js';

function roll(game, options) {
  game.throwBall(options);
  let guard = 0;
  while (game.state === 'rolling' && guard < 1200) {
    game.update(1 / 120);
    guard += 1;
  }
  assert.ok(guard < 1200, 'throw settled');
  return game.lastThrow;
}

test('a rack has ten pins in four staggered rows', () => {
  const pins = makeRack();
  assert.equal(pins.length, 10);
  assert.equal(pins[0].x, 0);
  assert.equal(new Set(pins.map((pin) => pin.z)).size, 4);
});

test('open frames, strikes, spares, and cumulative totals score correctly', () => {
  const frames = [
    [10], [7, 2], [5, 5], [4, 3], [0, 0],
    [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
  ];
  const score = calculateScore(frames);
  assert.deepEqual(score.totals.slice(0, 4), [19, 28, 42, 49]);
  assert.equal(score.total, 49);
});

test('a strike waits for both bonus rolls before showing a total', () => {
  const frames = Array.from({ length: 10 }, () => []);
  frames[0] = [10];
  assert.deepEqual(calculateScore(frames).totals.slice(0, 2), [null, null]);
  frames[1] = [4];
  assert.deepEqual(calculateScore(frames).totals.slice(0, 2), [null, null]);
  frames[1] = [4, 5];
  assert.deepEqual(calculateScore(frames).totals.slice(0, 2), [19, 28]);
});

test('a perfect game scores 300 through the real frame progression', () => {
  const game = new BowlingGame();
  for (let i = 0; i < 12; i += 1) game.recordRoll(10);
  assert.equal(game.state, 'complete');
  assert.equal(game.frames.length, 10);
  assert.deepEqual(game.frames[9], [10, 10, 10]);
  assert.equal(game.score().total, 300);
});

test('an all-fives game scores 150 with a third ball in the tenth', () => {
  const game = new BowlingGame();
  let guard = 0;
  while (game.state !== 'complete' && guard < 30) {
    game.recordRoll(5);
    guard += 1;
  }
  assert.equal(guard, 21);
  assert.deepEqual(game.frames[9], [5, 5, 5]);
  assert.equal(game.score().total, 150);
});

test('the tenth frame resets after a strike and allows a final spare', () => {
  const game = new BowlingGame();
  for (let frame = 0; frame < 9; frame += 1) {
    game.recordRoll(0);
    game.recordRoll(0);
  }
  game.recordRoll(10);
  assert.equal(game.standingCount(), 10);
  game.recordRoll(7);
  assert.equal(game.standingCount(), 3);
  assert.equal(game.state, 'ready');
  game.recordRoll(3);
  assert.equal(game.state, 'complete');
  assert.deepEqual(game.frames[9], [10, 7, 3]);
  assert.equal(game.score().total, 20);
});

test('an open tenth frame ends after two balls', () => {
  const game = new BowlingGame();
  for (let frame = 0; frame < 9; frame += 1) {
    game.recordRoll(0);
    game.recordRoll(0);
  }
  game.recordRoll(3);
  game.recordRoll(4);
  assert.equal(game.state, 'complete');
  assert.equal(game.recordRoll(10), null);
  assert.deepEqual(game.frames[9], [3, 4]);
});

test('a head-on throw reaches the rack and knocks down pins', () => {
  const game = new BowlingGame();
  const result = roll(game, { power: 1, aim: 0, spin: 0 });
  assert.ok(result.knocked >= 7, `head-on throw knocked ${result.knocked} pins`);
  assert.equal(game.frame, result.knocked === 10 ? 1 : 0);
});

test('a wide hook goes into the gutter without touching the rack', () => {
  const game = new BowlingGame();
  const result = roll(game, { power: 1, aim: 1, spin: 1 });
  assert.equal(result.kind, 'gutter');
  assert.equal(result.knocked, 0);
  assert.equal(game.standingCount(), 10);
});

test('a second ball uses the remaining rack and advances an open frame', () => {
  const game = new BowlingGame();
  const first = roll(game, { power: 0.8, aim: -0.32, spin: 0 });
  if (first.knocked === 10) return;
  assert.equal(game.standingCount(), 10 - first.knocked);
  const second = roll(game, { power: 0.9, aim: 0.25, spin: 0 });
  assert.equal(game.frame, 1);
  assert.equal(game.frames[0].length, 2);
  assert.equal(game.frames[0][0] + game.frames[0][1], first.knocked + second.knocked);
  assert.equal(second.remaining, 10 - first.knocked - second.knocked);
});

test('a rolling ball cannot be thrown twice', () => {
  const game = new BowlingGame();
  assert.ok(game.throwBall());
  assert.equal(game.throwBall(), null);
});
