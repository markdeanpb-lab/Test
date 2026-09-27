// Page player: draws the film's frames to a canvas, plays the score live, and offers play/pause,
// scrubbing, chapters, mute and fullscreen. `?render` turns it into a frame/audio source for
// tools/render-video.mjs instead.
'use strict';
(() => {
  const { W, H } = PX;
  const canvas = document.getElementById('screen');
  const g = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  const img = g.createImageData(W, H);
  const bytes = new Uint8ClampedArray(PX.main.buf.buffer);
  const blit = () => { img.data.set(bytes); g.putImageData(img, 0, 0); };
  const events = AUDIO.buildEvents(STORY.cues, STORY.ambs, STORY.duration).filter((e) => e.v > 0.001);
  const dur = STORY.duration;
  const chapterAt = (t) => { let i = 0; STORY.chapters.forEach((c, k) => { if (c.start <= t + 1e-6) i = k; }); return i; };
  const params = new URLSearchParams(location.search);

  // ---------- render mode (used by the video exporter) ----------
  if (params.has('render')) {
    document.body.classList.add('render');
    const b64 = (u8) => {
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    };
    let audioBytes = null;
    window.RENDER = {
      duration: dur, W, H, shots: STORY.shots.map((s) => [s.start, s.d]),
      frames(start, count, fps) {
        const out = new Uint8Array(W * H * 4 * count);
        for (let k = 0; k < count; k++) {
          FILM.render((start + k) / fps);
          out.set(bytes, k * W * H * 4);
        }
        blit();
        return b64(out);
      },
      async renderAudio(sampleRate = 44100) {
        const buf = await AUDIO.renderOffline(events, dur, sampleRate);
        const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)];
        const wav = new DataView(new ArrayBuffer(44 + n * 4));
        const str = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
        wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true); wav.setUint32(24, sampleRate, true);
        wav.setUint32(28, sampleRate * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); str(36, 'data'); wav.setUint32(40, n * 4, true);
        let peak = 0;
        for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
          const v = Math.max(-1, Math.min(1, ch[c][i]));
          peak = Math.max(peak, Math.abs(v));
          wav.setInt16(44 + i * 4 + c * 2, v * 32767, true);
        }
        audioBytes = new Uint8Array(wav.buffer);
        return { bytes: audioBytes.length, peak };
      },
      audioChunk(i, size) { return b64(audioBytes.subarray(i * size, (i + 1) * size)); },
    };
    FILM.render(+(params.get('t') || 0));
    blit();
    return;
  }

  // ---------- interactive player ----------
  const $ = (id) => document.getElementById(id);
  const playBtn = $('play'), bigPlay = $('bigplay'), seek = $('seek'), timeEl = $('time'), chap = $('chapter'), muteBtn = $('mute'), fsBtn = $('fs'), chapList = $('chapters');
  const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  seek.max = String(dur);
  let playing = false, t = +(params.get('t') || 0), last = 0, muted = false, ctx = null;
  try { muted = localStorage.getItem('longrun-muted') === '1'; } catch (e) { /* storage blocked */ }
  const player = AUDIO.LivePlayer(events);

  STORY.chapters.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span>${fmtT(s.start)}</span>${s.name}`;
    b.addEventListener('click', () => { setTime(s.start + 0.001); if (!playing) play(); });
    chapList.appendChild(b);
    s.btn = b;
    void i;
  });
  function ensureCtx() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  function startAudio() { if (playing && !muted && ctx) player.start(ctx, t); }
  function play() {
    if (t >= dur - 0.05) t = 0;
    ensureCtx();
    playing = true; last = performance.now();
    startAudio();
    bigPlay.hidden = true;
    playBtn.textContent = '❚❚'; playBtn.setAttribute('aria-label', 'Pause');
  }
  function pause() {
    playing = false; player.stop();
    playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Play');
  }
  function setTime(v) {
    t = Math.max(0, Math.min(dur - 0.01, v));
    if (playing) { player.stop(); startAudio(); }
    last = performance.now();
  }
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('longrun-muted', m ? '1' : '0'); } catch (e) { /* storage blocked */ }
    muteBtn.textContent = m ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
    if (m) player.stop(); else { ensureCtx(); startAudio(); }
  }
  playBtn.addEventListener('click', () => (playing ? pause() : play()));
  bigPlay.addEventListener('click', play);
  canvas.addEventListener('click', () => (playing ? pause() : play()));
  seek.addEventListener('input', () => setTime(+seek.value));
  muteBtn.addEventListener('click', () => setMuted(!muted));
  fsBtn.addEventListener('click', () => {
    const el = $('stage');
    if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen();
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
    else if (e.code === 'ArrowRight') setTime(t + 5);
    else if (e.code === 'ArrowLeft') setTime(t - 5);
    else if (e.key === 'm' || e.key === 'M') setMuted(!muted);
    else if (e.key === 'f' || e.key === 'F') fsBtn.click();
  });
  setMuted(muted);

  let lastScene = -1;
  function frame(now) {
    if (playing) {
      if (!muted && player.ctx && ctx && ctx.state === 'running') { t = player.time(); player.pump(); }
      else t += Math.min(0.1, (now - last) / 1000);
      last = now;
      if (t >= dur) { t = dur - 0.01; pause(); }
    }
    FILM.render(t);
    blit();
    const i = chapterAt(t);
    if (document.activeElement !== seek) seek.value = String(t);
    timeEl.textContent = `${fmtT(t)} / ${fmtT(dur)}`;
    if (i !== lastScene) {
      chap.textContent = STORY.chapters[i].name;
      STORY.chapters.forEach((s, k) => s.btn.classList.toggle('on', k === i));
      lastScene = i;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
