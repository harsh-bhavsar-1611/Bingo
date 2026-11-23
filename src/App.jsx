import { useState, useEffect, useCallback } from 'react';
import { 
  Trophy, 
  RefreshCw, 
  Shuffle, 
  Users, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  History, 
  Play, 
  Crown,
  Info,
  Bot,
  Eye,
  X,
  Grid,
  AlertTriangle,
  Link,
  LogOut,
  RotateCcw,
  Loader2,
  ArrowUpRight
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

export default function App() {
  const [mode, setMode] = useState('menu'); // menu, pass-and-play, vs-computer, online-game
  const [gridSize, setGridSize] = useState(5); // 5x5, 6x6, 7x7
  const [soundEnabled, setSoundEnabled] = useState(true);

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

  // Local game state initialized with Player 0's board ready immediately
  const [localState, setLocalState] = useState(() => ({
    phase: 'ready', // 'ready', 'playing', 'finished'
    setupPlayerIdx: 0,
    boards: { 0: generateRandomGrid(5) },
    calledNumbers: [],
    currentTurnIdx: 0,
    winners: [],
    completedLines: {},
    isAi: {}
  }));

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

  // Handle Grid Size Change with immediate board synchronization
  const handleGridSizeChange = (newSize) => {
    setGridSize(newSize);
    setLocalState(prev => ({
      ...prev,
      boards: {
        ...prev.boards,
        0: generateRandomGrid(newSize)
      },
      calledNumbers: [],
      winners: [],
      completedLines: {},
      phase: 'ready',
      currentTurnIdx: 0
    }));
    setMode('menu');
  };

  // Auto-Shuffle on Right Panel
  const handleAutoShuffle = () => {
    if (mode === 'online-game' && onlineRoomData) {
      shuffleOnlineBoard();
    } else {
      const newBoard = generateRandomGrid(gridSize);
      setLocalState(prev => ({
        ...prev,
        boards: {
          ...prev.boards,
          0: newBoard
        }
      }));
      showToast('Card re-shuffled!');
    }
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
        if (!pBoard) continue;
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

  // AI bot turn trigger
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
        if (!board) return;
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

  // Start local game in-place
  const startLocalGame = (isVsAi = false) => {
    const initialBoards = {};
    const isAiMap = {};

    for (let i = 0; i < playerCount; i++) {
      if (i === 0 && localState.boards[0] && localState.boards[0].length === gridSize * gridSize) {
        initialBoards[0] = localState.boards[0];
      } else {
        initialBoards[i] = generateRandomGrid(gridSize);
      }
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
    showToast(`Match started! ${isVsAi ? 'Playing vs AI' : 'Pass & Play mode'}`);
  };

  const resetToSetup = () => {
    setLocalState(prev => ({
      ...prev,
      phase: 'ready',
      calledNumbers: [],
      winners: [],
      completedLines: {},
      currentTurnIdx: 0
    }));
    setMode('menu');
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
    const board = (localState.boards[0] && localState.boards[0].length === gridSize * gridSize)
      ? localState.boards[0]
      : generateRandomGrid(gridSize);

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

  // Helper: SVG Line Strike-through overlay
  const renderLineStrikeThroughs = (completedLines, size, strokeColor = '#000000') => {
    if (!completedLines || completedLines.length === 0) return null;

    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
        {completedLines.map((line, idx) => {
          let x1, y1, x2, y2;
          const cellSize = 100 / size;
          const halfCell = cellSize / 2;

          if (line.type === 'row') {
            y1 = y2 = line.index * cellSize + halfCell;
            x1 = 3;
            x2 = 97;
          } else if (line.type === 'col') {
            x1 = x2 = line.index * cellSize + halfCell;
            y1 = 3;
            y2 = 97;
          } else if (line.type === 'diag1') {
            x1 = y1 = 3;
            x2 = 97;
          } else if (line.type === 'diag2') {
            x1 = 97;
            y1 = 3;
            x2 = 3;
            y2 = 97;
          }

          return (
            <line
              key={idx}
              x1={`${x1}%`}
              y1={`${y1}%`}
              x2={`${x2}%`}
              y2={`${y2}%`}
              stroke={strokeColor}
              strokeWidth="6"
              strokeLinecap="square"
              className="drop-shadow-sm opacity-95"
            />
          );
        })}
      </svg>
    );
  };

  // Helper: Letter header (e.g. B - I - N - G - O)
  const renderBingoLetterHeader = (completedCount, size) => {
    const defaultLetters = ['B', 'I', 'N', 'G', 'O', 'S', '!'];
    const symbols = ['■', '●', '▶', '//', '★', '▲', '◆'];
    const letters = defaultLetters.slice(0, size);

    return (
      <div 
        className="grid gap-1.5 sm:gap-2 w-full max-w-md"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {letters.map((letter, idx) => {
          const unlocked = completedCount > idx;
          const colors = [
            'bg-[#FF5500] text-white',
            'bg-[#5E5CE6] text-white',
            'bg-[#CCFF00] text-black',
            'bg-black text-white',
            'bg-[#FF5500] text-white',
            'bg-[#5E5CE6] text-white',
            'bg-[#CCFF00] text-black'
          ];
          const activeColor = colors[idx % colors.length];

          return (
            <div
              key={idx}
              className={`border-2 border-black flex flex-col justify-between p-1.5 sm:p-2 transition-all duration-200 select-none ${
                unlocked
                  ? `${activeColor} shadow-brutal-sm scale-[1.03]`
                  : 'bg-white text-black/30'
              }`}
            >
              <div className="flex items-center justify-between text-[8px] sm:text-[9px] font-mono font-bold leading-none">
                <span>0{idx + 1}</span>
                <span>{symbols[idx % symbols.length]}</span>
              </div>
              <div className="font-condensed font-black text-2xl sm:text-3xl text-center leading-none mt-1 sm:mt-1.5">
                {letter}
              </div>
              <div className="text-[7px] sm:text-[8px] font-mono uppercase text-center mt-0.5 tracking-tight font-bold opacity-80">
                {unlocked ? 'ACTIVE' : 'LOCK'}
              </div>
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

  // Local game display: in vs-computer mode, permanently pin display to Player 0 (human user)
  const localDisplayPlayerIdx = mode === 'vs-computer' ? 0 : localState.currentTurnIdx;
  const isLocalUserTurn = localState.currentTurnIdx === localDisplayPlayerIdx;

  // Unified Board State Variables (Right Section)
  const isOnline = mode === 'online-game';
  const activeGridSize = isOnline ? (onlineRoomData?.gridSize || gridSize) : gridSize;
  const activeBoard = isOnline 
    ? myOnlineBoard 
    : (localState.boards[localDisplayPlayerIdx] || localState.boards[0] || []);
  const activeCompletedLines = isOnline 
    ? myOnlineCompletedLines 
    : (localState.completedLines[localDisplayPlayerIdx] || []);
  const isGameActive = isOnline 
    ? onlineRoomData?.status === 'playing' 
    : localState.phase === 'playing';
  const isUserTurnToCall = isOnline 
    ? (onlineRoomData?.turnUserId === myPlayerId) 
    : (isGameActive && isLocalUserTurn);
  const activeCalledNumbers = isOnline 
    ? (onlineRoomData?.calledNumbers || []) 
    : localState.calledNumbers;

  return (
    <div className="min-h-screen bg-[#F4F3EE] text-[#111111] font-mono selection:bg-[#FF5500] selection:text-white flex flex-col items-center justify-between p-3 sm:p-6 relative overflow-x-hidden">
      
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-4 z-[120] bg-black text-[#CCFF00] font-mono text-xs sm:text-sm px-4 py-2.5 border-2 border-black shadow-brutal flex items-center gap-2">
          <AlertTriangle size={16} className="text-[#CCFF00] shrink-0" />
          <span className="font-bold">{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER */}
      <header className="w-full max-w-6xl flex items-center justify-between border-b-2 border-black pb-3 relative z-50">
        <div>
          <h1 className="font-condensed font-black text-4xl sm:text-5xl tracking-tighter uppercase leading-none">
            BINGO
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 border-2 border-black bg-white hover:bg-black hover:text-white text-black transition-all shadow-brutal-sm cursor-pointer"
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} className="text-black/40" />}
          </button>

          {(mode !== 'menu' || localState.phase !== 'ready') && (
            <button
              onClick={() => {
                if (mode === 'online-game') {
                  leaveOnlineRoom();
                } else {
                  resetToSetup();
                }
              }}
              className="px-2.5 py-1.5 border-2 border-black bg-white hover:bg-black hover:text-white font-condensed font-black text-xs uppercase transition-all shadow-brutal-sm flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} /> NEW MATCH
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER: 2-SECTION DASHBOARD */}
      <main className="w-full max-w-6xl my-auto py-4 flex flex-col gap-5 relative z-10">

        {/* ======================================================== */}
        {/* TOP SPECIFICATION RIBBON (Replaces bulky Match card)     */}
        {/* ======================================================== */}
        <div className="w-full bg-[#FF5500] text-white border-2 border-black shadow-brutal px-3 sm:px-4 py-2 sm:py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-condensed font-black text-base sm:text-lg uppercase tracking-wider bg-black text-[#CCFF00] px-2 py-0.5 border border-black leading-none">
              MATCH // 01
            </span>
            <span className="font-mono text-xs sm:text-sm font-bold uppercase tracking-tight text-white flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isGameActive ? 'bg-[#CCFF00] animate-ping' : 'bg-white'}`}></span>
              {mode === 'online-game' ? 'ONLINE MULTIPLAYER' : mode === 'vs-computer' ? 'VS COMPUTER AI' : mode === 'pass-and-play' ? 'PASS & PLAY' : 'GAME SETUP'}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 font-mono text-[10px] sm:text-xs font-bold uppercase text-white/95">
            <span className="bg-black/20 px-2 py-0.5 border border-black/40">
              GRID: {activeGridSize}×{activeGridSize}
            </span>
            <span className="bg-black/20 px-2 py-0.5 border border-black/40">
              {mode === 'online-game' ? `${Object.keys(onlineRoomData?.players || {}).length || 1} PLAYERS` : `${playerCount} PLAYERS`}
            </span>
            <span className="bg-black/20 px-2 py-0.5 border border-black/40">
              TARGET: {isOnline ? (onlineRoomData?.targetLines || targetLines) : targetLines} LINES
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2-SECTION GRID (LEFT PANE & RIGHT PANE CONTAINERS)       */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 w-full items-start">

          {/* ------------------------------------------------------ */}
          {/* LEFT PANE CONTAINER: CONTROLS, MODES & TELEMETRY       */}
          {/* ------------------------------------------------------ */}
          <div className="lg:col-span-5 bg-white border-2 border-black shadow-brutal p-4 sm:p-5 flex flex-col gap-4 w-full">

            {/* Left Pane Header */}
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <span className="font-condensed font-black text-xl uppercase tracking-wider text-black">
                {isGameActive ? 'MATCH CONSOLE' : 'MATCH SETUP'}
              </span>
              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 bg-black text-[#CCFF00]">
                PANE // 01
              </span>
            </div>

            {/* A. SETUP VIEW (Before Match is active) */}
            {!isGameActive && mode !== 'online-game' && (
              <>
                {/* Grid Size Selection */}
                <div className="w-full bg-white border-2 border-black shadow-brutal p-3 sm:p-4 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between border-b-2 border-black pb-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Grid size={13} /> SELECT GRID MATRIX
                    </span>
                    <span className="text-[9px] font-mono font-bold text-black/50">LINES = GRID</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[5, 6, 7].map((size) => (
                      <button
                        key={size}
                        onClick={() => handleGridSizeChange(size)}
                        className={`py-2 px-1 border-2 border-black font-condensed font-black text-base flex flex-col items-center justify-center transition-all cursor-pointer ${
                          gridSize === size
                            ? 'bg-black text-[#CCFF00] shadow-brutal-sm -translate-y-0.5'
                            : 'bg-white text-black hover:bg-black/5'
                        }`}
                      >
                        <span>{size} × {size}</span>
                        <span className="text-[8px] font-mono uppercase font-bold opacity-80">{size} LINES</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Local Player Count */}
                <div className="w-full bg-white border-2 border-black shadow-brutal p-3 sm:p-4 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between border-b-2 border-black pb-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Users size={13} /> LOCAL PLAYER COUNT
                    </span>
                    <span className="text-[9px] font-mono font-bold text-black/50">{playerCount} SEATS</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[2, 3, 4, 5].map((cnt) => (
                      <button
                        key={cnt}
                        onClick={() => setPlayerCount(cnt)}
                        className={`py-2 px-1 border-2 border-black font-condensed font-black text-xs sm:text-sm uppercase transition-all cursor-pointer ${
                          playerCount === cnt
                            ? 'bg-[#FF5500] text-white shadow-brutal-sm -translate-y-0.5'
                            : 'bg-white text-black hover:bg-black/5'
                        }`}
                      >
                        {cnt} Players
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode Launcher Cards */}
                <div className="w-full flex flex-col gap-3">
                  {/* Card 01: Pass & Play */}
                  <button
                    onClick={() => startLocalGame(false)}
                    className="w-full p-4 bg-[#FF5500] text-white border-2 border-black shadow-brutal hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-brutal-sm transition-all flex items-center justify-between text-left group cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold bg-black text-white px-1.5 py-0.5">01</span>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-black">OFFLINE</span>
                      </div>
                      <h3 className="font-condensed font-black text-2xl sm:text-3xl uppercase tracking-tight mt-1 leading-none text-white">
                        PASS & PLAY
                      </h3>
                      <p className="text-[10px] font-mono uppercase tracking-wider opacity-90 mt-1">
                        {playerCount} PLAYERS • SINGLE DEVICE
                      </p>
                    </div>
                    <div className="w-10 h-10 border-2 border-black bg-black text-white flex items-center justify-center shrink-0 group-hover:bg-white group-hover:text-black transition-colors">
                      <Play size={18} fill="currentColor" />
                    </div>
                  </button>

                  {/* Card 02: VS Computer AI */}
                  <div className="w-full p-4 bg-[#5E5CE6] text-white border-2 border-black shadow-brutal flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold bg-black text-white px-1.5 py-0.5">02</span>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/80">SOLO</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-condensed font-black text-2xl sm:text-3xl uppercase tracking-tight leading-none">
                          VS COMPUTER AI
                        </h3>
                        <p className="text-[10px] font-mono uppercase tracking-wider opacity-80 mt-1">
                          TACTICAL BOT OPPONENT
                        </p>
                      </div>
                      <button
                        onClick={() => startLocalGame(true)}
                        className="w-10 h-10 border-2 border-black bg-black text-white hover:bg-white hover:text-black flex items-center justify-center shrink-0 transition-colors shadow-brutal-sm cursor-pointer"
                        title="Start vs AI Match"
                      >
                        <Play size={18} fill="currentColor" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/20">
                      {['easy', 'medium', 'hard'].map((diff) => (
                        <button
                          key={diff}
                          onClick={() => setAiDifficulty(diff)}
                          className={`py-1.5 font-mono text-[10px] font-bold uppercase border-2 border-black transition-all cursor-pointer ${
                            aiDifficulty === diff
                              ? 'bg-black text-[#CCFF00] shadow-brutal-sm'
                              : 'bg-white/10 text-white hover:bg-white/20'
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Card 03: Online Real-Time Rooms */}
                  <div className="w-full p-4 bg-[#CCFF00] text-black border-2 border-black shadow-brutal flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold bg-black text-white px-1.5 py-0.5">03</span>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-black">ONLINE</span>
                    </div>

                    <div>
                      <h3 className="font-condensed font-black text-2xl sm:text-3xl uppercase tracking-tight leading-none text-black">
                        ONLINE ROOMS
                      </h3>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-black/70 mt-1 font-bold">
                        MULTIPLAYER
                      </p>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-mono font-bold uppercase text-black/70">PLAYER NAME:</label>
                      <input
                        type="text"
                        placeholder="ENTER PLAYER NAME"
                        value={onlineMyName}
                        onChange={(e) => {
                          setOnlineMyName(e.target.value);
                          localStorage.setItem('bingo_username', e.target.value);
                        }}
                        className="w-full px-3 py-1.5 bg-white border-2 border-black font-mono font-bold text-xs text-black focus:outline-none focus:bg-amber-50"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        disabled={onlineIsLoading}
                        onClick={createOnlineRoom}
                        className="py-2.5 px-3 bg-black text-white hover:bg-white hover:text-black border-2 border-black font-condensed font-black text-base uppercase transition-all shadow-brutal-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {onlineIsLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        <span>CREATE ROOM</span>
                      </button>

                      <div className="flex gap-1">
                        <input
                          type="text"
                          placeholder="ROOM CODE"
                          value={joinRoomInput}
                          onChange={(e) => setJoinRoomInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === 'Enter' && joinOnlineRoom()}
                          className="w-full px-2 py-1 bg-white border-2 border-black font-mono font-bold text-xs text-black focus:outline-none uppercase tracking-wider"
                        />
                        <button
                          disabled={onlineIsLoading || !joinRoomInput.trim()}
                          onClick={joinOnlineRoom}
                          className="px-3 bg-black text-[#CCFF00] hover:bg-white hover:text-black border-2 border-black font-condensed font-black text-sm uppercase transition-all shadow-brutal-sm disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                        >
                          {onlineIsLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                          JOIN
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* B. ACTIVE LOCAL GAME VIEW (When local match is in progress) */}
            {isGameActive && !isOnline && (
              <>
                {/* Active Player Turn Card */}
                <div className={`w-full text-white border-2 border-black shadow-brutal p-4 relative flex items-center justify-between transition-colors ${
                  isLocalUserTurn ? 'bg-[#FF5500]' : 'bg-[#5E5CE6]'
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 bg-black text-[#CCFF00] font-mono text-[9px] font-bold uppercase tracking-wider">
                        ACTIVE TURN
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider opacity-90 font-bold">
                        PLAYER // 0{localState.currentTurnIdx + 1}
                      </span>
                    </div>
                    <h3 className="font-condensed font-black text-3xl sm:text-4xl uppercase tracking-tight mt-1 leading-none flex items-center gap-2">
                      {localState.isAi[localState.currentTurnIdx] && <Bot size={28} className="text-white shrink-0 animate-pulse" />}
                      <span>{playerNames[localState.currentTurnIdx]}</span>
                    </h3>
                    <p className="text-[10px] font-mono uppercase opacity-90 tracking-widest mt-1 font-bold">
                      {localState.isAi[localState.currentTurnIdx] ? 'AI BOT IS PICKING A NUMBER...' : 'YOUR TURN: CALL A NUMBER FROM YOUR CARD'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-between self-stretch">
                    <span className="font-condensed font-black text-xl opacity-90">0{localState.currentTurnIdx + 1}</span>
                    <ArrowUpRight size={38} strokeWidth={3} className="text-white" />
                  </div>
                </div>

                {/* Status Bar */}
                <div className="w-full bg-black text-white border-2 border-black shadow-brutal p-2.5 text-center">
                  <span className="block text-[8px] font-mono font-bold uppercase text-white/60 tracking-widest">
                    SYSTEM STATUS
                  </span>
                  <h4 className="font-condensed font-black text-xl sm:text-2xl uppercase tracking-wider text-[#CCFF00]">
                    {isLocalUserTurn ? 'YOUR MOVE: CALL NUMBER' : 'AI BOT IS CALCULATING MOVE...'}
                  </h4>
                </div>

                {/* Call Log */}
                <div className="w-full bg-white border-2 border-black shadow-brutal p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b-2 border-black pb-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <History size={13} className="text-[#FF5500]" /> CALL LOG ({localState.calledNumbers.length})
                    </span>
                    <span className="text-[9px] font-mono font-bold text-black/50">SEQUENCE</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                    {localState.calledNumbers.length === 0 ? (
                      <span className="text-[10px] font-mono text-black/40">NO NUMBERS CALLED YET</span>
                    ) : (
                      localState.calledNumbers.map((n, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-black text-[#CCFF00] font-mono font-bold text-[10px] border border-black">
                          #{i + 1}: {n}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Participants & Standings */}
                <div className="w-full bg-white border-2 border-black shadow-brutal p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b-2 border-black pb-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Trophy size={13} className="text-[#FF5500]" /> PARTICIPANTS & STANDINGS
                    </span>
                    <span className="text-[9px] font-mono font-bold text-black/50">CARDS</span>
                  </div>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pt-1">
                    {Array.from({ length: playerCount }).map((_, i) => {
                      const winner = localState.winners.find(w => w.playerIdx === i);
                      const linesCount = localState.completedLines[i]?.length || 0;

                      return (
                        <div key={i} className="flex items-center justify-between text-xs font-bold px-2.5 py-1.5 border-2 border-black bg-[#F4F3EE]">
                          <span className="text-black flex items-center gap-1.5">
                            {winner && <Crown size={14} className="text-[#FF5500]" />}
                            {playerNames[i]}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={winner ? 'text-[#FF5500] font-black' : 'text-black/60 font-mono text-[10px]'}>
                              {winner ? `RANK #${winner.rank} (BINGO)` : `${linesCount}/${targetLines} LINES`}
                            </span>

                            {winner && (
                              <button
                                onClick={() => setViewCardsModal({ open: true, playerIdx: i, onlinePlayerId: null })}
                                className="p-1 border border-black bg-white hover:bg-black hover:text-white text-black transition cursor-pointer"
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

                {/* Match Action Controls */}
                <div className="flex gap-2 w-full pt-1">
                  <button
                    onClick={() => startLocalGame(mode === 'vs-computer')}
                    className="flex-1 py-2 bg-white hover:bg-black hover:text-white text-black font-condensed font-black text-sm uppercase border-2 border-black transition shadow-brutal-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw size={14} /> RESTART
                  </button>
                  <button
                    onClick={resetToSetup}
                    className="flex-1 py-2 bg-black hover:bg-[#FF5500] text-white font-condensed font-black text-sm uppercase border-2 border-black transition shadow-brutal-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw size={14} /> NEW MATCH
                  </button>
                </div>
              </>
            )}

            {/* C. LOCAL GAME CONCLUDED (Victory Screen) */}
            {localState.phase === 'finished' && !isOnline && (
              <div className="w-full bg-white border-2 border-black shadow-brutal p-5 text-center flex flex-col items-center gap-4">
                <div className="w-14 h-14 border-2 border-black bg-[#FF5500] text-white flex items-center justify-center shadow-brutal-sm">
                  <Trophy size={32} />
                </div>
                <div>
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 bg-black text-[#CCFF00]">
                    MATCH COMPLETE
                  </span>
                  <h2 className="font-condensed font-black text-3xl uppercase tracking-tight text-black mt-1">
                    VICTORY PODIUM
                  </h2>
                </div>

                <div className="w-full space-y-2">
                  {localState.winners.map((w) => (
                    <div key={w.playerIdx} className="p-2.5 bg-[#F4F3EE] border-2 border-black flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-2 text-black font-condensed font-black text-lg">
                        <Crown size={18} className="text-[#FF5500]" /> #{w.rank} {w.name}
                      </span>
                      <button
                        onClick={() => setViewCardsModal({ open: true, playerIdx: w.playerIdx, onlinePlayerId: null })}
                        className="px-2 py-0.5 bg-white hover:bg-black hover:text-white text-black border-2 border-black font-mono text-[10px] uppercase shadow-brutal-sm cursor-pointer"
                      >
                        CARD
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 w-full pt-1">
                  <button
                    onClick={() => startLocalGame(mode === 'vs-computer')}
                    className="flex-1 py-2.5 bg-[#FF5500] hover:bg-black text-white border-2 border-black font-condensed font-black text-base uppercase transition-all shadow-brutal cursor-pointer"
                  >
                    PLAY AGAIN
                  </button>
                  <button
                    onClick={resetToSetup}
                    className="flex-1 py-2.5 bg-black hover:bg-white hover:text-black text-white border-2 border-black font-condensed font-black text-base uppercase transition-all shadow-brutal cursor-pointer"
                  >
                    NEW MATCH
                  </button>
                </div>
              </div>
            )}

            {/* D. ONLINE MULTIPLAYER CONTROLS */}
            {isOnline && onlineRoomData && (
              <div className="w-full flex flex-col gap-4">
                {/* Room Header & Share Bar */}
                <div className="w-full bg-white border-2 border-black shadow-brutal p-3 sm:p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-mono font-bold text-black/60 uppercase tracking-wider">ROOM CODE</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <h3 className="font-mono font-black text-xl text-black tracking-widest">{roomId}</h3>
                      <button 
                        onClick={copyRoomCode} 
                        className="p-1 border border-black bg-[#F4F3EE] hover:bg-black hover:text-white text-black transition cursor-pointer"
                        title="Copy Code"
                      >
                        {copiedCode ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                      <button 
                        onClick={copyRoomLink} 
                        className="p-1 border border-black bg-[#F4F3EE] hover:bg-black hover:text-white text-black transition cursor-pointer"
                        title="Copy Invite Link"
                      >
                        {copiedLink ? <Check size={14} className="text-green-600" /> : <Link size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-1 bg-black text-[#CCFF00] border border-black flex items-center gap-1">
                      <Users size={12} />
                      {Object.keys(onlineRoomData.players || {}).length}P
                    </span>
                    <button
                      onClick={leaveOnlineRoom}
                      className="p-1.5 border-2 border-black bg-white hover:bg-red-500 hover:text-white text-black transition cursor-pointer"
                      title="Leave Room"
                    >
                      <LogOut size={16} />
                    </button>
                  </div>
                </div>

                {/* Online Lobby View */}
                {onlineRoomData.status === 'lobby' && (
                  <div className="w-full bg-white border-2 border-black shadow-brutal p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b-2 border-black pb-1.5">
                      <span className="text-[10px] font-mono font-bold text-black uppercase">CONNECTED PLAYERS</span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-black text-[#CCFF00] font-mono font-bold">
                        {Object.keys(onlineRoomData.players || {}).length} JOINED
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                      {Object.values(onlineRoomData.players || {}).map((p) => {
                        const isMe = p.id === myPlayerId;
                        const isHost = p.id === onlineRoomData.hostId;
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between px-2.5 py-1.5 border border-black font-mono text-xs font-bold ${
                              isMe ? 'bg-[#CCFF00] text-black' : 'bg-[#F4F3EE] text-black'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              {isHost && <Crown size={14} className="text-[#FF5500]" title="Host" />}
                              <span>{p.name}</span>
                              {isMe && <span className="text-[9px] px-1 py-0.2 bg-black text-white font-bold">YOU</span>}
                            </div>
                            <span className="text-[9px] font-mono text-emerald-700 uppercase font-bold">READY</span>
                          </div>
                        );
                      })}
                    </div>

                    {myPlayerId === onlineRoomData.hostId ? (
                      <div className="flex flex-col gap-2 pt-1">
                        {Object.keys(onlineRoomData.players || {}).length < 2 ? (
                          <div className="p-2.5 bg-[#F4F3EE] border-2 border-black text-[10px] font-mono text-black flex items-center justify-center gap-2 font-bold">
                            <Users size={14} className="text-[#FF5500] animate-pulse" />
                            <span>WAITING FOR PLAYERS TO JOIN...</span>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => startOnlineGame(false)}
                              className="w-full py-2.5 bg-[#FF5500] hover:bg-black text-white border-2 border-black font-condensed font-black text-lg uppercase transition-all shadow-brutal cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Play size={18} fill="currentColor" /> START MATCH
                            </button>
                            <button
                              onClick={() => startOnlineGame(true)}
                              className="w-full py-2 bg-white hover:bg-black hover:text-white text-black font-mono font-bold text-xs uppercase border-2 border-black transition shadow-brutal-sm cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Shuffle size={13} /> TRADITIONAL SWAP & START
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-[#F4F3EE] border-2 border-black flex items-center justify-center gap-2 text-xs font-mono font-bold text-black animate-pulse">
                        <Loader2 size={16} className="animate-spin text-[#FF5500]" />
                        WAITING FOR HOST TO START...
                      </div>
                    )}
                  </div>
                )}

                {/* Online Playing View */}
                {onlineRoomData.status === 'playing' && (
                  <div className="w-full flex flex-col gap-3">
                    <div className={`w-full border-2 border-black shadow-brutal p-3 flex items-center justify-between ${
                      onlineRoomData.turnUserId === myPlayerId ? 'bg-[#FF5500] text-white' : 'bg-black text-white'
                    }`}>
                      <div>
                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 bg-white text-black">
                          ACTIVE TURN
                        </span>
                        <h3 className="font-condensed font-black text-2xl uppercase tracking-tight mt-1 leading-none">
                          {onlineRoomData.turnUserId === myPlayerId 
                            ? '⭐ YOUR TURN! CALL NUMBER' 
                            : `${onlineRoomData.players[onlineRoomData.turnUserId]?.name || 'PLAYER'}'S TURN`}
                        </h3>
                      </div>
                      <ArrowUpRight size={30} strokeWidth={3} className="text-white shrink-0" />
                    </div>

                    {/* Online Call Log */}
                    <div className="w-full bg-white border-2 border-black shadow-brutal p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between border-b-2 border-black pb-1.5">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <History size={13} className="text-[#FF5500]" /> CALL LOG ({onlineRoomData.calledNumbers?.length || 0})
                        </span>
                        <span className="text-[9px] font-mono font-bold text-black/50">SEQUENCE</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                        {(onlineRoomData.calledNumbers || []).map((n, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-black text-[#CCFF00] font-mono font-bold text-[10px] border border-black">
                            #{i + 1}: {n}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Online Standings */}
                    <div className="w-full bg-white border-2 border-black shadow-brutal p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between border-b-2 border-black pb-1.5">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Trophy size={13} className="text-[#FF5500]" /> ROOM STANDINGS
                        </span>
                        <span className="text-[9px] font-mono font-bold text-black/50">CARDS</span>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto pt-1">
                        {Object.values(onlineRoomData.players || {}).map((p) => {
                          const isMe = p.id === myPlayerId;
                          return (
                            <div key={p.id} className="flex items-center justify-between text-xs font-bold px-2 py-1.5 border border-black bg-[#F4F3EE]">
                              <span className="text-black flex items-center gap-1.5">
                                {p.rank && <Crown size={14} className="text-[#FF5500]" />}
                                {p.name} {isMe && '(YOU)'}
                              </span>
                              <span className={p.rank ? 'text-[#FF5500] font-black' : 'text-black/60 font-mono text-[10px]'}>
                                {p.rank ? `RANK #${p.rank}` : `${p.lines || 0}/${onlineRoomData.targetLines || 5} LINES`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Online Finished View */}
                {onlineRoomData.status === 'finished' && (
                  <div className="w-full bg-white border-2 border-black shadow-brutal p-4 flex flex-col gap-3 text-center items-center">
                    <div className="w-12 h-12 border-2 border-black bg-[#FF5500] text-white flex items-center justify-center shadow-brutal-sm">
                      <Trophy size={28} />
                    </div>
                    <div>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 bg-black text-[#CCFF00]">
                        ONLINE MATCH COMPLETE
                      </span>
                      <h2 className="font-condensed font-black text-3xl uppercase tracking-tight text-black mt-1">
                        ROOM RESULTS
                      </h2>
                    </div>

                    <div className="w-full space-y-1.5 max-h-36 overflow-y-auto">
                      {Object.values(onlineRoomData.players || {}).map((p) => (
                        <div key={p.id} className="p-2 border border-black bg-[#F4F3EE] flex items-center justify-between text-xs font-bold">
                          <span className="flex items-center gap-1.5">
                            {p.rank && <Crown size={14} className="text-[#FF5500]" />}
                            {p.name} {p.id === myPlayerId && '(YOU)'}
                          </span>
                          <span className={p.rank ? 'text-[#FF5500] font-black' : 'text-black/60 font-mono text-[10px]'}>
                            {p.rank ? `RANK #${p.rank}` : `${p.lines || 0}/${onlineRoomData.targetLines || 5} LINES`}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 w-full pt-1">
                      {myPlayerId === onlineRoomData.hostId ? (
                        <button
                          onClick={playAgainOnline}
                          className="w-full py-2.5 bg-[#FF5500] hover:bg-black text-white border-2 border-black font-condensed font-black text-base uppercase transition-all shadow-brutal cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <RotateCcw size={15} /> PLAY REMATCH
                        </button>
                      ) : (
                        <p className="text-xs font-mono text-[#FF5500] animate-pulse font-bold">
                          WAITING FOR HOST TO START REMATCH...
                        </p>
                      )}

                      <button
                        onClick={leaveOnlineRoom}
                        className="w-full py-2 bg-white hover:bg-black hover:text-white text-black border-2 border-black font-mono font-bold text-xs uppercase transition shadow-brutal-sm cursor-pointer"
                      >
                        LEAVE ROOM
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ------------------------------------------------------ */}
          {/* RIGHT PANE CONTAINER: ALWAYS-VISIBLE LIVE BINGO CARD   */}
          {/* ------------------------------------------------------ */}
          <div className="lg:col-span-7 bg-white border-2 border-black shadow-brutal p-4 sm:p-5 flex flex-col gap-4 w-full items-center">
            
            {/* Right Pane Header: Title & Auto-Shuffle Button */}
            <div className="w-full flex items-center justify-between border-b-2 border-black pb-2">
              <div className="flex items-center gap-2">
                <span className="font-condensed font-black text-xl uppercase tracking-wider text-black">
                  LIVE BINGO CARD
                </span>
                <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 bg-black text-[#CCFF00]">
                  {activeGridSize}×{activeGridSize}
                </span>
              </div>

              <button
                onClick={handleAutoShuffle}
                disabled={isGameActive && mode === 'vs-computer'}
                className="py-1 px-2.5 bg-white hover:bg-black hover:text-white text-black border-2 border-black font-condensed font-black text-xs uppercase transition shadow-brutal-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Shuffle card numbers"
              >
                <Shuffle size={13} /> AUTO-SHUFFLE
              </button>
            </div>

            {/* B-I-N-G-O Progress Blocks (Modular Cards) */}
            <div className="w-full flex flex-col gap-1 items-center">
              <div className="w-full flex items-center justify-between px-1">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-black/60">
                  B-I-N-G-O PROGRESS TRACKER
                </span>
                <span className="text-[9px] font-mono font-bold text-[#FF5500]">
                  {activeCompletedLines.length} OF {activeGridSize} LINES COMPLETED
                </span>
              </div>
              {renderBingoLetterHeader(activeCompletedLines.length, activeGridSize)}
            </div>

            {/* THE LIVE BINGO GRID */}
            <div className="w-full flex flex-col items-center relative">
              
              {/* Optional Device Handoff overlay in Pass & Play mode */}
              {mode === 'pass-and-play' && isGameActive && !isLocalUserTurn && (
                <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-[#CCFF00] p-6 text-center">
                  <Users size={40} className="animate-bounce" />
                  <p className="font-condensed font-black text-2xl uppercase tracking-wider">PASS DEVICE</p>
                  <p className="text-[10px] font-mono text-white/80">HAND OVER TO {playerNames[localState.currentTurnIdx].toUpperCase()}</p>
                </div>
              )}

              <div 
                className="grid gap-1.5 sm:gap-2 w-full aspect-square bg-[#F4F3EE] p-2 sm:p-3 border-2 border-black relative" 
                style={{ 
                  display: 'grid',
                  gridTemplateColumns: `repeat(${activeGridSize}, minmax(0, 1fr))` 
                }}
              >
                {renderLineStrikeThroughs(
                  activeCompletedLines,
                  activeGridSize,
                  '#000000'
                )}

                {activeBoard.map((num, cellIdx) => {
                  const isCalled = activeCalledNumbers.includes(num);

                  return (
                    <button
                      key={cellIdx}
                      disabled={isCalled || (isGameActive && !isUserTurnToCall)}
                      onClick={() => {
                        if (!isGameActive) {
                          showToast('Start a match on the left panel to call numbers!');
                          return;
                        }
                        if (isOnline) {
                          announceOnlineNumber(num);
                        } else {
                          announceNumberLocal(num);
                        }
                      }}
                      className={`relative w-full h-full border-2 border-black font-condensed font-black transition-all flex items-center justify-center text-lg sm:text-3xl ${
                        isCalled
                          ? 'bg-black text-[#CCFF00] shadow-none cursor-not-allowed'
                          : isGameActive
                            ? isUserTurnToCall 
                              ? 'bg-white text-black hover:bg-[#FAF9F5] hover:-translate-y-0.5 hover:shadow-brutal-sm cursor-pointer' 
                              : 'bg-white text-black/60 cursor-default'
                            : 'bg-white text-black hover:bg-[#FAF9F5] cursor-pointer'
                      }`}
                    >
                      <span className="flex items-center justify-center text-center w-full h-full leading-none">
                        {num}
                      </span>
                      {isCalled && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[#FF5500] text-3xl sm:text-5xl font-black leading-none select-none opacity-90">✕</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom 4-Column Telemetry Strip */}
            <div className="grid grid-cols-4 w-full bg-white border-2 border-black shadow-brutal divide-x-2 divide-black text-left">
              <div className="p-2 sm:p-2.5">
                <span className="block text-[8px] font-mono font-bold uppercase text-black/50 tracking-wider">GRID SPEC</span>
                <span className="font-condensed font-black text-xs sm:text-sm uppercase tracking-tight text-black">{activeGridSize} × {activeGridSize}</span>
              </div>
              <div className="p-2 sm:p-2.5">
                <span className="block text-[8px] font-mono font-bold uppercase text-black/50 tracking-wider">CALLS</span>
                <span className="font-condensed font-black text-xs sm:text-sm uppercase tracking-tight text-black">{activeCalledNumbers.length} NUMS</span>
              </div>
              <div className="p-2 sm:p-2.5">
                <span className="block text-[8px] font-mono font-bold uppercase text-black/50 tracking-wider">LINES</span>
                <span className="font-condensed font-black text-xs sm:text-sm uppercase tracking-tight text-[#FF5500]">
                  {activeCompletedLines.length} / {isOnline ? (onlineRoomData?.targetLines || targetLines) : targetLines}
                </span>
              </div>
              <div className="p-2 sm:p-2.5">
                <span className="block text-[8px] font-mono font-bold uppercase text-black/50 tracking-wider">STATUS</span>
                <span className="font-condensed font-black text-xs sm:text-sm uppercase tracking-tight text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {isGameActive ? (isUserTurnToCall ? 'YOUR MOVE' : 'WAITING') : 'READY'}
                </span>
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* MODAL: VIEW PLAYER REVEALED CARD */}
      {viewCardsModal.open && (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black shadow-brutal-lg max-w-md w-full p-5 flex flex-col items-center gap-4 relative">
            <button
              onClick={() => setViewCardsModal({ open: false, playerIdx: null, onlinePlayerId: null })}
              className="absolute top-3 right-3 p-1 text-black border-2 border-black bg-[#F4F3EE] hover:bg-black hover:text-white transition cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="text-center">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 bg-black text-[#CCFF00]">
                CARD INSPECTION
              </span>
              <h3 className="font-condensed font-black text-2xl uppercase tracking-tight text-black mt-1">
                {viewCardsModal.playerIdx !== null 
                  ? playerNames[viewCardsModal.playerIdx] 
                  : (onlineRoomData?.players[viewCardsModal.onlinePlayerId]?.name || 'PLAYER')}
              </h3>
            </div>

            {/* Local Player Card Reveal */}
            {viewCardsModal.playerIdx !== null && (
              <div 
                className="grid gap-1.5 w-full aspect-square bg-[#F4F3EE] p-2.5 border-2 border-black relative"
                style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
              >
                {renderLineStrikeThroughs(
                  localState.completedLines[viewCardsModal.playerIdx] || [],
                  gridSize,
                  '#000000'
                )}

                {(localState.boards[viewCardsModal.playerIdx] || []).map((num, idx) => {
                  const isCalled = localState.calledNumbers.includes(num);
                  return (
                    <div
                      key={idx}
                      className={`border-2 border-black font-condensed font-black flex items-center justify-center text-lg sm:text-2xl ${
                        isCalled ? 'bg-black text-[#CCFF00]' : 'bg-white text-black'
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
                className="grid gap-1.5 w-full aspect-square bg-[#F4F3EE] p-2.5 border-2 border-black relative"
                style={{ gridTemplateColumns: `repeat(${onlineRoomData.gridSize || 5}, minmax(0, 1fr))` }}
              >
                {renderLineStrikeThroughs(
                  calculateLines(
                    onlineRoomData.players[viewCardsModal.onlinePlayerId]?.board || [],
                    onlineRoomData.calledNumbers || [],
                    onlineRoomData.gridSize || 5
                  ),
                  onlineRoomData.gridSize || 5,
                  '#000000'
                )}

                {(onlineRoomData.players[viewCardsModal.onlinePlayerId]?.board || []).map((num, idx) => {
                  const isCalled = onlineRoomData.calledNumbers?.includes(num);
                  return (
                    <div
                      key={idx}
                      className={`border-2 border-black font-condensed font-black flex items-center justify-center text-lg sm:text-2xl ${
                        isCalled ? 'bg-black text-[#CCFF00]' : 'bg-white text-black'
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

      {/* FOOTER BAR */}
      <footer className="w-full max-w-6xl border-t-2 border-black pt-3 flex items-center justify-between text-[10px] font-mono text-black/60 z-10">
        <span className="font-bold uppercase">BINGO</span>
        <span className="flex items-center gap-1 font-bold">
          <Info size={12} /> {targetLines} LINES TO WIN
        </span>
      </footer>
    </div>
  );
}
