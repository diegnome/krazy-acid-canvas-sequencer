class AudioEngine {
  constructor() {
    this.ctx = null;
    this.drumBus = null;
    this.bassGain = null;
    this.distortion = null;
    this.saturation = null;
    this.bitcrusher = null;
    
    this.leadOsc = null;
    this.formant1 = null;
    this.formant2 = null;
    this.formant3 = null;
    this.leadGain = null;
    
    this.leadNoiseSource = null;
    this.leadNoiseFilter = null;
    this.leadNoiseGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.drumBus = this.ctx.createGain();
      this.bassGain = this.ctx.createGain();
      
      this.distortion = this.ctx.createWaveShaper();
      this.saturation = this.ctx.createWaveShaper();
      this.bitcrusher = this.ctx.createScriptProcessor(4096, 1, 1);
      
      this.updateDistortion(0);
      this.updateSaturation(0);
      this.updateBitcrusher(0);

      this.drumBus.connect(this.distortion);
      this.distortion.connect(this.saturation);
      this.saturation.connect(this.bitcrusher);
      this.bitcrusher.connect(this.ctx.destination);
      
      this.bassGain.connect(this.ctx.destination);
      
      // Init Lead Synth
      this.leadOsc = this.ctx.createOscillator();
      this.formant1 = this.ctx.createBiquadFilter();
      this.formant2 = this.ctx.createBiquadFilter();
      this.formant3 = this.ctx.createBiquadFilter();
      this.leadGain = this.ctx.createGain();
      
      this.leadOsc.type = 'sawtooth';
      this.formant1.type = 'bandpass';
      this.formant2.type = 'bandpass';
      this.formant3.type = 'bandpass';
      
      this.formant1.Q.value = 20;
      this.formant2.Q.value = 20;
      this.formant3.Q.value = 20;
      
      this.leadGain.gain.value = 0;
      
      this.leadOsc.connect(this.formant1);
      this.leadOsc.connect(this.formant2);
      this.leadOsc.connect(this.formant3);
      
      this.formant1.connect(this.leadGain);
      this.formant2.connect(this.leadGain);
      this.formant3.connect(this.leadGain);
      
      this.leadGain.connect(this.ctx.destination);
      this.leadOsc.start();
      
      // Init Lead Noise for Consonants
      const noiseBuffer = this.createNoiseBuffer();
      if (noiseBuffer) {
        this.leadNoiseSource = this.ctx.createBufferSource();
        this.leadNoiseSource.buffer = noiseBuffer;
        this.leadNoiseSource.loop = true;
        
        this.leadNoiseFilter = this.ctx.createBiquadFilter();
        this.leadNoiseFilter.type = 'bandpass';
        
        this.leadNoiseGain = this.ctx.createGain();
        this.leadNoiseGain.gain.value = 0;
        
        this.leadNoiseSource.connect(this.leadNoiseFilter);
        this.leadNoiseFilter.connect(this.leadNoiseGain);
        this.leadNoiseGain.connect(this.ctx.destination);
        
        this.leadNoiseSource.start();
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  updateDistortion(amount) {
    if (!this.distortion) return;
    const curve = new Float32Array(44100);
    const deg = Math.PI / 180;
    for (let i = 0; i < 44100; i++) {
        const x = i * 2 / 44100 - 1;
        curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
    }
    this.distortion.curve = curve;
  }

  updateSaturation(amount) {
    if (!this.saturation) return;
    const curve = new Float32Array(44100);
    for (let i = 0; i < 44100; i++) {
        const x = i * 2 / 44100 - 1;
        curve[i] = Math.tanh(x * (1 + amount * 5));
    }
    this.saturation.curve = curve;
  }

  updateBitcrusher(amount) {
    if (!this.bitcrusher) return;
    const bitDepth = Math.max(1, 16 - amount * 15);
    this.bitcrusher.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const output = e.outputBuffer.getChannelData(0);
        const step = Math.pow(0.5, bitDepth);
        for (let i = 0; i < input.length; i++) {
            output[i] = Math.floor(input[i] / step) * step;
        }
    };
  }

  duckBass(time) {
    if (!this.bassGain || !this.ctx) return;
    this.bassGain.gain.cancelScheduledValues(time);
    this.bassGain.gain.setValueAtTime(this.bassGain.gain.value, time);
    this.bassGain.gain.linearRampToValueAtTime(0.1, time + 0.02);
    this.bassGain.gain.linearRampToValueAtTime(1, time + 0.1);
  }

  scheduleLead(time, stepDuration, stepIdx, totalSteps, pitchData, gateData, params, syllable) {
    if (!this.leadOsc || !this.leadGain || !this.formant1 || !this.formant2 || !this.formant3 || !this.ctx) return;
    
    const resolution = pitchData.length;
    const pointsPerStep = Math.floor(resolution / totalSteps);
    const startIndex = stepIdx * pointsPerStep;
    
    let hasSound = false;
    for (let i = 0; i < pointsPerStep; i++) {
      if (gateData[startIndex + i] > 0) {
        hasSound = true;
        break;
      }
    }
    
    this.leadOsc.frequency.cancelScheduledValues(time);
    this.formant1.frequency.cancelScheduledValues(time);
    this.formant2.frequency.cancelScheduledValues(time);
    this.formant3.frequency.cancelScheduledValues(time);
    this.leadGain.gain.cancelScheduledValues(time);
    if (this.leadNoiseGain) this.leadNoiseGain.gain.cancelScheduledValues(time);
    if (this.leadNoiseFilter) {
        this.leadNoiseFilter.frequency.cancelScheduledValues(time);
        this.leadNoiseFilter.Q.cancelScheduledValues(time);
    }
    
    if (!hasSound) {
      this.leadGain.gain.setValueAtTime(0, time);
      if (this.leadNoiseGain) this.leadNoiseGain.gain.setValueAtTime(0, time);
      return;
    }
    
    const minFreq = 65.41;
    const maxFreq = 1046.5;
    
    this.leadOsc.type = params.waveform;
    
    const parseSyllable = (text) => {
      const lower = text.toLowerCase().replace(/[^a-z]/g, '');
      if (!lower) return { onset: '', vowel: 'a', coda: '' };
      
      const match = lower.match(/^([^aeiouy]*)([aeiouy]+)(.*)$/);
      if (match) {
        return { onset: match[1], vowel: match[2], coda: match[3] };
      }
      return { onset: '', vowel: lower, coda: '' };
    };

    const getConsonantParams = (c) => {
        if (!c) return null;
        if (['s', 'sh', 'ch', 'z', 'x', 'c'].some(x => c.includes(x))) {
            return { type: 'fricative', duration: 0.1, filterFreq: 6000, Q: 1 };
        }
        if (['f', 'th', 'v', 'h'].some(x => c.includes(x))) {
            return { type: 'fricative', duration: 0.08, filterFreq: 3000, Q: 1 };
        }
        if (['p', 't', 'k', 'b', 'd', 'g', 'q'].some(x => c.includes(x))) {
            return { type: 'plosive', duration: 0.02, filterFreq: 2000, Q: 5 };
        }
        if (['m', 'n', 'l', 'r', 'w', 'y', 'j'].some(x => c.includes(x))) {
            return { type: 'voiced', duration: 0.06, filterFreq: 300, Q: 1 };
        }
        return null;
    };

    const getFormants = (v) => {
      if (v.includes('a')) return [730, 1090, 2440];
      if (v.includes('e')) return [530, 1840, 2480];
      if (v.includes('i')) return [270, 2290, 3010];
      if (v.includes('o')) return [570, 840, 2410];
      if (v.includes('u')) return [300, 870, 2240];
      if (v.includes('y')) return [270, 2290, 3010];
      return [500, 1500, 2500];
    };
    
    const { onset, vowel, coda } = parseSyllable(syllable);
    const onsetParams = getConsonantParams(onset);
    const codaParams = getConsonantParams(coda);
    const [f1, f2, f3] = getFormants(vowel);
    
    try {
      if (onsetParams && onsetParams.type === 'voiced') {
          this.formant1.frequency.setValueAtTime(250, time);
          this.formant2.frequency.setValueAtTime(1000, time);
          this.formant3.frequency.setValueAtTime(2000, time);
          
          this.formant1.frequency.linearRampToValueAtTime(f1, time + onsetParams.duration);
          this.formant2.frequency.linearRampToValueAtTime(f2, time + onsetParams.duration);
          this.formant3.frequency.linearRampToValueAtTime(f3, time + onsetParams.duration);
      } else {
          this.formant1.frequency.setValueAtTime(f1, time);
          this.formant2.frequency.setValueAtTime(f2, time);
          this.formant3.frequency.setValueAtTime(f3, time);
      }
      
      if (this.leadNoiseGain && this.leadNoiseFilter) {
        this.leadNoiseGain.gain.setValueAtTime(0, time);
        
        if (onsetParams && (onsetParams.type === 'fricative' || onsetParams.type === 'plosive')) {
            this.leadNoiseFilter.frequency.setValueAtTime(onsetParams.filterFreq, time);
            this.leadNoiseFilter.Q.setValueAtTime(onsetParams.Q, time);
            
            this.leadNoiseGain.gain.setValueAtTime(0, time);
            this.leadNoiseGain.gain.linearRampToValueAtTime(0.5, time + 0.005);
            this.leadNoiseGain.gain.linearRampToValueAtTime(0, time + onsetParams.duration);
        }
        
        if (codaParams && (codaParams.type === 'fricative' || codaParams.type === 'plosive')) {
            const codaTime = time + stepDuration - codaParams.duration;
            if (codaTime > time) {
                this.leadNoiseFilter.frequency.setValueAtTime(codaParams.filterFreq, codaTime);
                this.leadNoiseFilter.Q.setValueAtTime(codaParams.Q, codaTime);
                
                this.leadNoiseGain.gain.setValueAtTime(0, codaTime);
                this.leadNoiseGain.gain.linearRampToValueAtTime(0.4, codaTime + 0.005);
                this.leadNoiseGain.gain.linearRampToValueAtTime(0, codaTime + codaParams.duration);
            }
        }
      }
      
      const pointDuration = stepDuration / pointsPerStep;
      
      for (let i = 0; i < pointsPerStep; i++) {
        const pitch = pitchData[startIndex + i];
        const gate = gateData[startIndex + i];
        
        const freq = minFreq * Math.pow(maxFreq / minFreq, pitch);
        const gateVal = gate * 0.8;
        
        const pointTime = time + i * pointDuration;
        
        if (i === 0) {
          this.leadOsc.frequency.setValueAtTime(freq * 0.8, pointTime);
          this.leadGain.gain.setValueAtTime(gateVal, pointTime);
        } else {
          this.leadOsc.frequency.linearRampToValueAtTime(freq, pointTime);
          this.leadGain.gain.linearRampToValueAtTime(gateVal, pointTime);
        }
      }
    } catch (e) {
      console.error("Lead scheduling error:", e);
    }
  }

  playKick(time) {
    if (!this.ctx || !this.drumBus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.drumBus);

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);

    osc.start(time);
    osc.stop(time + 0.5);
  }

  playSnare(time) {
    if (!this.ctx || !this.drumBus) return;
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.connect(oscGain);
    oscGain.connect(this.drumBus);

    osc.frequency.setValueAtTime(250, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.2);
    oscGain.gain.setValueAtTime(0.5, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    osc.start(time);
    osc.stop(time + 0.2);

    const noise = this.createNoiseBuffer();
    if (!noise) return;
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    noiseSource.connect(noiseFilter);
    const noiseGain = this.ctx.createGain();
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.drumBus);

    noiseGain.gain.setValueAtTime(0.5, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    noiseSource.start(time);
    noiseSource.stop(time + 0.2);
  }

  playHiHat(time) {
    if (!this.ctx || !this.drumBus) return;
    const noise = this.createNoiseBuffer();
    if (!noise) return;
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 10000;
    
    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 7000;

    const gain = this.ctx.createGain();
    
    noiseSource.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.drumBus);

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

    noiseSource.start(time);
    noiseSource.stop(time + 0.05);
  }

  playClap(time) {
    if (!this.ctx || !this.drumBus) return;
    const noise = this.createNoiseBuffer();
    if (!noise) return;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;

    const gain = this.ctx.createGain();
    
    filter.connect(gain);
    gain.connect(this.drumBus);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.4, time + 0.01);
    gain.gain.linearRampToValueAtTime(0, time + 0.02);
    
    gain.gain.linearRampToValueAtTime(0.4, time + 0.03);
    gain.gain.linearRampToValueAtTime(0, time + 0.04);
    
    gain.gain.linearRampToValueAtTime(0.4, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    noiseSource.connect(filter);
    noiseSource.start(time);
    noiseSource.stop(time + 0.2);
  }

  playBass(time, freq, params) {
    if (!this.ctx || !this.bassGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = params.waveform;
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(params.resonance, time);
    
    filter.frequency.setValueAtTime(params.cutoff + params.envMod, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(params.cutoff, 10), time + params.decay);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.6, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, time + params.decay);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bassGain);

    osc.start(time);
    osc.stop(time + params.decay + 0.1);
  }

  createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

window.AudioEngine = AudioEngine;
