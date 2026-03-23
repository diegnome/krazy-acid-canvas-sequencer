import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AudioEngine, BassParams } from './audioEngine';
import { Play, Square, Volume2 } from 'lucide-react';

const TRACKS = ['Kick', 'Snare', 'Hi-Hat', 'Clap'];
const STEPS = 16;
const DEFAULT_BPM = 120;
const LEAD_RESOLUTION = 1024;

// C2 to C3 Dorian scale frequencies
const BASS_SCALE = [65.41, 73.42, 77.78, 87.31, 98.00, 110.00, 116.54, 130.81];
const NOTE_NAMES = ['C2', 'D2', 'Eb2', 'F2', 'G2', 'A2', 'Bb2', 'C3'];

const getInitialGrid = () => {
  const saved = localStorage.getItem('sequencerGrid');
  return saved ? JSON.parse(saved) : Array(4).fill(null).map(() => Array(16).fill(false));
};

const getInitialBassActive = () => {
  const saved = localStorage.getItem('bassActive');
  return saved ? JSON.parse(saved) : Array(16).fill(false);
};

const getInitialBassPitch = () => {
  const saved = localStorage.getItem('bassPitch');
  return saved ? JSON.parse(saved) : Array(16).fill(0);
};

const getInitialBassParams = (): BassParams => {
  const saved = localStorage.getItem('bassParams');
  return saved ? JSON.parse(saved) : {
    cutoff: 400,
    resonance: 15,
    envMod: 2000,
    decay: 0.3,
    waveform: 'sawtooth'
  };
};

export default function App() {
  const [grid, setGrid] = useState<boolean[][]>(getInitialGrid);
  const [bassActive, setBassActive] = useState<boolean[]>(getInitialBassActive);
  const [bassPitch, setBassPitch] = useState<number[]>(getInitialBassPitch);
  const [bassParams, setBassParams] = useState<BassParams>(getInitialBassParams);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [distortion, setDistortion] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [bitcrush, setBitcrush] = useState(0);
  const [sidechainEnabled, setSidechainEnabled] = useState(true);
  const [lyrics, setLyrics] = useState("RO BOT IC FUNK MA CHINE");
  const [currentStep, setCurrentStep] = useState(-1);
  const [audioReady, setAudioReady] = useState(false);
  
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const nextNoteTimeRef = useRef(0);
  const current16thNoteRef = useRef(0);
  const timerIDRef = useRef<number | null>(null);
  const noteQueueRef = useRef<{note: number, time: number}[]>([]);
  const animationRef = useRef<number | null>(null);
  const lastNoteDrawnRef = useRef(-1);
  
  // Lead Synth State & Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leadPitchRef = useRef<Float32Array>(new Float32Array(LEAD_RESOLUTION));
  const leadGateRef = useRef<Float32Array>(new Float32Array(LEAD_RESOLUTION));
  const isDrawingLeadRef = useRef(false);
  const lastDrawPosRef = useRef<{x: number, y: number} | null>(null);
  
  // Refs for state used in scheduling to avoid re-creating the scheduler
  const gridRef = useRef(grid);
  const bassActiveRef = useRef(bassActive);
  const bassPitchRef = useRef(bassPitch);
  const bassParamsRef = useRef(bassParams);
  const bpmRef = useRef(bpm);
  const sidechainEnabledRef = useRef(sidechainEnabled);
  const lyricsRef = useRef(lyrics);

  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { bassActiveRef.current = bassActive; }, [bassActive]);
  useEffect(() => { bassPitchRef.current = bassPitch; }, [bassPitch]);
  useEffect(() => { bassParamsRef.current = bassParams; }, [bassParams]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { sidechainEnabledRef.current = sidechainEnabled; }, [sidechainEnabled]);
  useEffect(() => { lyricsRef.current = lyrics; }, [lyrics]);

  // Save to localStorage
  useEffect(() => { localStorage.setItem('sequencerGrid', JSON.stringify(grid)); }, [grid]);
  useEffect(() => { localStorage.setItem('bassActive', JSON.stringify(bassActive)); }, [bassActive]);
  useEffect(() => { localStorage.setItem('bassPitch', JSON.stringify(bassPitch)); }, [bassPitch]);
  useEffect(() => { localStorage.setItem('bassParams', JSON.stringify(bassParams)); }, [bassParams]);
  useEffect(() => { localStorage.setItem('distortion', JSON.stringify(distortion)); }, [distortion]);
  useEffect(() => { localStorage.setItem('saturation', JSON.stringify(saturation)); }, [saturation]);
  useEffect(() => { localStorage.setItem('bitcrush', JSON.stringify(bitcrush)); }, [bitcrush]);
  useEffect(() => { localStorage.setItem('sidechainEnabled', JSON.stringify(sidechainEnabled)); }, [sidechainEnabled]);

  useEffect(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.updateDistortion(distortion);
    }
  }, [distortion]);

  useEffect(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.updateSaturation(saturation);
    }
  }, [saturation]);

  useEffect(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.updateBitcrusher(bitcrush);
    }
  }, [bitcrush]);

  const initAudio = () => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine();
    }
    audioEngineRef.current.init();
    audioEngineRef.current.updateDistortion(distortion);
    audioEngineRef.current.updateSaturation(saturation);
    audioEngineRef.current.updateBitcrusher(bitcrush);
    setAudioReady(true);
  };

  const nextNote = useCallback(() => {
    const secondsPerBeat = 60.0 / bpmRef.current;
    nextNoteTimeRef.current += 0.25 * secondsPerBeat;
    current16thNoteRef.current++;
    if (current16thNoteRef.current === 16) {
      current16thNoteRef.current = 0;
    }
  }, []);

  const scheduleNote = useCallback((beatNumber: number, time: number) => {
    noteQueueRef.current.push({ note: beatNumber, time });
    
    if (audioEngineRef.current) {
      const currentGrid = gridRef.current;
      if (currentGrid[0][beatNumber]) {
        audioEngineRef.current.playKick(time);
        if (sidechainEnabledRef.current) {
          audioEngineRef.current.duckBass(time);
        }
      }
      if (currentGrid[1][beatNumber]) audioEngineRef.current.playSnare(time);
      if (currentGrid[2][beatNumber]) audioEngineRef.current.playHiHat(time);
      if (currentGrid[3][beatNumber]) audioEngineRef.current.playClap(time);
      
      if (bassActiveRef.current[beatNumber]) {
        const pitchIdx = bassPitchRef.current[beatNumber];
        audioEngineRef.current.playBass(time, BASS_SCALE[pitchIdx], bassParamsRef.current);
      }
      
      // Schedule Lead Synth
      const stepDuration = 0.25 * (60.0 / bpmRef.current);
      const words = lyricsRef.current.split(/\s+/).filter(w => w.length > 0);
      const syllable = words.length > 0 ? words[beatNumber % words.length] : 'a';
      
      audioEngineRef.current.scheduleLead(
        time, 
        stepDuration, 
        beatNumber, 
        16, 
        leadPitchRef.current, 
        leadGateRef.current, 
        bassParamsRef.current,
        syllable
      );
    }
  }, []);

  const scheduler = useCallback(() => {
    if (!audioEngineRef.current || !audioEngineRef.current.ctx) return;
    
    while (nextNoteTimeRef.current < audioEngineRef.current.ctx.currentTime + 0.1) {
      scheduleNote(current16thNoteRef.current, nextNoteTimeRef.current);
      nextNote();
    }
    timerIDRef.current = window.setTimeout(scheduler, 25.0);
  }, [nextNote, scheduleNote]);

  const draw = useCallback(() => {
    if (!audioEngineRef.current || !audioEngineRef.current.ctx) return;
    
    let drawNote = lastNoteDrawnRef.current;
    const currentTime = audioEngineRef.current.ctx.currentTime;

    while (noteQueueRef.current.length && noteQueueRef.current[0].time < currentTime) {
      drawNote = noteQueueRef.current[0].note;
      noteQueueRef.current.splice(0, 1);
    }

    if (lastNoteDrawnRef.current !== drawNote) {
      setCurrentStep(drawNote);
      lastNoteDrawnRef.current = drawNote;
    }

    animationRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      if (audioEngineRef.current && audioEngineRef.current.ctx) {
        if (audioEngineRef.current.ctx.state === 'suspended') {
          audioEngineRef.current.ctx.resume();
        }
        nextNoteTimeRef.current = audioEngineRef.current.ctx.currentTime + 0.05;
        current16thNoteRef.current = 0;
        noteQueueRef.current = [];
        lastNoteDrawnRef.current = -1;
        scheduler();
        animationRef.current = requestAnimationFrame(draw);
      }
    } else {
      if (timerIDRef.current !== null) {
        window.clearTimeout(timerIDRef.current);
        timerIDRef.current = null;
      }
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setCurrentStep(-1);
    }

    return () => {
      if (timerIDRef.current !== null) window.clearTimeout(timerIDRef.current);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, scheduler, draw]);

  // Drum Grid Interaction
  const isPaintingRef = useRef(false);
  const paintValueRef = useRef(false);

  const toggleStep = (trackIdx: number, stepIdx: number, forceValue?: boolean) => {
    setGrid(prev => {
      const newGrid = [...prev];
      newGrid[trackIdx] = [...newGrid[trackIdx]];
      newGrid[trackIdx][stepIdx] = forceValue !== undefined ? forceValue : !newGrid[trackIdx][stepIdx];
      return newGrid;
    });
  };

  const handlePointerDown = (trackIdx: number, stepIdx: number) => {
    isPaintingRef.current = true;
    const newValue = !grid[trackIdx][stepIdx];
    paintValueRef.current = newValue;
    toggleStep(trackIdx, stepIdx, newValue);
  };

  const handlePointerEnter = (trackIdx: number, stepIdx: number) => {
    if (isPaintingRef.current) {
      toggleStep(trackIdx, stepIdx, paintValueRef.current);
    }
  };

  // Bass Grid Interaction
  const isBassPaintingRef = useRef(false);
  const bassPaintValueRef = useRef(false);
  const bassPaintNoteRef = useRef(0);

  const drawOnCanvas = useCallback((ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, height: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#00FFFF'; // cyan
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    const steps = Math.max(Math.abs(x2 - x1), 1);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      
      const index = Math.floor((x / width) * LEAD_RESOLUTION);
      if (index >= 0 && index < LEAD_RESOLUTION) {
        leadPitchRef.current[index] = Math.max(0, Math.min(1, 1.0 - (y / height)));
        leadGateRef.current[index] = 1.0;
      }
    }
  }, []);

  const handleLeadPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDrawingLeadRef.current = true;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    lastDrawPosRef.current = { x, y };
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawOnCanvas(ctx, x, y, x, y, canvas.width, canvas.height);
    }
  };

  const handleLeadPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingLeadRef.current || !lastDrawPosRef.current) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawOnCanvas(ctx, lastDrawPosRef.current.x, lastDrawPosRef.current.y, x, y, canvas.width, canvas.height);
    }
    
    lastDrawPosRef.current = { x, y };
  };

  const clearLeadCanvas = useCallback(() => {
    leadPitchRef.current.fill(0);
    leadGateRef.current.fill(0);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Draw grid lines
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        for (let i = 1; i < 16; i++) {
          ctx.beginPath();
          ctx.moveTo((i / 16) * canvas.width, 0);
          ctx.lineTo((i / 16) * canvas.width, canvas.height);
          ctx.stroke();
        }
      }
    }
  }, []);

  useEffect(() => {
    clearLeadCanvas();
  }, [clearLeadCanvas]);

  const handleBassPointerDown = (stepIdx: number, noteIdx: number) => {
    isBassPaintingRef.current = true;
    bassPaintNoteRef.current = noteIdx;
    
    const isCurrentlyActive = bassActive[stepIdx] && bassPitch[stepIdx] === noteIdx;
    bassPaintValueRef.current = !isCurrentlyActive;
    
    setBassActive(prev => {
      const next = [...prev];
      next[stepIdx] = !isCurrentlyActive;
      return next;
    });
    if (!isCurrentlyActive) {
      setBassPitch(prev => {
        const next = [...prev];
        next[stepIdx] = noteIdx;
        return next;
      });
    }
  };

  const handleBassPointerEnter = (stepIdx: number, noteIdx: number) => {
    if (isBassPaintingRef.current) {
      setBassActive(prev => {
        const next = [...prev];
        next[stepIdx] = bassPaintValueRef.current;
        return next;
      });
      if (bassPaintValueRef.current) {
        setBassPitch(prev => {
          const next = [...prev];
          next[stepIdx] = noteIdx;
          return next;
        });
      }
    }
  };

  const handlePointerUp = () => {
    isPaintingRef.current = false;
    isBassPaintingRef.current = false;
    isDrawingLeadRef.current = false;
    lastDrawPosRef.current = null;
  };

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const clearPattern = () => {
    setGrid(Array(4).fill(null).map(() => Array(16).fill(false)));
    setBassActive(Array(16).fill(false));
    setBassPitch(Array(16).fill(0));
  };

  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center p-4 font-sans select-none">
      <div className="max-w-5xl w-full bg-[#1A1A1A]/80 backdrop-blur-md rounded-3xl shadow-[0_0_50px_rgba(255,0,255,0.5)] border-4 border-cyan-400 p-6 md:p-8">
        
        {/* Header & Transport */}
        <div className="flex flex-col md:flex-row items-start justify-between mb-8 gap-6 border-b-4 border-fuchsia-500 pb-6">
          <div className="flex flex-col gap-6 w-full md:w-1/2">
            <div>
              <h1 className="text-5xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 mb-1 uppercase italic drop-shadow-[0_0_10px_rgba(255,0,255,0.8)]">
                KRAZY SEKWENS BRAH
              </h1>
              <p className="text-cyan-200 text-sm font-mono uppercase tracking-widest animate-pulse">Analog-Style Step Machine</p>
            </div>
            
            {audioReady && (
              <div className="bg-[#000]/50 p-4 rounded-2xl border-2 border-cyan-400 shadow-[inset_0_0_20px_rgba(0,255,255,0.2)]">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1 pb-4 border-b border-cyan-400/30">
                    <div className="flex justify-between text-xs font-mono text-cyan-300 uppercase tracking-wider">
                      <span>Master BPM</span>
                      <span className="text-white">{bpm}</span>
                    </div>
                    <input type="range" min="60" max="180" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value))} className="w-full accent-fuchsia-500" />
                  </div>
                  
                  <div>
                    <h3 className="text-cyan-300 font-mono text-xs uppercase tracking-widest mb-3">Drum Effects</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-mono text-cyan-300 uppercase tracking-wider">
                          <span>Distortion</span>
                          <span className="text-white">{distortion.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0" max="10" step="0.1" value={distortion} onChange={(e) => setDistortion(parseFloat(e.target.value))} className="w-full accent-fuchsia-500" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-mono text-cyan-300 uppercase tracking-wider">
                          <span>Saturation</span>
                          <span className="text-white">{saturation.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.05" value={saturation} onChange={(e) => setSaturation(parseFloat(e.target.value))} className="w-full accent-fuchsia-500" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-mono text-cyan-300 uppercase tracking-wider">
                          <span>Bitcrush</span>
                          <span className="text-white">{bitcrush.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.05" value={bitcrush} onChange={(e) => setBitcrush(parseFloat(e.target.value))} className="w-full accent-fuchsia-500" />
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono text-cyan-300 uppercase tracking-wider">
                        <span>Sidechain</span>
                        <button onClick={() => setSidechainEnabled(!sidechainEnabled)} className={`px-3 py-1 rounded-full border-2 transition-all ${sidechainEnabled ? 'bg-fuchsia-600 border-fuchsia-400 text-white shadow-[0_0_10px_rgba(255,0,255,0.6)]' : 'bg-[#333] border-[#555] text-zinc-400'}`}>
                          {sidechainEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex items-center justify-center w-full md:w-auto mt-4 md:mt-0 md:ml-auto">
            {!audioReady ? (
              <button 
                onClick={initAudio}
                className="flex items-center gap-2 bg-fuchsia-500 hover:bg-fuchsia-400 text-white px-8 py-4 rounded-full font-bold transition-all justify-center uppercase tracking-widest shadow-[0_0_20px_rgba(255,0,255,0.6)] text-lg"
              >
                <Volume2 size={24} />
                Start Audio
              </button>
            ) : (
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`flex items-center justify-center w-32 h-32 rounded-full transition-all border-4 shadow-[0_0_30px_rgba(255,255,255,0.3)] ${
                  isPlaying 
                    ? 'bg-red-900 border-red-500 text-red-500' 
                    : 'bg-cyan-400 border-white text-black hover:bg-white hover:scale-105'
                }`}
              >
                {isPlaying ? <Square size={48} fill="currentColor" /> : <Play size={48} fill="currentColor" className="ml-2" />}
              </button>
            )}
          </div>
        </div>

        {/* Drum Sequencer */}
        <div className="mb-8">
          <h3 className="text-cyan-300 font-mono text-sm uppercase tracking-widest mb-4">Drum Matrix</h3>
          <div className="grid gap-4 touch-none" style={{ touchAction: 'none' }}>
            {TRACKS.map((track, trackIdx) => (
              <div key={track} className="flex flex-col md:flex-row gap-2 md:gap-4 items-start md:items-center">
                <div className="w-24 text-sm font-mono text-fuchsia-300 uppercase tracking-widest flex-shrink-0">
                  {track}
                </div>
                <div className="grid gap-1 md:gap-2 flex-1 w-full" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
                  {grid[trackIdx].map((isActive, stepIdx) => {
                    const isCurrentStep = currentStep === stepIdx;
                    const isBeat = stepIdx % 4 === 0;
                    
                    return (
                      <div
                        key={stepIdx}
                        onPointerDown={(e) => {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                          handlePointerDown(trackIdx, stepIdx);
                        }}
                        onPointerEnter={() => handlePointerEnter(trackIdx, stepIdx)}
                        className={`
                          aspect-square rounded-full cursor-pointer transition-all duration-75 border-2
                          ${isActive 
                            ? 'bg-cyan-400 border-white shadow-[0_0_15px_rgba(0,255,255,0.8)]' 
                            : isBeat 
                              ? 'bg-[#333] border-[#555]' 
                              : 'bg-[#1A1A1A] border-[#333]'
                          }
                          ${isCurrentStep && !isActive ? 'bg-[#444] border-[#666]' : ''}
                          ${isCurrentStep && isActive ? 'bg-white border-white shadow-[0_0_20px_rgba(255,255,255,0.9)] scale-110' : ''}
                          hover:bg-[#555]
                        `}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Continuous Lead Synth */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <h3 className="text-cyan-300 font-mono text-sm uppercase tracking-widest">Vocaloid Lead Synth</h3>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <input
                type="text"
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                className="bg-[#000]/50 border-2 border-cyan-400 rounded-full px-4 py-1 text-xs font-mono text-white w-full md:w-64 focus:outline-none focus:border-fuchsia-500 transition-colors"
                placeholder="Enter lyrics (space separated)"
              />
              <button 
                onClick={clearLeadCanvas}
                className="hover:text-white transition-colors border-2 border-cyan-500 px-3 py-1 rounded-full text-xs font-mono shadow-[0_0_5px_rgba(0,255,255,0.4)] whitespace-nowrap"
              >
                Clear Canvas
              </button>
            </div>
          </div>
          <div className="relative w-full h-48 md:h-64 bg-[#1A1A1A] border-2 border-cyan-400 rounded-2xl overflow-hidden shadow-[inset_0_0_20px_rgba(0,255,255,0.1)]">
            <canvas
              ref={canvasRef}
              width={1024}
              height={256}
              className="w-full h-full cursor-crosshair touch-none"
              onPointerDown={handleLeadPointerDown}
              onPointerMove={handleLeadPointerMove}
              style={{ touchAction: 'none' }}
            />
            {/* Playhead overlay for lead synth */}
            {isPlaying && currentStep >= 0 && (
              <div 
                className="absolute top-0 bottom-0 w-1 bg-white/50 shadow-[0_0_10px_rgba(255,255,255,0.8)] pointer-events-none"
                style={{ 
                  left: `${(currentStep / 16) * 100}%`,
                  transition: `left ${60.0 / bpm * 0.25}s linear`
                }}
              />
            )}
            {/* Step markers overlay */}
            <div className="absolute inset-0 pointer-events-none flex">
              {Array(16).fill(null).map((_, i) => (
                <div key={i} className="flex-1 border-r border-white/5 last:border-r-0" />
              ))}
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs font-mono text-cyan-300/50">
            <span>Low Pitch</span>
            <span>High Pitch</span>
          </div>
        </div>

        {/* Acid Bass Controls */}
        <div className="bg-[#000]/50 p-4 md:p-6 rounded-2xl border-2 border-fuchsia-500 mb-6 shadow-[inset_0_0_20px_rgba(255,0,255,0.2)]">
          <h3 className="text-fuchsia-300 font-mono text-sm uppercase tracking-widest mb-4">Acid Bass Controls</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-mono text-cyan-300">
                <span>Cutoff</span>
                <span className="text-white">{bassParams.cutoff}Hz</span>
              </div>
              <input type="range" min="50" max="3000" value={bassParams.cutoff} onChange={(e) => setBassParams({...bassParams, cutoff: parseInt(e.target.value)})} className="accent-cyan-400" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-mono text-cyan-300">
                <span>Resonance</span>
                <span className="text-white">{bassParams.resonance}</span>
              </div>
              <input type="range" min="0" max="30" step="0.1" value={bassParams.resonance} onChange={(e) => setBassParams({...bassParams, resonance: parseFloat(e.target.value)})} className="accent-cyan-400" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-mono text-cyan-300">
                <span>Env Mod</span>
                <span className="text-white">{bassParams.envMod}Hz</span>
              </div>
              <input type="range" min="0" max="5000" value={bassParams.envMod} onChange={(e) => setBassParams({...bassParams, envMod: parseInt(e.target.value)})} className="accent-cyan-400" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-mono text-cyan-300">
                <span>Decay</span>
                <span className="text-white">{bassParams.decay}s</span>
              </div>
              <input type="range" min="0.1" max="1.0" step="0.01" value={bassParams.decay} onChange={(e) => setBassParams({...bassParams, decay: parseFloat(e.target.value)})} className="accent-cyan-400" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-mono text-cyan-300">
                <span>Waveform</span>
                <span className="text-white">{bassParams.waveform}</span>
              </div>
              <button 
                onClick={() => setBassParams({...bassParams, waveform: bassParams.waveform === 'sawtooth' ? 'square' : 'sawtooth'})}
                className="bg-[#333] hover:bg-[#555] text-xs py-1.5 rounded-full text-white transition-colors uppercase font-mono border border-cyan-400 shadow-[0_0_5px_rgba(0,255,255,0.4)]"
              >
                Toggle Wave
              </button>
            </div>
          </div>
        </div>

        {/* Acid Bass Piano Roll */}
        <div className="mb-4">
          <div className="grid gap-1 touch-none" style={{ touchAction: 'none' }}>
            {[...NOTE_NAMES].reverse().map((noteName, revIdx) => {
              const noteIdx = 7 - revIdx;
              return (
                <div key={noteName} className="flex flex-col md:flex-row gap-2 md:gap-4 items-start md:items-center">
                  <div className="w-24 text-xs font-mono text-fuchsia-300 uppercase tracking-widest flex-shrink-0 md:text-right md:pr-4">
                    {noteName}
                  </div>
                  <div className="grid gap-1 md:gap-2 flex-1 w-full" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
                    {Array(16).fill(null).map((_, stepIdx) => {
                      const isCurrentStep = currentStep === stepIdx;
                      const isBeat = stepIdx % 4 === 0;
                      const isActive = bassActive[stepIdx] && bassPitch[stepIdx] === noteIdx;
                      
                      return (
                        <div
                          key={stepIdx}
                          onPointerDown={(e) => {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                            handleBassPointerDown(stepIdx, noteIdx);
                          }}
                          onPointerEnter={() => handleBassPointerEnter(stepIdx, noteIdx)}
                          className={`
                            h-6 md:h-8 rounded-full cursor-pointer transition-all duration-75 border-2
                            ${isActive 
                              ? 'bg-fuchsia-400 border-white shadow-[0_0_10px_rgba(255,0,255,0.8)]' 
                              : isBeat 
                                ? 'bg-[#333] border-[#555]' 
                                : 'bg-[#1A1A1A] border-[#333]'
                            }
                            ${isCurrentStep && !isActive ? 'bg-[#444] border-[#666]' : ''}
                            ${isCurrentStep && isActive ? 'bg-white border-white shadow-[0_0_15px_rgba(255,255,255,0.9)] scale-110' : ''}
                            hover:bg-[#555]
                          `}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="mt-8 flex justify-between items-center text-xs text-cyan-300 font-mono uppercase tracking-widest">
          <p>Drag to paint notes</p>
          <button 
            onClick={clearPattern}
            className="hover:text-white transition-colors border-2 border-fuchsia-500 px-4 py-2 rounded-full shadow-[0_0_5px_rgba(255,0,255,0.4)]"
          >
            Clear Pattern
          </button>
        </div>
      </div>
    </div>
  );
}
