/**
 * Guessify - Ultimate Number Guessing Game
 * Updated JavaScript Engine
 */

// ==========================================================================
// 1. Difficulty Level Configurations
// ==========================================================================
const DIFFICULTY_CONFIG = {
  easy: { min: 1, max: 50, attempts: 10, time: 60, name: 'Easy' },
  medium: { min: 1, max: 100, attempts: 8, time: 45, name: 'Medium' },
  hard: { min: 1, max: 500, attempts: 6, time: 30, name: 'Hard' }
};

// ==========================================================================
// 2. Game State Variables
// ==========================================================================
let activeDifficulty = 'easy';
let gameMode = 'solo'; // 'solo' or 'multiplayer'
let playerNames = { p1: 'Player 1', p2: 'Player 2' };
let activePlayer = 'p1'; // 'p1' or 'p2'

let secretNumber = null;
let maxAttempts = 10;
let attemptsLeft = 0;
let attemptsUsed = 0;
let hintsUsed = 0;
let score = 100;
let timeLeft = 0;
let timerId = null;
let isGameActive = false;

// Statistics structure
let stats = {
  played: 0,
  wins: 0,
  losses: 0,
  bestScores: {
    easy: null,
    medium: null,
    hard: null
  },
  achievements: {
    firstWin: false,
    speedDemon: false,
    sharpShooter: false,
    mindReader: false,
    hardcore: false,
    survivor: false
  }
};

// Leaderboards structure
let leaderboards = {
  easy: [],
  medium: [],
  hard: []
};

// Guess history array
let guessHistory = [];

// ==========================================================================
// 3. Audio Synthesis Manager (Web Audio API Fallback)
// ==========================================================================
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.soundPaths = {
      correct: 'sounds/correct.mp3',
      wrong: 'sounds/wrong.mp3',
      win: 'sounds/win.mp3',
      lose: 'sounds/lose.mp3'
    };
    
    const savedSound = localStorage.getItem('guessify_sound_enabled');
    if (savedSound !== null) {
      this.enabled = savedSound === 'true';
    }
  }

  initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('guessify_sound_enabled', this.enabled);
    return this.enabled;
  }

  play(soundName) {
    if (!this.enabled) return;
    this.initContext();

    // Try playing MP3. If failed (due to 0-byte placeholders), fallback to synthesis.
    const audio = new Audio(this.soundPaths[soundName] || '');
    audio.volume = 0.4;
    
    audio.play().catch(() => {
  this.synthesize(soundName);
});
  }

  synthesize(soundName) {
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    const now = this.ctx.currentTime;

    switch (soundName) {
      case 'correct':
        // Ascending chime: C5 (523Hz) -> E5 (659Hz)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        
        osc.start(now);
        osc.stop(now + 0.25);
        break;

      case 'wrong':
        // Short flat buzz: 180Hz triangle sliding to 130Hz
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(170, now);
        osc.frequency.linearRampToValueAtTime(120, now + 0.16);
        
        gainNode.gain.setValueAtTime(0.18, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        
        osc.start(now);
        osc.stop(now + 0.16);
        break;

      case 'close_guess':
        // Quick high warning beep: G5 (784Hz) -> A5 (880Hz)
        osc.type = 'sawtooth';
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, now);
        osc.disconnect(gainNode);
        osc.connect(filter);
        filter.connect(gainNode);

        osc.frequency.setValueAtTime(783.99, now);
        osc.frequency.setValueAtTime(880.00, now + 0.06);
        
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.start(now);
        osc.stop(now + 0.15);
        break;

      case 'win':
        // Major run arpeggio
        osc.type = 'triangle';
        const winNotes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
        const step = 0.07;
        
        gainNode.gain.setValueAtTime(0.1, now);
        
        winNotes.forEach((freq, idx) => {
          const noteTime = now + idx * step;
          osc.frequency.setValueAtTime(freq, noteTime);
          if (idx === winNotes.length - 1) {
            gainNode.gain.setValueAtTime(0.12, noteTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.55);
          } else {
            gainNode.gain.setValueAtTime(0.1, noteTime);
            gainNode.gain.setValueAtTime(0.06, noteTime + step - 0.01);
          }
        });
        
        osc.start(now);
        osc.stop(now + (winNotes.length * step) + 0.55);
        break;

      case 'lose':
        // Sad slider down
        osc.type = 'sawtooth';
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(550, now);
        osc.disconnect(gainNode);
        osc.connect(lowpass);
        lowpass.connect(gainNode);

        osc.frequency.setValueAtTime(293.66, now);
        osc.frequency.linearRampToValueAtTime(140.00, now + 0.7);
        
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        
        osc.start(now);
        osc.stop(now + 0.7);
        break;
    }
  }
}

const sounds = new SoundManager();

// ==========================================================================
// 4. Custom Canvas Confetti System
// ==========================================================================
class ConfettiEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.animationId = null;
    this.isActive = false;
    this.colors = ['#8a2be2', '#00ffff', '#ff007f', '#00e676', '#f59e0b', '#3b82f6'];

    window.addEventListener('resize', () => {
      if (this.isActive) this.resizeCanvas();
    });
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  start() {
    this.isActive = true;
    this.resizeCanvas();
    this.particles = [];
    
    for (let i = 0; i < 160; i++) {
      this.particles.push(this.createParticle());
    }
    
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animate();
  }

  stop() {
    this.isActive = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  createParticle() {
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * -this.canvas.height - 20,
      size: Math.random() * 8 + 6,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      speedX: Math.random() * 4 - 2,
      speedY: Math.random() * 4 + 3,
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * 4 - 2,
      opacity: Math.random() * 0.4 + 0.6
    };
  }

  animate() {
    if (!this.isActive) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let alive = 0;

    this.particles.forEach((p) => {
      if (p.y < this.canvas.height) {
        alive++;
        
        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotationSpeed;
        p.speedX += Math.sin(p.y / 40) * 0.05;

        this.ctx.save();
        this.ctx.translate(p.x + p.size / 2, p.y + p.size / 2);
        this.ctx.rotate((p.rotation * Math.PI) / 180);
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = p.opacity;

        if (p.size % 2 === 0) {
          this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          this.ctx.fill();
        }

        this.ctx.restore();
      }
    });

    if (alive > 0) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.stop();
    }
  }
}

const confetti = new ConfettiEngine('confetti-canvas');

// ==========================================================================
// 5. DOM Elements Cache
// ==========================================================================
const DOM = {
  // Theme & Sound
  html: document.documentElement,
  themeToggle: document.getElementById('theme-toggle'),
  sunIcon: document.querySelector('.icon-sun'),
  moonIcon: document.querySelector('.icon-moon'),
  soundToggle: document.getElementById('sound-toggle'),
  soundOnIcon: document.querySelector('.icon-sound-on'),
  soundOffIcon: document.querySelector('.icon-sound-off'),

  // Views
  startScreen: document.getElementById('start-screen'),
  gameScreen: document.getElementById('game-screen'),
  resultScreen: document.getElementById('result-screen'),
  gameCard: document.querySelector('.game-card'),

  // Game Mode select
  modeSolo: document.getElementById('mode-solo'),
  modeMulti: document.getElementById('mode-multi'),
  multiplayerNamesContainer: document.getElementById('multiplayer-names-container'),
  player1NameInput: document.getElementById('player1-name-input'),
  player2NameInput: document.getElementById('player2-name-input'),

  // Difficulty selection
  diffCards: document.querySelectorAll('.diff-card'),
  startGameBtn: document.getElementById('start-game-btn'),
  resetStatsBtn: document.getElementById('reset-stats-btn'),

  // Tab Control panels
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),

  // Cumulative Stats
  statPlayed: document.getElementById('stat-played'),
  statWins: document.getElementById('stat-wins'),
  statWinRate: document.getElementById('stat-winrate'),
  statBest: document.getElementById('stat-best'),

  // Leaderboard Tab
  leaderboardList: document.getElementById('leaderboard-list'),
  leaderboardDiffLabel: document.getElementById('leaderboard-diff-label'),

  // Achievements Tab
  playerLevelBadge: document.getElementById('player-level-badge'),
  achievementsUnlockedCount: document.getElementById('achievements-unlocked-count'),
  badgeCards: document.querySelectorAll('.badge-card'),

  // Gameplay Turn Indicator
  turnIndicator: document.getElementById('turn-indicator'),
  activePlayerName: document.getElementById('active-player-name'),

  // Gameplay HUD
  timerDisplay: document.getElementById('timer-display'),
  attemptsDisplay: document.getElementById('attempts-display'),
  scoreDisplay: document.getElementById('score-display'),
  timerHud: document.querySelector('.timer-hud'),
  attemptsProgressBar: document.getElementById('attempts-progress-bar'),

  // Gameplay main panels
  rangeMin: document.getElementById('range-min'),
  rangeMax: document.getElementById('range-max'),
  gameFeedback: document.getElementById('game-feedback'),
  attemptsVisualizer: document.getElementById('attempts-visualizer'),
  guessForm: document.getElementById('guess-form'),
  guessInput: document.getElementById('guess-input'),
  submitGuessBtn: document.getElementById('submit-guess-btn'),

  // Hint Elements
  hintBtn: document.getElementById('hint-btn'),
  hintPill1: document.getElementById('hint-pill-1'),
  hintPill2: document.getElementById('hint-pill-2'),
  hintDisplay: document.getElementById('hint-display'),

  // Guess History
  historyContainer: document.getElementById('history-container'),
  historyList: document.getElementById('history-list'),

  // Footers & Play Again
  restartBtn: document.getElementById('restart-btn'),
  playAgainBtn: document.getElementById('play-again-btn'),
  
  // Results Elements
  resultIconContainer: document.getElementById('result-icon-container'),
  resultTitle: document.getElementById('result-title'),
  resultSubtitle: document.getElementById('result-subtitle'),
  resultCorrectNumber: document.getElementById('result-correct-number'),
  resultAttempts: document.getElementById('result-attempts'),
  resultScore: document.getElementById('result-score'),
  resultBestScore: document.getElementById('result-best-score'),

  // Solo Leaderboard Save
  leaderboardSaveContainer: document.getElementById('leaderboard-save-container'),
  playerNameInput: document.getElementById('player-name-input'),
  submitScoreBtn: document.getElementById('submit-score-btn')
};

// ==========================================================================
// 6. Settings, Stats & Leaderboard Persistent Initialization
// ==========================================================================
function initSettingsAndStats() {
  // Theme check
  const savedTheme = localStorage.getItem('guessify_theme') || 'dark';
  setTheme(savedTheme);

  // Sound check
  updateSoundToggleUI(sounds.enabled);

  // Cumulative Stats Check
  const savedStats = localStorage.getItem('guessify_stats');
  if (savedStats) {
    try {
      stats = JSON.parse(savedStats);
      // Backwards compatibility for achievements object
      if (!stats.achievements) {
        stats.achievements = {
          firstWin: false,
          speedDemon: false,
          sharpShooter: false,
          mindReader: false,
          hardcore: false,
          survivor: false
        };
      }
    } catch (e) {
      console.error('Failed to parse saved statistics, resetting...', e);
      saveStats();
    }
  } else {
    saveStats();
  }

  // Leaderboard data load
  const savedLeaderboard = localStorage.getItem('guessify_leaderboard');
  if (savedLeaderboard) {
    try {
      leaderboards = JSON.parse(savedLeaderboard);
    } catch (e) {
      console.error('Failed to parse leaderboard data, resetting...', e);
      saveLeaderboard();
    }
  } else {
    saveLeaderboard();
  }

  // Populate Name Input field with last player name if available
  const lastPlayerName = localStorage.getItem('guessify_last_player_name');
  if (lastPlayerName) {
    DOM.playerNameInput.value = lastPlayerName;
  }

  updateStatsUI();
  updateLeaderboardUI();
  updateAchievementsUI();
}

function setTheme(theme) {
  if (theme === 'light') {
    DOM.html.classList.remove('dark');
    DOM.html.classList.add('light');
    DOM.sunIcon.classList.add('hidden');
    DOM.moonIcon.classList.remove('hidden');
  } else {
    DOM.html.classList.remove('light');
    DOM.html.classList.add('dark');
    DOM.sunIcon.classList.remove('hidden');
    DOM.moonIcon.classList.add('hidden');
  }
  localStorage.setItem('guessify_theme', theme);
}

function updateSoundToggleUI(enabled) {
  if (enabled) {
    DOM.soundOnIcon.classList.remove('hidden');
    DOM.soundOffIcon.classList.add('hidden');
  } else {
    DOM.soundOnIcon.classList.add('hidden');
    DOM.soundOffIcon.classList.remove('hidden');
  }
}

function saveStats() {
  localStorage.setItem('guessify_stats', JSON.stringify(stats));
}

function saveLeaderboard() {
  localStorage.setItem('guessify_leaderboard', JSON.stringify(leaderboards));
}

function updateStatsUI() {
  DOM.statPlayed.textContent = stats.played;
  DOM.statWins.textContent = stats.wins;
  
  const winRate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
  DOM.statWinRate.textContent = `${winRate}%`;

  const bestScore = stats.bestScores[activeDifficulty];
  DOM.statBest.textContent = bestScore !== null ? `${bestScore} pts` : '–';
}

// Populate Leaderboard list for active difficulty
function updateLeaderboardUI() {
  const currentDiffLabel = DIFFICULTY_CONFIG[activeDifficulty].name;
  DOM.leaderboardDiffLabel.textContent = currentDiffLabel;

  DOM.leaderboardList.innerHTML = '';
  const list = leaderboards[activeDifficulty] || [];

  if (list.length === 0) {
    DOM.leaderboardList.innerHTML = `
      <div class="leaderboard-empty">
        🏆 No high scores yet for ${currentDiffLabel}. Play to claim rank #1!
      </div>
    `;
    return;
  }

  list.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = `leader-row rank-${index + 1}`;
    
    // Formatting attempts and time labels
    const attemptsLabel = item.attempts === 1 ? '1 try' : `${item.attempts} tries`;
    const min = Math.floor(item.timeLeft / 60);
    const sec = item.timeLeft % 60;
    const timeLabel = `${min}:${sec < 10 ? '0' + sec : sec} left`;

    row.innerHTML = `
      <div class="leader-left">
        <span class="leader-rank">${index + 1}</span>
        <span class="leader-name">${escapeHTML(item.name)}</span>
      </div>
      <div class="leader-right">
        <span>🎯 ${attemptsLabel}</span>
        <span>⏱️ ${timeLabel}</span>
        <span class="leader-score">${item.score} pts</span>
      </div>
    `;
    DOM.leaderboardList.appendChild(row);
  });
}

function escapeHTML(str) {
  if (typeof str !== 'string') return '';

  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag]));
}

// Reset cumulative stats, high scores, achievements, and leaderboards
function resetStats() {
  if (confirm('Are you sure you want to permanently delete all statistics, leaderboard rankings, and unlocked badges?')) {
    stats = {
      played: 0,
      wins: 0,
      losses: 0,
      bestScores: {
        easy: null,
        medium: null,
        hard: null
      },
      achievements: {
        firstWin: false,
        speedDemon: false,
        sharpShooter: false,
        mindReader: false,
        hardcore: false,
        survivor: false
      }
    };
    leaderboards = {
      easy: [],
      medium: [],
      hard: []
    };
    saveStats();
    saveLeaderboard();
    
    updateStatsUI();
    updateLeaderboardUI();
    updateAchievementsUI();
    sounds.play('wrong');
  }
}

// ==========================================================================
// 7. Achievements & Level Calculation System
// ==========================================================================
function getPlayerLevelInfo() {
  const wins = stats.wins;
  if (wins < 1) return { level: 1, name: 'Level 1: Novice Guesser', color: '#5f6385' };
  if (wins < 3) return { level: 2, name: 'Level 2: Rookie Guesser', color: '#10b981' };
  if (wins < 8) return { level: 3, name: 'Level 3: Keen Eye', color: '#00c0ff' };
  if (wins < 15) return { level: 4, name: 'Level 4: Mind Reader', color: '#8a2be2' };
  return { level: 5, name: 'Level 5: Oracle Guesser', color: '#f59e0b' };
}

function updateAchievementsUI() {
  // Update level text
  const lvlInfo = getPlayerLevelInfo();
  DOM.playerLevelBadge.textContent = lvlInfo.name;
  DOM.playerLevelBadge.style.color = lvlInfo.color;

  let unlockedCount = 0;
  const list = stats.achievements || {};

  // Check card elements
  DOM.badgeCards.forEach((card) => {
    const badgeId = card.id.replace('badge-', '');
    const isUnlocked = list[badgeId];

    if (isUnlocked) {
      card.classList.remove('locked');
      card.classList.add('unlocked');
      unlockedCount++;
    } else {
      card.classList.remove('unlocked');
      card.classList.add('locked');
    }
  });

  DOM.achievementsUnlockedCount.textContent = `${unlockedCount}/6 Unlocked`;
}

function evaluateAchievements(isWin, triesUsed, secondsLeft) {
  if (!isWin) return []; // Only wins unlock badges
  
  const config = DIFFICULTY_CONFIG[activeDifficulty];
  const list = stats.achievements;
  const newlyUnlocked = [];

  // Badge 1: First Win
  if (!list.firstWin) {
    list.firstWin = true;
    newlyUnlocked.push('First Win');
  }
  // Badge 2: Speed Demon (win with over 75% time remaining)
  if (!list.speedDemon && secondsLeft > (config.time * 0.75)) {
    list.speedDemon = true;
    newlyUnlocked.push('Speed Demon');
  }
  // Badge 3: Sharp Shooter (win in 3 tries or fewer)
  if (!list.sharpShooter && triesUsed <= 3) {
    list.sharpShooter = true;
    newlyUnlocked.push('Sharp Shooter');
  }
  // Badge 4: Mind Reader (win on 1st guess)
  if (!list.mindReader && triesUsed === 1) {
    list.mindReader = true;
    newlyUnlocked.push('Mind Reader');
  }
  // Badge 5: Hardcore Victor (win on Hard)
  if (!list.hardcore && activeDifficulty === 'hard') {
    list.hardcore = true;
    newlyUnlocked.push('Hardcore Victor');
  }
  // Badge 6: Survivor (win on final try)
  if (!list.survivor && attemptsLeft === 0) {
    list.survivor = true;
    newlyUnlocked.push('Survivor');
  }

  if (newlyUnlocked.length > 0) {
    saveStats();
    updateAchievementsUI();
  }
  
  return newlyUnlocked;
}

// ==========================================================================
// 8. Game Panel Navigation / Tabs
// ==========================================================================
function showScreen(screenId) {
  DOM.startScreen.classList.remove('active');
  DOM.gameScreen.classList.remove('active');
  DOM.resultScreen.classList.remove('active');

  // Stop confetti and card effects
  confetti.stop();
  DOM.gameCard.classList.remove('close-guess-card');

  if (screenId === 'start') {
    DOM.startScreen.classList.add('active');
    updateStatsUI();
    updateLeaderboardUI();
  } else if (screenId === 'game') {
    DOM.gameScreen.classList.add('active');
  } else if (screenId === 'result') {
    DOM.resultScreen.classList.add('active');
  }
}

// Tab Switching logic on Start card
function setupTabNavigation() {
  DOM.tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      sounds.initContext();
      
      DOM.tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tabId = btn.dataset.tab;
      DOM.tabPanels.forEach((panel) => {
        panel.classList.remove('active');
        if (panel.id === `tab-${tabId}`) {
          panel.classList.add('active');
        }
      });
    });
  });
}

// ==========================================================================
// 9. Core Game Logic
// ==========================================================================
function initGame() {
  const config = DIFFICULTY_CONFIG[activeDifficulty];
  
  // Set secret number
  secretNumber = Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
  
  // Setup player names for Multiplayer
  if (gameMode === 'multiplayer') {
    const p1 = DOM.player1NameInput.value.trim();
    const p2 = DOM.player2NameInput.value.trim();
    
    playerNames.p1 = p1 !== '' ? p1 : 'Player 1';
    playerNames.p2 = p2 !== '' ? p2 : 'Player 2';
    activePlayer = 'p1';

    DOM.turnIndicator.classList.remove('hidden');
    DOM.activePlayerName.textContent = playerNames.p1;
  } else {
    DOM.turnIndicator.classList.add('hidden');
  }

  // Reset values
  maxAttempts = config.attempts;
  attemptsLeft = config.attempts;
  attemptsUsed = 0;
  hintsUsed = 0;
  score = 100;
  timeLeft = config.time;
  isGameActive = true;
  guessHistory = [];

  // Reset UI elements
  DOM.rangeMin.textContent = config.min;
  DOM.rangeMax.textContent = config.max;
  DOM.guessInput.value = '';
  DOM.guessInput.min = config.min;
  DOM.guessInput.max = config.max;
  
  DOM.gameFeedback.textContent = "Make your first guess!";
  DOM.gameFeedback.className = "feedback-text";
  DOM.gameCard.classList.remove('close-guess-card');

  // Hints reset
  DOM.hintDisplay.classList.add('hidden');
  DOM.hintDisplay.textContent = '';
  DOM.hintBtn.disabled = false;
  DOM.hintPill1.classList.remove('used');
  DOM.hintPill2.classList.remove('used');

  // History list reset
  DOM.historyContainer.classList.add('hidden');
  DOM.historyList.innerHTML = '';

  // Update HUD
  updateHUD();
  createAttemptsVisualizer(config.attempts);
  updateAttemptsProgressBar();
  
  // Timer launch
  startTimer();

  // Focus
  setTimeout(() => {
    DOM.guessInput.focus();
  }, 100);

  sounds.initContext();
}

function updateHUD() {
  DOM.attemptsDisplay.textContent = `${attemptsUsed} / ${maxAttempts}`;
  DOM.scoreDisplay.textContent = score;
  updateTimerDisplay();
}

function createAttemptsVisualizer(total) {
  DOM.attemptsVisualizer.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('span');
    dot.className = 'attempt-dot';
    DOM.attemptsVisualizer.appendChild(dot);
  }
}

function updateAttemptsVisualizerUI() {
  const dots = DOM.attemptsVisualizer.querySelectorAll('.attempt-dot');
  dots.forEach((dot, index) => {
    if (index < attemptsUsed) {
      dot.classList.add('used');
    } else {
      dot.classList.remove('used');
    }
  });
}

// Attempts Progress Bar styling
function updateAttemptsProgressBar() {
  const percent = (attemptsLeft / maxAttempts) * 100;
  DOM.attemptsProgressBar.style.width = `${percent}%`;

  DOM.attemptsProgressBar.className = "progress-bar-fill";
  
  if (percent <= 25) {
    DOM.attemptsProgressBar.classList.add('low-danger');
  } else if (percent <= 50) {
    DOM.attemptsProgressBar.classList.add('medium-warning');
  }
}

// Timer management
function startTimer() {
  if (timerId) clearInterval(timerId);
  DOM.timerHud.classList.remove('danger-timer');
  
  timerId = setInterval(() => {
    if (!isGameActive) {
      clearInterval(timerId);
      return;
    }
    
    timeLeft--;
    updateTimerDisplay();

    if (timeLeft <= 10) {
      DOM.timerHud.classList.add('danger-timer');
    }

    if (timeLeft <= 0) {
      clearInterval(timerId);
      endGame(false, 'time');
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  DOM.timerDisplay.textContent = `${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
}

// Process user guess
function processGuess() {
  if (!isGameActive) return;

  const guess = parseInt(DOM.guessInput.value, 10);
  const config = DIFFICULTY_CONFIG[activeDifficulty];

  // Validation
  if (isNaN(guess) || guess < config.min || guess > config.max) {
    triggerInputWarning(`Enter a valid whole number between ${config.min} and ${config.max}!`);
    return;
  }

  // Clear card-shake indicator
  DOM.gameCard.classList.remove('close-guess-card');
  void DOM.gameCard.offsetWidth; // trigger reflow

  attemptsUsed++;
  attemptsLeft--;
  
  updateAttemptsVisualizerUI();
  updateAttemptsProgressBar();

  // Evaluate close bounds (within 5% of range)
  const range = config.max - config.min;
  const closeBound = Math.ceil(range * 0.05);
  const isClose = Math.abs(guess - secretNumber) <= closeBound;

  const activeName = gameMode === 'multiplayer' ? playerNames[activePlayer] : 'You';

  if (guess === secretNumber) {
    // Win Condition
    endGame(true);
  } else {
    // Wrong guess logic
    let feedbackMsg = '';
    let feedbackClass = '';

    if (isClose) {
      // Close guess heat alert!
      sounds.play('close_guess');
      DOM.gameCard.classList.add('close-guess-card');
      feedbackMsg = `${activeName} guessed ${guess}: Burning Hot! 🔥`;
      feedbackClass = 'heat-alert';
    } else {
      sounds.play('wrong');
      if (guess > secretNumber) {
        feedbackMsg = `${activeName} guessed ${guess}: Too High! 📈`;
        feedbackClass = 'up';
      } else {
        feedbackMsg = `${activeName} guessed ${guess}: Too Low! 📉`;
        feedbackClass = 'down';
      }
    }

    // Deduct 10 points
    score = Math.max(0, score - 10);

    // Save to guess history
    addGuessToHistory(guess, isClose, guess > secretNumber ? 'Too High 📈' : 'Too Low 📉');

    if (attemptsLeft <= 0) {
      // Out of attempts
      endGame(false, 'attempts');
    } else {
      setFeedback(feedbackMsg, feedbackClass);
      updateHUD();

      // Cycle Multiplayer player turn
      if (gameMode === 'multiplayer') {
        activePlayer = activePlayer === 'p1' ? 'p2' : 'p1';
        DOM.activePlayerName.textContent = playerNames[activePlayer];
      }

      DOM.guessInput.value = '';
      DOM.guessInput.focus();
    }
  }
}

function setFeedback(msg, className) {
  DOM.gameFeedback.className = "feedback-text";
  void DOM.gameFeedback.offsetWidth;
  DOM.gameFeedback.classList.add(className);
  DOM.gameFeedback.textContent = msg;
}

function triggerInputWarning(msg) {
  sounds.play('wrong');
  setFeedback(msg, "up");
  DOM.guessInput.focus();
}

// Append guess log to scrolling history container
function addGuessToHistory(guess, isClose, dirLabel) {
  DOM.historyContainer.classList.remove('hidden');

  const item = document.createElement('div');
  let typeClass = guess > secretNumber ? 'up-feedback' : 'down-feedback';
  if (isClose) typeClass = 'close-feedback';

  item.className = `history-item ${typeClass}`;
  
  const labelText = gameMode === 'multiplayer' ? playerNames[activePlayer] : `Guess #${attemptsUsed}`;
  const resultText = isClose ? 'Burning Hot! 🔥' : dirLabel;

  item.innerHTML = `
    <span class="history-label">${labelText}</span>
    <span class="history-val">${guess}</span>
    <span class="history-result">${resultText}</span>
  `;

  // Prepend to show latest guesses first
  DOM.historyList.insertBefore(item, DOM.historyList.firstChild);
}

// Hint Reveal Logic
function requestHint() {
  if (!isGameActive || hintsUsed >= 2) return;

  hintsUsed++;
  DOM.hintDisplay.classList.remove('hidden');

  const config = DIFFICULTY_CONFIG[activeDifficulty];
  sounds.play('correct');

  if (hintsUsed === 1) {
    DOM.hintPill1.classList.add('used');
    const isEven = secretNumber % 2 === 0;
    DOM.hintDisplay.innerHTML = `🔮 <strong>Hint 1:</strong> The secret number is <strong>${isEven ? 'EVEN' : 'ODD'}</strong>!`;
  } else if (hintsUsed === 2) {
    DOM.hintPill2.classList.add('used');
    DOM.hintBtn.disabled = true;
    const middleValue = (config.min + config.max) / 2;
    const isGreater = secretNumber > middleValue;
    DOM.hintDisplay.innerHTML += `<br>🔮 <strong>Hint 2:</strong> The secret number is <strong>${isGreater ? 'greater' : 'less than or equal'}</strong> than the middle boundary (<strong>${middleValue}</strong>)!`;
  }
}

// Game Termination
function endGame(isWin, reason = '') {
  isGameActive = false;
  if (timerId) clearInterval(timerId);

  // Stats update only for Single Player
  if (gameMode === 'solo') {
    stats.played++;
  }
  
  if (isWin) {
    sounds.play('win');
    confetti.start();

    if (gameMode === 'solo') {
      stats.wins++;
      
      // Check Best Score for active difficulty
      const currentBest = stats.bestScores[activeDifficulty];
      if (currentBest === null || score > currentBest) {
        stats.bestScores[activeDifficulty] = score;
      }
      
      // Evaluate Achievements
      evaluateAchievements(true, attemptsUsed, timeLeft);
      
      // Show leaderboard name input
      DOM.leaderboardSaveContainer.classList.remove('hidden');
      DOM.playerNameInput.disabled = false;
      DOM.submitScoreBtn.disabled = false;
      DOM.submitScoreBtn.textContent = 'Save Score';
      DOM.playerNameInput.focus();
    } else {
      DOM.leaderboardSaveContainer.classList.add('hidden');
    }
    
    // UI displays winner details
    DOM.resultScreen.className = "view-panel active win-state";
    DOM.resultTitle.textContent = "Victory!";
    
    if (gameMode === 'multiplayer') {
      DOM.resultSubtitle.textContent = `Excellent! ${playerNames[activePlayer]} guessed the secret number! ⚔️`;
    } else {
      DOM.resultSubtitle.textContent = "Sensational! You guessed the secret number!";
    }
    
    DOM.resultIconContainer.innerHTML = `
      <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="7"></circle>
        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
      </svg>
    `;
    DOM.resultScore.textContent = gameMode === 'multiplayer' ? 'Duel Won' : `${score} pts`;
  } else {
    sounds.play('lose');
    DOM.leaderboardSaveContainer.classList.add('hidden');

    if (gameMode === 'solo') {
      stats.losses++;
    }
    
    DOM.resultScreen.className = "view-panel active lose-state";
    
    if (gameMode === 'multiplayer') {
      DOM.resultTitle.textContent = "Draw! 🤝";
      DOM.resultSubtitle.textContent = reason === 'time' ? "Time ran out for both players!" : "Both players ran out of guesses!";
    } else {
      DOM.resultTitle.textContent = "Game Over";
      DOM.resultSubtitle.textContent = reason === 'time' ? "Time ran out! Better luck next time." : "Out of guesses! Practice makes perfect.";
    }

    DOM.resultIconContainer.innerHTML = `
      <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    `;
    DOM.resultScore.textContent = `0 pts`;
  }

  if (gameMode === 'solo') {
    saveStats();
  }

  // Populate Result HUD
  DOM.resultCorrectNumber.textContent = secretNumber;
  DOM.resultAttempts.textContent = `${attemptsUsed} / ${maxAttempts}`;
  
  const currentBestScore = stats.bestScores[activeDifficulty];
  DOM.resultBestScore.textContent = currentBestScore !== null ? `${currentBestScore} pts` : '–';

  showScreen('result');
}

// Save High Score to Solo Leaderboard
function submitHighScore() {
  const name = DOM.playerNameInput.value.trim();
  if (name === '') {
    alert('Please enter your name!');
    DOM.playerNameInput.focus();
    return;
  }

  // Record details
  const newEntry = {
    name: name,
    score: score,
    attempts: attemptsUsed,
    timeLeft: timeLeft,
    date: new Date().toLocaleDateString()
  };

  // Pre-save last player name
  localStorage.setItem('guessify_last_player_name', name);

  // Push, Sort with tie-breaker details
  if (!leaderboards[activeDifficulty]) {
    leaderboards[activeDifficulty] = [];
  }
  
  leaderboards[activeDifficulty].push(newEntry);

  leaderboards[activeDifficulty].sort((a, b) => {
    // 1. Sort by Score descending
    if (b.score !== a.score) return b.score - a.score;
    // 2. Sort by Attempts ascending (fewer is better)
    if (a.attempts !== b.attempts) return a.attempts - b.attempts;
    // 3. Sort by Time Left descending (more time left is faster / better)
    return b.timeLeft - a.timeLeft;
  });

  // Limit to top 5 rankings
  leaderboards[activeDifficulty] = leaderboards[activeDifficulty].slice(0, 5);

  saveLeaderboard();
  
  // Disable form
  DOM.playerNameInput.disabled = true;
  DOM.submitScoreBtn.disabled = true;
  DOM.submitScoreBtn.textContent = 'Saved! ✓';

  updateLeaderboardUI();
}

// ==========================================================================
// 10. Event Listeners Setup
// ==========================================================================
function setupEventListeners() {
  // Theme Toggle
  DOM.themeToggle.addEventListener('click', () => {
    sounds.initContext();
    const isLightMode = DOM.html.classList.contains('light');
    setTheme(isLightMode ? 'dark' : 'light');
  });

  // Sound Toggle
  DOM.soundToggle.addEventListener('click', () => {
    const enabled = sounds.toggle();
    updateSoundToggleUI(enabled);
  });

  // Mode Selection
  DOM.modeSolo.addEventListener('click', () => {
    sounds.initContext();
    DOM.modeSolo.classList.add('active');
    DOM.modeMulti.classList.remove('active');
    DOM.multiplayerNamesContainer.classList.add('hidden');
    gameMode = 'solo';
  });

  DOM.modeMulti.addEventListener('click', () => {
    sounds.initContext();
    DOM.modeMulti.classList.add('active');
    DOM.modeSolo.classList.remove('active');
    DOM.multiplayerNamesContainer.classList.remove('hidden');
    gameMode = 'multiplayer';
  });

  // Difficulty selection
  DOM.diffCards.forEach((card) => {
    card.addEventListener('click', () => {
      sounds.initContext();
      
      DOM.diffCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      activeDifficulty = card.dataset.difficulty;
      
      // Update cumulative stats labels
      updateStatsUI();
      updateLeaderboardUI();
    });
  });

  // Reset Stats Button
  DOM.resetStatsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetStats();
  });

  // Start Game Button
  DOM.startGameBtn.addEventListener('click', () => {
    sounds.play('correct');
    showScreen('game');
    initGame();
  });

  // Guess form submit
  DOM.guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    processGuess();
  });

  // Hint Button
  DOM.hintBtn.addEventListener('click', () => {
    requestHint();
  });

  // Restart Button in HUD
  DOM.restartBtn.addEventListener('click', () => {
    sounds.play('correct');
    if (confirm('Are you sure you want to restart the current game?')) {
      initGame();
    }
  });

  // Play Again Button
  DOM.playAgainBtn.addEventListener('click', () => {
    sounds.play('correct');
    showScreen('start');
  });

  // Leaderboard save submit
  DOM.submitScoreBtn.addEventListener('click', () => {
    submitHighScore();
  });
}

// ==========================================================================
// 11. Initial Entry Point
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupTabNavigation();
  initSettingsAndStats();
});
