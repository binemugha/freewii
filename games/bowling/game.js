import * as THREE from '/vendor/three/three.module.js';
import { consumeLaunchSplash } from '../../core/splash.js';
import { createChannel } from '../../core/channel.js';
import { SwingDetector } from '../../core/gesture.js';
import { clamp } from '../../core/orientation.js';
import {
  BowlingGame, LANE_HALF, BALL_RADIUS, START_Z, HEAD_PIN_Z,
} from './logic.js';

consumeLaunchSplash();

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b17);
scene.fog = new THREE.Fog(0x080b17, 38, 78);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
camera.position.set(0, 5.4, 12.8);
camera.lookAt(0, 0, -8.5);

scene.add(new THREE.HemisphereLight(0xb9d7ff, 0x201326, 1.55));
const keyLight = new THREE.DirectionalLight(0xffe5c2, 2.4);
keyLight.position.set(4, 11, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -9;
keyLight.shadow.camera.right = 9;
keyLight.shadow.camera.top = 12;
keyLight.shadow.camera.bottom = -25;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 55;
scene.add(keyLight);

const pinLight = new THREE.SpotLight(0xfff0d8, 110, 42, Math.PI / 4, 0.55, 1.4);
pinLight.position.set(0, 9, -14);
pinLight.target.position.set(0, 0, -19);
scene.add(pinLight, pinLight.target);
const cyanLight = new THREE.PointLight(0x38d8ef, 26, 24, 1.6);
cyanLight.position.set(-4, 2, -10);
scene.add(cyanLight);
const pinkLight = new THREE.PointLight(0xff4d91, 24, 24, 1.6);
pinkLight.position.set(4, 2, -15);
scene.add(pinkLight);

const material = (color, roughness = 0.65, metalness = 0) => new THREE.MeshStandardMaterial({
  color, roughness, metalness,
});

function canvasTexture(width, height, draw) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  draw(c.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const woodTexture = canvasTexture(512, 1024, (ctx, width, height) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#d7a766');
  gradient.addColorStop(0.5, '#edc98d');
  gradient.addColorStop(1, '#c99152');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const boards = 28;
  for (let board = 0; board < boards; board += 1) {
    const x = (board / boards) * width;
    const w = width / boards;
    ctx.fillStyle = board % 2 ? '#6f3f1710' : '#fff4cf0c';
    ctx.fillRect(x, 0, w, height);
    ctx.fillStyle = '#64401f45';
    ctx.fillRect(x, 0, 1, height);
    for (let grain = 0; grain < 5; grain += 1) {
      const gx = x + ((grain * 37 + board * 19) % 83) / 83 * w;
      ctx.strokeStyle = '#71471918';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      for (let y = 0; y <= height; y += 40) {
        ctx.lineTo(gx + Math.sin(y * 0.025 + board) * 1.6, y);
      }
      ctx.stroke();
    }
  }
});
woodTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 110), material(0x0b1020, 0.94));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, -0.37, -15);
floor.receiveShadow = true;
scene.add(floor);

const laneBase = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.28, 38), material(0x4c2d20, 0.75));
laneBase.position.set(0, -0.17, -8);
scene.add(laneBase);
const lane = new THREE.Mesh(
  new THREE.PlaneGeometry(LANE_HALF * 2, 38),
  new THREE.MeshStandardMaterial({ map: woodTexture, roughness: 0.3, metalness: 0.04 }),
);
lane.rotation.x = -Math.PI / 2;
lane.position.set(0, -0.015, -8);
lane.receiveShadow = true;
scene.add(lane);

const gutterMaterial = material(0x273044, 0.25, 0.75);
const railMaterial = material(0x11182a, 0.38, 0.55);
for (const side of [-1, 1]) {
  const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 38), gutterMaterial);
  gutter.position.set(side * (LANE_HALF + 0.25), -0.14, -8);
  scene.add(gutter);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 38), railMaterial);
  rail.position.set(side * (LANE_HALF + 0.58), -0.08, -8);
  scene.add(rail);
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.055, 38),
    new THREE.MeshBasicMaterial({ color: side < 0 ? 0x42dcef : 0xff5b9b }),
  );
  strip.position.set(side * (LANE_HALF + 0.57), 0.1, -8);
  scene.add(strip);

  const nextLane = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 42), material(0x473a35, 0.72));
  nextLane.rotation.x = -Math.PI / 2;
  nextLane.position.set(side * 7.2, -0.27, -9);
  scene.add(nextLane);
}

const foulLine = new THREE.Mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.018, 0.14), material(0x252331, 0.5));
foulLine.position.set(0, 0.005, 5.7);
scene.add(foulLine);

const markingMaterial = new THREE.MeshBasicMaterial({ color: 0x5b3e32, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
for (let i = -3; i <= 3; i += 1) {
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), markingMaterial);
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(i * 0.48, 0.006, 2.5 + Math.abs(i) * 0.08);
  scene.add(dot);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0.28);
  shape.lineTo(0.105, -0.15);
  shape.lineTo(-0.105, -0.15);
  shape.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), markingMaterial);
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(i * 0.48, 0.007, -2.7 - Math.abs(i) * 0.25);
  scene.add(arrow);
}

const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 11, 0.4), material(0x10162a, 0.82));
backWall.position.set(0, 4.5, -26);
scene.add(backWall);
const signTexture = canvasTexture(1024, 300, (ctx, width, height) => {
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8f5ec';
  ctx.font = '900 italic 112px Arial';
  ctx.fillText('MOONLIGHT', width / 2, 135);
  ctx.fillStyle = '#61dbe8';
  ctx.font = '800 42px Arial';
  ctx.letterSpacing = '18px';
  ctx.fillText('L A N E S', width / 2, 215);
  ctx.fillStyle = '#ffb45a';
  ctx.fillRect(width / 2 - 180, 248, 360, 5);
});
const sign = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 2.65),
  new THREE.MeshBasicMaterial({ map: signTexture, transparent: true }),
);
sign.position.set(0, 4.8, -25.75);
scene.add(sign);

for (const side of [-1, 1]) {
  for (const z of [4, -7, -18]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.45, 8, 0.6), material(0x151c31, 0.75));
    column.position.set(side * 5.1, 3.5, z);
    scene.add(column);
  }
}
for (const z of [3, -7, -17]) {
  const lamp = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xffe4b5, side: THREE.DoubleSide }),
  );
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, 8, z);
  scene.add(lamp);
}

const ballGroup = new THREE.Group();
const ballBody = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 36, 26),
  new THREE.MeshPhysicalMaterial({ color: 0x6843b8, roughness: 0.2, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.16 }),
);
ballBody.castShadow = true;
ballGroup.add(ballBody);
const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x100d1c });
for (const [x, z] of [[-0.105, 0.015], [0.105, 0.015], [0, -0.12]]) {
  const hole = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8), holeMaterial);
  hole.position.set(x, Math.sqrt((BALL_RADIUS - 0.018) ** 2 - x * x - z * z), z);
  ballGroup.add(hole);
}
scene.add(ballGroup);

const pinProfile = [
  [0.13, 0], [0.2, 0.04], [0.25, 0.18], [0.27, 0.35], [0.23, 0.58],
  [0.15, 0.8], [0.105, 0.96], [0.12, 1.06], [0.17, 1.13], [0.17, 1.23],
  [0.12, 1.32], [0.001, 1.36],
].map(([x, y]) => new THREE.Vector2(x, y));
const pinGeometry = new THREE.LatheGeometry(pinProfile, 28);
const pinMaterial = new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.3, metalness: 0.02 });
const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xe84d5b, roughness: 0.38 });
const pinMeshes = new Map();

function makePin() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(pinGeometry, pinMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  for (const y of [1.005, 1.085]) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.025, 8, 28), stripeMaterial);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = y;
    group.add(stripe);
  }
  return group;
}

const aimGroup = new THREE.Group();
const aimMaterial = new THREE.MeshBasicMaterial({ color: 0x8bf3ff, transparent: true, opacity: 0.75, depthWrite: false });
for (let i = 0; i < 17; i += 1) {
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035 + i * 0.0018, 10), aimMaterial);
  dot.rotation.x = -Math.PI / 2;
  aimGroup.add(dot);
}
scene.add(aimGroup);

const confetti = [];
const confettiGeometry = new THREE.PlaneGeometry(0.09, 0.2);
const confettiMaterials = [0x61dbe8, 0xffb45a, 0xff648c, 0xf8f5ec, 0x8c70e8]
  .map((color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));

function celebrate() {
  for (let i = 0; i < 52; i += 1) {
    const mesh = new THREE.Mesh(confettiGeometry, confettiMaterials[i % confettiMaterials.length]);
    mesh.position.set((Math.random() - 0.5) * 1.5, 0.8 + Math.random(), HEAD_PIN_Z);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(mesh);
    confetti.push({
      mesh,
      vx: (Math.random() - 0.5) * 5,
      vy: 3 + Math.random() * 4,
      vz: (Math.random() - 0.5) * 4,
      life: 2.4,
    });
  }
}

function updateConfetti(dt) {
  for (let i = confetti.length - 1; i >= 0; i -= 1) {
    const p = confetti[i];
    p.life -= dt;
    p.vy -= 7 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.x += dt * 5;
    p.mesh.rotation.y += dt * 7;
    if (p.life <= 0 || p.mesh.position.y < -0.2) {
      scene.remove(p.mesh);
      confetti.splice(i, 1);
    }
  }
}

const game = new BowlingGame({ onEvent: handleEvent });
const swing = new SwingDetector({ onThreshold: 110, offThreshold: 55, minTravel: 18, maxMs: 650 });
let started = false;
let round = 0;
let shownPower = 0;
let shake = 0;
let lastPinSound = 0;
let calloutTimer = 0;
let fps = 0;
let frames = 0;
let fpsMark = performance.now();

const channel = createChannel({
  onA: () => {
    if (!started || game.state === 'complete') startGame();
    else if (!channel.pointer.live) desktopThrow();
  },
  onSample: (_sample, dt, now) => {
    const result = swing.update(channel.pointer.rateDps, dt, now);
    if (started && game.state === 'ready') {
      shownPower = clamp(Math.hypot(channel.pointer.rateDps.yaw, channel.pointer.rateDps.pitch) / 430, 0, 1);
    }
    if (!result || !started || game.state !== 'ready') return;
    const power = clamp((result.peak - 60) / 370, 0.2, 1);
    const spin = clamp(Math.cos(result.angle) * 0.85, -1, 1);
    shownPower = power;
    game.throwBall({ power, aim: game.aim, spin });
  },
});

channel.audio.register('bowl-release', (audio, { power = 0.8 } = {}) => {
  audio.noise({ dur: 0.2, gain: 0.12, type: 'bandpass', freq: 500, sweepTo: 1500, q: 1.1 });
  audio.tone({ freq: 100 + power * 50, slideTo: 65, dur: 0.16, type: 'sine', gain: 0.16 });
});
channel.audio.register('bowl-pins', (audio, { speed = 8 } = {}) => {
  audio.noise({ dur: 0.15, gain: clamp(speed / 35, 0.1, 0.32), type: 'bandpass', freq: 1350, sweepTo: 420, q: 0.7 });
  audio.tone({ freq: 180, slideTo: 75, dur: 0.12, type: 'triangle', gain: 0.12 });
});
channel.audio.register('bowl-strike', (audio) => {
  [523, 659, 784, 1047].forEach((freq, i) => audio.tone({ freq, dur: 0.28, type: 'triangle', gain: 0.13, delay: i * 0.075 }));
});
channel.audio.register('bowl-spare', (audio) => {
  audio.tone({ freq: 440, dur: 0.18, type: 'triangle', gain: 0.12 });
  audio.tone({ freq: 660, dur: 0.3, type: 'triangle', gain: 0.14, delay: 0.1 });
});
channel.audio.register('bowl-gutter', (audio) => {
  audio.tone({ freq: 180, slideTo: 75, dur: 0.4, type: 'sine', gain: 0.13 });
});

function handleEvent(event) {
  if (event.type === 'throw') {
    channel.audio.play('bowl-release', { power: event.power });
    channel.feedback({ type: 'launch' });
    $('callout').classList.remove('on');
  } else if (event.type === 'pin') {
    shake = Math.min(0.18, shake + 0.055);
    const now = performance.now();
    if (now - lastPinSound > 65) {
      channel.audio.play('bowl-pins', { speed: event.speed });
      lastPinSound = now;
    }
  } else if (event.type === 'gutter') {
    channel.audio.play('bowl-gutter');
  } else if (event.type === 'result') {
    syncHud();
    if (event.kind === 'strike') {
      showCallout('STRIKE!', 'THAT’S ALL TEN');
      channel.audio.play('bowl-strike');
      channel.feedback({ type: 'slice', combo: 4 });
      celebrate();
    } else if (event.kind === 'spare') {
      showCallout('SPARE!', 'CLEANED UP');
      channel.audio.play('bowl-spare');
      channel.feedback({ type: 'slice', combo: 2 });
      celebrate();
    } else if (event.kind === 'gutter') {
      showCallout('GUTTER', 'SHAKE IT OFF');
    } else if (event.knocked === 0) {
      showCallout('NO PINS', 'TRY A NEW LINE');
    } else {
      showCallout(`${event.knocked} PIN${event.knocked === 1 ? '' : 'S'}`, `${event.remaining} LEFT STANDING`);
    }
    if (event.complete) {
      const completedRound = round;
      setTimeout(() => {
        if (completedRound === round && game.state === 'complete') showFinalScore();
      }, 1350);
    }
  }
}

function showCallout(title, subtitle) {
  clearTimeout(calloutTimer);
  $('callout').replaceChildren(document.createTextNode(title));
  const small = document.createElement('small');
  small.textContent = subtitle;
  $('callout').appendChild(small);
  $('callout').classList.add('on');
  calloutTimer = setTimeout(() => $('callout').classList.remove('on'), 1500);
}

function buildScoreboard() {
  const board = $('scoreboard');
  for (let frame = 0; frame < 10; frame += 1) {
    const el = document.createElement('div');
    el.className = `frame${frame === 9 ? ' tenth' : ''}`;
    el.dataset.frame = String(frame);
    const rollCount = frame === 9 ? 3 : 2;
    el.innerHTML = `<div class="frame-head">${frame + 1}</div><div class="rolls">${
      Array.from({ length: rollCount }, () => '<span class="roll"></span>').join('')
    }</div><div class="total"></div>`;
    board.appendChild(el);
  }
  const total = document.createElement('div');
  total.id = 'grand-total';
  total.innerHTML = '<small>TOTAL</small><b>0</b>';
  board.appendChild(total);
}

function rollMark(value) {
  return value === 0 ? '−' : String(value);
}

function marksFor(rolls, tenth) {
  const marks = rolls.map((pins, index) => {
    if (pins === 10) return 'X';
    if (index > 0 && rolls[index - 1] !== 10 && rolls[index - 1] + pins === 10) return '/';
    return rollMark(pins);
  });
  if (!tenth && rolls[0] === 10) return ['', 'X'];
  return marks;
}

function syncHud() {
  const score = game.score();
  const frameElements = $('scoreboard').querySelectorAll('.frame');
  frameElements.forEach((el, index) => {
    el.classList.toggle('current', game.state !== 'complete' && index === game.frame);
    const marks = marksFor(game.frames[index], index === 9);
    const cells = el.querySelectorAll('.roll');
    if (index < 9 && game.frames[index][0] !== 10) {
      cells.forEach((cell, roll) => { cell.textContent = marks[roll] || ''; });
    } else if (index < 9) {
      cells[0].textContent = '';
      cells[1].textContent = marks[1] || '';
    } else {
      cells.forEach((cell, roll) => { cell.textContent = marks[roll] || ''; });
    }
    el.querySelector('.total').textContent = score.totals[index] ?? '';
  });
  $('grand-total').querySelector('b').textContent = score.total;

  if (game.state === 'complete') {
    $('frame-label').textContent = 'Game complete';
    $('pins-label').textContent = `Final score · ${score.total}`;
  } else {
    $('frame-label').textContent = `Frame ${game.frame + 1} · Roll ${game.frames[game.frame].length + 1}`;
    $('pins-label').textContent = `${game.standingCount()} pin${game.standingCount() === 1 ? '' : 's'} standing`;
  }
}

function startGame() {
  round += 1;
  game.reset();
  started = true;
  shownPower = 0;
  $('overlay').classList.add('hide');
  $('callout').classList.remove('on');
  for (const p of confetti) scene.remove(p.mesh);
  confetti.length = 0;
  syncHud();
}

function desktopThrow() {
  if (!started || game.state !== 'ready') return;
  shownPower = 0.82;
  game.throwBall({ power: 0.82, aim: game.aim, spin: 0 });
}

function showFinalScore() {
  const score = game.score().total;
  const best = Math.max(score, Number(localStorage.getItem('bowling.best') || 0));
  localStorage.setItem('bowling.best', String(best));
  $('panel').innerHTML = `<div class="eyebrow">Ten frames complete</div><h1>Nice <em>Roll</em></h1>
    <div id="final-score"><small>FINAL SCORE</small>${score}</div>
    <p>${score >= 200 ? 'A masterful night at Moonlight Lanes.' : score >= 120 ? 'The pins know your name. Come back for 200.' : 'Find your line and the strikes will come.'}<br>Personal best: <strong>${best}</strong></p>
    <div class="cta">Press A or Space to play again</div><div class="subcta">B returns to the games menu</div>`;
  $('overlay').classList.remove('hide');
}

function syncScene(now, dt) {
  ballGroup.position.set(game.ball.x, game.ball.gutter ? -0.08 : BALL_RADIUS, game.ball.z);
  ballGroup.rotation.x = -game.ball.distance / BALL_RADIUS;
  ballGroup.rotation.z = -game.ball.x * 0.35;

  const alive = new Set();
  for (const pin of game.pins) {
    alive.add(pin.id);
    let mesh = pinMeshes.get(pin.id);
    if (!mesh) {
      mesh = makePin();
      pinMeshes.set(pin.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(pin.x, pin.standing ? 0 : pin.fall * 0.17, pin.z);
    const angle = pin.standing ? 0 : pin.fall * Math.PI * 0.48;
    mesh.rotation.set(-Math.cos(pin.fallDirection) * angle, 0, -Math.sin(pin.fallDirection) * angle);
  }
  for (const [id, mesh] of pinMeshes) {
    if (alive.has(id)) continue;
    scene.remove(mesh);
    pinMeshes.delete(id);
  }

  aimGroup.visible = started && game.state === 'ready';
  if (aimGroup.visible) {
    const targetX = game.aim * 1.72;
    aimGroup.children.forEach((dot, index) => {
      const t = (index + 1) / aimGroup.children.length;
      dot.position.set(targetX * t, 0.018, 5.2 + (HEAD_PIN_Z - 5.2) * t);
      dot.material.opacity = 0.25 + t * 0.55;
    });
  }

  const progress = game.state === 'rolling'
    ? clamp((START_Z - game.ball.z) / (START_Z - HEAD_PIN_Z), 0, 1)
    : 0;
  const desired = new THREE.Vector3(game.ball.x * 0.12, 5.4 - progress * 0.55, 12.8 - progress * 5.4);
  camera.position.lerp(desired, Math.min(1, dt * 3.4));
  if (shake > 0.001) {
    camera.position.x += Math.sin(now * 0.09) * shake;
    camera.position.y += Math.cos(now * 0.073) * shake * 0.45;
    shake *= Math.max(0, 1 - dt * 7);
  }
  camera.lookAt(game.ball.x * 0.08, 0.2, -8.5 - progress * 8.2);
  updateConfetti(dt);
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  channel.pointer.setViewport(width, height);
}
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  if (dt <= 0) return;
  frames += 1;
  if (now - fpsMark >= 500) {
    fps = frames * 1000 / (now - fpsMark);
    frames = 0;
    fpsMark = now;
  }

  const pointer = channel.poll(now);
  if (started && game.state === 'ready') game.aim = clamp((pointer.x - 0.5) * 2, -1, 1);
  game.update(dt);
  if (game.state === 'ready' && !swing.active) shownPower *= Math.max(0, 1 - dt * 4);
  $('power').style.width = `${Math.round(shownPower * 100)}%`;
  $('instruction').textContent = game.state === 'rolling' ? 'Ball in motion' : 'Point to aim · Swing to bowl';
  syncScene(now, dt);
  renderer.render(scene, camera);
}

setInterval(() => {
  if (!$('debug').classList.contains('on')) return;
  $('debug').textContent = [
    `state      ${game.state}`,
    `frame      ${game.frame + 1} · rolls ${game.frames[game.frame].join(', ') || '—'}`,
    `score      ${game.score().total}`,
    `aim        ${game.aim.toFixed(2)}`,
    `ball       ${game.ball.x.toFixed(2)}, ${game.ball.z.toFixed(2)}${game.ball.gutter ? ' · gutter' : ''}`,
    `pins       ${game.standingCount()} standing`,
    `gyro map   ${channel.pointer.describeMap()}`,
    `sensor     ${channel.link.rate.toFixed(0)} Hz`,
    `fps        ${fps.toFixed(0)}`,
  ].join('\n');
}, 250);

buildScoreboard();
resize();
syncHud();
channel.audio.unlock();
requestAnimationFrame(frame);

window.__freewii = {
  game, channel, scene, camera, renderer, startGame, desktopThrow, syncScene,
  fps: () => fps,
};
