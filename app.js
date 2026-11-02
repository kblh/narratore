(() => {
  'use strict';
  const KEY = 'narratore.sentences';
  const $ = (id) => document.getElementById(id);
  const form = $('form'), text = $('text'), list = $('list'),
        empty = $('empty'), playAll = $('playAll');

  const synth = window.speechSynthesis;
  if (!synth) $('warn').hidden = false;

  let sentences = [];
  try { sentences = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
  let nextId = sentences.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  let playingId = null;
  let queueToken = 0; // invalidates running "play all" queue

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(sentences)); } catch (e) {} };

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

  function stop() {
    queueToken++;
    if (synth) synth.cancel();
    setPlaying(null);
    playAll.textContent = '▶ Riproduci tutto';
  }

  function setPlaying(id) {
    playingId = id;
    for (const li of list.children) {
      const on = Number(li.dataset.id) === id;
      li.classList.toggle('playing', on);
      const btn = li.querySelector('.icon:not(.del)');
      btn.textContent = on ? '■' : '▶';
      btn.setAttribute('aria-label', on ? 'Ferma' : 'Riproduci frase');
    }
  }

  async function playOne(s) {
    if (!synth) return;
    stop();
    const token = queueToken;
    setPlaying(s.id);
    await speak(s);
    if (token === queueToken) setPlaying(null);
  }

  const PAUSE_MS = 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setPlayAllRunning(on) {
    playAll.textContent = on ? '■ Ferma' : '▶ Riproduci tutto';
  }

  async function playEverything() {
    if (!synth) return;
    stop();
    const token = queueToken;
    setPlayAllRunning(true);
    const items = [...sentences];
    for (let i = 0; i < items.length; i++) {
      if (token !== queueToken) return;
      setPlaying(items[i].id);
      await speak(items[i]);
      if (token !== queueToken) return;
      if (i < items.length - 1) {
        setPlaying(null);
        await sleep(PAUSE_MS);
      }
    }
    if (token === queueToken) { setPlaying(null); setPlayAllRunning(false); }
  }

  function remove(id) {
    if (playingId === id) stop();
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
      play.type = 'button'; play.className = 'icon'; play.textContent = '▶';
      play.setAttribute('aria-label', 'Riproduci frase');
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
    $('actions').hidden = sentences.length === 0;
    playAll.hidden = !synth;
    setPlaying(playingId);
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
    save();
    render();
  });

  playAll.addEventListener('click', () => {
    if (playAll.textContent.includes('Ferma')) stop();
    else playEverything();
  });

  // Voices load asynchronously in some browsers
  if (synth) {
    const checkVoice = () => { $('noit').hidden = synth.getVoices().length === 0 || !!italianVoice(); };
    synth.addEventListener('voiceschanged', checkVoice);
    checkVoice();
  }

  render();
})();
