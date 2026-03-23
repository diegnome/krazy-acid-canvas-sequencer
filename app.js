const TRACKS = ['Kick', 'Snare', 'Hi-Hat', 'Clap'];
const BASS_SCALE = [65.41, 73.42, 77.78, 87.31, 98.00, 110.00, 116.54, 130.81];
const LEAD_RESOLUTION = 1024;

let grid = Array(4).fill().map(() => Array(16).fill(false));
let bassActive = Array(16).fill(false);
let bassPitch = Array(16).fill(0);
let bassParams = { cutoff: 2000, resonance: 10, envMod: 4000, decay: 0.2, waveform: 'sawtooth' };
let bpm = 120;
let distortion = 0;
let saturation = 0;
let bitcrush = 0;
let sidechainEnabled = true;
let lyrics = "RO BOT IC FUNK MA CHINE";
let isPlaying = false;
let currentStep = -1;
let audioReady = false;

let leadPitch = new Float32Array(LEAD_RESOLUTION);
let leadGate = new Float32Array(LEAD_RESOLUTION);

const audioEngine = new AudioEngine();

// Load state
try {
  const savedGrid = localStorage.getItem('sequencerGrid');
  if (savedGrid) grid = JSON.parse(savedGrid);
  const savedBassActive = localStorage.getItem('bassActive');
  if (savedBassActive) bassActive = JSON.parse(savedBassActive);
  const savedBassPitch = localStorage.getItem('bassPitch');
  if (savedBassPitch) bassPitch = JSON.parse(savedBassPitch);
  const savedLeadPitch = localStorage.getItem('leadPitch');
  if (savedLeadPitch) {
    const arr = JSON.parse(savedLeadPitch);
    for (let i = 0; i < LEAD_RESOLUTION; i++) leadPitch[i] = arr[i] || 0;
  }
  const savedLeadGate = localStorage.getItem('leadGate');
  if (savedLeadGate) {
    const arr = JSON.parse(savedLeadGate);
    for (let i = 0; i < LEAD_RESOLUTION; i++) leadGate[i] = arr[i] || 0;
  }
} catch (e) {}

function saveState() {
  localStorage.setItem('sequencerGrid', JSON.stringify(grid));
  localStorage.setItem('bassActive', JSON.stringify(bassActive));
  localStorage.setItem('bassPitch', JSON.stringify(bassPitch));
  localStorage.setItem('leadPitch', JSON.stringify(Array.from(leadPitch)));
  localStorage.setItem('leadGate', JSON.stringify(Array.from(leadGate)));
}

// DOM Elements
const startAudioBtn = document.getElementById('start-audio-btn');
const playBtn = document.getElementById('play-btn');
const controlsContainer = document.getElementById('controls-container');
const drumGrid = document.getElementById('drum-grid');
const bassGrid = document.getElementById('bass-grid');
const leadCanvas = document.getElementById('lead-canvas');
const leadPlayhead = document.getElementById('lead-playhead');
const leadMarkers = document.getElementById('lead-markers');
const lyricsInput = document.getElementById('lyrics-input');
const clearCanvasBtn = document.getElementById('clear-canvas-btn');

// Sliders
const bpmSlider = document.getElementById('bpm-slider');
const distSlider = document.getElementById('dist-slider');
const satSlider = document.getElementById('sat-slider');
const bitSlider = document.getElementById('bit-slider');
const sidechainBtn = document.getElementById('sidechain-btn');
const cutoffSlider = document.getElementById('cutoff-slider');
const resSlider = document.getElementById('res-slider');
const envSlider = document.getElementById('env-slider');
const decaySlider = document.getElementById('decay-slider');
const waveBtn = document.getElementById('wave-btn');

// Init Audio
startAudioBtn.addEventListener('click', () => {
  audioEngine.init();
  audioReady = true;
  startAudioBtn.classList.add('hidden');
  playBtn.classList.remove('hidden');
  controlsContainer.classList.remove('hidden');
});

// Play/Stop
playBtn.addEventListener('click', () => {
  isPlaying = !isPlaying;
  if (isPlaying) {
    playBtn.classList.remove('bg-cyan-400', 'border-white', 'text-black');
    playBtn.classList.add('bg-red-900', 'border-red-500', 'text-red-500');
    playBtn.innerHTML = '<i data-lucide="square" class="w-12 h-12"></i>';
    if (audioEngine.ctx.state === 'suspended') audioEngine.ctx.resume();
    nextNoteTime = audioEngine.ctx.currentTime + 0.1;
    currentBeat = 0;
    scheduler();
    updateVisuals();
  } else {
    playBtn.classList.add('bg-cyan-400', 'border-white', 'text-black');
    playBtn.classList.remove('bg-red-900', 'border-red-500', 'text-red-500');
    playBtn.innerHTML = '<i data-lucide="play" class="w-12 h-12 ml-2"></i>';
    clearTimeout(timerID);
    currentStep = -1;
    updateGridVisuals();
    leadPlayhead.classList.add('hidden');
  }
  lucide.createIcons();
});

// Controls Listeners
bpmSlider.addEventListener('input', (e) => { bpm = parseInt(e.target.value); document.getElementById('bpm-val').innerText = bpm; });
distSlider.addEventListener('input', (e) => { distortion = parseFloat(e.target.value); document.getElementById('dist-val').innerText = distortion.toFixed(1); audioEngine.updateDistortion(distortion); });
satSlider.addEventListener('input', (e) => { saturation = parseFloat(e.target.value); document.getElementById('sat-val').innerText = saturation.toFixed(1); audioEngine.updateSaturation(saturation); });
bitSlider.addEventListener('input', (e) => { bitcrush = parseFloat(e.target.value); document.getElementById('bit-val').innerText = bitcrush.toFixed(1); audioEngine.updateBitcrusher(bitcrush); });
sidechainBtn.addEventListener('click', () => {
  sidechainEnabled = !sidechainEnabled;
  if (sidechainEnabled) {
    sidechainBtn.classList.replace('bg-[#333]', 'bg-fuchsia-600');
    sidechainBtn.classList.replace('border-[#555]', 'border-fuchsia-400');
    sidechainBtn.classList.replace('text-zinc-400', 'text-white');
    sidechainBtn.innerText = 'ON';
  } else {
    sidechainBtn.classList.replace('bg-fuchsia-600', 'bg-[#333]');
    sidechainBtn.classList.replace('border-fuchsia-400', 'border-[#555]');
    sidechainBtn.classList.replace('text-white', 'text-zinc-400');
    sidechainBtn.innerText = 'OFF';
  }
});

cutoffSlider.addEventListener('input', (e) => { bassParams.cutoff = parseInt(e.target.value); document.getElementById('cutoff-val').innerText = bassParams.cutoff; });
resSlider.addEventListener('input', (e) => { bassParams.resonance = parseFloat(e.target.value); document.getElementById('res-val').innerText = bassParams.resonance; });
envSlider.addEventListener('input', (e) => { bassParams.envMod = parseInt(e.target.value); document.getElementById('env-val').innerText = bassParams.envMod; });
decaySlider.addEventListener('input', (e) => { bassParams.decay = parseFloat(e.target.value); document.getElementById('decay-val').innerText = bassParams.decay; });
waveBtn.addEventListener('click', () => {
  bassParams.waveform = bassParams.waveform === 'sawtooth' ? 'square' : 'sawtooth';
  waveBtn.innerText = bassParams.waveform.toUpperCase();
});

lyricsInput.addEventListener('input', (e) => { lyrics = e.target.value; });

// Render Drum Grid
function renderDrumGrid() {
  drumGrid.innerHTML = '';
  TRACKS.forEach((track, trackIdx) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    const label = document.createElement('div');
    label.className = 'w-20 text-xs font-mono text-cyan-500 uppercase tracking-widest';
    label.innerText = track;
    row.appendChild(label);
    
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('button');
      cell.className = `grid-cell w-10 h-10 rounded-md border-2 border-cyan-900/50 bg-[#111] ${grid[trackIdx][i] ? 'active' : ''}`;
      cell.id = `drum-${trackIdx}-${i}`;
      cell.addEventListener('click', () => {
        grid[trackIdx][i] = !grid[trackIdx][i];
        cell.classList.toggle('active');
        saveState();
      });
      row.appendChild(cell);
    }
    drumGrid.appendChild(row);
  });
}

// Render Bass Grid
function renderBassGrid() {
  bassGrid.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const col = document.createElement('div');
    col.className = 'flex flex-col gap-1';
    
    const activeBtn = document.createElement('button');
    activeBtn.className = `bass-cell w-10 h-10 rounded-md border-2 border-fuchsia-900/50 bg-[#111] mb-2 ${bassActive[i] ? 'active' : ''}`;
    activeBtn.id = `bass-active-${i}`;
    activeBtn.addEventListener('click', () => {
      bassActive[i] = !bassActive[i];
      activeBtn.classList.toggle('active');
      saveState();
    });
    col.appendChild(activeBtn);
    
    BASS_SCALE.forEach((_, pitchIdx) => {
      const pitchBtn = document.createElement('button');
      const isActive = bassActive[i] && bassPitch[i] === (7 - pitchIdx);
      pitchBtn.className = `w-10 h-6 rounded-sm border border-fuchsia-900/30 transition-all ${isActive ? 'bg-fuchsia-400 shadow-[0_0_10px_rgba(255,0,255,0.5)]' : 'bg-[#111] hover:bg-[#222]'}`;
      pitchBtn.id = `bass-pitch-${i}-${7 - pitchIdx}`;
      pitchBtn.addEventListener('click', () => {
        bassPitch[i] = 7 - pitchIdx;
        bassActive[i] = true;
        renderBassGrid();
        saveState();
      });
      col.appendChild(pitchBtn);
    });
    bassGrid.appendChild(col);
  }
}

function updateGridVisuals() {
  for (let i = 0; i < 16; i++) {
    for (let t = 0; t < 4; t++) {
      const cell = document.getElementById(`drum-${t}-${i}`);
      if (cell) {
        if (i === currentStep) cell.classList.add('current');
        else cell.classList.remove('current');
      }
    }
    const bassCell = document.getElementById(`bass-active-${i}`);
    if (bassCell) {
      if (i === currentStep) bassCell.classList.add('current');
      else bassCell.classList.remove('current');
    }
  }
  
  if (currentStep >= 0) {
    leadPlayhead.classList.remove('hidden');
    leadPlayhead.style.left = `${(currentStep / 16) * 100}%`;
  } else {
    leadPlayhead.classList.add('hidden');
  }
}

// Canvas Drawing
const ctx = leadCanvas.getContext('2d');
let isDrawing = false;

function drawCanvas() {
  ctx.clearRect(0, 0, leadCanvas.width, leadCanvas.height);
  ctx.beginPath();
  let hasStarted = false;
  for (let i = 0; i < LEAD_RESOLUTION; i++) {
    if (leadGate[i] > 0) {
      const x = (i / LEAD_RESOLUTION) * leadCanvas.width;
      const y = (1 - leadPitch[i]) * leadCanvas.height;
      if (!hasStarted) {
        ctx.moveTo(x, y);
        hasStarted = true;
      } else {
        ctx.lineTo(x, y);
      }
    } else {
      hasStarted = false;
    }
  }
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#06b6d4';
  ctx.shadowBlur = 15;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function handleDraw(e) {
  if (!isDrawing) return;
  const rect = leadCanvas.getBoundingClientRect();
  let clientX, clientY;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  
  const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  
  const index = Math.floor(x * LEAD_RESOLUTION);
  const brushSize = Math.floor(LEAD_RESOLUTION / 64);
  
  for (let i = Math.max(0, index - brushSize); i < Math.min(LEAD_RESOLUTION, index + brushSize); i++) {
    leadPitch[i] = 1 - y;
    leadGate[i] = 1;
  }
  drawCanvas();
  saveState();
}

leadCanvas.addEventListener('mousedown', (e) => { isDrawing = true; handleDraw(e); });
leadCanvas.addEventListener('mousemove', handleDraw);
window.addEventListener('mouseup', () => { isDrawing = false; });
leadCanvas.addEventListener('touchstart', (e) => { isDrawing = true; handleDraw(e); });
leadCanvas.addEventListener('touchmove', handleDraw);
window.addEventListener('touchend', () => { isDrawing = false; });

clearCanvasBtn.addEventListener('click', () => {
  leadPitch.fill(0);
  leadGate.fill(0);
  drawCanvas();
  saveState();
});

// Init Canvas Markers
for (let i = 0; i < 16; i++) {
  const marker = document.createElement('div');
  marker.className = 'flex-1 border-r border-cyan-900/30 h-full';
  leadMarkers.appendChild(marker);
}

// Scheduler
let nextNoteTime = 0;
let currentBeat = 0;
let scheduleAheadTime = 0.1;
let lookahead = 25;
let timerID;
let notesInQueue = [];
let lastNoteDrawn = -1;

function nextNote() {
  const secondsPerBeat = 60.0 / bpm;
  nextNoteTime += 0.25 * secondsPerBeat;
  currentBeat = (currentBeat + 1) % 16;
}

function scheduleNote(beatNumber, time) {
  if (grid[0][beatNumber]) audioEngine.playKick(time);
  if (grid[1][beatNumber]) audioEngine.playSnare(time);
  if (grid[2][beatNumber]) audioEngine.playHiHat(time);
  if (grid[3][beatNumber]) audioEngine.playClap(time);

  if (sidechainEnabled && grid[0][beatNumber]) {
    audioEngine.duckBass(time);
  }

  if (bassActive[beatNumber]) {
    const pitchIdx = bassPitch[beatNumber];
    audioEngine.playBass(time, BASS_SCALE[pitchIdx], bassParams);
  }

  const stepDuration = 0.25 * (60.0 / bpm);
  const words = lyrics.split(/\s+/).filter(w => w.length > 0);
  const syllable = words.length > 0 ? words[beatNumber % words.length] : 'a';

  audioEngine.scheduleLead(
    time,
    stepDuration,
    beatNumber,
    16,
    leadPitch,
    leadGate,
    bassParams,
    syllable
  );
}

function scheduler() {
  while (nextNoteTime < audioEngine.ctx.currentTime + scheduleAheadTime) {
    notesInQueue.push({ note: currentBeat, time: nextNoteTime });
    scheduleNote(currentBeat, nextNoteTime);
    nextNote();
  }
  timerID = setTimeout(scheduler, lookahead);
}

function updateVisuals() {
  if (!isPlaying) return;
  let currentTime = audioEngine.ctx.currentTime;
  let currentNote = lastNoteDrawn;

  while (notesInQueue.length && notesInQueue[0].time < currentTime) {
    currentNote = notesInQueue[0].note;
    notesInQueue.splice(0, 1);
  }

  if (currentNote !== lastNoteDrawn) {
    currentStep = currentNote;
    updateGridVisuals();
    lastNoteDrawn = currentNote;
  }

  requestAnimationFrame(updateVisuals);
}

// Initial Render
renderDrumGrid();
renderBassGrid();
drawCanvas();
