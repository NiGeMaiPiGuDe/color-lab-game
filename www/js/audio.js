/* ============ 音频引擎 v3 ============
   柔和冒险风原创音乐：主旋律(三角波+正弦泛音) + 拨弦琶音 + 贝斯 + 轻鼓
   三首曲目可切换，带轻微延迟混响，音色不刺耳
   全部由 Web Audio API 实时合成，无任何第三方版权素材
   ================================= */
(function (global) {
  'use strict';

  function noteFreq(name) {
    if (!name) return 0;
    const m = /^([A-G])(#|b)?(\d)$/.exec(name);
    if (!m) return 0;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    let semi = base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /* 每首曲子 8 小节 × 16 步 = 128 步。melody: [起始步, 音名, 持续步数] */
  const SONGS = [
    {
      name: '晨光冒险', bpm: 122,
      chords: [
        ['C4','E4','G4'], ['A3','C4','E4'], ['F3','A3','C4'], ['G3','B3','D4'],
        ['C4','E4','G4'], ['F3','A3','C4'], ['A3','C4','E4'], ['G3','B3','D4']
      ],
      bass: ['C3','A2','F2','G2','C3','F2','A2','G2'],
      melody: [
        [0,'C5',2],[2,'E5',2],[4,'G5',4],[8,'E5',2],[10,'G5',2],[12,'A5',4],
        [16,'G5',2],[18,'E5',2],[20,'D5',4],[24,'E5',2],[26,'G5',2],[28,'C5',4],
        [32,'F5',2],[34,'A5',2],[36,'G5',4],[40,'E5',2],[42,'F5',2],[44,'G5',4],
        [48,'A5',2],[50,'G5',2],[52,'E5',4],[56,'D5',2],[58,'E5',2],[60,'G5',4],
        [64,'C5',2],[66,'E5',2],[68,'G5',4],[72,'C6',4],[76,'G5',4],
        [80,'A5',2],[82,'G5',2],[84,'F5',4],[88,'E5',2],[90,'G5',2],[92,'E5',4],
        [96,'D5',2],[98,'F5',2],[100,'A5',4],[104,'G5',2],[106,'E5',2],[108,'D5',4],
        [112,'E5',2],[114,'G5',2],[116,'C6',4],[120,'G5',4],[124,'E5',4]
      ]
    },
    {
      name: '糖果乐园', bpm: 106,
      chords: [
        ['F4','A4','C5'], ['D4','F4','A4'], ['A#3','D4','F4'], ['C4','E4','G4'],
        ['F4','A4','C5'], ['A#3','D4','F4'], ['D4','F4','A4'], ['C4','E4','G4']
      ],
      bass: ['F2','D2','A#2','C2','F2','A#2','D2','C2'],
      melody: [
        [0,'F5',2],[2,'A5',2],[4,'C6',4],[8,'A5',2],[10,'F5',2],[12,'G5',4],
        [16,'A5',2],[18,'C6',2],[20,'D6',4],[24,'C6',2],[26,'A5',2],[28,'F5',4],
        [32,'G5',2],[34,'A5',2],[36,'C6',4],[40,'A5',2],[42,'G5',2],[44,'F5',4],
        [48,'E5',2],[50,'G5',2],[52,'A5',4],[56,'G5',2],[58,'E5',2],[60,'D5',4],
        [64,'F5',2],[66,'A5',2],[68,'C6',4],[72,'F6',4],[76,'C6',4],
        [80,'D6',2],[82,'C6',2],[84,'A5',4],[88,'G5',2],[90,'A5',2],[92,'C6',4],
        [96,'A5',2],[98,'G5',2],[100,'F5',4],[104,'A5',2],[106,'C6',2],[108,'A5',4],
        [112,'G5',2],[114,'A5',2],[116,'F5',4],[120,'C5',4],[124,'F5',4]
      ]
    },
    {
      name: '星空航行', bpm: 114,
      chords: [
        ['A3','C4','E4'], ['C4','E4','G4'], ['F3','A3','C4'], ['G3','B3','D4'],
        ['A3','C4','E4'], ['F3','A3','C4'], ['C4','E4','G4'], ['G3','B3','D4']
      ],
      bass: ['A2','C2','F2','G2','A2','F2','C2','G2'],
      melody: [
        [0,'A4',4],[4,'C5',2],[6,'E5',2],[8,'G5',4],[12,'E5',4],
        [16,'D5',2],[18,'E5',2],[20,'G5',4],[24,'A5',4],[28,'G5',4],
        [32,'E5',2],[34,'G5',2],[36,'A5',4],[40,'C6',4],[44,'A5',4],
        [48,'G5',2],[50,'E5',2],[52,'D5',4],[56,'E5',4],[60,'G5',4],
        [64,'A4',4],[68,'C5',2],[70,'E5',2],[72,'A5',4],[76,'E5',4],
        [80,'F5',2],[82,'G5',2],[84,'A5',4],[88,'G5',2],[90,'E5',2],[92,'D5',4],
        [96,'C5',2],[98,'E5',2],[100,'G5',4],[104,'E5',2],[106,'D5',2],[108,'C5',4],
        [112,'E5',2],[114,'G5',2],[116,'A5',4],[120,'E5',4],[124,'A4',4]
      ]
    }
  ];
  const LOOP_STEPS = 128;

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.musicOn = true;
      this.soundOn = true;
      this.vibrateOn = true;
      this.speechOn = true;
      this.musicTimer = null;
      this.step = 0;
      this.nextNoteTime = 0;
      this.songIndex = 0;
      this.loops = 0;
      this.noiseBuf = null;
      this.customMode = false;
      this.customAudio = null;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.7 : 0;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.soundOn ? 0.5 : 0;
      this.sfxGain.connect(this.master);

      // 轻微延迟混响，让声音不干涩
      const delay = this.ctx.createDelay(1.0);
      delay.delayTime.value = 0.21;
      const fb = this.ctx.createGain(); fb.gain.value = 0.2;
      const wet = this.ctx.createGain(); wet.gain.value = 0.16;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      this.musicGain.connect(delay);
      delay.connect(lp); lp.connect(fb); fb.connect(delay);
      lp.connect(wet); wet.connect(this.master);

      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }

    /* 柔和音符：三角波主音 + 正弦八度泛音，带低通 */
    tone(freq, dur, opts) {
      if (!this.ctx || !freq) return;
      opts = opts || {};
      const t = opts.when || this.ctx.currentTime;
      const bus = opts.bus || this.sfxGain;
      const g = this.ctx.createGain();
      const vol = opts.vol == null ? 0.15 : opts.vol;
      const atk = opts.attack == null ? 0.02 : opts.attack;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = opts.cutoff || 2600;
      g.connect(lp); lp.connect(bus);

      const osc = this.ctx.createOscillator();
      osc.type = opts.type || 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
      osc.connect(g);
      osc.start(t); osc.stop(t + dur + 0.04);

      if (opts.harmony) {
        const o2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(freq * (opts.harmonyRatio || 2), t);
        g2.gain.setValueAtTime(vol * opts.harmony, t);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o2.connect(g2); g2.connect(lp);
        o2.start(t); o2.stop(t + dur + 0.04);
      }
    }

    noise(dur, opts) {
      if (!this.ctx || !this.noiseBuf) return;
      opts = opts || {};
      const t = opts.when || this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = opts.filter || 'highpass';
      filter.frequency.value = opts.freq || 3000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(opts.vol == null ? 0.08 : opts.vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter); filter.connect(g); g.connect(opts.bus || this.sfxGain);
      src.start(t); src.stop(t + dur + 0.02);
    }

    kick(t, vol) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(vol || 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(t); osc.stop(t + 0.16);
    }

    setSong(i) {
      this.clearCustomMusic();
      this.songIndex = ((i % SONGS.length) + SONGS.length) % SONGS.length;
      this.step = 0; this.loops = 0;
      if (this.ctx) this.nextNoteTime = this.ctx.currentTime + 0.1;
    }
    getSongName() { return this.customMode ? '我的音乐' : SONGS[this.songIndex].name; }

    /* 导入用户自己的音乐（零版权问题），替代内置合成音乐 */
    setCustomMusic(url) {
      this.stopMusic();
      if (!this.customAudio) {
        this.customAudio = new Audio();
        this.customAudio.loop = true;
        this.customAudio.volume = 0.55;
      }
      this.customAudio.src = url;
      this.customMode = true;
      if (this.musicOn) this.customAudio.play().catch(() => {});
    }
    clearCustomMusic() {
      if (this.customAudio) { this.customAudio.pause(); this.customAudio.src = ''; }
      this.customMode = false;
    }

    startMusic() {
      if (!this.ctx || this.musicTimer || this.customMode) return;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      const schedule = () => {
        if (!this.ctx) return;
        const song = SONGS[this.songIndex];
        const stepDur = 60 / song.bpm / 4;
        while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
          this.scheduleStep(this.step, this.nextNoteTime, song, stepDur);
          this.nextNoteTime += stepDur;
          this.step++;
          if (this.step >= LOOP_STEPS) {
            this.step = 0; this.loops++;
            if (this.loops >= 2) { this.loops = 0; this.songIndex = (this.songIndex + 1) % SONGS.length; }
          }
        }
      };
      schedule();
      this.musicTimer = setInterval(schedule, 45);
    }

    stopMusic() {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    }

    scheduleStep(step, t, song, stepDur) {
      const bus = this.musicGain;
      const bar = Math.floor(step / 16);
      const inBar = step % 16;
      const chord = song.chords[bar];

      // 主旋律：柔和三角波 + 一点正弦泛音
      for (const ev of song.melody) {
        if (ev[0] === step) {
          this.tone(noteFreq(ev[1]), stepDur * ev[2] * 0.92,
            { type: 'triangle', vol: 0.11, harmony: 0.22, when: t, bus, cutoff: 2800, attack: 0.025 });
        }
      }
      // 拨弦琶音：每两拍一个，轻快但不吵
      if (inBar % 2 === 0) {
        const idx = [0,1,2,1,0,2,1,2][(inBar / 2) % 8];
        this.tone(noteFreq(chord[idx]), stepDur * 1.4,
          { type: 'sine', vol: 0.055, when: t, bus, cutoff: 3200, attack: 0.006 });
      }
      // 贝斯
      if (inBar % 4 === 0) {
        this.tone(noteFreq(song.bass[bar]), stepDur * 3.4,
          { type: 'triangle', vol: 0.085, when: t, bus, cutoff: 700, attack: 0.015 });
      }
      // 很轻的鼓点
      if (inBar === 0 || inBar === 8) this.kick(t, 0.13);
      if (inBar === 4 || inBar === 12) this.noise(0.08, { filter: 'bandpass', freq: 1500, vol: 0.05, when: t, bus });
      if (inBar % 4 === 2) this.noise(0.02, { filter: 'highpass', freq: 8000, vol: 0.018, when: t, bus });
    }

    /* ---- 音效 ---- */
    sfx(name) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      switch (name) {
        case 'click':
          this.tone(740, 0.07, { type: 'triangle', vol: 0.12 }); break;
        case 'slide':
          this.tone(520, 0.035, { type: 'sine', vol: 0.035 }); break;
        case 'correct':
          [523.25, 659.25, 783.99].forEach((f, i) =>
            this.tone(f, 0.2, { type: 'triangle', vol: 0.13, harmony: 0.2, when: t + i * 0.085 })); break;
        case 'wrong':
          this.tone(300, 0.22, { type: 'triangle', vol: 0.13, slideTo: 150 }); break;
        case 'penalty':
          this.tone(420, 0.42, { type: 'sawtooth', vol: 0.14, slideTo: 90, cutoff: 1600 });
          this.tone(210, 0.45, { type: 'square', vol: 0.08, slideTo: 70, cutoff: 900 });
          this.noise(0.25, { filter: 'lowpass', freq: 900, vol: 0.11 }); break;
        case 'star':
          this.tone(1046.5, 0.13, { type: 'triangle', vol: 0.12 });
          this.tone(1567.98, 0.18, { type: 'triangle', vol: 0.09, when: t + 0.06 }); break;
        case 'flash':
          this.tone(880, 0.11, { type: 'sine', vol: 0.1 }); break;
        case 'levelup':
          [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
            this.tone(f, 0.19, { type: 'triangle', vol: 0.12, when: t + i * 0.085 })); break;
        case 'swap':
          this.tone(600, 0.06, { type: 'sine', vol: 0.055 }); break;
      }
    }

    vibrate(pattern) {
      if (!this.vibrateOn) return;
      const name = typeof pattern === 'string' ? pattern : 'tap';
      // APK 中优先走原生震动（Capacitor 插件），稳定可靠
      const NV = global.NativeVibrator;
      if (NV && typeof NV.vibrate === 'function') {
        NV.vibrate({ pattern: name }).catch(() => {});
        return;
      }
      if (!navigator.vibrate) return;
      const presets = {
        tap: 18, step: 10,
        success: [40, 35, 70],
        fail: [110, 60, 110, 60, 180],
        penalty: [140, 55, 140, 55, 260],
        star: 28,
        level: [45, 45, 45, 45, 180]
      };
      try { navigator.vibrate(presets[name] || presets.tap); } catch (e) {}
    }

    speak(text) {
      if (!this.speechOn || !global.speechSynthesis) return;
      global.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 0.95; u.pitch = 1.1;
      global.speechSynthesis.speak(u);
    }

    applySettings(s) {
      this.musicOn = s.music; this.soundOn = s.sound;
      this.vibrateOn = s.vibrate; this.speechOn = s.speech;
      if (typeof s.song === 'number') this.setSong(s.song);
      if (this.musicGain) this.musicGain.gain.setTargetAtTime(s.music ? 0.7 : 0, this.ctx.currentTime, 0.1);
      if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(s.sound ? 0.5 : 0, this.ctx.currentTime, 0.1);
      if (this.customAudio) {
        if (s.music && this.customMode) this.customAudio.play().catch(() => {});
        else this.customAudio.pause();
      }
      if (s.music) this.startMusic(); else this.stopMusic();
    }
  }

  global.AudioEngine = AudioEngine;
})(window);
