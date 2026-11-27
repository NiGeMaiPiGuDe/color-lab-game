/* ============ 色彩实验室 · 主程序 ============ */
(function () {
  'use strict';

  const A = new AudioEngine();
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = rand(0, i);[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  /* ---------- 持久化 ---------- */
  const DEFAULTS = {
    settings: { music: true, sound: true, vibrate: true, speech: true, song: 0 },
    stats: { best: 0, level: 1, games: 0, totalStars: 0 }
  };
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem('colorlab_state') || '{}');
      return {
        settings: Object.assign({}, DEFAULTS.settings, s.settings || {}),
        stats: Object.assign({}, DEFAULTS.stats, s.stats || {})
      };
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  let S = load();
  function save() { localStorage.setItem('colorlab_state', JSON.stringify(S)); }

  /* ---------- 色彩算法 ---------- */
  function rgb(a) { return `rgb(${a[0]},${a[1]},${a[2]})`; }
  function hex(a) { return '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase(); }
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function rgbToLab(c) {
    const R = lin(c[0]), G = lin(c[1]), B = lin(c[2]);
    let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
    let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
    const fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function deltaE(a, b) {
    const x = rgbToLab(a), y = rgbToLab(b);
    return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
  }
  function calcStars(d) {
    if (d < 3) return 6;
    if (d < 6) return 5;
    if (d < 10) return 4;
    if (d < 16) return 3;
    if (d < 25) return 2;
    return 1;
  }
  function genTarget(diff) {
    const pool = diff === 'easy' ? [0, 128, 255] : diff === 'normal' ? [0, 32, 64, 96, 128, 160, 192, 224, 255] : null;
    return [0, 1, 2].map(() => pool ? pool[rand(0, pool.length - 1)] : rand(0, 255));
  }

  /* ---------- 通用 UI ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }
  /* 扣分强反馈：红闪 + 分数抖动变红 + 飘字 + 强音效 + 强震动 */
  function penaltyFeedback(scoreEl, amount) {
    const app = $('app');
    app.classList.remove('penalty-flash');
    void app.offsetWidth;
    app.classList.add('penalty-flash');
    setTimeout(() => app.classList.remove('penalty-flash'), 520);
    scoreEl.classList.remove('penalty');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('penalty');
    setTimeout(() => scoreEl.classList.remove('penalty'), 520);
    const r = scoreEl.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'float-penalty';
    f.textContent = '-' + amount;
    f.style.left = (r.left + r.width / 2 - 18) + 'px';
    f.style.top = (r.top - 6) + 'px';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 950);
    A.sfx('penalty');
    A.vibrate('penalty');
  }
  let resultNext = null;
  function showResult(o) {
    $('result-stars').innerHTML = '';
    for (let i = 0; i < o.stars; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      s.style.color = '#ffc94d';
      s.style.animationDelay = (i * 0.09) + 's';
      $('result-stars').appendChild(s);
    }
    for (let i = o.stars; i < 6; i++) {
      const s = document.createElement('span');
      s.textContent = '☆';
      s.style.color = '#ddd8ef';
      $('result-stars').appendChild(s);
    }
    $('result-title').textContent = o.title;
    $('result-detail').textContent = o.detail;
    $('result-target').style.background = rgb(o.target);
    $('result-mine').style.background = rgb(o.mine);
    $('btn-result-next').textContent = o.nextText || '继续挑战';
    resultNext = o.onNext;
    $('result-overlay').classList.add('show');
    if (o.stars >= 5) { A.sfx('star'); A.vibrate('star'); }
  }
  $('btn-result-next').addEventListener('click', () => {
    $('result-overlay').classList.remove('show');
    if (resultNext) { const fn = resultNext; resultNext = null; fn(); }
  });
  $('result-overlay').addEventListener('click', e => {
    if (e.target === $('result-overlay')) {
      $('result-overlay').classList.remove('show');
      if (resultNext) { const fn = resultNext; resultNext = null; fn(); }
    }
  });

  /* ---------- 页面导航 ---------- */
  const TITLES = { home: '色彩实验室', mix: '调色挑战', gradient: '渐变排序', odd: '颜色找不同', memory: '记忆复刻', quest: '闯关模式' };
  let current = 'home';
  function go(page) {
    if (current === 'quest' && page !== 'quest') questCleanup();
    $$('.page').forEach(p => p.classList.remove('active'));
    $('page-' + page).classList.add('active');
    $('page-title').textContent = TITLES[page];
    $('btn-back').classList.toggle('show', page !== 'home');
    current = page;
    A.sfx('click');
    if (page === 'mix') newMixTarget();
    if (page === 'gradient') newGradient();
    if (page === 'odd') newOdd();
    if (page === 'memory') resetMemory();
    if (page === 'home') refreshHome();
  }
  $('btn-back').addEventListener('click', () => go('home'));
  $$('.menu-card').forEach(c => c.addEventListener('click', () => {
    A.init(); A.startMusic();
    if (c.dataset.go === 'quest') startQuest(); else go(c.dataset.go);
  }));

  /* ---------- 精细推杆组件 ---------- */
  const CHANNELS = [
    { key: 'r', label: 'R 红', cls: 'r' },
    { key: 'g', label: 'G 绿', cls: 'g' },
    { key: 'b', label: 'B 蓝', cls: 'b' }
  ];
  /* 竖向推杆：整条轨道都能点按/拖动，下面四个大按钮微调 */
  function createSliders(container, initial, onChange) {
    container.innerHTML = '';
    const vals = { r: initial[0], g: initial[1], b: initial[2] };
    const rows = {};
    CHANNELS.forEach(ch => {
      const row = document.createElement('div');
      row.className = 'fader';
      row.innerHTML = `
        <div class="fader-lab"><i class="channel-dot ${ch.cls}"></i><b>${ch.label}</b></div>
        <div class="fader-track ${ch.cls}">
          <div class="fader-fill"></div>
          <div class="fader-thumb"></div>
        </div>
        <input type="number" class="num-input fader-num" min="0" max="255" value="${vals[ch.key]}">
        <div class="fader-btns">
          <button class="step-btn" data-step="-10">−10</button>
          <button class="step-btn" data-step="-1">−1</button>
          <button class="step-btn" data-step="1">+1</button>
          <button class="step-btn" data-step="10">+10</button>
        </div>`;
      container.appendChild(row);
      const track = row.querySelector('.fader-track');
      const fill = row.querySelector('.fader-fill');
      const thumb = row.querySelector('.fader-thumb');
      const num = row.querySelector('.fader-num');
      rows[ch.key] = { fill, thumb, num };

      const render = () => {
        const p = vals[ch.key] / 255 * 100;
        fill.style.height = p + '%';
        thumb.style.bottom = p + '%';
        num.value = vals[ch.key];
      };
      const set = (v, silent) => {
        const before = vals[ch.key];
        vals[ch.key] = clamp(Math.round(v), 0, 255);
        render();
        if (vals[ch.key] !== before && !silent) A.sfx('slide');
        onChange([vals.r, vals.g, vals.b]);
      };
      rows[ch.key].set = set;

      // 点按轨道任意位置 / 按住上下拖动
      let dragging = false, lastVib = 0, onMove = null, onUp = null;
      const fromY = (clientY, silent) => {
        const r = track.getBoundingClientRect();
        set((1 - (clientY - r.top) / r.height) * 255, silent);
      };
      track.addEventListener('pointerdown', e => {
        e.preventDefault();
        dragging = true;
        fromY(e.clientY, true);
        A.vibrate('tap');
        onMove = ev => {
          if (!dragging) return;
          const before = vals[ch.key];
          fromY(ev.clientY, true);
          if (Math.abs(vals[ch.key] - before) >= 6 && Date.now() - lastVib > 55) {
            A.vibrate('step'); lastVib = Date.now();
          }
        };
        onUp = () => {
          dragging = false;
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });

      num.addEventListener('change', () => set(parseFloat(num.value) || 0, true));

      // 微调按钮：点一下动一下，长按连续动
      $$('.step-btn', row).forEach(btn => {
        let timer, repeat;
        const step = +btn.dataset.step;
        const doStep = () => set(vals[ch.key] + step, true);
        btn.addEventListener('pointerdown', e => {
          e.preventDefault();
          btn._lp = Date.now();
          doStep(); A.vibrate('step');
          clearTimeout(timer); clearInterval(repeat);
          timer = setTimeout(() => { repeat = setInterval(doStep, 85); }, 400);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
          btn.addEventListener(ev, () => { clearTimeout(timer); clearInterval(repeat); }));
        btn.addEventListener('click', () => { if (Date.now() - (btn._lp || 0) > 450) doStep(); });
      });
      render();
    });
    return {
      get: () => [vals.r, vals.g, vals.b],
      set: (arr, silent) => {
        arr.forEach((v, i) => { rows[CHANNELS[i].key].set(v, true); });
        if (!silent) onChange([vals.r, vals.g, vals.b]);
      }
    };
  }

  /* ================= 玩法一：调色挑战 ================= */
  const M = { target: [0, 0, 0], ctrl: null, score: 0, combo: 0, diff: 'easy', hidden: false, locked: false };
  function paintTarget() {
    if (M.hidden) {
      $('target-disc').style.background = '#ece9f7';
      $('target-disc').innerHTML = '<span class="disc-question">?</span>';
      $('target-rgb').textContent = '目标已隐藏';
    } else {
      $('target-disc').style.background = rgb(M.target);
      $('target-disc').innerHTML = '';
      $('target-rgb').textContent = `RGB ${M.target.join(',')}`;
    }
  }
  function newMixTarget() {
    M.target = genTarget(M.diff);
    M.hidden = false; M.locked = false;
    $('btn-mix-hint').textContent = '藏起目标挑战';
    if (!M.ctrl) {
      M.ctrl = createSliders($('mix-sliders'), [128, 128, 128], updateMixPreview);
    } else { M.ctrl.set([128, 128, 128]); }
    updateMixPreview(M.ctrl.get());
    paintTarget();
  }
  function updateMixPreview(v) {
    $('mix-disc').style.background = rgb(v);
    $('mix-hex').textContent = `rgb(${v[0]},${v[1]},${v[2]})`;
  }
  // 切换「藏起目标」高难度模式：只藏目标色，绝不自动填配方
  $('btn-mix-hint').addEventListener('click', () => {
    M.hidden = !M.hidden;
    $('btn-mix-hint').textContent = M.hidden ? '显示目标色' : '藏起目标挑战';
    paintTarget();
    A.sfx('click'); A.vibrate('tap');
    toast(M.hidden ? '目标色已藏起，靠记忆和色感挑战' : '目标色已显示');
  });
  $('btn-mix-skip').addEventListener('click', () => { A.sfx('click'); newMixTarget(); });
  $('btn-mix-submit').addEventListener('click', () => {
    if (M.locked) return;
    M.locked = true;
    const mine = M.ctrl.get();
    const d = deltaE(mine, M.target);
    const stars = calcStars(d);
    const gain = stars * 10 + M.combo * 2;
    M.score += gain; M.combo = stars >= 4 ? M.combo + 1 : 0;
    $('mix-score').textContent = M.score;
    $('mix-combo').textContent = M.combo;
    S.stats.games++; save();
    A.sfx('correct'); A.vibrate('success');
    const titles = ['再接再厉', '不错哦', '有进步', '很接近了', '非常棒！', '色感大师！', '完美匹配！'];
    showResult({
      stars, title: titles[stars], detail: `色差值 ${d.toFixed(1)} · 获得 ${gain} 分${M.hidden ? '（隐藏目标挑战）' : ''}`,
      target: M.target, mine, nextText: '下一个颜色', onNext: newMixTarget
    });
  });

  /* ================= 玩法二：渐变排序（拖拽 + 平滑让位） =================
     色块用绝对定位摆放，位置只由数组下标决定；
     拖动时只改 transform 跟随手指，其他色块靠 left 过渡平滑让位。
     不再用 FLIP 反算位移，避免色块飞出屏幕。 */
  const G = { sorter: null, diff: 'easy', timer: null, start: 0 };

  function makeSortable(board, tiles, height) {
    const gap = 8;
    let drag = null;
    board.innerHTML = '';
    board.style.height = height + 'px';
    tiles.forEach(t => {
      const el = document.createElement('div');
      el.className = 'gradient-tile no-anim';
      el.style.background = rgb(t.color);
      el.innerHTML = '<span class="order-num"></span>';
      t.el = el;
      bind(el);
      board.appendChild(el);
    });
    function metrics() {
      const n = tiles.length;
      const bw = board.clientWidth || 340;
      // 先算块宽，再用剩余空间居中（修复 5 个时不居中）
      const w = Math.max(24, Math.min(52, Math.floor((bw - 24 - gap * (n - 1)) / n)));
      const total = n * w + (n - 1) * gap;
      const pad = Math.max(8, Math.floor((bw - total) / 2));
      return { n, w, gap, pad };
    }
    const leftOf = (i, m) => m.pad + i * (m.w + m.gap);
    function layout() {
      const m = metrics();
      tiles.forEach((t, i) => {
        t.el.style.width = m.w + 'px';
        t.el.style.transform = `translate3d(${leftOf(i, m)}px,0,0)`;
        t.el.querySelector('.order-num').textContent = i + 1;
      });
    }
    layout();
    requestAnimationFrame(() => tiles.forEach(t => t.el.classList.remove('no-anim')));

    function bind(el) {
      let onMove = null, onUp = null;
      const cleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      };
      el.addEventListener('pointerdown', e => {
        if (drag) return;
        e.preventDefault();
        const m = metrics();
        const idx = tiles.findIndex(t => t.el === el);
        const startLeft = leftOf(idx, m);
        drag = { el, sx: e.clientX, sy: e.clientY, startLeft, visual: startLeft, m, lastIdx: idx };
        el.classList.add('dragging');
        el.style.transform = `translate3d(${startLeft}px,0,0) scale(1.08)`;
        A.vibrate('tap');

        onMove = ev => {
          if (!drag || drag.el !== el) return;
          const d = drag;
          const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
          d.visual = d.startLeft + dx;
          const idx2 = clamp(Math.round((d.visual - d.m.pad) / (d.m.w + d.m.gap)), 0, tiles.length - 1);
          if (idx2 !== d.lastIdx) {
            const cur = tiles.findIndex(t => t.el === el);
            const [item] = tiles.splice(cur, 1);
            tiles.splice(idx2, 0, item);
            d.lastIdx = idx2;
            layout(); // 被拖块由下面的 transform 覆写，其余块平滑挤让
            A.sfx('swap'); A.vibrate('step');
          }
          // 被拖块跟手，位置 = 手指位置 - 目标格基准，其余块保持 layout 的位置
          el.style.transform = `translate3d(${d.visual.toFixed(1)}px,${dy.toFixed(1)}px,0) scale(1.08)`;
        };
        onUp = () => {
          if (!drag || drag.el !== el) return;
          const d = drag; drag = null;
          cleanup();
          el.classList.remove('dragging');
          const idx3 = tiles.findIndex(t => t.el === el);
          // 归位到格子基准，靠 CSS 的 .34s 缓动平滑落位
          el.style.transform = `translate3d(${leftOf(idx3, d.m)}px,0,0)`;
          A.sfx('swap'); A.vibrate('tap');
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });
    }
    return {
      tiles,
      relayout: layout,
      sorted: () => tiles.every((t, i) => t.correct === i)
    };
  }

  function newGradient() {
    clearInterval(G.timer);
    const n = G.diff === 'easy' ? 5 : G.diff === 'normal' ? 7 : 9;
    const hue = rand(0, 359);
    const colors = [];
    // 从左到右：由浅到深（i=0 最亮，i=n-1 最暗）
    for (let i = 0; i < n; i++) colors.push(hslToRgb(hue, 62, 84 - (i / (n - 1)) * 66));
    const tiles = shuffle(colors.map((c, i) => ({ color: c, correct: i })));
    G.sorter = makeSortable($('gradient-board'), tiles, 230);
    G.start = Date.now();
    G.timer = setInterval(() => { $('gradient-time').textContent = Math.floor((Date.now() - G.start) / 1000) + 's'; }, 500);
  }
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  $('btn-gradient-new').addEventListener('click', () => { A.sfx('click'); newGradient(); });
  $('btn-gradient-check').addEventListener('click', () => {
    const ok = G.sorter.sorted();
    clearInterval(G.timer);
    if (ok) {
      const sec = Math.floor((Date.now() - G.start) / 1000);
      const gain = G.sorter.tiles.length * 10 + Math.max(0, 60 - sec);
      $('gradient-score').textContent = (+$('gradient-score').textContent) + gain;
      S.stats.games++; save();
      A.sfx('levelup'); A.vibrate('success');
      showResult({ stars: sec < 15 ? 6 : sec < 25 ? 5 : 4, title: '排序正确！', detail: `用时 ${sec} 秒 · 获得 ${gain} 分`, target: G.sorter.tiles[0].color, mine: G.sorter.tiles[G.sorter.tiles.length - 1].color, nextText: '再来一局', onNext: newGradient });
    } else {
      A.sfx('wrong'); A.vibrate('fail'); toast('还没排对，再看看深浅顺序');
    }
  });

  /* ================= 玩法三：找不同 ================= */
  const O = { cells: [], oddIndex: 0, diff: 'easy', timer: null, left: 30, busy: false };
  function newOdd() {
    clearInterval(O.timer);
    O.busy = false;
    const n = O.diff === 'easy' ? 3 : O.diff === 'normal' ? 4 : 5;
    const base = [rand(40, 215), rand(40, 215), rand(40, 215)];
    const delta = O.diff === 'easy' ? 34 : O.diff === 'normal' ? 20 : 11;
    O.oddIndex = rand(0, n * n - 1);
    O.cells = [];
    for (let i = 0; i < n * n; i++) {
      let c = base.slice();
      if (i === O.oddIndex) {
        const ch = rand(0, 2);
        c[ch] = clamp(c[ch] + (Math.random() < .5 ? -delta : delta), 0, 255);
      }
      O.cells.push(c);
    }
    const board = $('odd-board');
    board.style.gridTemplateColumns = `repeat(${n},1fr)`;
    board.innerHTML = '';
    O.cells.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'odd-tile';
      el.style.background = rgb(c);
      el.addEventListener('click', () => onOddClick(i, el));
      board.appendChild(el);
    });
    O.left = O.diff === 'easy' ? 30 : O.diff === 'normal' ? 25 : 20;
    $('odd-time').textContent = O.left + 's';
    O.timer = setInterval(() => {
      O.left--;
      $('odd-time').textContent = O.left + 's';
      if (O.left <= 0) { clearInterval(O.timer); A.sfx('wrong'); A.vibrate('fail'); toast('时间到！换一局再试'); setTimeout(newOdd, 900); }
    }, 1000);
  }
  function onOddClick(i, el) {
    if (O.busy) return;
    if (i === O.oddIndex) {
      O.busy = true; clearInterval(O.timer);
      el.classList.add('right');
      const gain = 50 + O.left * 3;
      $('odd-score').textContent = (+$('odd-score').textContent) + gain;
      S.stats.games++; save();
      A.sfx('correct'); A.vibrate('success');
      setTimeout(() => showResult({ stars: O.left > 20 ? 6 : O.left > 12 ? 5 : 4, title: '找到了！', detail: `剩余 ${O.left} 秒 · 获得 ${gain} 分`, target: O.cells[O.oddIndex], mine: O.cells[O.oddIndex], nextText: '下一局', onNext: newOdd }), 350);
    } else {
      el.classList.add('wrong');
      setTimeout(() => el.classList.remove('wrong'), 460);
      const before = +$('odd-score').textContent;
      const after = Math.max(0, before - 5);
      $('odd-score').textContent = after;
      penaltyFeedback($('odd-score'), before - after);
    }
  }
  $('btn-odd-new').addEventListener('click', () => { A.sfx('click'); newOdd(); });

  /* ================= 玩法四：记忆复刻 ================= */
  const Y = { target: [0, 0, 0], ctrl: null, phase: 'idle', score: 0, combo: 0, diff: 'easy', timer: null, locked: false };
  function resetMemory() {
    clearInterval(Y.timer);
    Y.phase = 'idle'; Y.locked = false;
    $('memory-disc').className = 'color-disc big';
    $('memory-disc').innerHTML = '<span class="disc-question">?</span>';
    $('memory-disc').style.background = '#ece9f7';
    $('memory-label').textContent = '先看清这个颜色';
    $('memory-label').classList.remove('showing');
    $('memory-count').textContent = '';
    $('memory-status').textContent = '点「开始记忆」，会出现一个颜色，记住它';
    $('btn-memory-start').textContent = '开始记忆';
    $('memory-sliders').classList.add('locked');
    if (!Y.ctrl) Y.ctrl = createSliders($('memory-sliders'), [128, 128, 128], v => { $('memory-disc').style.background = rgb(v); });
    else Y.ctrl.set([128, 128, 128]);
    $('memory-disc').style.background = '#ece9f7';
  }
  $('btn-memory-start').addEventListener('click', () => {
    if (Y.phase === 'show') return;
    if (Y.phase === 'input') { // 重看一次（本次得分打折）
      Y.reshow = true;
    }
    Y.target = Y.target && Y.phase === 'input' ? Y.target : genTarget(Y.diff);
    const sec = Y.diff === 'easy' ? 5 : Y.diff === 'normal' ? 4 : 3;
    Y.phase = 'show'; Y.locked = true;
    $('memory-sliders').classList.add('locked');
    $('memory-disc').className = 'color-disc big showing';
    $('memory-disc').style.background = rgb(Y.target);
    $('memory-disc').innerHTML = '';
    $('memory-label').textContent = '记住这个颜色！';
    $('memory-label').classList.add('showing');
    $('memory-status').textContent = Y.reshow ? '再看一遍，这次得分会打折' : '盯住颜色，倒计时结束后它会消失';
    $('btn-memory-start').textContent = '记忆中…';
    A.sfx('flash'); A.vibrate('tap'); A.speak('记住这个颜色');
    let left = sec;
    $('memory-count').textContent = left;
    clearInterval(Y.timer);
    Y.timer = setInterval(() => {
      left--;
      if (left > 0) {
        $('memory-count').textContent = left;
        A.sfx('flash'); A.vibrate('step');
      } else {
        clearInterval(Y.timer);
        Y.phase = 'input'; Y.locked = false;
        $('memory-disc').className = 'color-disc big';
        $('memory-disc').innerHTML = '<span class="disc-question">?</span>';
        $('memory-disc').style.background = '#ece9f7';
        $('memory-count').textContent = '';
        $('memory-label').textContent = '现在用推杆还原刚才的颜色';
        $('memory-label').classList.remove('showing');
        $('memory-status').textContent = '拖动 R / G / B 三个推杆，调好后点「确认还原」';
        $('btn-memory-start').textContent = '再看一次';
        $('memory-sliders').classList.remove('locked');
        Y.ctrl.set([128, 128, 128]);
        A.sfx('click'); A.vibrate('tap');
      }
    }, 1000);
  });
  $('btn-memory-submit').addEventListener('click', () => {
    if (Y.phase !== 'input' || Y.locked) { toast('请先点「开始记忆」，看清颜色后再还原'); return; }
    Y.locked = true;
    const mine = Y.ctrl.get();
    const d = deltaE(mine, Y.target);
    let stars = calcStars(d);
    let gain = stars * 10 + Y.combo * 2;
    if (Y.reshow) { gain = Math.ceil(gain * 0.5); stars = Math.max(1, stars - 1); }
    Y.score += gain; Y.combo = stars >= 4 ? Y.combo + 1 : 0;
    Y.reshow = false;
    $('memory-score').textContent = Y.score;
    $('memory-combo').textContent = Y.combo;
    S.stats.games++; save();
    A.sfx('correct'); A.vibrate('success');
    showResult({
      stars, title: stars >= 5 ? '记性真好！' : stars >= 3 ? '还不错' : '再练练', detail: `色差值 ${d.toFixed(1)} · 获得 ${gain} 分`,
      target: Y.target, mine, nextText: '再记一个', onNext: () => { Y.target = null; resetMemory(); }
    });
  });

  /* ================= 玩法五：闯关模式 ================= */
  const Q = { level: 1, stars: 0, type: '', clean: null, locked: false, ctx: {}, timer: null };
  const TOTAL_LEVELS = 12;
  const TYPES = ['mix', 'gradient', 'odd', 'memory'];
  const TYPE_NAMES = { mix: '调色挑战', gradient: '渐变排序', odd: '颜色找不同', memory: '记忆复刻' };
  function startQuest() {
    Q.level = 1; Q.stars = 0;
    go('quest');
    renderQuestLevel();
  }
  function questCleanup() { clearInterval(Q.timer); if (Q.clean) { Q.clean(); Q.clean = null; } }
  function renderQuestLevel() {
    questCleanup();
    const body = $('quest-body');
    body.innerHTML = '';
    Q.locked = false;
    Q.type = TYPES[(Q.level - 1) % 4];
    const lv = Math.min(3, 1 + Math.floor((Q.level - 1) / 4));
    const diff = ['easy', 'normal', 'hard'][lv - 1];
    $('quest-level').textContent = `第 ${Q.level} / ${TOTAL_LEVELS} 关`;
    $('quest-name').textContent = TYPE_NAMES[Q.type];
    $('quest-stars').textContent = `累计 ${Q.stars} 星`;
    $('quest-progress-bar').style.width = ((Q.level - 1) / TOTAL_LEVELS * 100) + '%';
    $('btn-quest-submit').textContent = Q.type === 'memory' ? '开始记忆' : '提交答案';

    if (Q.type === 'mix') {
      const target = genTarget(diff);
      Q.ctx = { target };
      body.innerHTML = `
        <div class="compare-area" style="margin-top:0">
          <div class="compare-item">
            <div class="color-disc" id="q-target" style="background:${rgb(target)}"></div>
            <small>目标色</small><code>RGB ${target.join(',')}</code>
          </div>
          <div class="vs-mark">VS</div>
          <div class="compare-item">
            <div class="color-disc" id="q-current"></div>
            <small>你的颜色</small><code id="q-rgb">RGB 128,128,128</code>
          </div>
        </div>
        <div class="slider-panel" id="q-sliders"></div>`;
      Q.ctx.ctrl = createSliders($('q-sliders'), [128, 128, 128], v => {
        $('q-current').style.background = rgb(v);
        $('q-rgb').textContent = `RGB ${v.join(',')}`;
      });
      $('q-current').style.background = rgb(Q.ctx.ctrl.get());
    } else if (Q.type === 'gradient') {
      const n = diff === 'easy' ? 5 : diff === 'normal' ? 7 : 9;
      const hue = rand(0, 359);
      const colors = [];
      for (let i = 0; i < n; i++) colors.push(hslToRgb(hue, 62, 84 - (i / (n - 1)) * 66));
      const tiles = shuffle(colors.map((c, i) => ({ color: c, correct: i })));
      body.innerHTML = `<div class="instruction">按住色块拖到新位置，按<b>从浅到深</b>排好</div><div class="gradient-board"></div>`;
      Q.ctx = { tiles, sorter: null };
      Q.ctx.sorter = makeSortable(body.querySelector('.gradient-board'), tiles, 190);
    } else if (Q.type === 'odd') {
      const n = diff === 'easy' ? 3 : diff === 'normal' ? 4 : 5;
      const base = [rand(40, 215), rand(40, 215), rand(40, 215)];
      const delta = diff === 'easy' ? 34 : diff === 'normal' ? 20 : 11;
      const odd = rand(0, n * n - 1);
      const cells = [];
      for (let i = 0; i < n * n; i++) {
        const c = base.slice();
        if (i === odd) { const ch = rand(0, 2); c[ch] = clamp(c[ch] + (Math.random() < .5 ? -delta : delta), 0, 255); }
        cells.push(c);
      }
      Q.ctx = { odd, cells };
      body.innerHTML = `<div class="instruction">找出颜色<b>不一样</b>的那一块，点它，再提交</div><div class="odd-board" id="q-board" style="aspect-ratio:1"></div>`;
      $('q-board').style.gridTemplateColumns = `repeat(${n},1fr)`;
      cells.forEach((c, i) => {
        const el = document.createElement('div');
        el.className = 'odd-tile';
        el.style.background = rgb(c);
        el.addEventListener('click', () => {
          Q.ctx.picked = i;
          $$('.odd-tile', $('q-board')).forEach(x => x.style.outline = 'none');
          el.style.outline = '3px solid #6c5ce7';
          A.sfx('click'); A.vibrate('tap');
        });
        $('q-board').appendChild(el);
      });
    } else {
      const target = genTarget(diff);
      Q.ctx = { target, phase: 'idle' };
      body.innerHTML = `
        <div class="memory-stage" style="padding-top:0">
          <div class="color-disc big" id="q-target" style="margin:0 auto"><span class="disc-question">?</span></div>
          <div class="memory-status" id="q-status">点击「开始记忆」</div>
        </div>
        <div class="slider-panel" id="q-sliders"></div>`;
      Q.ctx.ctrl = createSliders($('q-sliders'), [128, 128, 128], v => { if (Q.ctx.phase === 'input') $('q-target').style.background = rgb(v); });
    }
  }
  function enterQuestInput() {
    clearInterval(Q.timer);
    Q.ctx.phase = 'input';
    $('q-target').innerHTML = '<span class="disc-question">?</span>';
    $('q-target').style.background = '#ece9f7';
    $('q-status').textContent = '颜色消失了，用推杆还原';
    $('btn-quest-submit').textContent = '提交答案';
    Q.ctx.ctrl.set([128, 128, 128]);
  }
  $('btn-quest-submit').addEventListener('click', () => {
    if (Q.locked) return;
    if (Q.type === 'memory') {
      if (Q.ctx.phase === 'idle') {
        Q.ctx.phase = 'show';
        const sec = Math.min(3, 1 + Math.floor((Q.level - 1) / 4));
        $('q-target').style.background = rgb(Q.ctx.target);
        $('q-target').innerHTML = '';
        $('q-status').textContent = `记住这个颜色 · ${sec}秒`;
        $('btn-quest-submit').textContent = '记住了，开始还原';
        A.sfx('flash'); A.vibrate('tap'); A.speak('记住这个颜色');
        let left = sec;
        Q.timer = setInterval(() => {
          left--;
          if (left > 0) { $('q-status').textContent = `记住这个颜色 · ${left}秒`; A.sfx('flash'); }
          else enterQuestInput();
        }, 1000);
        return;
      }
      if (Q.ctx.phase === 'show') { enterQuestInput(); return; }
    }
    Q.locked = true;
    let stars = 0, target, mine, detail = '';
    if (Q.type === 'mix') {
      target = Q.ctx.target; mine = Q.ctx.ctrl.get();
      const d = deltaE(mine, target); stars = calcStars(d); detail = `色差值 ${d.toFixed(1)}`;
    } else if (Q.type === 'gradient') {
      const ok = Q.ctx.tiles.every((t, i) => t.correct === i);
      stars = ok ? 6 : 2; target = Q.ctx.tiles[0].color; mine = Q.ctx.tiles[Q.ctx.tiles.length - 1].color;
      detail = ok ? '顺序完全正确' : '顺序还有错误';
    } else if (Q.type === 'odd') {
      const ok = Q.ctx.picked === Q.ctx.odd;
      stars = ok ? 6 : 2; target = Q.ctx.cells[Q.ctx.odd]; mine = target;
      detail = ok ? '找对了！' : '这次找错了';
    } else {
      target = Q.ctx.target; mine = Q.ctx.ctrl.get();
      const d = deltaE(mine, target); stars = calcStars(d); detail = `色差值 ${d.toFixed(1)}`;
    }
    Q.stars += stars;
    S.stats.totalStars = Math.max(S.stats.totalStars, Q.stars);
    S.stats.games++; save();
    if (stars >= 5) { A.sfx('correct'); A.vibrate('success'); }
    else { A.sfx('wrong'); A.vibrate('fail'); }
    const last = Q.level >= TOTAL_LEVELS;
    showResult({
      stars, title: last ? '闯关完成！' : stars >= 5 ? '过关！' : '继续加油',
      detail: `${detail} · 累计 ${Q.stars} 星`, target, mine,
      nextText: last ? '查看成绩' : '下一关',
      onNext: () => {
        if (last) {
          S.stats.level = Math.max(S.stats.level, TOTAL_LEVELS); save();
          A.sfx('levelup'); A.vibrate('level');
          go('home'); toast(`闯关完成！共获得 ${Q.stars} 星`);
        } else { Q.level++; renderQuestLevel(); }
      }
    });
  });
  $('btn-quest-quit').addEventListener('click', () => { A.sfx('click'); go('home'); });

  /* ================= 难度按钮 ================= */
  $$('.diff-row').forEach(row => {
    $$('.diff-btn', row).forEach(btn => btn.addEventListener('click', () => {
      A.sfx('click');
      $$('.diff-btn', row).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const group = row.dataset.group, d = btn.dataset.diff;
      if (group === 'mix') { M.diff = d; newMixTarget(); }
      if (group === 'gradient') { G.diff = d; newGradient(); }
      if (group === 'odd') { O.diff = d; newOdd(); }
      if (group === 'memory') { Y.diff = d; resetMemory(); }
    }));
  });

  /* ================= 设置 ================= */
  function openSettings() {
    $('set-music').checked = S.settings.music;
    $('set-sound').checked = S.settings.sound;
    $('set-vibrate').checked = S.settings.vibrate;
    $('set-speech').checked = S.settings.speech;
    $$('.song-picker button').forEach(b => b.classList.toggle('active', !A.customMode && +b.dataset.song === (S.settings.song || 0)));
    $('settings-overlay').classList.add('show');
    A.sfx('click');
  }
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-close-settings').addEventListener('click', () => { $('settings-overlay').classList.remove('show'); A.sfx('click'); });
  $('settings-overlay').addEventListener('click', e => { if (e.target === $('settings-overlay')) $('settings-overlay').classList.remove('show'); });
  ['music', 'sound', 'vibrate', 'speech'].forEach(k => {
    $('set-' + k).addEventListener('change', e => {
      S.settings[k] = e.target.checked; save();
      A.applySettings(S.settings);
      if (k === 'vibrate' && e.target.checked) A.vibrate('tap');
    });
  });
  $$('.song-picker button').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.song;
    S.settings.song = i; save();
    A.init(); A.setSong(i); A.startMusic();
    $$('.song-picker button').forEach(x => x.classList.toggle('active', x === b));
    A.sfx('click');
    toast('已切换音乐：' + A.getSongName());
  }));
  $('set-custom-music').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (window.__musicUrl) URL.revokeObjectURL(window.__musicUrl);
    window.__musicUrl = URL.createObjectURL(f);
    A.init(); A.setCustomMusic(window.__musicUrl);
    $$('.song-picker button').forEach(x => x.classList.remove('active'));
    toast('已播放你的音乐：' + f.name);
  });
  $('btn-clear-music').addEventListener('click', () => {
    A.clearCustomMusic();
    if (window.__musicUrl) { URL.revokeObjectURL(window.__musicUrl); window.__musicUrl = null; }
    A.setSong(S.settings.song || 0);
    if (S.settings.music) A.startMusic();
    $$('.song-picker button').forEach(b => b.classList.toggle('active', +b.dataset.song === (S.settings.song || 0)));
    toast('已恢复内置音乐');
  });
  $('btn-reset-data').addEventListener('click', () => {
    if (confirm('确定清除所有成绩记录吗？此操作不可恢复。')) {
      S.stats = JSON.parse(JSON.stringify(DEFAULTS.stats)); save(); refreshHome();
      toast('成绩已清空');
    }
  });

  function refreshHome() {
    $('stat-best').textContent = S.stats.totalStars;
    $('stat-level').textContent = S.stats.level;
    $('stat-games').textContent = S.stats.games;
  }

  /* ================= 启动 ================= */
  A.applySettings(S.settings);
  refreshHome();
  // 首次交互后初始化音频（浏览器策略要求）
  const unlock = () => { A.init(); if (S.settings.music) A.startMusic(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);
  // 注册 Service Worker（PWA 离线可用）
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
