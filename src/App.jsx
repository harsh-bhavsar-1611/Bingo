import { useState, useEffect, useCallback } from 'react';
import { 
  Trophy, 
  RefreshCw, 
  Shuffle, 
  Users, 
  Globe, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  History, 
  Play, 
  CheckCircle2, 
  Crown,
  Info,
  Bot,
  Palette,
  Eye,
  X,
  Grid,
  AlertTriangle,
  Link,
  LogOut,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { 
  onlineManager, 
  getLocalPlayerId, 
  generateRandomGrid, 
  generateWinningLines, 
  calculateLines 
} from './services/multiplayer';

// Sound Synthesizer
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'mark') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'line') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    } else if (type === 'bingo') {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.3, ctx.currentTime + idx * 0.1);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.1 + 0.18);
        o.start(ctx.currentTime + idx * 0.1);
        o.stop(ctx.currentTime + idx * 0.1 + 0.18);
      });
    }
  } catch (err) {
    console.debug('Audio error:', err);
  }
};

// Color Theme Definitions
const THEMES = {
  notebook: {
    id: 'notebook',
    name: 'Math Notebook',
    bg: 'bg-slate-900',
    cardBg: 'bg-slate-800/90 text-slate-100',
    gridBg: 'bg-slate-950',
    cellBg: 'bg-slate-800 border-amber-500/30 text-amber-300 hover:border-amber-400',
    cellMarked: 'bg-slate-950 text-slate-600 border-slate-800',
    accent: 'amber',
    accentGrad: 'from-amber-500 to-yellow-400',
    textAccent: 'text-amber-400',
    borderAccent: 'border-amber-500/40',
    strokeColor: '#f59e0b'
  },
  neon: {
    id: 'neon',
    name: 'Dark Neon Arcade',
    bg: 'bg-zinc-950',
    cardBg: 'bg-zinc-900/90 text-cyan-100',
    gridBg: 'bg-black',
    cellBg: 'bg-zinc-900 border-cyan-500/40 text-cyan-300 hover:border-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]',
    cellMarked: 'bg-zinc-950 text-zinc-700 border-zinc-800',
    accent: 'cyan',
    accentGrad: 'from-cyan-500 to-emerald-400',
    textAccent: 'text-cyan-400',
    borderAccent: 'border-cyan-500/40',
    strokeColor: '#06b6d4'
  },
  pastel: {
    id: 'pastel',
    name: 'Minimal Light',
    bg: 'bg-slate-200',
    cardBg: 'bg-white/95 text-slate-900 shadow-xl',
    gridBg: 'bg-slate-100',
    cellBg: 'bg-slate-50 border-indigo-200 text-indigo-700 hover:border-indigo-400 font-extrabold',
    cellMarked: 'bg-slate-200 text-slate-400 border-slate-300',
    accent: 'indigo',
    accentGrad: 'from-indigo-600 to-violet-500',
    textAccent: 'text-indigo-600',
    borderAccent: 'border-indigo-300',
    strokeColor: '#6366f1'
  },
  gold: {
    id: 'gold',
    name: 'Cyber Gold',
    bg: 'bg-stone-950',
    cardBg: 'bg-stone-900/90 text-yellow-100',
    gridBg: 'bg-black',
    cellBg: 'bg-stone-900 border-yellow-500/40 text-yellow-300 hover:border-yellow-300',
    cellMarked: 'bg-stone-950 text-stone-700 border-stone-800',
    accent: 'yellow',
    accentGrad: 'from-yellow-500 to-amber-600',
    textAccent: 'text-yellow-400',
    borderAccent: 'border-yellow-500/40',
    strokeColor: '#eab308'
  }
};

export default function App() {
  const [mode, setMode] = useState('menu'); // menu, pass-and-play, vs-computer, online-game
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('bingo_theme') || 'notebook';
    } catch {
      return 'notebook';
    }
  });
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [gridSize, setGridSize] = useState(5); // 5x5, 6x6, 7x7
  const [soundEnabled, setSoundEnabled] = useState(true);

  // General state
  const currentTheme = THEMES[theme] || THEMES.notebook;
  const targetLines = gridSize;

  // Pass and Play / Vs Computer local state
  const [playerCount, setPlayerCount] = useState(2);
  const [aiDifficulty, setAiDifficulty] = useState('medium'); // easy, medium, hard
  const [playerNames] = useState(['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5']);
  
  // Alert Toast State
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [localState, setLocalState] = useState({
    phase: 'setup',
    setupPlayerIdx: 0,
    boards: {},
    calledNumbers: [],
    currentTurnIdx: 0,
    winners: [],
    completedLines: {},
    isAi: {}
  });

  // Modal for Viewing Revealed Cards
  const [viewCardsModal, setViewCardsModal] = useState({
    open: false,
    playerIdx: null,
    onlinePlayerId: null
  });

  // Online Multiplayer States
  const [myPlayerId] = useState(() => getLocalPlayerId());
  const [roomId, setRoomId] = useState('');
  const [joinRoomInput, setJoinRoomInput] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('room')?.trim().toUpperCase() || '';
    } catch {
      return '';
    }
  });
  const [onlineMyName, setOnlineMyName] = useState(() => {
    return localStorage.getItem('bingo_username') || ('Player ' + Math.floor(1000 + Math.random() * 9000));
  });
  const [onlineRoomData, setOnlineRoomData] = useState(null);
  const [onlineIsLoading, setOnlineIsLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Cleanup online connection on unmount
  useEffect(() => {
    return () => {
      onlineManager.destroy();
    };
  }, []);

  // Safe manual board update with real-time duplicate check (for local setup)
  const setCellLocalBoard = (playerIdx, cellIndex, val) => {
    setLocalState(prev => {
      const currentBoard = [...prev.boards[playerIdx]];
      const maxVal = gridSize * gridSize;

      if (val !== null && (val < 1 || val > maxVal)) {
        showToast(`Number must be between 1 and ${maxVal}!`);
        return prev;
      }

      // Check duplicate
      if (val !== null) {
        const existingIdx = currentBoard.indexOf(val);
        if (existingIdx !== -1 && existingIdx !== cellIndex) {
          showToast(`Number ${val} is already placed on box #${existingIdx + 1}!`);
          return prev;
        }
      }

      currentBoard[cellIndex] = val;
      return {
        ...prev,
        boards: { ...prev.boards, [playerIdx]: currentBoard }
      };
    });
  };

  // Announce Number for Local Game (declared before AI effect)
  const announceNumberLocal = useCallback((num) => {
    setLocalState(prev => {
      if (prev.calledNumbers.includes(num)) return prev;
      if (soundEnabled) playSound('mark');

      const nextCalled = [...prev.calledNumbers, num];
      const newCompleted = {};
      const newlyFinished = [];
      const updatedWinners = [...prev.winners];

      for (let i = 0; i < playerCount; i++) {
        const pBoard = prev.boards[i];
        const lines = calculateLines(pBoard, nextCalled, gridSize);
        newCompleted[i] = lines;

        const alreadyRanked = updatedWinners.some(w => w.playerIdx === i);
        if (lines.length >= targetLines && !alreadyRanked) {
          newlyFinished.push(i);
        }
      }

      if (newlyFinished.length > 0) {
        if (soundEnabled) playSound('bingo');
        newlyFinished.forEach(pIdx => {
          const rank = updatedWinners.length + 1;
          updatedWinners.push({
            playerIdx: pIdx,
            name: playerNames[pIdx],
            rank
          });
        });
      }

      let nextTurn = (prev.currentTurnIdx + 1) % playerCount;
      let count = 0;
      while (updatedWinners.some(w => w.playerIdx === nextTurn) && count < playerCount) {
        nextTurn = (nextTurn + 1) % playerCount;
        count++;
      }

      const activeCount = playerCount - updatedWinners.length;
      const isGameOver = activeCount <= 1;

      return {
        ...prev,
        calledNumbers: nextCalled,
        completedLines: newCompleted,
        winners: updatedWinners,
        currentTurnIdx: nextTurn,
        phase: isGameOver ? 'finished' : 'playing'
      };
    });
  }, [soundEnabled, playerCount, gridSize, targetLines, playerNames]);

  // --- LOCAL GAME SETUP (PASS & PLAY or VS AI) ---
  useEffect(() => {
    if (
      (mode === 'vs-computer' || mode === 'pass-and-play') &&
      localState.phase === 'playing' &&
      localState.isAi[localState.currentTurnIdx] &&
      !localState.winners.some(w => w.playerIdx === localState.currentTurnIdx)
    ) {
      const aiTimer = setTimeout(() => {
        const aiIdx = localState.currentTurnIdx;
        const board = localState.boards[aiIdx];
        const uncalled = board.filter(n => !localState.calledNumbers.includes(n));

        if (uncalled.length === 0) return;

        let chosenNumber = uncalled[0];

        if (aiDifficulty === 'easy') {
          chosenNumber = uncalled[Math.floor(Math.random() * uncalled.length)];
        } else if (aiDifficulty === 'medium') {
          const lineScores = {};
          const winningLines = generateWinningLines(gridSize);
          const calledSet = new Set(localState.calledNumbers);

          uncalled.forEach(num => {
            let score = 0;
            const cellIdx = board.indexOf(num);

            winningLines.forEach(line => {
              if (line.cells.includes(cellIdx)) {
                const markedCount = line.cells.filter(c => calledSet.has(board[c])).length;
                score += Math.pow(2, markedCount);
              }
            });
            lineScores[num] = score;
          });

          uncalled.sort((a, b) => lineScores[b] - lineScores[a]);
          chosenNumber = uncalled[0];
        } else if (aiDifficulty === 'hard') {
          const winningLines = generateWinningLines(gridSize);
          const calledSet = new Set(localState.calledNumbers);
          const numScores = {};

          uncalled.forEach(num => {
            const cellIdx = board.indexOf(num);
            let totalPotential = 0;
            let almostCompleteLines = 0;

            winningLines.forEach(line => {
              if (line.cells.includes(cellIdx)) {
                const markedInLine = line.cells.filter(c => calledSet.has(board[c])).length;
                if (markedInLine === gridSize - 1) {
                  totalPotential += 100;
                  almostCompleteLines++;
                } else {
                  totalPotential += (markedInLine + 1) * 10;
                }
              }
            });

            if (almostCompleteLines > 1) {
              totalPotential += 250;
            }

            numScores[num] = totalPotential;
          });

          uncalled.sort((a, b) => numScores[b] - numScores[a]);
          chosenNumber = uncalled[0];
        }

        announceNumberLocal(chosenNumber);
      }, 1000);

      return () => clearTimeout(aiTimer);
    }
  }, [localState, mode, aiDifficulty, gridSize, announceNumberLocal]);

  // Local Game Controls
  const startLocalGame = (isVsAi = false) => {
    const initialBoards = {};
    const isAiMap = {};

    for (let i = 0; i < playerCount; i++) {
      initialBoards[i] = generateRandomGrid(gridSize);
      isAiMap[i] = isVsAi && i > 0;
    }

    setLocalState({
      phase: 'playing',
      setupPlayerIdx: 0,
      boards: initialBoards,
      calledNumbers: [],
      currentTurnIdx: 0,
      winners: [],
      completedLines: {},
      isAi: isAiMap
    });
    setMode(isVsAi ? 'vs-computer' : 'pass-and-play');
    if (soundEnabled) playSound('line');
  };

  const autoFillLocalBoard = (playerIdx) => {
    const newBoard = generateRandomGrid(gridSize);
    setLocalState(prev => ({
      ...prev,
      boards: { ...prev.boards, [playerIdx]: newBoard }
    }));
  };

  const finishLocalPlayerSetup = () => {
    const currentBoard = localState.boards[localState.setupPlayerIdx] || [];
    const requiredTotal = gridSize * gridSize;
    const isComplete = currentBoard.length === requiredTotal && currentBoard.every(n => n !== null && n !== undefined);

    if (!isComplete) {
      showToast(`Please fill all ${requiredTotal} boxes completely before proceeding!`);
      return;
    }

    if (localState.setupPlayerIdx < playerCount - 1) {
      setLocalState(prev => ({
        ...prev,
        setupPlayerIdx: prev.setupPlayerIdx + 1
      }));
    } else {
      setLocalState(prev => {
        const swapped = {};
        for (let i = 0; i < playerCount; i++) {
          const nextIdx = (i + 1) % playerCount;
          swapped[i] = prev.boards[nextIdx];
        }
        return {
          ...prev,
          boards: swapped,
          phase: 'playing'
        };
      });
      if (soundEnabled) playSound('line');
    }
  };

  // --- ONLINE MULTIPLAYER LOGIC ---
  const handleOnlineEvent = (type, data) => {
    if (type === 'NUMBER_CALLED') {
      if (data && data.callerId !== myPlayerId) {
        if (soundEnabled) playSound('mark');
        showToast(`${data.callerName} called number ${data.number}!`);
      }
    } else if (type === 'BINGO_ANNOUNCED') {
      if (soundEnabled) playSound('bingo');
      showToast(`🎉 ${data.name} completed all lines and claimed Rank #${data.rank}!`);
    } else if (type === 'GAME_STARTED') {
      if (soundEnabled) playSound('line');
      showToast('The Bingo match has started!');
    } else if (type === 'REMATCH_STARTED') {
      if (soundEnabled) playSound('line');
      showToast('Rematch started! Fresh cards distributed.');
    } else if (type === 'PLAYER_JOINED') {
      showToast(typeof data === 'string' ? data : 'A player joined the room!');
    } else if (type === 'PLAYER_LEFT') {
      showToast(typeof data === 'string' ? data : 'A player left the game.');
    } else if (type === 'HOST_LEFT') {
      showToast('Host left the room. Match ended.');
      setOnlineRoomData(null);
      setRoomId('');
      setMode('menu');
    } else if (type === 'ERROR') {
      showToast(typeof data === 'string' ? data : 'Connection error occurred.');
    }
  };

  const createOnlineRoom = async () => {
    if (onlineIsLoading) return;
    setOnlineIsLoading(true);

    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const board = generateRandomGrid(gridSize);

    try {
      const room = await onlineManager.createRoom({
        code,
        hostName: onlineMyName,
        gridSize,
        board,
        onStateChange: (updatedData) => setOnlineRoomData(updatedData ? { ...updatedData } : null),
        onEvent: handleOnlineEvent,
        onStatusChange: (status) => {
          if (status === 'error') setOnlineIsLoading(false);
        }
      });

      setOnlineRoomData(room ? { ...room } : null);
      setRoomId(code);
      setMode('online-game');
      showToast(`Room ${code} created! Share the code with friends.`);
    } catch (err) {
      console.error('Failed to create room:', err);
      showToast(err.message || 'Failed to create room. Please try again.');
    } finally {
      setOnlineIsLoading(false);
    }
  };

  const joinOnlineRoom = async () => {
    if (onlineIsLoading) return;
    const cleanCode = joinRoomInput.trim().toUpperCase();

    if (!cleanCode) {
      showToast('Please enter a room code!');
      return;
    }

    setOnlineIsLoading(true);

    try {
      const room = await onlineManager.joinRoom({
        code: cleanCode,
        playerName: onlineMyName,
        onStateChange: (updatedData) => setOnlineRoomData(updatedData ? { ...updatedData } : null),
        onEvent: handleOnlineEvent,
        onStatusChange: (status) => {
          if (status === 'error') setOnlineIsLoading(false);
        }
      });

      setOnlineRoomData(room ? { ...room } : null);
      setRoomId(cleanCode);
      setMode('online-game');
      showToast(`Successfully joined room ${cleanCode}!`);
    } catch (err) {
      console.error('Failed to join room:', err);
      showToast(err.message || 'Room not found or host is offline.');
    } finally {
      setOnlineIsLoading(false);
    }
  };

  const leaveOnlineRoom = () => {
    onlineManager.leaveRoom();
    setOnlineRoomData(null);
    setRoomId('');
    setMode('menu');
    showToast('Left the room.');
  };

  const shuffleOnlineBoard = () => {
    const size = onlineRoomData?.gridSize || gridSize;
    const newBoard = generateRandomGrid(size);
    onlineManager.shuffleBoard(newBoard);
    showToast('Your card has been shuffled!');
  };

  const startOnlineGame = (swapPapers = false) => {
    try {
      onlineManager.startGame(swapPapers);
    } catch (err) {
      showToast(err.message || 'Could not start match.');
    }
  };

  const announceOnlineNumber = (num) => {
    if (soundEnabled) playSound('mark');
    onlineManager.announceNumber(num);
  };

  const playAgainOnline = () => {
    try {
      onlineManager.playAgain();
    } catch (err) {
      showToast(err.message || 'Could not start rematch.');
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    showToast(`Room code ${roomId} copied!`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('Invite link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Helper: SVG Line Strike-through overlay across completed lines
  const renderLineStrikeThroughs = (completedLines, size, strokeColor) => {
    if (!completedLines || completedLines.length === 0) return null;

    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
        {completedLines.map((line, idx) => {
          let x1, y1, x2, y2;
          const cellSize = 100 / size;
          const halfCell = cellSize / 2;

          if (line.type === 'row') {
            y1 = y2 = line.index * cellSize + halfCell;
            x1 = 4;
            x2 = 96;
          } else if (line.type === 'col') {
            x1 = x2 = line.index * cellSize + halfCell;
            y1 = 4;
            y2 = 96;
          } else if (line.type === 'diag1') {
            x1 = y1 = 4;
            x2 = y2 = 96;
          } else if (line.type === 'diag2') {
            x1 = 96;
            y1 = 4;
            x2 = 4;
            y2 = 96;
          }

          return (
            <line
              key={idx}
              x1={`${x1}%`}
              y1={`${y1}%`}
              x2={`${x2}%`}
              y2={`${y2}%`}
              stroke={strokeColor || '#f59e0b'}
              strokeWidth="6"
              strokeLinecap="round"
              className="drop-shadow-lg opacity-90 animate-pulse"
            />
          );
        })}
      </svg>
    );
  };

  // Helper: Letter header (e.g. B - I - N - G - O) based on grid size
  const renderBingoLetterHeader = (completedCount, size) => {
    const defaultLetters = ['B', 'I', 'N', 'G', 'O', 'S', '!'];
    const letters = defaultLetters.slice(0, size);

    return (
      <div className="flex items-center justify-center gap-1.5 sm:gap-2">
        {letters.map((letter, idx) => {
          const unlocked = completedCount > idx;
          return (
            <div
              key={idx}
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-sm sm:text-lg transition-all duration-300 ${
                unlocked
                  ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 shadow-lg scale-105 ring-2 ring-yellow-400/50'
                  : 'bg-slate-800/80 text-slate-500 border border-slate-700/60'
              }`}
            >
              {letter}
            </div>
          );
        })}
      </div>
    );
  };

  // Online local board derivation
  const myOnlineBoard = onlineRoomData?.players[myPlayerId]?.board || [];
  const myOnlineCompletedLines = calculateLines(
    myOnlineBoard,
    onlineRoomData?.calledNumbers || [],
    onlineRoomData?.gridSize || 5
  );

  return (
    <div className={`min-h-screen ${currentTheme.bg} text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950 flex flex-col items-center justify-between p-3 sm:p-6 relative overflow-x-hidden transition-colors duration-300`}>
      
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-5 z-[120] bg-slate-900/95 text-amber-300 font-extrabold text-xs sm:text-sm px-5 py-3 rounded-2xl shadow-2xl border border-amber-500/50 flex items-center gap-2.5 backdrop-blur-md animate-bounce">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="w-full max-w-4xl flex items-center justify-between border-b border-slate-800/80 pb-4 relative z-50">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${currentTheme.accentGrad} text-slate-950 font-black flex items-center justify-center text-xl shadow-lg`}>
            {gridSize}
          </div>
          <div>
            <h1 className="font-extrabold text-xl sm:text-2xl tracking-tight text-white">
              Paper Bingo <span className={currentTheme.textAccent}>[{gridSize}x{gridSize}]</span>
            </h1>
            <p className="text-xs text-slate-400">Multiplayer & vs AI Notebook Game</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Clickable Theme Switcher with high z-index */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5 shadow-lg relative z-50"
            >
              <Palette size={18} />
              <span className="hidden sm:inline text-xs font-semibold">Theme</span>
            </button>

            {showThemeMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-black/20" 
                  onClick={() => setShowThemeMenu(false)} 
                />
                <div className="absolute right-0 mt-2 w-52 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-2xl p-2.5 shadow-2xl z-50 flex flex-col gap-1 ring-1 ring-white/10">
                  <span className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">Select Theme</span>
                  {Object.values(THEMES).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTheme(t.id);
                        try {
                          localStorage.setItem('bingo_theme', t.id);
                        } catch (e) {
                          console.debug(e);
                        }
                        setShowThemeMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                        theme === t.id ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{t.name}</span>
                      {theme === t.id && <Check size={14} className="text-amber-400" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} className="text-slate-500" />}
          </button>

          {mode !== 'menu' && (
            <button
              onClick={() => {
                if (mode === 'online-game') {
                  leaveOnlineRoom();
                } else {
                  setMode('menu');
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5"
            >
              <RefreshCw size={14} /> Main Menu
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="w-full max-w-4xl my-auto py-6 flex flex-col items-center relative z-10">

        {/* MAIN MENU */}
        {mode === 'menu' && (
          <div className="w-full max-w-md flex flex-col items-center gap-6">

            {/* Grid Size Selection */}
            <div className={`w-full ${currentTheme.cardBg} border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-3`}>
              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Grid size={15} className={currentTheme.textAccent} /> Select Grid Size
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[5, 6, 7].map((size) => (
                  <button
                    key={size}
                    onClick={() => setGridSize(size)}
                    className={`py-3 rounded-2xl font-black text-sm transition flex flex-col items-center gap-0.5 border ${
                      gridSize === size
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg scale-[1.02]'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>{size}x{size}</span>
                    <span className="text-[10px] font-semibold opacity-80">{size} Lines</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Player Count Selection (Local) */}
            <div className={`w-full ${currentTheme.cardBg} border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-3`}>
              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users size={15} className={currentTheme.textAccent} /> Local Player Count
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5].map((cnt) => (
                  <button
                    key={cnt}
                    onClick={() => setPlayerCount(cnt)}
                    className={`py-2.5 rounded-xl font-black text-xs transition border ${
                      playerCount === cnt
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {cnt} Players
                  </button>
                ))}
              </div>
            </div>

            {/* Offline Game Modes */}
            <div className="w-full space-y-3">
              {/* Pass & Play */}
              <button
                onClick={() => startLocalGame(false)}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-sm shadow-xl hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-950/10">
                    <Users size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-extrabold text-base">Pass & Play ({playerCount} Players)</p>
                    <p className="text-xs text-slate-900/80 font-medium">Single device offline multiplayer</p>
                  </div>
                </div>
                <Play size={18} fill="currentColor" />
              </button>

              {/* vs Computer */}
              <button
                onClick={() => startLocalGame(true)}
                className="w-full p-4 rounded-2xl bg-slate-900 border border-slate-800 text-white font-extrabold text-sm hover:border-slate-700 transition flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                    <Bot size={20} />
                  </div>
                  <div className="text-left">
                    <p className="font-extrabold text-base">vs Computer AI ({playerCount - 1} Bots)</p>
                    <p className="text-xs text-slate-400 font-medium">Play solo against smart bots</p>
                  </div>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-amber-300 border border-slate-700">
                  {aiDifficulty.toUpperCase()}
                </span>
              </button>

              {/* AI Difficulty Selector */}
              <div className="flex gap-2 w-full pt-1">
                {['easy', 'medium', 'hard'].map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setAiDifficulty(diff)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold capitalize transition border ${
                      aiDifficulty === diff
                        ? 'bg-slate-800 text-amber-300 border-amber-500/50'
                        : 'bg-slate-950 text-slate-500 border-slate-900 hover:text-slate-300'
                    }`}
                  >
                    AI: {diff}
                  </button>
                ))}
              </div>
            </div>

            {/* Online Room Section */}
            <div className={`w-full ${currentTheme.cardBg} border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe size={15} className="text-indigo-400" /> Online Real-Time Rooms
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live P2P
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-400">Your Nickname:</label>
                <input
                  type="text"
                  placeholder="Your Nickname"
                  value={onlineMyName}
                  onChange={(e) => {
                    setOnlineMyName(e.target.value);
                    localStorage.setItem('bingo_username', e.target.value);
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  disabled={onlineIsLoading}
                  onClick={createOnlineRoom}
                  className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {onlineIsLoading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  <span>Create Room</span>
                </button>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="ROOM CODE"
                    value={joinRoomInput}
                    onChange={(e) => setJoinRoomInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && joinOnlineRoom()}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-slate-200 focus:outline-none focus:border-indigo-500 uppercase tracking-wider"
                  />
                  <button
                    disabled={onlineIsLoading || !joinRoomInput.trim()}
                    onClick={joinOnlineRoom}
                    className="px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-xs border border-slate-700 transition disabled:opacity-50 flex items-center gap-1"
                  >
                    {onlineIsLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                    Join
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* --- LOCAL GAME: BOARD SETUP PHASE --- */}
        {(mode === 'pass-and-play' || mode === 'vs-computer') && localState.phase === 'setup' && (
          <div className={`w-full max-w-2xl ${currentTheme.cardBg} border border-slate-800 rounded-3xl p-6 text-center shadow-2xl flex flex-col items-center gap-5`}>
            <div>
              <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-widest">
                Setup Phase ({localState.setupPlayerIdx + 1}/{playerCount})
              </span>
              <h2 className="text-2xl font-black text-white mt-0.5">
                {playerNames[localState.setupPlayerIdx]}'s Card Setup
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Fill numbers 1 to {gridSize * gridSize} or click Auto-Shuffle
              </p>
            </div>

            <div 
              className="grid gap-2 w-full max-w-md aspect-square bg-slate-950 p-3 rounded-2xl border border-slate-800 shadow-inner"
              style={{ 
                display: 'grid',
                gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` 
              }}
            >
              {(localState.boards[localState.setupPlayerIdx] || Array(gridSize * gridSize).fill(null)).map((num, i) => (
                <div key={i} className="w-full h-full flex items-center justify-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={num || ''}
                    onChange={(e) => {
                      const valStr = e.target.value.replace(/[^0-9]/g, '');
                      const val = parseInt(valStr, 10);
                      const maxVal = gridSize * gridSize;
                      if (!valStr) {
                        setCellLocalBoard(localState.setupPlayerIdx, i, null);
                      } else if (val >= 1 && val <= maxVal) {
                        setCellLocalBoard(localState.setupPlayerIdx, i, val);
                      }
                    }}
                    className="w-full h-full text-center font-black text-amber-300 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 focus:bg-slate-800 transition text-base sm:text-2xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 w-full max-w-md">
              <button
                onClick={() => autoFillLocalBoard(localState.setupPlayerIdx)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-1.5"
              >
                <Shuffle size={14} /> Auto-Shuffle
              </button>
              <button
                onClick={finishLocalPlayerSetup}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={15} /> Confirm Layout
              </button>
            </div>
          </div>
        )}

        {/* --- LOCAL GAME: ACTIVE PLAYING PHASE --- */}
        {(mode === 'pass-and-play' || mode === 'vs-computer') && (localState.phase === 'playing' || localState.phase === 'finished') && (
          <div className="w-full max-w-2xl flex flex-col items-center gap-6">

            {localState.phase === 'playing' && (
              <div className="w-full flex flex-col items-center gap-4">
                {/* Turn Header */}
                <div className={`w-full ${currentTheme.cardBg} border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between`}>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Turn</span>
                    <h3 className="text-xl font-extrabold text-amber-400">
                      {playerNames[localState.currentTurnIdx]}
                      {localState.isAi[localState.currentTurnIdx] && ' (AI)'}
                    </h3>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Lines ({localState.completedLines[localState.currentTurnIdx]?.length || 0}/{targetLines})
                    </span>
                    {renderBingoLetterHeader(localState.completedLines[localState.currentTurnIdx]?.length || 0, gridSize)}
                  </div>
                </div>

                {/* Grid Card */}
                <div className={`w-full ${currentTheme.cardBg} border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col items-center gap-4 relative`}>
                  
                  {/* Privacy overlay during AI turn */}
                  {localState.isAi[localState.currentTurnIdx] && (
                    <div className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center gap-3 text-amber-400 p-6 text-center">
                      <Bot size={40} className="animate-bounce" />
                      <p className="font-extrabold text-lg">AI is thinking...</p>
                      <p className="text-xs text-slate-400">Card masked during bot's turn for fair play</p>
                    </div>
                  )}

                  <div 
                    className="grid gap-2 w-full max-w-md aspect-square bg-slate-950 p-3 rounded-2xl border border-slate-800 shadow-inner relative" 
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` 
                    }}
                  >
                    
                    {renderLineStrikeThroughs(
                      localState.completedLines[localState.currentTurnIdx] || [],
                      gridSize,
                      currentTheme.strokeColor
                    )}

                    {(localState.boards[localState.currentTurnIdx] || []).map((num, cellIdx) => {
                      const isCalled = localState.calledNumbers.includes(num);

                      return (
                        <button
                          key={cellIdx}
                          disabled={isCalled || localState.isAi[localState.currentTurnIdx]}
                          onClick={() => announceNumberLocal(num)}
                          className={`relative w-full h-full rounded-xl font-black transition-all flex items-center justify-center border text-base sm:text-2xl ${
                            isCalled
                              ? currentTheme.cellMarked
                              : `${currentTheme.cellBg} hover:scale-[1.03]`
                          }`}
                        >
                          <span className="flex items-center justify-center text-center w-full h-full leading-none">{num}</span>
                          {isCalled && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-red-500/80 text-2xl sm:text-4xl font-black">✕</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Standings & Call Log */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  <div className={`p-4 rounded-2xl ${currentTheme.cardBg} border border-slate-800 flex flex-col gap-2`}>
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                      <History size={14} className={currentTheme.textAccent} /> Call Log ({localState.calledNumbers.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                      {localState.calledNumbers.map((n, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold text-xs">
                          #{i + 1}: {n}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl ${currentTheme.cardBg} border border-slate-800 flex flex-col gap-2`}>
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                      <Trophy size={14} className="text-yellow-400" /> Players & Card Reveal
                    </span>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto pt-1">
                      {Array.from({ length: playerCount }).map((_, i) => {
                        const winner = localState.winners.find(w => w.playerIdx === i);
                        const linesCount = localState.completedLines[i]?.length || 0;

                        return (
                          <div key={i} className="flex items-center justify-between text-xs font-semibold px-2 py-1 rounded-lg bg-slate-950/60">
                            <span className="text-slate-300 flex items-center gap-1">
                              {winner && <Crown size={12} className="text-yellow-400" />}
                              {playerNames[i]}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={winner ? 'text-yellow-400 font-extrabold' : 'text-slate-400'}>
                                {winner ? `Rank #${winner.rank} (BINGO)` : `${linesCount}/${targetLines} Lines`}
                              </span>

                              {winner && (
                                <button
                                  onClick={() => setViewCardsModal({ open: true, playerIdx: i, onlinePlayerId: null })}
                                  className="p-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/40 transition"
                                  title="View Player's Card"
                                >
                                  <Eye size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* END-GAME RESULT SCREEN */}
            {localState.phase === 'finished' && (
              <div className={`w-full max-w-md ${currentTheme.cardBg} border border-slate-800 rounded-3xl p-6 text-center shadow-2xl flex flex-col items-center gap-5`}>
                <div className="p-4 rounded-full bg-yellow-500/10 text-yellow-400 ring-8 ring-yellow-500/5">
                  <Trophy size={48} />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-white">Match Concluded!</h2>
                  <p className="text-xs text-slate-400 mt-1">Final Standings & Winning Rankings</p>
                </div>

                {/* Final Victory Podium List */}
                <div className="w-full space-y-2">
                  {localState.winners.map((w) => (
                    <div key={w.playerIdx} className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-2 text-slate-200">
                        <Crown size={15} className="text-yellow-400" /> #{w.rank} {w.name}
                      </span>
                      <button
                        onClick={() => setViewCardsModal({ open: true, playerIdx: w.playerIdx, onlinePlayerId: null })}
                        className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1"
                      >
                        <Eye size={12} /> View Card
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 w-full pt-2">
                  <button
                    onClick={() => startLocalGame(mode === 'vs-computer')}
                    className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-lg"
                  >
                    Play Again
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* --- ONLINE MULTIPLAYER GAMEPLAY --- */}
        {mode === 'online-game' && onlineRoomData && (
          <div className="w-full max-w-2xl flex flex-col items-center gap-6">

            {/* Room Header & Share Bar */}
            <div className={`w-full ${currentTheme.cardBg} border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between`}>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Room Code</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-xl font-mono font-black text-indigo-400 tracking-widest">{roomId}</h3>
                  <button 
                    onClick={copyRoomCode} 
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-300 transition"
                    title="Copy Code"
                  >
                    {copiedCode ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                  <button 
                    onClick={copyRoomLink} 
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-indigo-300 transition"
                    title="Copy Invite Link"
                  >
                    {copiedLink ? <Check size={14} className="text-green-400" /> : <Link size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5">
                  <Users size={12} />
                  {Object.keys(onlineRoomData.players || {}).length} Players
                </span>
                <button
                  onClick={leaveOnlineRoom}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-800 transition"
                  title="Leave Room"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>

            {/* --- ONLINE LOBBY --- */}
            {onlineRoomData.status === 'lobby' && (
              <div className={`w-full ${currentTheme.cardBg} border border-slate-800 rounded-3xl p-6 text-center shadow-2xl flex flex-col items-center gap-6`}>
                <div>
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-widest">
                      Lobby Active • {onlineRoomData.gridSize}x{onlineRoomData.gridSize} Grid
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-white">Online Room Lobby</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Share room code <strong className="text-indigo-400 font-mono">{roomId}</strong> with friends to join!
                  </p>
                </div>

                {/* Joined Players List */}
                <div className="w-full max-w-sm bg-slate-950/80 rounded-2xl p-3 border border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400 border-b border-slate-800/80 pb-2 px-1">
                    <span className="flex items-center gap-1.5">
                      <Users size={14} className="text-indigo-400" /> Connected Players
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 font-mono font-bold">
                      {Object.keys(onlineRoomData.players || {}).length} Joined
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                    {Object.values(onlineRoomData.players || {}).map((p) => {
                      const isMe = p.id === myPlayerId;
                      const isHost = p.id === onlineRoomData.hostId;
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold ${
                            isMe ? 'bg-indigo-950/40 border border-indigo-500/30 text-indigo-200' : 'bg-slate-900 border border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isHost && <Crown size={14} className="text-yellow-400" title="Host" />}
                            <span>{p.name}</span>
                            {isMe && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                                You
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Ready
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Card Preview with Shuffle Option */}
                <div className="flex flex-col items-center gap-2 w-full max-w-xs">
                  <div className="flex items-center justify-between w-full px-1">
                    <span className="text-xs font-bold text-slate-400">Your Card Preview:</span>
                    <button
                      onClick={shuffleOnlineBoard}
                      className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition"
                    >
                      <Shuffle size={12} /> Auto-Shuffle
                    </button>
                  </div>

                  <div 
                    className="grid gap-1.5 w-full aspect-square bg-slate-950 p-2.5 rounded-2xl border border-slate-800 shadow-inner"
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: `repeat(${onlineRoomData.gridSize || 5}, minmax(0, 1fr))` 
                    }}
                  >
                    {myOnlineBoard.map((num, i) => (
                      <div key={i} className="w-full h-full bg-slate-900 rounded-lg flex items-center justify-center text-center font-black text-amber-300 text-xs sm:text-sm border border-slate-800 leading-none">
                        {num}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                {myPlayerId === onlineRoomData.hostId ? (
                  <div className="flex flex-col gap-2.5 w-full max-w-xs">
                    {Object.keys(onlineRoomData.players || {}).length < 2 ? (
                      <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2">
                        <Users size={16} className="text-amber-400 animate-pulse" />
                        <span>Waiting for at least 1 friend to join...</span>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => startOnlineGame(false)}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 font-extrabold text-slate-950 text-xs shadow-lg hover:scale-[1.01] active:scale-[0.99] transition flex items-center justify-center gap-1.5"
                        >
                          <Play size={15} fill="currentColor" /> Start Match
                        </button>
                        <button
                          onClick={() => startOnlineGame(true)}
                          className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-500/30 transition flex items-center justify-center gap-1.5"
                        >
                          <Shuffle size={14} /> Traditional Rule: Swap Papers & Start
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center gap-2 text-xs font-semibold text-amber-400 animate-pulse">
                    <Loader2 size={16} className="animate-spin" />
                    Waiting for host to start match...
                  </div>
                )}
              </div>
            )}

            {/* --- ONLINE ACTIVE PLAYING PHASE --- */}
            {onlineRoomData.status === 'playing' && (
              <div className="w-full flex flex-col gap-6 items-center">
                {/* Active Turn Banner */}
                <div className={`w-full ${currentTheme.cardBg} border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between`}>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Turn</span>
                    <h3 className={`text-lg font-black ${
                      onlineRoomData.turnUserId === myPlayerId ? 'text-amber-400 animate-pulse' : 'text-slate-200'
                    }`}>
                      {onlineRoomData.turnUserId === myPlayerId ? '⭐ YOUR TURN! Pick a number' : `${onlineRoomData.players[onlineRoomData.turnUserId]?.name || 'Player'}'s turn`}
                    </h3>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Completed Lines ({onlineRoomData.players[myPlayerId]?.lines || 0}/{onlineRoomData.targetLines || 5})
                    </span>
                    {renderBingoLetterHeader(onlineRoomData.players[myPlayerId]?.lines || 0, onlineRoomData.gridSize || 5)}
                  </div>
                </div>

                {/* Grid Card */}
                <div className={`w-full ${currentTheme.cardBg} border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col items-center gap-4`}>
                  <div 
                    className="grid gap-2 w-full max-w-md aspect-square bg-slate-950 p-3 rounded-2xl border border-slate-800 shadow-inner relative" 
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: `repeat(${onlineRoomData.gridSize || 5}, minmax(0, 1fr))` 
                    }}
                  >
                    
                    {renderLineStrikeThroughs(
                      myOnlineCompletedLines,
                      onlineRoomData.gridSize || 5,
                      currentTheme.strokeColor
                    )}

                    {myOnlineBoard.map((num, cellIdx) => {
                      const isCalled = onlineRoomData.calledNumbers?.includes(num);
                      const isMyTurn = onlineRoomData.turnUserId === myPlayerId;

                      return (
                        <button
                          key={cellIdx}
                          disabled={!isMyTurn || isCalled}
                          onClick={() => announceOnlineNumber(num)}
                          className={`relative w-full h-full rounded-xl font-black transition-all flex items-center justify-center border text-base sm:text-2xl ${
                            isCalled
                              ? currentTheme.cellMarked
                              : `${currentTheme.cellBg} ${isMyTurn ? 'hover:scale-[1.04] cursor-pointer' : 'cursor-default opacity-80'}`
                          }`}
                        >
                          <span className="flex items-center justify-center text-center w-full h-full leading-none">{num}</span>
                          {isCalled && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-red-500/80 text-2xl sm:text-4xl font-black">✕</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Call Log & Standings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  {/* Call Log */}
                  <div className={`p-4 rounded-2xl ${currentTheme.cardBg} border border-slate-800 flex flex-col gap-2`}>
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                      <History size={14} className={currentTheme.textAccent} /> Call Log ({onlineRoomData.calledNumbers?.length || 0})
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                      {(onlineRoomData.calledNumbers || []).map((n, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold text-xs">
                          #{i + 1}: {n}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Online Standings & Card Reveal */}
                  <div className={`p-4 rounded-2xl ${currentTheme.cardBg} border border-slate-800 flex flex-col gap-2`}>
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                      <Trophy size={14} className="text-yellow-400" /> Players & Standings
                    </span>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto pt-1">
                      {Object.values(onlineRoomData.players || {}).map((p) => {
                        const isMe = p.id === myPlayerId;
                        return (
                          <div key={p.id} className="flex items-center justify-between text-xs font-semibold px-2 py-1 rounded-lg bg-slate-950/60">
                            <span className="text-slate-300 flex items-center gap-1">
                              {p.rank && <Crown size={12} className="text-yellow-400" />}
                              {p.name} {isMe && '(You)'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={p.rank ? 'text-yellow-400 font-bold' : 'text-slate-400'}>
                                {p.rank ? `Rank #${p.rank} (BINGO)` : `${p.lines || 0}/${onlineRoomData.targetLines || 5} Lines`}
                              </span>

                              {p.rank && (
                                <button
                                  onClick={() => setViewCardsModal({ open: true, playerIdx: null, onlinePlayerId: p.id })}
                                  className="p-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/40"
                                  title="View Player's Card"
                                >
                                  <Eye size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* --- ONLINE MATCH CONCLUDED SCREEN --- */}
            {onlineRoomData.status === 'finished' && (() => {
              const winners = onlineRoomData.winners || [];
              const firstWinner = winners[0];
              const isMeWinner = winners.some(w => w.id === myPlayerId);

              // Gather all players with their lines and winner status
              const allPlayers = Object.values(onlineRoomData.players || {}).map(p => {
                const winnerInfo = winners.find(w => w.id === p.id);
                return {
                  ...p,
                  isWinner: !!winnerInfo,
                  rank: winnerInfo ? winnerInfo.rank : null,
                  lines: p.lines || 0
                };
              });

              // Sort winners first by rank, then others by completed lines descending
              allPlayers.sort((a, b) => {
                if (a.isWinner && b.isWinner) return a.rank - b.rank;
                if (a.isWinner) return -1;
                if (b.isWinner) return 1;
                return b.lines - a.lines;
              });

              return (
                <div className={`w-full max-w-md ${currentTheme.cardBg} border border-slate-800 rounded-3xl p-6 text-center shadow-2xl flex flex-col items-center gap-5 animate-in fade-in duration-300`}>
                  <div className="p-4 rounded-full bg-yellow-500/10 text-yellow-400 ring-8 ring-yellow-500/5 animate-bounce">
                    <Trophy size={48} />
                  </div>

                  <div>
                    <h2 className="text-2xl font-black text-white">Match Concluded!</h2>
                    <p className="text-xs text-slate-400 mt-1">Official Final Standings & Winner</p>
                  </div>

                  {/* Outcome Highlight Banner */}
                  {isMeWinner ? (
                    <div className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-400/20 to-amber-500/20 border border-yellow-400/50 text-yellow-300 font-black text-sm flex items-center justify-center gap-2 shadow-lg">
                      <Sparkles size={16} className="text-yellow-400 animate-spin" />
                      <span>VICTORY! You claimed BINGO!</span>
                    </div>
                  ) : (
                    <div className="w-full py-2.5 px-4 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 font-extrabold text-xs flex items-center justify-center gap-2">
                      <Crown size={15} className="text-yellow-400 shrink-0" />
                      <span>
                        <strong className="text-yellow-400 font-black">{firstWinner?.name || 'Opponent'}</strong> completed {onlineRoomData.targetLines || 5} lines and won the game!
                      </span>
                    </div>
                  )}

                  {/* Complete Player Standings */}
                  <div className="w-full space-y-2">
                    {allPlayers.map((p, idx) => (
                      <div 
                        key={p.id} 
                        className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-bold transition ${
                          p.isWinner 
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md ring-1 ring-amber-500/20' 
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {p.isWinner ? (
                            <Crown size={16} className="text-yellow-400" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                              #{idx + 1}
                            </span>
                          )}
                          <span className={p.isWinner ? 'font-black text-white' : ''}>
                            {p.name} {p.id === myPlayerId && '(You)'}
                          </span>
                        </span>

                        <div className="flex items-center gap-2">
                          <span className={p.isWinner ? 'text-yellow-400 font-black tracking-wide' : 'text-slate-400'}>
                            {p.isWinner ? `Rank #${p.rank} (BINGO)` : `${p.lines}/${onlineRoomData.targetLines || 5} Lines`}
                          </span>

                          <button
                            onClick={() => setViewCardsModal({ open: true, playerIdx: null, onlinePlayerId: p.id })}
                            className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1 transition"
                            title="Inspect Player's Card"
                          >
                            <Eye size={12} /> View Card
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Rematch Controls */}
                  <div className="flex flex-col gap-2 w-full pt-2">
                    {myPlayerId === onlineRoomData.hostId ? (
                      <button
                        onClick={playAgainOnline}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:opacity-95 text-slate-950 font-black text-xs transition shadow-lg flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw size={15} /> Play Rematch (New Cards)
                      </button>
                    ) : (
                      <p className="text-xs text-amber-400 animate-pulse font-medium">
                        Waiting for host to initiate rematch...
                      </p>
                    )}

                    <button
                      onClick={leaveOnlineRoom}
                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition"
                    >
                      Return to Main Menu
                    </button>
                  </div>
                </div>
              );
            })()}

          </div>
        )}

      </main>

      {/* MODAL: VIEW PLAYER REVEALED CARD */}
      {viewCardsModal.open && (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col items-center gap-4 relative">
            <button
              onClick={() => setViewCardsModal({ open: false, playerIdx: null, onlinePlayerId: null })}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800 transition"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Crown size={18} className="text-yellow-400" /> 
              Revealed Card: {
                viewCardsModal.playerIdx !== null 
                  ? playerNames[viewCardsModal.playerIdx] 
                  : (onlineRoomData?.players[viewCardsModal.onlinePlayerId]?.name || 'Player')
              }
            </h3>

            {/* Local Player Card Reveal */}
            {viewCardsModal.playerIdx !== null && (
              <div 
                className="grid gap-2 w-full aspect-square bg-slate-950 p-3 rounded-2xl border border-slate-800 relative"
                style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
              >
                {renderLineStrikeThroughs(
                  localState.completedLines[viewCardsModal.playerIdx] || [],
                  gridSize,
                  currentTheme.strokeColor
                )}

                {(localState.boards[viewCardsModal.playerIdx] || []).map((num, idx) => {
                  const isCalled = localState.calledNumbers.includes(num);
                  return (
                    <div
                      key={idx}
                      className={`rounded-xl font-black flex items-center justify-center text-sm sm:text-xl border ${
                        isCalled ? currentTheme.cellMarked : currentTheme.cellBg
                      }`}
                    >
                      {num}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Online Player Card Reveal */}
            {viewCardsModal.onlinePlayerId && onlineRoomData && (
              <div 
                className="grid gap-2 w-full aspect-square bg-slate-950 p-3 rounded-2xl border border-slate-800 relative"
                style={{ gridTemplateColumns: `repeat(${onlineRoomData.gridSize || 5}, minmax(0, 1fr))` }}
              >
                {renderLineStrikeThroughs(
                  calculateLines(
                    onlineRoomData.players[viewCardsModal.onlinePlayerId]?.board || [],
                    onlineRoomData.calledNumbers || [],
                    onlineRoomData.gridSize || 5
                  ),
                  onlineRoomData.gridSize || 5,
                  currentTheme.strokeColor
                )}

                {(onlineRoomData.players[viewCardsModal.onlinePlayerId]?.board || []).map((num, idx) => {
                  const isCalled = onlineRoomData.calledNumbers?.includes(num);
                  return (
                    <div
                      key={idx}
                      className={`rounded-xl font-black flex items-center justify-center text-sm sm:text-xl border ${
                        isCalled ? currentTheme.cellMarked : currentTheme.cellBg
                      }`}
                    >
                      {num}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="w-full max-w-4xl border-t border-slate-800/80 pt-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2 z-10">
        <p>© Traditional Paper Bingo • Pass-and-Play, AI Bots & Online Multiplayer</p>
        <p className="flex items-center gap-1">
          <Info size={13} /> Complete {targetLines} lines to claim victory!
        </p>
      </footer>
    </div>
  );
}
