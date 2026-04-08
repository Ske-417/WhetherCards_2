const STORAGE_KEYS = {
  settings: 'app.settings',
  location: 'app.location',
  weatherCache: 'app.weatherCache',
  refreshTs: 'app.refreshTs',
};

const TOKYO = { lat: 35.6764, lon: 139.65, label: 'Tokyo' };
const ENCOURAGE = [
  '今日もゆっくり、あなたのペースで。',
  '小さな一歩が、ちゃんと前進です。',
  '無理せず、深呼吸していきましょう。',
  'あなたの今日に、やさしい追い風を。',
  'うまくいく日も、休む日もどちらも大切。',
  '焦らなくて大丈夫、順調です。',
  '少しでも笑顔になれますように。',
  'あなたは十分がんばっています。',
  '今の一枚が、今日のヒントになりますように。',
  '今日もきっと、いい一日になります。',
];

const weatherCategory = (code) => {
  if ([0, 1].includes(code)) return 'sun';
  if ([2, 3, 45, 48].includes(code)) return 'cloud';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  return 'rain';
};

const icons = {
  sun: '☀️',
  cloud: '☁️',
  rain: '🌧️',
  snow: '❄️',
};

const state = {
  settings: load(STORAGE_KEYS.settings, { unit: 'C', fontScale: 1 }),
  location: load(STORAGE_KEYS.location, TOKYO),
  weather: null,
  drawn: false,
  dismissedCount: 0,
};

const dom = {
  dateLabel: document.getElementById('dateLabel'),
  stack: document.getElementById('stack'),
  refreshBtn: document.getElementById('refreshBtn'),
  overlay: document.getElementById('overlay'),
  encourageText: document.getElementById('encourageText'),
  offlineBadge: document.getElementById('offlineBadge'),
  errorPanel: document.getElementById('errorPanel'),
  errorMessage: document.getElementById('errorMessage'),
  retryBtn: document.getElementById('retryBtn'),
  settingsDialog: document.getElementById('settingsDialog'),
  helpDialog: document.getElementById('helpDialog'),
  unitSelect: document.getElementById('unitSelect'),
  fontScale: document.getElementById('fontScale'),
  manualLocation: document.getElementById('manualLocation'),
  locationCandidates: document.getElementById('locationCandidates'),
};

init();

async function init() {
  updateDate();
  applySettings();
  bindUi();
  await ensureLocation();
  await fetchWeatherAndRender();
  window.addEventListener('offline', () => dom.offlineBadge.classList.remove('hidden'));
  window.addEventListener('online', () => dom.offlineBadge.classList.add('hidden'));
}

function bindUi() {
  document.getElementById('openSettings').onclick = () => {
    dom.unitSelect.value = state.settings.unit;
    dom.fontScale.value = state.settings.fontScale;
    dom.settingsDialog.showModal();
  };
  document.getElementById('closeSettings').onclick = () => dom.settingsDialog.close();
  document.getElementById('openHelp').onclick = () => dom.helpDialog.showModal();
  document.getElementById('closeHelp').onclick = () => dom.helpDialog.close();

  dom.refreshBtn.onclick = async () => {
    const last = Number(localStorage.getItem(STORAGE_KEYS.refreshTs) || '0');
    if (Date.now() - last < 60000) return;
    localStorage.setItem(STORAGE_KEYS.refreshTs, String(Date.now()));
    await fetchWeatherAndRender(true);
  };

  dom.retryBtn.onclick = () => fetchWeatherAndRender(true);
  dom.overlay.onclick = () => {
    dom.overlay.classList.add('hidden');
    state.dismissedCount = 0;
    renderCards(state.weather.hours);
  };

  dom.unitSelect.onchange = () => {
    state.settings.unit = dom.unitSelect.value;
    save(STORAGE_KEYS.settings, state.settings);
    renderCards(state.weather?.hours || []);
  };
  dom.fontScale.oninput = () => {
    state.settings.fontScale = Number(dom.fontScale.value);
    save(STORAGE_KEYS.settings, state.settings);
    applySettings();
  };

  document.getElementById('clearData').onclick = () => {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    location.reload();
  };

  document.getElementById('searchLocation').onclick = searchLocation;
}

async function ensureLocation() {
  if (state.location && state.location.lat && state.location.lon) return;
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
    );
    state.location = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      label: 'GPS',
    };
  } catch {
    state.location = TOKYO;
  }
  save(STORAGE_KEYS.location, state.location);
}

async function fetchWeatherAndRender(force = false) {
  dom.errorPanel.classList.add('hidden');
  const today = ymd(new Date());
  const cache = load(STORAGE_KEYS.weatherCache, null);
  if (!force && cache?.date === today) {
    state.weather = cache;
    renderCards(cache.hours);
    return;
  }

  try {
    const hours = await fetchWeather(state.location, 1);
    state.weather = { date: today, hours };
    save(STORAGE_KEYS.weatherCache, state.weather);
    renderCards(hours);
  } catch {
    if (cache?.hours) {
      dom.offlineBadge.classList.remove('hidden');
      state.weather = cache;
      renderCards(cache.hours);
    } else {
      dom.errorMessage.textContent = '天気の取得に失敗しました。';
      dom.errorPanel.classList.remove('hidden');
    }
  }
}

async function fetchWeather(location, retry = 1) {
  const now = new Date();
  const hourIndex = now.getHours();
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    hourly: 'weathercode,temperature_2m,precipitation_probability,windspeed_10m',
    timezone: 'auto',
    forecast_days: '1',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('api');
    const data = await res.json();
    return [1, 2, 3].map((offset) => {
      const i = hourIndex + offset;
      return {
        time: data.hourly.time[i],
        tempC: data.hourly.temperature_2m[i],
        pop: data.hourly.precipitation_probability[i],
        wind: data.hourly.windspeed_10m[i],
        code: data.hourly.weathercode[i],
      };
    });
  } catch (e) {
    if (retry > 0) return fetchWeather(location, retry - 1);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function renderCards(hours) {
  dom.stack.innerHTML = '';
  state.drawn = false;
  state.dismissedCount = 0;
  hours.forEach((h, idx) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.left = `${20 + Math.random() * 40}%`;
    card.style.top = `${16 + Math.random() * 18}%`;
    card.style.transform = `rotate(${Math.random() * 20 - 10}deg)`;
    card.dataset.index = String(idx);
    card.innerHTML = `
      <div class="card-back"></div>
      <div class="card-face ${weatherCategory(h.code)}">
        <div class="card-time">${fmtTime(h.time)}</div>
        <div class="card-icon" aria-hidden="true">${icons[weatherCategory(h.code)]}</div>
        <div class="card-temp top">${formatTemp(h.tempC)}</div>
        <div class="card-temp bottom">${formatTemp(h.tempC)}</div>
        <div class="card-meta"><span>降水${h.pop}%</span><span>風${Math.round(h.wind)}m/s</span></div>
      </div>
    `;
    enableSwipe(card);
    dom.stack.appendChild(card);
  });

  const topCard = dom.stack.lastElementChild;
  topCard?.addEventListener('pointerdown', () => {
    if (state.drawn) return;
    state.drawn = true;
    [...dom.stack.children].forEach((c) => c.classList.add('flipped'));
  }, { once: true });
}

function enableSwipe(card) {
  let startX = 0;
  let startY = 0;
  let dragging = false;

  card.addEventListener('pointerdown', (e) => {
    if (card !== dom.stack.lastElementChild) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    card.setPointerCapture(e.pointerId);
  });

  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx < 0 || dy > 0) return;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(5deg) rotateY(180deg)`;
  });

  card.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx > 30 && dy < -30) {
      card.style.transition = 'transform 200ms ease';
      card.style.transform = 'translate(120vw, -120vh) rotate(30deg) rotateY(180deg)';
      setTimeout(() => {
        card.remove();
        state.dismissedCount += 1;
        if (state.dismissedCount >= 3) completeRound();
      }, 200);
    } else {
      card.style.transition = 'transform 150ms ease';
      card.style.transform = 'rotateY(180deg)';
    }
  });
}

function completeRound() {
  dom.encourageText.textContent = ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)];
  dom.overlay.classList.remove('hidden');
}

async function searchLocation() {
  const q = dom.manualLocation.value.trim();
  if (!q) return;
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: q, count: '5', language: 'ja', format: 'json' }).toString();
  const res = await fetch(url);
  const data = await res.json();
  dom.locationCandidates.innerHTML = '';
  (data.results || []).slice(0, 5).forEach((r) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = `${r.name}, ${r.country}`;
    btn.onclick = async () => {
      state.location = { lat: r.latitude, lon: r.longitude, label: r.name };
      save(STORAGE_KEYS.location, state.location);
      dom.settingsDialog.close();
      await fetchWeatherAndRender(true);
    };
    li.appendChild(btn);
    dom.locationCandidates.appendChild(li);
  });
}

function formatTemp(c) {
  if (!Number.isFinite(c)) return '--';
  if (state.settings.unit === 'F') return `${Math.round(c * 9 / 5 + 32)}°F`;
  if (state.settings.unit === 'K') return `${Math.round(c + 273.15)}K`;
  return `${Math.round(c)}°C`;
}

function updateDate() {
  dom.dateLabel.textContent = ymd(new Date()).replaceAll('-', '/');
}

function fmtTime(str) {
  const d = new Date(str);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

function applySettings() {
  document.documentElement.style.fontSize = `${16 * state.settings.fontScale}px`;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
