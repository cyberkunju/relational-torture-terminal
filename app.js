/**
 * Relational Torture Terminal - Main Application Logic
 * Cybernetic comic HUD theme with offset solid shadows.
 * Handles game state, settings toggling, modifiers, Web Audio API synth, and interactive visualizer.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Game State
  const state = {
    brainScore: 0,
    clownScore: 0,
    
    // Config options
    mode: 'network',
    numPremises: 3,
    presentationMode: 'standard', // 'standard' or 'carousel'
    soundEnabled: true,
    
    modifiers: {
      gibberish: false,
      stroop: true,
      negation: false,
      panic: false
    },
    
    // Active round variables
    currentPuzzle: null,
    carouselIndex: 0,
    timerInterval: null,
    timeRemaining: 0,
    maxTime: 15, // seconds (standard)
    startTime: 0,
    answered: false,
    hoveredNodeId: null
  };

  // Emojis list for premise lines
  const premiseEmojis = ['⏳', '⚙️', '🧮', '⚡', '💾', '📡', '🛠️', '🔑'];

  // DOM Elements
  const els = {
    // Header
    scoreBrain: document.getElementById('score-brain-val'),
    scoreClown: document.getElementById('score-clown-val'),
    btnOpenSettings: document.getElementById('btn-open-settings'),

    // Screens
    screenStart: document.getElementById('screen-start'),
    screenGame: document.getElementById('screen-game'),
    screenVerdict: document.getElementById('screen-verdict'),

    // Start Screen Config
    checkGibberish: document.getElementById('check-gibberish'),
    checkStroop: document.getElementById('check-stroop'),
    checkNegation: document.getElementById('check-negation'),
    checkPanic: document.getElementById('check-panic'),
    btnStartGame: document.getElementById('btn-start-game'),

    // Game Screen Elements
    gameTimerContainer: document.getElementById('game-timer-container'),
    gameTimerFill: document.getElementById('game-timer-fill'),
    gamePremises: document.getElementById('game-premises'),
    gameQuestion: document.getElementById('game-question'),
    btnChoiceTrue: document.getElementById('btn-choice-true'),
    btnChoiceFalse: document.getElementById('btn-choice-false'),

    // Verdict Screen Elements
    verdictTitle: document.getElementById('verdict-title'),
    verdictEfficiency: document.getElementById('verdict-efficiency'),
    verdictQuote: document.getElementById('verdict-quote'),
    btnRecover: document.getElementById('btn-recover'),
    btnGiveUp: document.getElementById('btn-giveup'),

    // Sidebar Drawer Controls
    settingsDrawer: document.getElementById('settings-drawer'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    btnApplySettings: document.getElementById('btn-apply-settings'),
    drawerMode: document.getElementById('drawer-mode'),
    drawerPremisesCount: document.getElementById('drawer-premises-count'),
    drawerPremisesVal: document.getElementById('drawer-premises-val'),
    drawerCheckGibberish: document.getElementById('drawer-check-gibberish'),
    drawerCheckStroop: document.getElementById('drawer-check-stroop'),
    drawerCheckNegation: document.getElementById('drawer-check-negation'),
    drawerCheckPanic: document.getElementById('drawer-check-panic'),

    // Review Panel
    drawerReview: document.getElementById('drawer-review'),
    canvas: document.getElementById('visualizer-canvas'),
    btnNextReview: document.getElementById('btn-next-review')
  };

  // Sound Synthesizer (Web Audio API)
  const sound = (() => {
    let ctx = null;

    function initCtx() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    }

    function playTone(freq, type, duration, gainStart = 0.1) {
      if (!state.soundEnabled) return;
      initCtx();
      
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      
      gainNode.gain.setValueAtTime(gainStart, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + duration);
    }

    return {
      click() {
        playTone(1600, 'sine', 0.04, 0.05);
      },
      bloop() {
        playTone(580, 'triangle', 0.1, 0.08);
      },
      correct() {
        if (!state.soundEnabled) return;
        initCtx();
        const now = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // Major arpeggio C5 -> C6
        notes.forEach((freq, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + index * 0.07);
          gain.gain.setValueAtTime(0.06, now + index * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.07 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + index * 0.07);
          osc.stop(now + index * 0.07 + 0.3);
        });
      },
      wrong() {
        if (!state.soundEnabled) return;
        initCtx();
        const now = ctx.currentTime;
        const notes = [160, 150]; // Discordant low buzz
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + idx * 0.05);
          gain.gain.setValueAtTime(0.12, now + idx * 0.05);
          gain.gain.linearRampToValueAtTime(0.0001, now + idx * 0.05 + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.05);
          osc.stop(now + idx * 0.05 + 0.45);
        });
      },
      alarm() {
        playTone(820, 'sine', 0.12, 0.06);
      }
    };
  })();

  // Core Init
  function init() {
    setupEventListeners();
    loadSettings();
    syncUIFromState();
    updateScoreHUD();
  }

  function setupEventListeners() {
    // Drawer Opening/Closing
    els.btnOpenSettings.addEventListener('click', () => {
      sound.bloop();
      syncDrawerFromState();
      els.settingsDrawer.classList.add('drawer-open');
    });

    els.btnCloseSettings.addEventListener('click', () => {
      sound.click();
      els.settingsDrawer.classList.remove('drawer-open');
    });

    // Start suffering button
    els.btnStartGame.addEventListener('click', () => {
      sound.click();
      syncStateFromStartScreen();
      saveSettings();
      
      els.screenStart.style.display = 'none';
      els.screenVerdict.style.display = 'none';
      els.screenGame.style.display = 'flex';
      
      startNewRound();
    });

    // Apply Settings button inside Drawer
    els.btnApplySettings.addEventListener('click', () => {
      sound.click();
      syncStateFromDrawer();
      saveSettings();
      els.settingsDrawer.classList.remove('drawer-open');
      
      // Return to game and restart puzzle
      els.screenStart.style.display = 'none';
      els.screenVerdict.style.display = 'none';
      els.screenGame.style.display = 'flex';
      
      startNewRound();
    });

    // Slider display updates
    els.drawerPremisesCount.addEventListener('input', (e) => {
      els.drawerPremisesVal.textContent = e.target.value;
    });

    // Choice Selection
    els.btnChoiceTrue.addEventListener('click', () => evaluateAnswer(true));
    els.btnChoiceFalse.addEventListener('click', () => evaluateAnswer(false));

    // Next round after review
    els.btnNextReview.addEventListener('click', () => {
      sound.click();
      els.drawerReview.style.display = 'none';
      startNewRound();
    });

    // Fail Recovery Actions
    els.btnRecover.addEventListener('click', () => {
      sound.click();
      // Keep score but allow user to try again
      els.screenVerdict.style.display = 'none';
      els.screenGame.style.display = 'flex';
      startNewRound();
    });

    els.btnGiveUp.addEventListener('click', () => {
      sound.click();
      // Hard reset
      state.brainScore = 0;
      state.clownScore = 0;
      updateScoreHUD();
      
      els.screenVerdict.style.display = 'none';
      els.screenGame.style.display = 'none';
      els.screenStart.style.display = 'flex';
    });

    // Canvas Mouse movements for review traces
    els.canvas.addEventListener('mousemove', (e) => {
      if (!state.currentPuzzle || !state.answered) return;
      const rect = els.canvas.getBoundingClientRect();
      const scaleX = els.canvas.width / rect.width;
      const scaleY = els.canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const nodeHit = Visualizer.hitTest(els.canvas, state.currentPuzzle, mouseX, mouseY);
      if (nodeHit !== state.hoveredNodeId) {
        state.hoveredNodeId = nodeHit;
        if (nodeHit) {
          sound.click();
        }
      }
    });

    els.canvas.addEventListener('mouseleave', () => {
      state.hoveredNodeId = null;
    });

    // Keyboard Hotkey controls
    document.addEventListener('keydown', (e) => {
      // Prevent shortcut interference in input fields
      if (document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'INPUT') {
        return;
      }

      const key = e.key.toLowerCase();
      
      // If playing the game
      if (els.screenGame.style.display === 'flex' && !state.answered) {
        if (key === 'arrowleft' || key === 't' || key === '1') {
          evaluateAnswer(true);
        } else if (key === 'arrowright' || key === 'f' || key === '2') {
          evaluateAnswer(false);
        } else if (key === ' ' || key === 'arrowdown') {
          e.preventDefault();
          if (state.presentationMode === 'carousel') {
            navigateCarouselNext();
          }
        }
      } else if (els.drawerReview.style.display === 'flex') {
        if (key === ' ' || key === 'enter') {
          e.preventDefault();
          els.btnNextReview.click();
        }
      } else if (els.screenVerdict.style.display === 'flex') {
        if (key === ' ' || key === 'enter' || key === 'r') {
          e.preventDefault();
          els.btnRecover.click();
        }
      }
    });
  }

  // Load and save settings helpers
  function saveSettings() {
    localStorage.setItem('rt_torture_settings', JSON.stringify({
      mode: state.mode,
      numPremises: state.numPremises,
      presentationMode: state.presentationMode,
      modifiers: state.modifiers
    }));
  }

  function loadSettings() {
    const raw = localStorage.getItem('rt_torture_settings');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      state.mode = data.mode || 'network';
      state.numPremises = data.numPremises || 3;
      state.presentationMode = data.presentationMode || 'standard';
      if (data.modifiers) {
        state.modifiers = { ...state.modifiers, ...data.modifiers };
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    }
  }

  function syncUIFromState() {
    // Sync Start screen checkmarks
    els.checkGibberish.checked = state.modifiers.gibberish;
    els.checkStroop.checked = state.modifiers.stroop;
    els.checkNegation.checked = state.modifiers.negation;
    els.checkPanic.checked = state.modifiers.panic;

    // Sync Drawer elements
    els.drawerMode.value = state.mode;
    els.drawerPremisesCount.value = state.numPremises;
    els.drawerPremisesVal.textContent = state.numPremises;
    
    document.getElementsByName('drawer-presentation').forEach(radio => {
      radio.checked = radio.value === state.presentationMode;
    });

    els.drawerCheckGibberish.checked = state.modifiers.gibberish;
    els.drawerCheckStroop.checked = state.modifiers.stroop;
    els.drawerCheckNegation.checked = state.modifiers.negation;
    els.drawerCheckPanic.checked = state.modifiers.panic;
  }

  function syncDrawerFromState() {
    els.drawerMode.value = state.mode;
    els.drawerPremisesCount.value = state.numPremises;
    els.drawerPremisesVal.textContent = state.numPremises;
    els.drawerCheckGibberish.checked = state.modifiers.gibberish;
    els.drawerCheckStroop.checked = state.modifiers.stroop;
    els.drawerCheckNegation.checked = state.modifiers.negation;
    els.drawerCheckPanic.checked = state.modifiers.panic;
    
    document.getElementsByName('drawer-presentation').forEach(radio => {
      radio.checked = radio.value === state.presentationMode;
    });
  }

  function syncStateFromStartScreen() {
    state.modifiers.gibberish = els.checkGibberish.checked;
    state.modifiers.stroop = els.checkStroop.checked;
    state.modifiers.negation = els.checkNegation.checked;
    state.modifiers.panic = els.checkPanic.checked;
    
    // Keep drawer values in sync
    syncUIFromState();
  }

  function syncStateFromDrawer() {
    state.mode = els.drawerMode.value;
    state.numPremises = parseInt(els.drawerPremisesCount.value);
    
    document.getElementsByName('drawer-presentation').forEach(radio => {
      if (radio.checked) {
        state.presentationMode = radio.value;
      }
    });

    state.modifiers.gibberish = els.drawerCheckGibberish.checked;
    state.modifiers.stroop = els.drawerCheckStroop.checked;
    state.modifiers.negation = els.drawerCheckNegation.checked;
    state.modifiers.panic = els.drawerCheckPanic.checked;

    // Keep start page values in sync
    syncUIFromState();
  }

  function updateScoreHUD() {
    els.scoreBrain.textContent = `🧠:${state.brainScore}`;
    els.scoreClown.textContent = `🤡:${state.clownScore}`;
  }

  // Stroop Mode color interference wrapper
  function applyStroopColoring(text) {
    if (!state.modifiers.stroop) return text;
    
    let result = text;
    // Target keywords to apply mismatched neon coloring
    const keywords = [
      'faster than', 'slower than', 'lower latency', 'higher latency',
      'contains all changes', 'does NOT contain changes', 'depends on',
      'conflicts with', 'inherits from', 'extends', 'HIGH (1)', 'LOW (0)',
      'not LOW (0)', 'not HIGH (1)'
    ];

    const colorsPool = ['color-p-green', 'color-p-pink', 'color-p-cyan', 'color-p-white'];
    
    // Sort words descending in length to prevent inner substring replacements
    keywords.sort((a,b) => b.length - a.length);

    keywords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      // Assign a random mismatch color
      const colorClass = colorsPool[Math.floor(Math.random() * colorsPool.length)];
      result = result.replace(regex, `<span class="${colorClass}">${word}</span>`);
    });

    return result;
  }

  // Game Round Control
  function startNewRound() {
    Visualizer.stop();
    state.hoveredNodeId = null;
    state.answered = false;
    state.carouselIndex = 0;

    // Generate puzzle mapping modifiers
    state.currentPuzzle = Generator.generate(state.mode, state.numPremises, {
      gibberish: state.modifiers.gibberish,
      negation: state.modifiers.negation
    });

    renderPuzzleConsole();

    // Start timer countdown
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }

    state.maxTime = state.modifiers.panic ? 3.0 : 15.0; // 3 seconds panic limit!
    state.timeRemaining = state.maxTime;
    
    els.gameTimerFill.style.width = '100%';
    els.gameTimerFill.classList.remove('alert-fill');

    state.timerInterval = setInterval(() => {
      state.timeRemaining -= 0.05;
      if (state.timeRemaining <= 0) {
        state.timeRemaining = 0;
        updateTimerProgressBar();
        clearInterval(state.timerInterval);
        handleTimeoutFail();
      } else {
        updateTimerProgressBar();
        // Beep alarm in the last 1.2 seconds of panic timer or 3 seconds of standard
        const warningTrigger = state.modifiers.panic ? 1.2 : 3.0;
        if (state.timeRemaining <= warningTrigger && Math.floor(state.timeRemaining * 10) % 5 === 0) {
          sound.alarm();
        }
      }
    }, 50);

    state.startTime = performance.now();
  }

  function updateTimerProgressBar() {
    const percentage = (state.timeRemaining / state.maxTime) * 100;
    els.gameTimerFill.style.width = `${percentage}%`;
    
    const warningTrigger = state.modifiers.panic ? 1.2 : 3.5;
    if (state.timeRemaining <= warningTrigger) {
      els.gameTimerFill.classList.add('alert-fill');
    } else {
      els.gameTimerFill.classList.remove('alert-fill');
    }
  }

  function renderPuzzleConsole() {
    const pz = state.currentPuzzle;
    
    // Clear premises container
    els.gamePremises.innerHTML = '';
    
    if (state.presentationMode === 'standard') {
      // Add all premises with random emojis
      pz.premises.forEach((premiseText) => {
        const item = document.createElement('div');
        item.className = 'premise-item';
        
        const randomEmoji = premiseEmojis[Math.floor(Math.random() * premiseEmojis.length)];
        item.innerHTML = `${randomEmoji} ${applyStroopColoring(premiseText)}`;
        els.gamePremises.appendChild(item);
      });
      
      // Set question
      els.gameQuestion.innerHTML = applyStroopColoring(pz.conclusion);
    } else {
      // Carousel Mode initialization
      showCarouselPremise(0);
    }
  }

  function showCarouselPremise(idx) {
    state.carouselIndex = idx;
    const pz = state.currentPuzzle;
    
    els.gamePremises.innerHTML = '';
    
    // Show one active premise
    const item = document.createElement('div');
    item.className = 'premise-item';
    const randomEmoji = premiseEmojis[Math.floor(Math.random() * premiseEmojis.length)];
    item.innerHTML = `${randomEmoji} ${applyStroopColoring(pz.premises[idx])}`;
    els.gamePremises.appendChild(item);

    // Question holds placeholder until carousel completes
    if (idx === pz.premises.length - 1) {
      els.gameQuestion.innerHTML = `<em>TAP SPACEBAR TO DEDUCE...</em>`;
    } else {
      els.gameQuestion.innerHTML = `<em>TAP SPACEBAR FOR NEXT LOG LINE...</em>`;
    }
  }

  function navigateCarouselNext() {
    sound.click();
    const maxIdx = state.currentPuzzle.premises.length - 1;
    const nextIdx = state.carouselIndex + 1;
    
    if (nextIdx > maxIdx) {
      // Reveal the question statement
      els.gameQuestion.innerHTML = applyStroopColoring(state.currentPuzzle.conclusion);
    } else {
      showCarouselPremise(nextIdx);
    }
  }

  // Answer Evaluation
  function evaluateAnswer(userChoice) {
    if (state.answered) return;
    state.answered = true;

    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }

    const isCorrect = userChoice === state.currentPuzzle.correctAnswer;
    
    if (isCorrect) {
      state.brainScore++;
      updateScoreHUD();
      sound.correct();
      
      // Reveal diagram reviewer
      revealReviewOverlay();
    } else {
      state.clownScore++;
      updateScoreHUD();
      sound.wrong();
      
      // Show failure verdict card
      triggerFailureVerdict();
    }
  }

  function handleTimeoutFail() {
    state.answered = true;
    state.clownScore++;
    updateScoreHUD();
    sound.wrong();
    
    triggerFailureVerdict("SYSTEM TIMEOUT - COGNITIVE BUFFER FLUSHED");
  }

  function revealReviewOverlay() {
    els.drawerReview.style.display = 'flex';
    Visualizer.render(els.canvas, state.currentPuzzle);
  }

  function triggerFailureVerdict(customMessage = null) {
    els.screenGame.style.display = 'none';
    els.screenVerdict.style.display = 'flex';

    // Calculate accuracy percentage
    const total = state.brainScore + state.clownScore;
    const efficiency = total > 0 ? Math.round((state.brainScore / total) * 100) : 0;
    
    els.verdictEfficiency.textContent = `${efficiency}%`;

    // Verdict rankings
    let verdict = 'SMOOTH BRAIN 🤡';
    let quote = '"My pet rock scored higher than you. Do better."';
    
    if (customMessage) {
      quote = customMessage;
    } else {
      if (efficiency >= 90) {
        verdict = 'SYNTACTIC GOD ⚡';
        quote = '"Absolute logical transcendence. System fully optimized. Proceed with extreme arrogance."';
      } else if (efficiency >= 70) {
        verdict = 'GIGA BRAIN 🧠';
        quote = '"Highly efficient logical routing detected. Good compilation."';
      } else if (efficiency >= 40) {
        verdict = 'AVERAGE COMPILER ⚙️';
        quote = '"Not terrible. But you won\'t replace ChatGPT anytime soon."';
      } else {
        verdict = 'SMOOTH BRAIN 🤡';
        quote = '"My pet rock scored higher than you. Do better."';
      }
    }

    els.verdictTitle.textContent = `FINAL VERDICT: ${verdict}`;
    els.verdictQuote.textContent = quote;
  }

  init();
});
