import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/formula-field.js', import.meta.url), 'utf8');

function runScene(width, height, withCore = false) {
  const listeners = new Map();
  const frames = [];
  let formulaImages = 0;
  const quadrantImages = [0, 0, 0, 0];
  let lastFormulaPosition = { x: 0, y: 0 };
  const classes = new Set(['experience:cinema-mode']);
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key === 'transform') return (_a, _b, _c, _d, x, y) => { lastFormulaPosition = { x, y }; };
      if (key === 'drawImage') return () => {
        formulaImages++;
        const { x, y } = lastFormulaPosition;
        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          quadrantImages[(y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0)]++;
        }
      };
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  const element = id => ({
    id,
    style: {},
    textContent: '',
    innerHTML: '',
    classList: {
      add(name) { classes.add(`${id}:${name}`); },
      remove(name) { classes.delete(`${id}:${name}`); },
      toggle(name) {
        const key = `${id}:${name}`;
        if (classes.has(key)) { classes.delete(key); return false; }
        classes.add(key); return true;
      }
    },
    getBoundingClientRect() { return { left: 0, top: 0, width, height }; },
    getContext() { return context; },
    setPointerCapture() {},
    setAttribute() {},
    addEventListener(type, fn) { listeners.set(`${id}:${type}`, fn); },
    click() { listeners.get(`${id}:click`)?.(); }
  });
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element(id));
    return elements.get(id);
  };
  const window = {
    innerWidth: width,
    devicePixelRatio: 1,
    blackholeCoreActive: withCore,
    matchMedia: () => ({ matches: false }),
    dispatchEvent() {},
    addEventListener(type, fn) { listeners.set(`window:${type}`, fn); }
  };
  let now = 0;
  runInNewContext(source, {
    window,
    document: {
      querySelector: selector => get(selector.slice(1)),
      createElement: withCore ? () => ({
        getContext: () => ({
          font: '', textBaseline: '', fillStyle: '', shadowBlur: 0, shadowColor: '',
          measureText: text => ({ width: text.length * 9 }),
          fillText() {}
        })
      }) : undefined
    },
    performance: { now: () => (now += 16) },
    requestAnimationFrame: fn => frames.push(fn),
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    HTMLElement: class HTMLElement {}
  }, { filename: 'app.js' });

  assert.equal(frames.length, 1);
  frames.shift()();
  get('cinema-button').click();
  assert.ok(!classes.has('experience:cinema-mode'));
  const canvas = get('universe');
  const pointer = { pointerId: 1, clientX: width / 2, clientY: height / 2, button: 0, shiftKey: false, preventDefault() {} };
  listeners.get('universe:pointerdown')(pointer);
  listeners.get('universe:pointerup')(pointer);
  assert.equal(get('status').textContent, '时空波纹已激发');
  frames.shift()();
  listeners.get('universe:wheel')({ deltaY: -150, preventDefault() {} });
  frames.shift()();
  get('top-view').click();
  assert.equal(get('status').textContent, '已切换到俯瞰视角');
  frames.shift()();
  assert.ok(canvas.width > 0 && canvas.height > 0);
  if (withCore) {
    assert.ok(formulaImages > 100, 'dense formula sprites should render over the WebGL core');
    assert.ok(quadrantImages.every(count => count > 8), 'formula field should extend into every screen quadrant');
  }
}

runScene(1280, 720);
runScene(390, 844);
runScene(1280, 720, true);
runScene(284, 316, true);
console.log('Desktop and mobile canvas interaction smoke checks passed.');
