(() => {
  'use strict';
  const KEY = 'narratore.sentences';
  const PAUSE_KEY = 'narratore.pause';
  const $ = (id) => document.getElementById(id);
  const form = $('form'), text = $('text'), list = $('list'), empty = $('empty'),
        playAll = $('playAll'), stopAll = $('stopAll'),
        pause = $('pause'), pauseVal = $('pauseVal');

  const synth = window.speechSynthesis;
  if (!synth) $('warn').hidden = false;

  let sentences = [];
  try { sentences = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
  let nextId = sentences.reduce((m, s) => Math.max(m, s.id), 0) + 1;

  let playingId = null;   // sentence being spoken right now
  let lastId = null;      // last played sentence, stays highlighted
  let queueToken = 0;     // invalidates a running "play all" queue
  let allRunning = false; // "play all" queue is active
  let allPaused = false;  // ...and paused

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(sentences)); } catch (e) {} };

  // ---- pause between sentences (slider) ----
  try { const p = Number(localStorage.getItem(PAUSE_KEY)); if (p >= 1 && p <= 10) pause.value = p; } catch (e) {}
  const showPause = () => { pauseVal.textContent = pause.value + ' s'; };
  showPause();
  pause.addEventListener('input', () => {
    showPause();
    try { localStorage.setItem(PAUSE_KEY, pause.value); } catch (e) {}
  });
  const pauseMs = () => Number(pause.value) * 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- text handling ----
  // Split text into sentences: by new lines and after . ! ? …
  function split(raw) {
    return raw.split(/\n+/)
      .flatMap((line) => line.match(/[^.!?…]+[.!?…]*/g) || [])
      .map((s) => s.trim())
      .filter((s) => /[\p{L}\p{N}]/u.test(s));
  }

  function italianVoice() {
    const voices = synth.getVoices();
    return voices.find((v) => v.lang.replace('_', '-').toLowerCase() === 'it-it')
        || voices.find((v) => v.lang.toLowerCase().startsWith('it'));
  }

  function speak(s) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(s.text);
      u.lang = 'it-IT';
      const v = italianVoice();
      if (v) u.voice = v;
      u.onend = u.onerror = () => resolve();
      synth.speak(u);
    });
  }

  // ---- UI state ----
  function updateUI() {
    for (const li of list.children) {
      const id = Number(li.dataset.id);
      const active = id === playingId;
      li.classList.toggle('last', id === lastId);
      const btn = li.querySelector('.play');
      btn.textContent = active ? '■' : '▶';
      btn.setAttribute('aria-label', active ? 'Ferma' : 'Riproduci frase');
    }
    playAll.textContent = !allRunning ? '▶ Riproduci tutto' : allPaused ? '▶ Riprendi' : '⏸ Pausa';
    stopAll.disabled = !allRunning && playingId === null;
  }

  function setPlaying(id) {
    playingId = id;
    if (id !== null) lastId = id;
    updateUI();
  }

  // ---- playback control ----
  function stop() {
    queueToken++;
    allRunning = false;
    allPaused = false;
    playingId = null;
    if (synth) { synth.cancel(); synth.resume(); }
    updateUI();
  }

  async function playOne(s) {
    if (!synth) return;
    stop();
    const token = queueToken;
    setPlaying(s.id);
    await speak(s);
    if (token === queueToken) setPlaying(null);
  }

  // wait for the pause between sentences; the countdown halts while paused
  async function gap(token) {
    let left = pauseMs();
    while (left > 0 && token === queueToken) {
      await sleep(100);
      if (!allPaused) left -= 100;
    }
  }

  async function waitWhilePaused(token) {
    while (allPaused && token === queueToken) await sleep(100);
  }

  async function playEverything() {
    if (!synth) return;
    stop();
    const token = queueToken;
    allRunning = true;
    updateUI();
    const items = [...sentences];
    for (let i = 0; i < items.length; i++) {
      await waitWhilePaused(token);
      if (token !== queueToken) return;
      setPlaying(items[i].id);
      await speak(items[i]);
      if (token !== queueToken) return;
      if (i < items.length - 1) {
        setPlaying(null);
        await gap(token);
        if (token !== queueToken) return;
      }
    }
    allRunning = false;
    setPlaying(null);
  }

  function togglePauseAll() {
    if (!allRunning) return;
    if (allPaused) {
      allPaused = false;
      synth.resume();
    } else {
      allPaused = true;
      if (synth.speaking) synth.pause();
    }
    updateUI();
  }

  function remove(id) {
    if (playingId === id) stop();
    if (lastId === id) lastId = null;
    sentences = sentences.filter((s) => s.id !== id);
    save();
    render();
  }

  function render() {
    list.textContent = '';
    for (const s of sentences) {
      const li = document.createElement('li');
      li.dataset.id = s.id;

      const play = document.createElement('button');
      play.type = 'button'; play.className = 'icon play';
      play.onclick = () => (playingId === s.id ? stop() : playOne(s));

      const span = document.createElement('span');
      span.className = 'txt'; span.textContent = s.text;

      const del = document.createElement('button');
      del.type = 'button'; del.className = 'icon del'; del.textContent = '✕';
      del.setAttribute('aria-label', 'Elimina frase');
      del.onclick = () => remove(s.id);

      li.append(play, span, del);
      list.append(li);
    }
    empty.hidden = sentences.length > 0;
    $('controls').hidden = sentences.length === 0;
    playAll.hidden = stopAll.hidden = !synth;
    updateUI();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const parts = split(text.value);
    if (!parts.length) return;
    for (const t of parts) sentences.push({ id: nextId++, text: t });
    save();
    text.value = '';
    render();
    text.focus();
  });

  // Ctrl/Cmd+Enter submits
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
  });

  $('clearAll').addEventListener('click', () => {
    if (!sentences.length || !confirm('Eliminare tutte le frasi?')) return;
    stop();
    sentences = [];
    lastId = null;
    save();
    render();
  });

  playAll.addEventListener('click', () => (allRunning ? togglePauseAll() : playEverything()));
  stopAll.addEventListener('click', stop);

  // Voices load asynchronously in some browsers
  if (synth) {
    const checkVoice = () => { $('noit').hidden = synth.getVoices().length === 0 || !!italianVoice(); };
    synth.addEventListener('voiceschanged', checkVoice);
    checkVoice();
  }

  render();
})();
