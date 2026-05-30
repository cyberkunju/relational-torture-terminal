/**
 * Do you have brains - Main Application Logic
 * Cybernetic comic HUD theme with offset solid shadows.
 * Handles game state, settings toggling, modifiers, Web Audio API synth, and interactive visualizer.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Game State
  const state = {
    brainScore: 0,
    clownScore: 0,
    pointsScore: 0,
    streak: 0,
    bestStreak: 0,
    roundsPlayed: 0,
    
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
    conclusionRevealed: false,
    timerInterval: null,
    timeRemaining: 0,
    maxTime: 15, // seconds (standard)
    startTime: 0,
    answered: false,
    hoveredNodeId: null,
    runSubmitted: false
  };

  // Holds a finished run captured before sign-in, replayed once a profile exists.
  let pendingRun = null;

  // Lucide icon names cycled as premise bullet markers
  const premiseIcons = ['terminal', 'cpu', 'database', 'zap', 'git-commit-horizontal', 'radio', 'wrench', 'key-round'];

  // Re-render any <i data-lucide> elements injected after initial load
  function renderIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // DOM Elements
  const els = {
    // Header
    scorePoints: document.getElementById('score-points-val'),
    scoreBrain: document.getElementById('score-brain-val'),
    scoreClown: document.getElementById('score-clown-val'),
    scoreStreak: document.getElementById('score-streak-val'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnOpenLeaderboard: document.getElementById('btn-open-leaderboard'),
    btnAccount: document.getElementById('btn-account'),
    accountAvatar: document.getElementById('account-avatar'),
    accountName: document.getElementById('account-name'),
    scorePopup: document.getElementById('score-popup'),

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
    btnStartGameBottom: document.getElementById('btn-start-game-bottom'),

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
    verdictPoints: document.getElementById('verdict-points'),
    verdictRank: document.getElementById('verdict-rank'),
    verdictRankText: document.getElementById('verdict-rank-text'),
    verdictQuote: document.getElementById('verdict-quote'),
    btnViewBoard: document.getElementById('btn-view-board'),
    btnRecover: document.getElementById('btn-recover'),
    btnGiveUp: document.getElementById('btn-giveup'),
    btnHeroLeaderboard: document.getElementById('btn-hero-leaderboard'),

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
    btnNextReview: document.getElementById('btn-next-review'),
    btnEndSession: document.getElementById('btn-end-session'),
    reviewStatus: document.getElementById('review-status'),
    reviewStatusTitle: document.getElementById('review-status-title'),
    reviewStatusDetail: document.getElementById('review-status-detail'),

    // Leaderboard overlay
    leaderboardOverlay: document.getElementById('leaderboard-overlay'),
    btnCloseLeaderboard: document.getElementById('btn-close-leaderboard'),
    lbList: document.getElementById('lb-list'),
    lbEmpty: document.getElementById('lb-empty'),
    lbLive: document.getElementById('lb-live'),
    lbYou: document.getElementById('lb-you'),
    lbSubtitle: document.getElementById('lb-subtitle'),
    lbTabs: Array.from(document.querySelectorAll('.lb-tab')),

    // Auth modal
    authOverlay: document.getElementById('auth-overlay'),
    btnCloseAuth: document.getElementById('btn-close-auth'),
    authStepSignin: document.getElementById('auth-step-signin'),
    authStepUsername: document.getElementById('auth-step-username'),
    authStepAccount: document.getElementById('auth-step-account'),
    btnSigninGoogle: document.getElementById('btn-signin-google'),
    btnSigninGuest: document.getElementById('btn-signin-guest'),
    authSigninError: document.getElementById('auth-signin-error'),
    authUsernameInput: document.getElementById('auth-username-input'),
    btnConfirmUsername: document.getElementById('btn-confirm-username'),
    authUsernameError: document.getElementById('auth-username-error'),
    accountStepAvatar: document.getElementById('account-step-avatar'),
    accountStepName: document.getElementById('account-step-name'),
    accountStepMeta: document.getElementById('account-step-meta'),
    accountBest: document.getElementById('account-best'),
    accountRank: document.getElementById('account-rank'),
    accountRuns: document.getElementById('account-runs'),
    btnRename: document.getElementById('btn-rename'),
    btnSignout: document.getElementById('btn-signout')
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
    renderIcons();
    // Boot the leaderboard / auth layer (safe if Supabase is unreachable).
    if (window.Leaderboard && typeof lbUI !== 'undefined') {
      lbUI.start().catch(err => console.warn('Leaderboard start failed', err));
    }
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

      // Fresh session: reset score and streak
      resetSession();

      els.screenStart.style.display = 'none';
      els.screenVerdict.style.display = 'none';
      els.screenGame.style.display = 'flex';
      
      startNewRound();
    });

    // Secondary start button at the bottom of the landing page
    if (els.btnStartGameBottom) {
      els.btnStartGameBottom.addEventListener('click', () => {
        els.btnStartGame.click();
      });
    }

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

    // End the session from the review overlay -> show summary verdict
    if (els.btnEndSession) {
      els.btnEndSession.addEventListener('click', () => {
        sound.click();
        endSession();
      });
    }

    // Verdict screen: start a fresh session (reset score) and play again
    els.btnRecover.addEventListener('click', () => {
      sound.click();
      resetSession();
      els.screenVerdict.style.display = 'none';
      els.screenGame.style.display = 'flex';
      startNewRound();
    });

    els.btnGiveUp.addEventListener('click', () => {
      sound.click();
      // Hard reset back to the landing page
      resetSession();
      
      els.screenVerdict.style.display = 'none';
      els.screenGame.style.display = 'none';
      els.screenStart.style.display = 'flex';
    });

    // Canvas Mouse movements for review traces
    els.canvas.addEventListener('mousemove', (e) => {
      if (!state.currentPuzzle || !state.answered) return;
      const rect = els.canvas.getBoundingClientRect();
      // hitTest works in CSS-pixel space, so use coords relative to the element.
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const nodeHit = Visualizer.hitTest(els.canvas, state.currentPuzzle, mouseX, mouseY);
      if (nodeHit !== state.hoveredNodeId) {
        state.hoveredNodeId = nodeHit;
        Visualizer.setHighlight(nodeHit);
        if (nodeHit) {
          sound.click();
        }
      }
    });

    els.canvas.addEventListener('mouseleave', () => {
      state.hoveredNodeId = null;
      Visualizer.setHighlight(null);
    });

    // Touch support: tap a node to trace its paths on mobile.
    els.canvas.addEventListener('touchstart', (e) => {
      if (!state.currentPuzzle || !state.answered) return;
      const touch = e.touches[0];
      if (!touch) return;
      const rect = els.canvas.getBoundingClientRect();
      const mouseX = touch.clientX - rect.left;
      const mouseY = touch.clientY - rect.top;
      const nodeHit = Visualizer.hitTest(els.canvas, state.currentPuzzle, mouseX, mouseY);
      state.hoveredNodeId = nodeHit;
      Visualizer.setHighlight(nodeHit);
      if (nodeHit) sound.click();
    }, { passive: true });

    // Keyboard Hotkey controls
    document.addEventListener('keydown', (e) => {
      // Prevent shortcut interference in input fields
      if (document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'INPUT') {
        return;
      }

      const key = e.key.toLowerCase();
      
      // If playing the game
      if (els.screenGame.style.display === 'flex' && !state.answered) {
        // In carousel mode, premises must be revealed before answering is allowed.
        const carouselLocked = state.presentationMode === 'carousel' &&
          state.carouselIndex < (state.currentPuzzle ? state.currentPuzzle.premises.length - 1 : 0);

        if (key === ' ' || key === 'arrowdown') {
          e.preventDefault();
          if (state.presentationMode === 'carousel') {
            navigateCarouselNext();
          }
        } else if (carouselLocked) {
          // Ignore TRUE/FALSE keys until the full chain has been shown.
          return;
        } else if (key === 'arrowright' || key === 't' || key === '1') {
          // TRUE button sits on the right
          evaluateAnswer(true);
        } else if (key === 'arrowleft' || key === 'f' || key === '2') {
          // FALSE button sits on the left
          evaluateAnswer(false);
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

  function resetSession() {
    state.brainScore = 0;
    state.clownScore = 0;
    state.pointsScore = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.roundsPlayed = 0;
    state.runSubmitted = false;
    updateScoreHUD();
  }

  function updateScoreHUD() {
    if (els.scorePoints) els.scorePoints.textContent = `${state.pointsScore}`;
    els.scoreBrain.textContent = `${state.brainScore}`;
    els.scoreClown.textContent = `${state.clownScore}`;
    if (els.scoreStreak) els.scoreStreak.textContent = `${state.streak}`;
  }

  // Stroop Mode color interference wrapper
  function applyStroopColoring(text) {
    if (!state.modifiers.stroop) return text;

    let result = text;
    // Target keywords to apply mismatched neon coloring. Includes negation-mode
    // phrasings so Stroop still bites when Negation is also active.
    const keywords = [
      'is not slower than', 'is not faster than', 'is faster than', 'is slower than',
      'does not have higher latency than', 'does not have lower latency than',
      'has lower latency than', 'has higher latency than',
      'is not missing any changes from', 'is missing some changes from',
      'contains all changes from', 'does NOT contain changes from',
      'is not independent of', 'depends on', 'is not compatible with', 'conflicts with',
      'does not lack the properties and methods of', 'lacks the properties and methods of',
      'inherits properties and methods from',
      'not LOW (0)', 'not HIGH (1)', 'HIGH (1)', 'LOW (0)'
    ];

    const colorsPool = ['color-p-green', 'color-p-pink', 'color-p-cyan', 'color-p-white'];

    // Longest phrases first so we never color a fragment of a longer phrase.
    keywords.sort((a, b) => b.length - a.length);

    keywords.forEach(word => {
      // Escape regex-special characters (parentheses in "HIGH (1)" etc.)
      const escaped = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
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
    state.conclusionRevealed = false;

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
      // All premises visible at once -> answering allowed immediately.
      state.conclusionRevealed = true;
      // Add all premises with cycling icon markers
      pz.premises.forEach((premiseText, i) => {
        const item = document.createElement('div');
        item.className = 'premise-item';
        
        const iconName = premiseIcons[i % premiseIcons.length];
        item.innerHTML = `<i data-lucide="${iconName}"></i> ${applyStroopColoring(premiseText)}`;
        els.gamePremises.appendChild(item);
      });
      
      // Set question
      els.gameQuestion.innerHTML = applyStroopColoring(pz.conclusion);
    } else {
      // Carousel mode -> conclusion hidden until the chain is stepped through.
      state.conclusionRevealed = false;
      showCarouselPremise(0);
    }
    updateChoiceAvailability();
    renderIcons();
  }

  // Disable TRUE/FALSE until the conclusion is on screen (carousel mode).
  function updateChoiceAvailability() {
    const ready = state.conclusionRevealed;
    [els.btnChoiceTrue, els.btnChoiceFalse].forEach(btn => {
      btn.disabled = !ready;
      btn.classList.toggle('btn-locked', !ready);
    });
  }

  function showCarouselPremise(idx) {
    state.carouselIndex = idx;
    const pz = state.currentPuzzle;
    
    els.gamePremises.innerHTML = '';
    
    // Show one active premise
    const item = document.createElement('div');
    item.className = 'premise-item';
    const iconName = premiseIcons[idx % premiseIcons.length];
    item.innerHTML = `<i data-lucide="${iconName}"></i> ${applyStroopColoring(pz.premises[idx])}`;
    els.gamePremises.appendChild(item);

    // Question holds placeholder until carousel completes
    if (idx === pz.premises.length - 1) {
      els.gameQuestion.innerHTML = `<em>TAP SPACEBAR TO DEDUCE...</em>`;
    } else {
      els.gameQuestion.innerHTML = `<em>TAP SPACEBAR FOR NEXT LOG LINE...</em>`;
    }
    renderIcons();
  }

  function navigateCarouselNext() {
    sound.click();
    const maxIdx = state.currentPuzzle.premises.length - 1;
    const nextIdx = state.carouselIndex + 1;
    
    if (nextIdx > maxIdx) {
      // Reveal the question statement and unlock answering.
      els.gameQuestion.innerHTML = applyStroopColoring(state.currentPuzzle.conclusion);
      state.conclusionRevealed = true;
      updateChoiceAvailability();
    } else {
      showCarouselPremise(nextIdx);
    }
  }

  // Answer Evaluation
  function evaluateAnswer(userChoice) {
    if (state.answered) return;
    // In carousel mode, block answers until the conclusion has been revealed.
    if (!state.conclusionRevealed) return;
    state.answered = true;

    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }

    const isCorrect = userChoice === state.currentPuzzle.correctAnswer;
    state.roundsPlayed++;

    if (isCorrect) {
      state.brainScore++;
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;

      // Award points through the balanced scoring engine.
      const breakdown = Scoring.breakdown({
        correct: true,
        timeRemaining: state.timeRemaining,
        maxTime: state.maxTime,
        premises: currentPremiseCount(),
        streakAfter: state.streak,
        modifiers: state.modifiers
      });
      state.pointsScore += breakdown.total;
      updateScoreHUD();
      showScorePopup(breakdown);
      sound.correct();
      revealReviewOverlay('correct');
    } else {
      state.clownScore++;
      state.streak = 0;
      updateScoreHUD();
      showScorePopup(null);
      sound.wrong();
      revealReviewOverlay('wrong');
    }
  }

  function handleTimeoutFail() {
    if (state.answered) return;
    state.answered = true;
    state.roundsPlayed++;
    state.clownScore++;
    state.streak = 0;
    updateScoreHUD();
    showScorePopup(null);
    sound.wrong();

    revealReviewOverlay('timeout');
  }

  // How many premises are actually in the current puzzle (drives difficulty).
  function currentPremiseCount() {
    return (state.currentPuzzle && state.currentPuzzle.premises)
      ? state.currentPuzzle.premises.length
      : state.numPremises;
  }

  // Floating "+340" popup with multiplier breakdown on the game screen.
  function showScorePopup(breakdown) {
    const el = els.scorePopup;
    if (!el) return;
    el.classList.remove('show', 'miss');
    // Force reflow so the animation restarts on rapid consecutive rounds.
    void el.offsetWidth;

    if (breakdown && breakdown.total > 0) {
      const mults = [];
      if (breakdown.streakMult > 1.001) mults.push(`×${breakdown.streakMult.toFixed(1)} streak`);
      if (breakdown.chaosMult > 1.001) mults.push(`×${breakdown.chaosMult.toFixed(1)} chaos`);
      if (breakdown.difficultyMult > 1.001) mults.push(`×${breakdown.difficultyMult.toFixed(2)} diff`);
      el.innerHTML = `<span class="sp-points">+${breakdown.total}</span>` +
        `<span class="sp-mults">${mults.join('  ')}</span>`;
    } else {
      el.classList.add('miss');
      el.innerHTML = `<span class="sp-points">+0</span>` +
        `<span class="sp-mults">streak reset</span>`;
    }
    el.classList.add('show');
  }

  // Human-readable statement of the actual correct answer for this puzzle.
  function correctAnswerLabel() {
    return state.currentPuzzle.correctAnswer ? 'TRUE' : 'FALSE';
  }

  function revealReviewOverlay(outcome) {
    const banner = els.reviewStatus;
    const title = els.reviewStatusTitle;
    const detail = els.reviewStatusDetail;

    // Reset outcome classes
    banner.classList.remove('status-correct', 'status-wrong', 'status-timeout');

    if (outcome === 'correct') {
      banner.classList.add('status-correct');
      banner.innerHTML = `<span class="review-status-icon"><i data-lucide="circle-check-big"></i></span>` +
        `<div class="review-status-text">` +
        `<span class="review-status-title">CORRECT — STREAK ${state.streak}</span>` +
        `<span class="review-status-detail">Logic chain validated. The answer was ${correctAnswerLabel()}.</span>` +
        `</div>`;
    } else if (outcome === 'wrong') {
      banner.classList.add('status-wrong');
      banner.innerHTML = `<span class="review-status-icon"><i data-lucide="circle-x"></i></span>` +
        `<div class="review-status-text">` +
        `<span class="review-status-title">WRONG</span>` +
        `<span class="review-status-detail">The correct answer was ${correctAnswerLabel()}. Trace the graph below to see why.</span>` +
        `</div>`;
    } else {
      banner.classList.add('status-timeout');
      banner.innerHTML = `<span class="review-status-icon"><i data-lucide="timer-off"></i></span>` +
        `<div class="review-status-text">` +
        `<span class="review-status-title">TIME'S UP</span>` +
        `<span class="review-status-detail">Cognitive buffer flushed. The answer was ${correctAnswerLabel()}.</span>` +
        `</div>`;
    }

    els.drawerReview.style.display = 'flex';
    renderIcons();
    Visualizer.render(els.canvas, state.currentPuzzle);
  }

  function endSession() {
    els.drawerReview.style.display = 'none';
    triggerVerdictSummary();
  }

  function triggerVerdictSummary() {
    els.screenGame.style.display = 'none';
    els.screenVerdict.style.display = 'flex';

    // Calculate accuracy percentage across the whole session
    const total = state.brainScore + state.clownScore;
    const efficiency = total > 0 ? Math.round((state.brainScore / total) * 100) : 0;

    els.verdictEfficiency.textContent = `${efficiency}%`;

    // Verdict rankings based on full-session efficiency
    let verdict = 'SMOOTH BRAIN';
    let verdictIcon = 'skull';
    let quote = '"My pet rock scored higher than you. Do better."';

    if (total === 0) {
      verdict = 'NO DATA';
      verdictIcon = 'circle-help';
      quote = '"You bailed before answering anything. Bold strategy."';
    } else if (efficiency >= 90) {
      verdict = 'SYNTACTIC GOD';
      verdictIcon = 'zap';
      quote = '"Absolute logical transcendence. System fully optimized. Proceed with extreme arrogance."';
    } else if (efficiency >= 70) {
      verdict = 'GIGA BRAIN';
      verdictIcon = 'brain';
      quote = '"Highly efficient logical routing detected. Good compilation."';
    } else if (efficiency >= 40) {
      verdict = 'AVERAGE COMPILER';
      verdictIcon = 'settings';
      quote = '"Not terrible. But you won\'t replace ChatGPT anytime soon."';
    }

    els.verdictTitle.innerHTML = `FINAL VERDICT: ${verdict} <i data-lucide="${verdictIcon}"></i>`;
    els.verdictQuote.textContent =
      `${quote}  —  ${state.brainScore} correct / ${state.clownScore} wrong · best streak ${state.bestStreak}`;

    // Total points scored this session
    if (els.verdictPoints) els.verdictPoints.textContent = `${state.pointsScore}`;

    renderIcons();

    // Push the run to the global leaderboard (best-effort, non-blocking).
    submitSessionToLeaderboard();
  }

  // Send the finished session to Supabase and show the resulting global rank.
  async function submitSessionToLeaderboard() {
    const rankEl = els.verdictRank;
    const textEl = els.verdictRankText;
    if (!rankEl) return;

    // Nothing meaningful to submit, or already submitted this session.
    if (state.pointsScore <= 0 || state.runSubmitted) {
      rankEl.style.display = 'none';
      return;
    }

    if (!window.Leaderboard || !Leaderboard.isOnline()) {
      rankEl.style.display = 'none';
      return;
    }

    const total = state.brainScore + state.clownScore;
    const run = {
      score: state.pointsScore,
      accuracy: Scoring.accuracy(state.brainScore, state.clownScore),
      bestStreak: state.bestStreak,
      rounds: state.roundsPlayed || total,
      correct: state.brainScore,
      wrong: state.clownScore,
      mode: state.mode,
      maxPremises: state.numPremises,
      modifiers: state.modifiers
    };

    // Not signed in yet → offer to join the board.
    if (!Leaderboard.isSignedIn() || Leaderboard.needsUsername()) {
      rankEl.style.display = 'inline-flex';
      textEl.innerHTML = `Sign in to bank <span class="hl">${state.pointsScore}</span> points on the board`;
      rankEl.style.cursor = 'pointer';
      rankEl.onclick = () => { pendingRun = run; openAuth(); };
      return;
    }

    rankEl.style.display = 'inline-flex';
    rankEl.style.cursor = 'default';
    rankEl.onclick = null;
    textEl.textContent = 'Submitting to leaderboard…';

    try {
      const result = await Leaderboard.submitRun(run);
      state.runSubmitted = true;
      if (result) {
        const isBest = state.pointsScore >= (result.best_score || 0);
        textEl.innerHTML = isBest
          ? `New personal best! Global rank <span class="hl">#${result.rank}</span>`
          : `Banked. Your best still ranks <span class="hl">#${result.rank}</span>`;
      } else {
        textEl.textContent = 'Could not reach the leaderboard.';
      }
    } catch (err) {
      console.warn('submitSessionToLeaderboard', err);
      textEl.textContent = 'Could not reach the leaderboard.';
    }
  }

  // ============================================================
  //  AUTH + LEADERBOARD UI CONTROLLER
  // ============================================================
  const lbUI = (() => {
    let currentScope = 'all';
    let cachedRows = [];
    let unsubscribeLive = null;
    let usernameMode = 'claim'; // 'claim' (first time) or 'rename'

    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    // ---- Header account chip reflects current auth state.
    function refreshAccountChip() {
      const profile = Leaderboard.getProfile && Leaderboard.getProfile();
      const signedIn = Leaderboard.isSignedIn && Leaderboard.isSignedIn();
      if (!Leaderboard.isOnline()) {
        els.accountName.textContent = 'OFFLINE';
        els.accountAvatar.innerHTML = '<i data-lucide="wifi-off"></i>';
      } else if (signedIn && profile) {
        els.accountName.textContent = profile.username;
        const meta = (Leaderboard.getSession().user || {}).user_metadata || {};
        const avatar = profile.avatar_url || meta.avatar_url || meta.picture;
        els.accountAvatar.innerHTML = avatar
          ? `<img src="${escapeHtml(avatar)}" alt="">`
          : '<i data-lucide="user-round-check"></i>';
      } else if (signedIn && !profile) {
        els.accountName.textContent = 'PICK NAME';
        els.accountAvatar.innerHTML = '<i data-lucide="user-round-cog"></i>';
      } else {
        els.accountName.textContent = 'SIGN IN';
        els.accountAvatar.innerHTML = '<i data-lucide="user-round"></i>';
      }
      renderIcons();
    }

    // ---- Auth modal step switching.
    function showAuthStep(step) {
      els.authStepSignin.style.display = step === 'signin' ? 'block' : 'none';
      els.authStepUsername.style.display = step === 'username' ? 'block' : 'none';
      els.authStepAccount.style.display = step === 'account' ? 'block' : 'none';
    }

    function openAuth() {
      if (!Leaderboard.isOnline()) {
        // Offline: nothing to sign into.
        return;
      }
      els.authSigninError.textContent = '';
      els.authUsernameError.textContent = '';

      const signedIn = Leaderboard.isSignedIn();
      const profile = Leaderboard.getProfile();

      if (signedIn && profile) {
        renderAccountStep();
        showAuthStep('account');
      } else if (signedIn && !profile) {
        prepUsernameStep();
        showAuthStep('username');
      } else {
        showAuthStep('signin');
      }
      els.authOverlay.style.display = 'flex';
      renderIcons();
    }

    function closeAuth() {
      els.authOverlay.style.display = 'none';
    }

    function prepUsernameStep() {
      usernameMode = Leaderboard.getProfile() ? 'rename' : 'claim';
      els.authUsernameInput.value = usernameMode === 'rename'
        ? Leaderboard.getProfile().username
        : Leaderboard.suggestedUsername();
      els.authUsernameError.textContent = '';
      setTimeout(() => els.authUsernameInput.focus(), 50);
    }

    async function renderAccountStep() {
      const profile = Leaderboard.getProfile();
      if (!profile) return;
      els.accountStepName.textContent = profile.username;
      const meta = (Leaderboard.getSession().user || {}).user_metadata || {};
      const avatar = profile.avatar_url || meta.avatar_url || meta.picture;
      els.accountStepAvatar.innerHTML = avatar
        ? `<img src="${escapeHtml(avatar)}" alt="">`
        : '<i data-lucide="user-round-check"></i>';
      els.accountStepMeta.textContent = profile.is_guest ? 'Guest account' : 'Signed in with Google';
      els.accountBest.textContent = `${profile.best_score || 0}`;
      els.accountRuns.textContent = `${profile.total_runs || 0}`;
      els.accountRank.textContent = '…';
      renderIcons();

      // Resolve the player's live global rank from the board.
      const rows = await Leaderboard.fetchTop(100);
      const mine = rows.find(r => r.user_id === profile.user_id);
      els.accountRank.textContent = mine ? `#${mine.rank}` : '—';
    }

    // ---- Sign-in handlers.
    async function doGoogle() {
      els.authSigninError.textContent = '';
      try {
        await Leaderboard.signInWithGoogle(); // redirects away
      } catch (err) {
        els.authSigninError.textContent = 'Google sign-in is unavailable right now.';
      }
    }

    async function doGuest() {
      els.authSigninError.textContent = '';
      els.btnSigninGuest.disabled = true;
      try {
        await Leaderboard.signInAsGuest();
        prepUsernameStep();
        showAuthStep('username');
      } catch (err) {
        els.authSigninError.textContent = 'Could not start a guest session.';
      } finally {
        els.btnSigninGuest.disabled = false;
      }
    }

    async function confirmUsername() {
      const name = els.authUsernameInput.value.trim();
      els.authUsernameError.textContent = '';
      if (name.length < 2 || name.length > 24) {
        els.authUsernameError.textContent = 'Use 2–24 characters.';
        return;
      }
      els.btnConfirmUsername.disabled = true;
      try {
        await Leaderboard.setUsername(name);
        refreshAccountChip();
        // If a finished run was waiting on a username, submit it now.
        if (pendingRun) {
          const run = pendingRun;
          pendingRun = null;
          const result = await Leaderboard.submitRun(run);
          state.runSubmitted = true;
          if (result && els.verdictRank && els.screenVerdict.style.display === 'flex') {
            els.verdictRank.style.cursor = 'default';
            els.verdictRank.onclick = null;
            els.verdictRankText.innerHTML = `Banked! Global rank <span class="hl">#${result.rank}</span>`;
            renderIcons();
          }
        }
        renderAccountStep();
        showAuthStep('account');
      } catch (err) {
        const code = (err && err.message) || '';
        if (code === 'USERNAME_TAKEN') {
          els.authUsernameError.textContent = 'That callsign is taken — try another.';
        } else if (code === 'BAD_USERNAME') {
          els.authUsernameError.textContent = 'Use 2–24 characters.';
        } else {
          els.authUsernameError.textContent = 'Could not save that name.';
        }
      } finally {
        els.btnConfirmUsername.disabled = false;
      }
    }

    async function doSignout() {
      await Leaderboard.signOut();
      refreshAccountChip();
      closeAuth();
    }

    // ---- Leaderboard overlay.
    async function openBoard() {
      els.leaderboardOverlay.style.display = 'flex';
      renderIcons();
      if (!Leaderboard.isOnline()) {
        els.lbLive.classList.add('offline');
        els.lbList.innerHTML = '';
        els.lbEmpty.style.display = 'block';
        els.lbEmpty.textContent = 'Leaderboard is offline. Check your connection and reload.';
        return;
      }
      els.lbEmpty.style.display = 'block';
      els.lbEmpty.textContent = 'Loading the network…';
      cachedRows = await Leaderboard.fetchTop(100);
      renderBoard();

      // Subscribe to live updates while the board is open.
      if (!unsubscribeLive) {
        unsubscribeLive = Leaderboard.subscribeLive(rows => {
          cachedRows = rows;
          if (els.leaderboardOverlay.style.display === 'flex') renderBoard();
        });
      }
    }

    function closeBoard() {
      els.leaderboardOverlay.style.display = 'none';
    }

    function renderBoard() {
      const profile = Leaderboard.getProfile && Leaderboard.getProfile();
      const myId = profile && profile.user_id;

      let rows = cachedRows.slice();
      if (currentScope === 'members') {
        rows = rows.filter(r => !r.is_guest);
      } else if (currentScope === 'me' && myId) {
        const idx = rows.findIndex(r => r.user_id === myId);
        if (idx >= 0) {
          const lo = Math.max(0, idx - 4);
          rows = rows.slice(lo, lo + 9);
        }
      }

      if (!rows.length) {
        els.lbList.innerHTML = '';
        els.lbEmpty.style.display = 'block';
        els.lbEmpty.textContent = currentScope === 'me'
          ? 'Play a run to claim your spot on the board.'
          : 'No scores yet. Be the first to set one.';
      } else {
        els.lbEmpty.style.display = 'none';
        els.lbList.innerHTML = rows.map(r => rowHtml(r, myId)).join('');
      }

      // Footer "you" summary.
      if (myId) {
        const mine = cachedRows.find(r => r.user_id === myId);
        els.lbYou.innerHTML = mine
          ? `YOU · <span class="hl">#${mine.rank}</span> · ${mine.score}`
          : 'YOU · unranked';
      } else {
        els.lbYou.textContent = '';
      }
      renderIcons();
    }

    function rowHtml(r, myId) {
      const isMe = r.user_id === myId;
      const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '';
      const rankCell = medal
        ? `<span class="lb-rank-medal">${medal}</span>`
        : `${r.rank}`;
      const avatar = r.avatar_url
        ? `<img src="${escapeHtml(r.avatar_url)}" alt="">`
        : '<i data-lucide="user-round"></i>';
      const guestTag = r.is_guest ? '<span class="lb-guest-tag">GUEST</span>' : '';
      return `<div class="lb-row ${isMe ? 'is-me' : ''} top-${r.rank}">
        <span class="lb-rank">${rankCell}</span>
        <span class="lb-player">
          <span class="lb-avatar">${avatar}</span>
          <span class="lb-pname">${escapeHtml(r.username)}${guestTag}</span>
        </span>
        <span class="lb-acc">${Number(r.accuracy).toFixed(0)}%</span>
        <span class="lb-streak">${r.best_streak}</span>
        <span class="lb-score">${r.score}</span>
      </div>`;
    }

    function bind() {
      // Header
      els.btnAccount.addEventListener('click', () => { sound.bloop(); openAuth(); });
      els.btnOpenLeaderboard.addEventListener('click', () => { sound.bloop(); openBoard(); });
      if (els.btnHeroLeaderboard) els.btnHeroLeaderboard.addEventListener('click', () => { sound.bloop(); openBoard(); });
      if (els.btnViewBoard) els.btnViewBoard.addEventListener('click', () => { sound.click(); openBoard(); });

      // Leaderboard overlay
      els.btnCloseLeaderboard.addEventListener('click', () => { sound.click(); closeBoard(); });
      els.leaderboardOverlay.addEventListener('click', (e) => {
        if (e.target === els.leaderboardOverlay) closeBoard();
      });
      els.lbTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          els.lbTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          currentScope = tab.dataset.scope;
          renderBoard();
        });
      });

      // Auth modal
      els.btnCloseAuth.addEventListener('click', () => { sound.click(); closeAuth(); });
      els.authOverlay.addEventListener('click', (e) => {
        if (e.target === els.authOverlay) closeAuth();
      });
      els.btnSigninGoogle.addEventListener('click', () => { sound.click(); doGoogle(); });
      els.btnSigninGuest.addEventListener('click', () => { sound.click(); doGuest(); });
      els.btnConfirmUsername.addEventListener('click', () => { sound.click(); confirmUsername(); });
      els.authUsernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmUsername(); }
      });
      els.btnRename.addEventListener('click', () => { sound.click(); prepUsernameStep(); showAuthStep('username'); });
      els.btnSignout.addEventListener('click', () => { sound.click(); doSignout(); });

      // Keep the chip in sync with auth changes.
      Leaderboard.on('auth', () => { refreshAccountChip(); });
    }

    async function start() {
      bind();
      refreshAccountChip();
      await Leaderboard.init();
      refreshAccountChip();

      // If the user returned from a Google redirect mid-signup, nudge them to
      // pick a username so they actually land on the board.
      if (Leaderboard.isSignedIn() && Leaderboard.needsUsername()) {
        openAuth();
      }
    }

    return { start, openAuth, openBoard, refreshAccountChip };
  })();

  // Expose openAuth for the verdict-screen submission flow.
  function openAuth() { lbUI.openAuth(); }

  init();
});
