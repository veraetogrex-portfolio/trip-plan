// Trip Plan — github.com/veraetogrex-portfolio · zero dependencies
// One day of a trip at a time, hour by hour; the day chips above it are drop targets.
// Drop a plan on another day: the days slide under it and it lands in that day's first free slot.
// Undo puts it back; arrow keys move a focused plan between days.

const DAYS = [
  { name: 'Saturday', short: 'Sat 21', date: 'Nov 21' },
  { name: 'Sunday',   short: 'Sun 22', date: 'Nov 22' },
  { name: 'Monday',   short: 'Mon 23', date: 'Nov 23' },
];
// day: index in DAYS, start: hour of the day, hours: how long; the ticket is a booked entry
const START = [
  { what: 'Pastry breakfast',       where: 'Corner bakery, Graça',     day: 0, start: 9,    hours: 1,   ico: 'cup' },
  { what: 'Old town walk',          where: 'Alfama, with a guide',     day: 0, start: 10.5, hours: 2,   ico: 'pin' },
  { what: 'Tile Museum',            where: 'Timed entry · 2 h 30 min', day: 0, start: 14,   hours: 2.5, ico: 'museum', ticket: true },
  { what: 'Brunch at the market',   where: 'Riverside food hall',      day: 1, start: 9,    hours: 1.5, ico: 'basket' },
  { what: 'Ferry across the river', where: 'Pier 3, return ticket',    day: 1, start: 14,   hours: 1.5, ico: 'boat' },
  { what: 'Evening tram ride',      where: 'Line 28, up to Graça',     day: 1, start: 16,   hours: 1,   ico: 'tram' },
  { what: 'Hotel checkout',         where: 'Casa Azul',                day: 2, start: 10,   hours: 1,   ico: 'key' },
  { what: 'Train to Porto',         where: 'Platform 4, coach 6',      day: 2, start: 13,   hours: 3,   ico: 'train' },
];
const ICONS = {
  cup:    '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1.5 1.5 1.5 1.5 3M12 3.5c0 1.5 1.5 1.5 1.5 3"/>',
  pin:    '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  museum: '<path d="M3 9.5 12 4l9 5.5M4.5 9.5h15M5 19.5h14M3.5 21.5h17M7 12v5M12 12v5M17 12v5"/>',
  basket: '<path d="M3 10h18l-2 10H5z"/><path d="M8 10l3-6m5 6-3-6M9 14v3m6-3v3"/>',
  boat:   '<path d="M3 15h18l-2.5 4.5h-13z"/><path d="M6 15V9h12v6M10 9V5h4v4"/>',
  key:    '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
  tram:   '<rect x="5" y="5" width="14" height="12" rx="2.5"/><path d="M5 11h14M9 21l1-4m5 4-1-4M8 2.5h8M12 2.5V5"/>',
  train:  '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10.5h12M9 21l1.5-4m4.5 4-1.5-4"/><circle cx="9.5" cy="13.8" r=".6"/><circle cx="14.5" cy="13.8" r=".6"/>',
};
const OPEN = 9, CLOSE = 17, HOUR = 62, TOP = 270;       // the lane shows 9:00–17:00, 62 px an hour
const LANE_X = 172, LANE_W = 1116, STEP = LANE_W + 96;  // the days lie side by side, one STEP apart
const BREAK = .5;                                       // keep half an hour free between plans
const DOCK = .78;                                       // a plan held over a day chip shrinks to this

const root   = document.querySelector('#trip');
const strip  = root.querySelector('.tp-days');
const lane   = root.querySelector('.tp-lane');
const air    = root.querySelector('.tp-air');
const done   = root.querySelector('.tp-done');
const undoBtn = root.querySelector('.tp-undo');

const fmt = h => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;
const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const span = (p, a, b) => clamp((p - a) / (b - a), 0, 1);       // local progress of p inside [a, b]
const inOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const out = t => 1 - Math.pow(1 - t, 3);

// ── build: chips, titles, hour labels, plans ──
strip.innerHTML = DAYS.map((d, i) => `<button class="tp-day" role="radio" data-d="${i}"><b>${d.short}</b><span></span></button>`).join('')
  + '<span class="tp-day-pill" aria-hidden="true"></span>';
root.querySelector('.tp-titles').innerHTML = DAYS.map(d => `<p class="tp-title">${d.name}<span>${d.date}</span></p>`).join('');
root.querySelector('.tp-hours').innerHTML = Array.from({ length: CLOSE - OPEN + 1 }, (_, i) =>
  `<p style="top:${TOP + i * HOUR - 11}px">${OPEN + i}:00</p>`).join('');
const chips = [...strip.querySelectorAll('.tp-day')], pill = strip.querySelector('.tp-day-pill');
const titles = [...root.querySelectorAll('.tp-title')];

const PLANS = START.map((s, i) => {
  const el = document.createElement('div');
  el.className = 'tp-plan' + (s.ticket ? ' is-ticket' : s.hours < 1.5 ? ' is-short' : '');
  el.setAttribute('role', 'listitem'); el.dataset.i = i;
  el.style.height = s.hours * HOUR - 6 + 'px';
  el.innerHTML = `<span class="tp-ico">${svg(ICONS[s.ico])}</span><span class="tp-what"><p class="tp-name">${s.what}</p><p class="tp-place">${s.where}</p></span>`
    + (s.ticket ? '<span class="tp-stub">' + '<span class="tp-stub-face"><p class="tp-stub-day"></p><p class="tp-stub-time"></p></span>'.repeat(2) + '</span>'
                : '<p class="tp-when"></p>');
  lane.appendChild(el);
  return { ...s, el, faces: [...el.querySelectorAll('.tp-stub-face')] };
});
const gaps = ['from', 'to'].map(k => { const el = document.createElement('span'); el.className = 'tp-gap is-' + k; el.innerHTML = k === 'to' ? '<p></p>' : ''; lane.prepend(el); return { el, day: 0, start: 0, o: 0 }; });

let view = 0, pan = 0;     // the day on screen, and where the lane is (in days; fractional while it slides)
let held = null;           // the plan being carried: { p, gx, gy, x, y, s, r, k, dock, over }
let press = null, undo = null, busy = false, anim = 0, doneTimer = 0;
let landing = null;        // while a plan is on its way: { d, at, n } — the chips keep showing the old counts and the free time

// ── where things are ──
const xOf = d => LANE_X + (d - pan) * STEP;
const yOf = h => TOP + (h - OPEN) * HOUR + 3;
const put = (el, x, y, s = 1, r = 0) => { el.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`; };
const count = d => PLANS.filter(q => q.day === d).length;

function render() {
  PLANS.forEach(p => { if (p !== held?.p) put(p.el, xOf(p.day), yOf(p.start)); });
  titles.forEach((t, d) => { t.style.transform = `translate(${72 + (d - pan) * STEP}px, 92px)`; });
  gaps.forEach(g => { put(g.el, xOf(g.day), yOf(g.start)); g.el.style.opacity = g.o; });
  if (held) {
    const h = held;
    put(h.p.el, h.x, h.y, h.s, h.r);
    h.p.el.style.filter = h.k ? `drop-shadow(0 ${22 * h.k}px ${30 * h.k}px rgba(0, 0, 0, ${.55 * h.k}))` : '';
  }
}

// the first free time on day d that fits plan p: its own time if free, else the earliest half hour
function slotFor(p, d) {
  const busy = PLANS.filter(q => q !== p && q.day === d);
  const fits = t => t >= OPEN && t + p.hours <= CLOSE &&
    busy.every(q => t + p.hours + BREAK <= q.start || t >= q.start + q.hours + BREAK);
  if (fits(p.start)) return p.start;
  for (let t = OPEN; t + p.hours <= CLOSE; t += .5) if (fits(t)) return t;
  return null;
}

// the chips say how many plans each day has; while a plan is held over one, it says where it would go
function paintDays(over = -1) {
  chips.forEach((c, d) => {
    const n = landing ? landing.n[d] : count(d);
    const at = landing ? (d === landing.d ? landing.at : undefined) : over === d && held && d !== held.p.day ? slotFor(held.p, d) : undefined;
    c.querySelector('span').textContent = at === undefined ? `${n} plan${n === 1 ? '' : 's'}` : at === null ? 'No free time' : `${fmt(at)} free`;
    c.classList.toggle('is-target', at != null);
    c.classList.toggle('is-full', at === null);
    c.setAttribute('aria-checked', d === view); c.tabIndex = d === view ? 0 : -1;
  });
  pill.style.transform = `translateX(${view * (chips[1].offsetLeft - chips[0].offsetLeft)}px)`;
}
function label(p) {
  if (p.ticket) { p.faces[0].children[0].textContent = DAYS[p.day].name; p.faces[0].children[1].textContent = fmt(p.start); }
  else p.el.querySelector('.tp-when').textContent = `${fmt(p.start)} – ${fmt(p.start + p.hours)}`;
  p.el.setAttribute('aria-label', `${p.what}, ${DAYS[p.day].name} ${fmt(p.start)} to ${fmt(p.start + p.hours)}. Arrow keys move it to another day.`);
  const shown = p.day === view;
  p.el.tabIndex = shown ? 0 : -1; p.el.toggleAttribute('aria-hidden', !shown);
}
// the ticket's stub turns over to the new day and time: the old face leaves upward, the new one arrives from below
function flip(p, f, d, at) {
  if (!p.ticket) { if (f >= .5) p.el.querySelector('.tp-when').textContent = `${fmt(at)} – ${fmt(at + p.hours)}`; return; }
  const [a, b] = p.faces;
  b.children[0].textContent = DAYS[d].name; b.children[1].textContent = fmt(at);
  const e = inOut(f);                                                     // the two faces roll together, so the stub is never empty
  a.style.transform = `translateY(${-100 * e}%)`; a.style.opacity = 1;
  b.style.transform = `translateY(${100 * (1 - e)}%)`; b.style.opacity = 1;
}

// one animation at a time; t goes 0 → 1
function run(ms, step) {
  const id = ++anim;
  return new Promise(res => {
    const t0 = performance.now();
    const tick = now => {
      if (id !== anim) return res(false);
      const t = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : Math.min(1, (now - t0) / ms); step(t); render();   // reduced motion: jump to the end
      t < 1 ? requestAnimationFrame(tick) : res(true);
    };
    requestAnimationFrame(tick);
  });
}

// ── carry: the plan leaves the lane and follows the pointer ──
function lift(p, gx, gy) {
  held = { p, gx, gy, x: xOf(p.day), y: yOf(p.start), s: 1, r: 0, k: 0, dock: 0, over: -1, t0: performance.now() };
  air.appendChild(p.el); p.el.classList.add('is-air');
  Object.assign(gaps[0], { day: p.day, start: p.start, o: 1 });          // the place it came from stays marked
  gaps[0].el.style.height = p.el.style.height;
}
function carry(now) {
  if (!held || !press) return;
  const h = held, [cx, cy] = press.at, dt = Math.min(50, now - (h.last || now)); h.last = now;
  const over = chipAt(cx, cy);
  if (over !== h.over) { h.over = over; paintDays(over); }
  h.dock += ((over >= 0 ? 1 : 0) - h.dock) * (1 - Math.exp(-dt / 70));
  const up = span(now - h.t0, 0, 160);
  // free: the grab point stays under the pointer; above the lane the plan shrinks toward the chips
  const fs = lerp(1, .86, span(TOP + 40 - cy, 0, 200)) + .02 * up;
  const free = { x: clamp(cx - h.gx * fs, LANE_X, LANE_X + LANE_W * (1 - fs)), y: cy - h.gy * fs, s: fs, r: -.8 * up };   // never past the lane's edges
  // docked: hanging under the chip it is over, its top tucked under the strip
  if (over >= 0) { const c = chipRect(over), w = LANE_W * DOCK; h.at = { x: clamp(c.cx - w / 2, LANE_X, LANE_X + LANE_W - w), y: c.y2 - 10, s: DOCK, r: 0 }; }
  const q = out(h.dock), d = h.at || free;
  Object.assign(h, { x: lerp(free.x, d.x, q), y: lerp(free.y, d.y, q), s: lerp(free.s, d.s, q), r: lerp(free.r, d.r, q), k: up });
  render();
  requestAnimationFrame(carry);
}

// ── move: the new day slides in under the held plan, its free window shows, then the plan drops into it ──
async function move(p, d, at) {
  busy = true; showDone(false);
  if (!held) lift(p, 0, 0);
  undo = { p, day: p.day, start: p.start };
  const a = { ...held }, p0 = pan;
  landing = { d, at, n: DAYS.map((_, i) => count(i)) };
  p.day = d; p.start = at; view = d; paintDays();
  Object.assign(gaps[1], { day: d, start: at, o: 0 }); gaps[1].el.style.height = p.el.style.height;
  gaps[1].el.firstChild.textContent = `Free · ${fmt(at)} – ${fmt(at + p.hours)}`;
  await run(2000, t => {
    pan = lerp(p0, d, inOut(span(t, 0, .48)));                              // 1: the day slides in; the plan holds still
    gaps[1].o = span(t, .42, .54) * (1 - span(t, .9, .97));                  // 2: the free window it fits shows
    const q = inOut(span(t, .64, .94));                                      // 3: it comes down into that window
    if (landing && t >= .94) { landing = null; paintDays(); }               // 4: landed: now the days count it
    Object.assign(held, { x: lerp(a.x, LANE_X, q), y: lerp(a.y, yOf(at), q), r: lerp(a.r, 0, q),
      s: lerp(a.s, 1, q) * (1 + .014 * Math.sin(Math.PI * span(t, .92, 1))), k: Math.max(a.k, .6) * (1 - span(t, .9, 1)) });
    flip(p, span(t, .68, .88), d, at);
  });
  land(p);
  showDone(true, `Moved to ${DAYS[d].name}`);
}

// ── undo: lift it, slide the days back, set it down at its old time ──
async function back() {
  if (!undo || busy) return;
  const { p, day, start } = undo; undo = null;
  busy = true; showDone(false);
  lift(p, 0, 0); gaps[0].o = 0;
  const y0 = held.y, p0 = pan;
  p.day = day; p.start = start; view = day; paintDays();
  await run(1100, t => {
    const up = span(t, 0, .2) * (1 - span(t, .82, 1));
    pan = lerp(p0, day, inOut(span(t, .1, .66)));
    const q = inOut(span(t, .12, .86));
    const s = 1 + .012 * up, h = held.p.el.offsetHeight;                   // a slight lift, grown from its centre
    Object.assign(held, { x: LANE_X - (s - 1) * LANE_W / 2, y: lerp(y0, yOf(start), q) - (s - 1) * h / 2, s, r: -.3 * up, k: up });
    flip(p, span(t, .3, .62), day, start);
  });
  land(p);
  root.classList.remove('has-done');
}

function land(p) {
  p.el.classList.remove('is-air'); p.el.style.filter = '';
  inOrder(); held = null; landing = null;               // back into the lane, in time order
  gaps.forEach(g => g.o = 0);
  label(p); flip(p, 0, p.day, p.start); PLANS.forEach(label);
  busy = false; render();
}
// dropped anywhere else: it goes back to where it was
async function settle() {
  const p = held.p, a = { ...held };
  busy = true; paintDays();
  await run(380, t => {
    const q = out(t);
    Object.assign(held, { x: lerp(a.x, xOf(p.day), q), y: lerp(a.y, yOf(p.start), q), s: lerp(a.s, 1, q), r: lerp(a.r, 0, q), k: a.k * (1 - q) });
    gaps[0].o = 1 - q;
  });
  land(p);
}
function showDone(on, text) {
  clearTimeout(doneTimer);
  if (text) done.querySelector('.tp-done-t').textContent = text;
  root.classList.toggle('has-done', on); undoBtn.tabIndex = on ? 0 : -1;
  if (on) doneTimer = setTimeout(() => showDone(false), 8000);
}
async function showDay(d) {
  if (busy || d === view) return;
  const p0 = pan; view = d; paintDays(); PLANS.forEach(label);
  busy = true; await run(520, t => { pan = lerp(p0, d, inOut(t)); }); busy = false;
}

// ── pointer: press a plan, drag it onto a day chip ──
const toPanel = e => { const r = root.getBoundingClientRect(), k = r.width / 1360; return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; };
function chipRect(d) {
  const r = root.getBoundingClientRect(), k = r.width / 1360, c = chips[d].getBoundingClientRect();
  return { x: (c.left - r.left) / k, y: (c.top - r.top) / k, x2: (c.right - r.left) / k, y2: (c.bottom - r.top) / k, cx: (c.left + c.width / 2 - r.left) / k };
}
function chipAt(x, y) {      // the nearest chip, while the pointer is over the strip
  const a = chipRect(0), b = chipRect(DAYS.length - 1);
  if (y < a.y - 16 || y > a.y2 + 16 || x < a.x - 16 || x > b.x2 + 16) return -1;
  let best = 0; chips.forEach((_, d) => { if (Math.abs(chipRect(d).cx - x) < Math.abs(chipRect(best).cx - x)) best = d; });
  return best;
}
lane.addEventListener('pointerdown', e => {
  const el = e.target.closest('.tp-plan');
  if (!el || busy || e.button) return;
  const p = PLANS[el.dataset.i], at = toPanel(e);
  press = { p, from: at, at };
  try { el.setPointerCapture(e.pointerId); } catch (_) {}
});
addEventListener('pointermove', e => {
  if (!press) return;
  press.at = toPanel(e);
  if (!held && Math.hypot(press.at[0] - press.from[0], press.at[1] - press.from[1]) > 6) {
    const p = press.p; lift(p, press.from[0] - xOf(p.day), press.from[1] - yOf(p.start));
    requestAnimationFrame(carry);
  }
});
addEventListener('pointerup', () => {
  if (!press) return;
  const p = press.p; press = null;
  if (!held || busy) return;
  const d = held.over, at = d >= 0 && d !== p.day ? slotFor(p, d) : null;
  at != null ? move(p, d, at) : settle();
});

// ── keyboard: arrows move a plan between days, the strip switches days, Ctrl/⌘ Z undoes ──
lane.addEventListener('keydown', e => {
  const el = e.target.closest('.tp-plan'); if (!el || busy) return;
  const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!dir) return;
  e.preventDefault();
  const p = PLANS[el.dataset.i], d = p.day + dir, at = d >= 0 && d < DAYS.length ? slotFor(p, d) : null;
  if (at == null) return el.animate([{ translate: '0' }, { translate: '-8px' }, { translate: '8px' }, { translate: '0' }], 260);
  move(p, d, at).then(() => p.el.focus({ preventScroll: true }));
});
strip.addEventListener('keydown', e => {
  const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!dir) return;
  e.preventDefault(); const d = clamp(view + dir, 0, DAYS.length - 1); showDay(d); chips[d].focus();
});
chips.forEach((c, d) => c.addEventListener('click', () => showDay(d)));
undoBtn.addEventListener('click', undoKeepFocus);
root.addEventListener('scroll', () => { root.scrollLeft = root.scrollTop = 0; });   // focus must never scroll the panel itself
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoKeepFocus(); }
  if (e.key === 'Escape' && press) { press = null; if (held && !busy) settle(); }
});

// the lane keeps its plans in day and time order, so Tab and screen readers follow the screen
function inOrder() {
  const f = document.activeElement;
  [...PLANS].sort((a, b) => a.day - b.day || a.start - b.start).forEach(q => lane.appendChild(q.el));
  if (f !== document.activeElement && lane.contains(f)) f.focus({ preventScroll: true });   // moving a node drops its focus; give it back
}

// Undo hides its button and lifts the plan out of the lane; keyboard focus goes with the plan instead of falling to the page
function undoKeepFocus() {
  const p = undo?.p, f = document.activeElement;
  back().then(() => { if (p && (f === undoBtn || f === p.el || f === document.body)) p.el.focus({ preventScroll: true }); });
}

function reset() {
  anim++; clearTimeout(doneTimer); root.classList.add('is-reset');
  PLANS.forEach((p, i) => { Object.assign(p, START[i]); p.el.classList.remove('is-air'); p.el.style.filter = ''; lane.appendChild(p.el); });
  held = press = undo = landing = null; busy = false; view = pan = 0;
  gaps.forEach(g => g.o = 0); showDone(false);
  PLANS.forEach(p => { label(p); flip(p, 0, p.day, p.start); });
  paintDays(); render();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('is-reset')));
}

reset();
root.trip = { reset, day: d => chips[d], plan: i => PLANS[i].el, undo: undoBtn, held: () => held };   // for scripted demos
