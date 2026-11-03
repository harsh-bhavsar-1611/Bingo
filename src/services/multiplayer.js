import PeerJS from 'peerjs';

// Resolve Peer constructor safely across different ESM/CJS bundler formats
const Peer = PeerJS?.Peer || PeerJS?.default || PeerJS;

// PeerJS signaling room prefix to avoid ID collisions on public PeerServer
const PEER_PREFIX = 'bingo26-';

// Helper: Get or create persistent player ID for this browser tab/session
export const getLocalPlayerId = () => {
  let id = sessionStorage.getItem('bingo_player_id');
  if (!id) {
    id = 'p_' + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem('bingo_player_id', id);
  }
  return id;
};

// Generate random grid numbers for size x size
export const generateRandomGrid = (size) => {
  const total = size * size;
  const nums = Array.from({ length: total }, (_, i) => i + 1);
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums;
};

// Winning lines generator
export const generateWinningLines = (size) => {
  const lines = [];
  // Rows
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) row.push(r * size + c);
    lines.push({ type: 'row', index: r, cells: row });
  }
  // Columns
  for (let c = 0; c < size; c++) {
    const col = [];
    for (let r = 0; r < size; r++) col.push(r * size + c);
    lines.push({ type: 'col', index: c, cells: col });
  }
  // Diagonals
  const diag1 = [];
  for (let i = 0; i < size; i++) diag1.push(i * size + i);
  lines.push({ type: 'diag1', index: 0, cells: diag1 });

  const diag2 = [];
  for (let i = 0; i < size; i++) diag2.push(i * size + (size - 1 - i));
  lines.push({ type: 'diag2', index: 1, cells: diag2 });

  return lines;
};

// Calculate completed lines
export const calculateLines = (board, calledNumbers, size) => {
  if (!board || board.length !== size * size) return [];
  const calledSet = new Set(calledNumbers || []);
  const winningLines = generateWinningLines(size);
  return winningLines.filter((line) =>
    line.cells.every((cellIdx) => calledSet.has(board[cellIdx]))
  );
};

export class OnlineManager {
  constructor() {
    this.peer = null;
    this.broadcastChannel = null;
    this.isHost = false;
    this.myPlayerId = getLocalPlayerId();
    this.roomCode = null;
    this.connections = new Map(); // peerId -> connection (for Host)
    this.hostConnection = null; // connection to Host (for Guest)
    this.roomData = null;
    this.seenMsgIds = new Set();
    this.joinTimeout = null;

    // Callbacks
    this.onStateChange = null;
    this.onEvent = null;
    this.onStatusChange = null;
  }

  _newMsgId() {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  _hasSeen(id) {
    if (!id) return false;
    if (this.seenMsgIds.has(id)) return true;
    this.seenMsgIds.add(id);
    if (this.seenMsgIds.size > 200) {
      // Keep memory low
      const arr = Array.from(this.seenMsgIds);
      this.seenMsgIds = new Set(arr.slice(arr.length - 100));
    }
    return false;
  }

  // --- HOST: Create a Room ---
  async createRoom({ code, hostName, gridSize, board, onStateChange, onEvent, onStatusChange }) {
    this.destroy();

    this.isHost = true;
    this.roomCode = code.toUpperCase();
    this.onStateChange = onStateChange;
    this.onEvent = onEvent;
    this.onStatusChange = onStatusChange;

    this.onStatusChange?.('connecting');

    const hostPeerId = `${PEER_PREFIX}host-${this.roomCode.toLowerCase()}`;

    // Initialize initial room state
    this.roomData = {
      code: this.roomCode,
      hostId: this.myPlayerId,
      gridSize,
      targetLines: gridSize,
      status: 'lobby', // 'lobby' | 'playing' | 'finished'
      calledNumbers: [],
      turnUserId: this.myPlayerId,
      players: {
        [this.myPlayerId]: {
          id: this.myPlayerId,
          name: hostName || 'Host',
          board: board || generateRandomGrid(gridSize),
          lines: 0,
          rank: null,
          isHost: true,
          connected: true
        }
      },
      winners: [],
      created: Date.now(),
      lastCall: null,
      lastWinner: null
    };

    // Setup native BroadcastChannel for zero-latency local testing across browser tabs
    try {
      this.broadcastChannel = new BroadcastChannel(`bingo_bc_${this.roomCode}`);
      this.broadcastChannel.onmessage = (e) => this._handleIncomingMessage(e.data, 'broadcast');
    } catch (err) {
      console.debug('BroadcastChannel not available:', err);
    }

    return new Promise((resolve, reject) => {
      let isResolved = false;

      try {
        this.peer = new Peer(hostPeerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', () => {
          this.onStatusChange?.('connected');
          const freshData = JSON.parse(JSON.stringify(this.roomData));
          this.roomData = freshData;
          this.onStateChange?.(freshData);
          if (!isResolved) {
            isResolved = true;
            resolve(freshData);
          }
        });

        this.peer.on('connection', (conn) => {
          const clientPeerId = conn.peer;
          this.connections.set(clientPeerId, conn);

          conn.on('data', (data) => this._handleIncomingMessage(data, conn));

          conn.on('close', () => {
            this.connections.delete(clientPeerId);
            this._handlePeerDisconnect(clientPeerId);
          });

          conn.on('error', (err) => {
            console.warn('Host conn error:', err);
            this.connections.delete(clientPeerId);
          });
        });

        this.peer.on('error', (err) => {
          console.error('Peer error on host:', err);
          if (err.type === 'unavailable-id') {
            const errorMsg = `Room code "${this.roomCode}" is currently active. Please try a different room code.`;
            this.onEvent?.('ERROR', errorMsg);
            if (!isResolved) {
              isResolved = true;
              reject(new Error(errorMsg));
            }
          } else {
            this.onEvent?.('ERROR', err.message || 'Connection error');
          }
        });

      } catch (err) {
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      }
    });
  }

  // --- GUEST: Join an Existing Room ---
  async joinRoom({ code, playerName, onStateChange, onEvent, onStatusChange }) {
    this.destroy();

    this.isHost = false;
    this.roomCode = code.toUpperCase();
    this.onStateChange = onStateChange;
    this.onEvent = onEvent;
    this.onStatusChange = onStatusChange;

    this.onStatusChange?.('connecting');

    const hostPeerId = `${PEER_PREFIX}host-${this.roomCode.toLowerCase()}`;
    const myClientPeerId = `${PEER_PREFIX}client-${this.roomCode.toLowerCase()}-${this.myPlayerId}`;

    // Setup native BroadcastChannel for local tab testing
    try {
      this.broadcastChannel = new BroadcastChannel(`bingo_bc_${this.roomCode}`);
      this.broadcastChannel.onmessage = (e) => this._handleIncomingMessage(e.data, 'broadcast');
    } catch (err) {
      console.debug('BroadcastChannel not available:', err);
    }

    return new Promise((resolve, reject) => {
      let isResolved = false;

      // Timeout if room doesn't respond in 10 seconds
      this.joinTimeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          const msg = 'Room not found or host is offline. Please verify the room code.';
          this.onStatusChange?.('error');
          this.onEvent?.('ERROR', msg);
          this.destroy();
          reject(new Error(msg));
        }
      }, 10000);

      const tryResolve = (data) => {
        if (!isResolved) {
          isResolved = true;
          if (this.joinTimeout) clearTimeout(this.joinTimeout);
          this.onStatusChange?.('connected');
          resolve(data);
        }
      };

      try {
        this.peer = new Peer(myClientPeerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', () => {
          this._connectToHost(hostPeerId, playerName, tryResolve);
        });

        this.peer.on('error', (err) => {
          console.warn('Guest peer warning:', err);
          if (err.type === 'peer-unavailable') {
            // Host is not online or wrong code
            if (!isResolved) {
              isResolved = true;
              if (this.joinTimeout) clearTimeout(this.joinTimeout);
              const msg = `Room "${this.roomCode}" was not found. Please check the code.`;
              this.onEvent?.('ERROR', msg);
              this.destroy();
              reject(new Error(msg));
            }
          }
        });

        // Also broadcast local JOIN via BroadcastChannel immediately
        this._sendBroadcast({
          type: 'JOIN_REQUEST',
          id: this._newMsgId(),
          playerId: this.myPlayerId,
          name: playerName || 'Player'
        });

      } catch (err) {
        if (!isResolved) {
          isResolved = true;
          if (this.joinTimeout) clearTimeout(this.joinTimeout);
          reject(err);
        }
      }
    });
  }

  _connectToHost(hostPeerId, playerName, onJoined) {
    try {
      const conn = this.peer.connect(hostPeerId, { reliable: true });
      this.hostConnection = conn;

      conn.on('open', () => {
        conn.send({
          type: 'JOIN_REQUEST',
          id: this._newMsgId(),
          playerId: this.myPlayerId,
          name: playerName || 'Player'
        });
      });

      conn.on('data', (data) => {
        this._handleIncomingMessage(data, conn);
        if (data?.type === 'ROOM_STATE' || data?.type === 'JOIN_ACCEPTED') {
          onJoined?.(this.roomData);
        }
      });

      conn.on('close', () => {
        this.onEvent?.('HOST_LEFT', 'Host has closed or left the room.');
        this.destroy();
      });

      conn.on('error', (err) => {
        console.warn('Guest conn error:', err);
      });

    } catch (err) {
      console.error('Error connecting to host:', err);
    }
  }

  // Handle incoming message (can arrive via PeerJS DataConnection or BroadcastChannel)
  _handleIncomingMessage(msg, sender) {
    if (!msg || typeof msg !== 'object') return;
    if (this._hasSeen(msg.id)) return; // Deduplicate

    // --- HOST RECEIVES MESSAGES ---
    if (this.isHost) {
      switch (msg.type) {
        case 'JOIN_REQUEST': {
          this._handleJoinRequest(msg, sender);
          break;
        }
        case 'CALL_NUMBER': {
          this.announceNumber(msg.number, msg.playerId);
          break;
        }
        case 'UPDATE_BOARD': {
          if (this.roomData?.players[msg.playerId]) {
            this.roomData.players[msg.playerId].board = msg.board;
            this._broadcastState();
          }
          break;
        }
        case 'LEAVE_ROOM': {
          this._handlePeerDisconnect(msg.playerId);
          break;
        }
        default:
          break;
      }
      return;
    }

    // --- GUEST RECEIVES MESSAGES ---
    switch (msg.type) {
      case 'ROOM_STATE': {
        const freshData = JSON.parse(JSON.stringify(msg.roomData));
        this.roomData = freshData;
        this.onStateChange?.(freshData);

        if (msg.event) {
          this.onEvent?.(msg.event.type, msg.event.data);
        }
        break;
      }
      case 'JOIN_ACCEPTED': {
        const freshData = JSON.parse(JSON.stringify(msg.roomData));
        this.roomData = freshData;
        this.onStatusChange?.('connected');
        this.onStateChange?.(freshData);
        break;
      }
      case 'JOIN_REJECTED': {
        this.onEvent?.('ERROR', msg.reason || 'Could not join room');
        this.destroy();
        break;
      }
      case 'HOST_LEFT': {
        this.onEvent?.('HOST_LEFT', 'Host has left the room.');
        this.destroy();
        break;
      }
      default:
        break;
    }
  }

  _handleJoinRequest(msg, sender) {
    if (!this.roomData) return;

    if (this.roomData.status !== 'lobby') {
      const rejectMsg = {
        type: 'JOIN_REJECTED',
        id: this._newMsgId(),
        reason: 'Match is already in progress!'
      };
      this._sendTo(sender, rejectMsg);
      return;
    }

    const currentCount = Object.keys(this.roomData.players).length;
    if (currentCount >= 8) {
      const rejectMsg = {
        type: 'JOIN_REJECTED',
        id: this._newMsgId(),
        reason: 'Room has reached maximum capacity (8 players).'
      };
      this._sendTo(sender, rejectMsg);
      return;
    }

    // Add player to room
    const playerId = msg.playerId;
    const name = msg.name || `Player ${currentCount + 1}`;
    const board = generateRandomGrid(this.roomData.gridSize || 5);
    const peerId = typeof sender === 'object' && sender?.peer ? sender.peer : null;

    this.roomData.players[playerId] = {
      id: playerId,
      name,
      board,
      lines: 0,
      rank: null,
      isHost: false,
      connected: true,
      peerId
    };

    const acceptMsg = {
      type: 'JOIN_ACCEPTED',
      id: this._newMsgId(),
      roomData: JSON.parse(JSON.stringify(this.roomData))
    };
    this._sendTo(sender, acceptMsg);

    this._broadcastState({
      type: 'PLAYER_JOINED',
      data: `${name} joined the room!`
    });
  }

  _handlePeerDisconnect(playerIdOrPeer) {
    if (!this.isHost || !this.roomData) return;

    // Find player ID
    let leftPlayerId = null;
    let leftPlayerName = '';

    for (const [pId, pData] of Object.entries(this.roomData.players)) {
      if (
        pId === playerIdOrPeer ||
        pData.id === playerIdOrPeer ||
        pData.peerId === playerIdOrPeer ||
        (typeof playerIdOrPeer === 'string' && playerIdOrPeer.includes(pId))
      ) {
        leftPlayerId = pId;
        leftPlayerName = pData.name;
        break;
      }
    }

    if (!leftPlayerId || leftPlayerId === this.myPlayerId) return;

    // Remove or mark offline
    if (this.roomData.status === 'lobby') {
      delete this.roomData.players[leftPlayerId];
    } else {
      this.roomData.players[leftPlayerId].connected = false;
      
      // If only 1 player remains connected during active game, award victory
      const connectedPlayers = Object.values(this.roomData.players).filter((p) => p.connected);
      if (connectedPlayers.length <= 1 && (this.roomData.winners || []).length === 0) {
        const remaining = connectedPlayers[0];
        if (remaining) {
          remaining.rank = 1;
          this.roomData.winners = [
            {
              id: remaining.id,
              name: remaining.name,
              rank: 1
            }
          ];
          this.roomData.status = 'finished';
          this.roomData.turnUserId = null;
        }
      } else if (this.roomData.turnUserId === leftPlayerId) {
        this._advanceTurn();
      }
    }

    this._broadcastState({
      type: 'PLAYER_LEFT',
      data: `${leftPlayerName || 'A player'} left the game.`
    });
  }

  _advanceTurn() {
    const playerIds = Object.keys(this.roomData.players);
    const activeWinners = this.roomData.winners || [];
    let currentIdx = playerIds.indexOf(this.roomData.turnUserId);
    if (currentIdx === -1) currentIdx = 0;

    let nextTurnId = playerIds[(currentIdx + 1) % playerIds.length];
    let count = 0;

    while (
      (activeWinners.some((w) => w.id === nextTurnId) || !this.roomData.players[nextTurnId]?.connected) &&
      count < playerIds.length
    ) {
      currentIdx = (currentIdx + 1) % playerIds.length;
      nextTurnId = playerIds[currentIdx];
      count++;
    }

    this.roomData.turnUserId = nextTurnId;
  }

  // --- ACTIONS ---

  // Host starts the game
  startGame(swapPapers = false) {
    if (!this.isHost || !this.roomData) return;

    const playerIds = Object.keys(this.roomData.players);
    if (playerIds.length < 2) {
      throw new Error('At least 2 players are required to start!');
    }

    // Optional Fair Play swap
    if (swapPapers) {
      const swappedPlayers = { ...this.roomData.players };
      const boards = playerIds.map((id) => swappedPlayers[id].board);

      playerIds.forEach((id, idx) => {
        const nextIdx = (idx + 1) % playerIds.length;
        swappedPlayers[id].board = boards[nextIdx];
      });
      this.roomData.players = swappedPlayers;
    }

    this.roomData.status = 'playing';
    this.roomData.turnUserId = playerIds[0];
    this.roomData.calledNumbers = [];
    this.roomData.winners = [];
    this.roomData.lastCall = null;
    this.roomData.lastWinner = null;

    this._broadcastState({
      type: 'GAME_STARTED',
      data: 'The Bingo match has begun!'
    });
  }

  // Announce a number (can be called by Host directly or via action from Guest)
  announceNumber(num, callerPlayerId = null) {
    const callerId = callerPlayerId || this.myPlayerId;

    if (!this.isHost) {
      // Guest sends to Host
      const msg = {
        type: 'CALL_NUMBER',
        id: this._newMsgId(),
        playerId: this.myPlayerId,
        number: num
      };
      this._sendToHost(msg);
      return;
    }

    // Host authoritative logic
    if (!this.roomData || this.roomData.status !== 'playing') return;
    if (this.roomData.turnUserId !== callerId) return;
    if (this.roomData.calledNumbers.includes(num)) return;

    const nextCalled = [...this.roomData.calledNumbers, num];
    this.roomData.calledNumbers = nextCalled;

    const callerName = this.roomData.players[callerId]?.name || 'Player';
    this.roomData.lastCall = {
      number: num,
      callerId,
      callerName,
      timestamp: Date.now()
    };

    const playerIds = Object.keys(this.roomData.players);
    const updatedPlayers = { ...this.roomData.players };
    const newlyFinished = [];
    const updatedWinners = [...(this.roomData.winners || [])];

    const currentGridSize = this.roomData.gridSize || 5;
    const reqLines = this.roomData.targetLines || currentGridSize;

    playerIds.forEach((pId) => {
      const pBoard = updatedPlayers[pId].board;
      const lines = calculateLines(pBoard, nextCalled, currentGridSize);
      updatedPlayers[pId].lines = lines.length;

      const alreadyRanked = updatedWinners.some((w) => w.id === pId);
      if (lines.length >= reqLines && !alreadyRanked) {
        newlyFinished.push(pId);
      }
    });

    let newWinnerEvent = null;
    if (newlyFinished.length > 0) {
      newlyFinished.forEach((pId) => {
        const rank = updatedWinners.length + 1;
        updatedPlayers[pId].rank = rank;
        const winnerObj = {
          id: pId,
          name: updatedPlayers[pId].name,
          rank
        };
        updatedWinners.push(winnerObj);
        newWinnerEvent = winnerObj;
      });
    }

    this.roomData.players = updatedPlayers;
    this.roomData.winners = updatedWinners;
    if (newWinnerEvent) {
      this.roomData.lastWinner = newWinnerEvent;
    }

    // WIN CONDITION: In Bingo, the match concludes immediately when any player(s) achieve BINGO!
    if (updatedWinners.length > 0) {
      this.roomData.status = 'finished';
      this.roomData.turnUserId = null; // Lock turn so no more numbers can be called
    } else {
      // Game continues: advance turn to next player
      this._advanceTurn();
    }

    const eventPayload = newWinnerEvent
      ? { type: 'BINGO_ANNOUNCED', data: newWinnerEvent }
      : { type: 'NUMBER_CALLED', data: this.roomData.lastCall };

    this._broadcastState(eventPayload);
  }

  // Shuffle player's board (allowed in lobby)
  shuffleBoard(newBoard) {
    if (!this.roomData) return;

    if (this.isHost) {
      if (this.roomData.players[this.myPlayerId]) {
        this.roomData.players[this.myPlayerId].board = newBoard;
        this._broadcastState();
      }
    } else {
      const msg = {
        type: 'UPDATE_BOARD',
        id: this._newMsgId(),
        playerId: this.myPlayerId,
        board: newBoard
      };
      this._sendToHost(msg);
    }
  }

  // Rematch / Play Again
  playAgain() {
    if (!this.isHost || !this.roomData) return;

    const size = this.roomData.gridSize || 5;
    const playerIds = Object.keys(this.roomData.players);

    playerIds.forEach((pId) => {
      this.roomData.players[pId].board = generateRandomGrid(size);
      this.roomData.players[pId].lines = 0;
      this.roomData.players[pId].rank = null;
    });

    this.roomData.calledNumbers = [];
    this.roomData.winners = [];
    this.roomData.status = 'playing';
    this.roomData.turnUserId = playerIds[0];
    this.roomData.lastCall = null;
    this.roomData.lastWinner = null;

    this._broadcastState({
      type: 'REMATCH_STARTED',
      data: 'Rematch started with new cards!'
    });
  }

  // Leave room
  leaveRoom() {
    if (this.isHost) {
      this._broadcast({
        type: 'HOST_LEFT',
        id: this._newMsgId()
      });
    } else {
      this._sendToHost({
        type: 'LEAVE_ROOM',
        id: this._newMsgId(),
        playerId: this.myPlayerId
      });
    }
    this.destroy();
  }

  // --- INTERNAL BROADCAST & SEND HELPERS ---

  _broadcastState(event = null) {
    if (!this.roomData) return;

    // Deep clone so React always receives a completely new reference for state identity checks
    const freshData = JSON.parse(JSON.stringify(this.roomData));
    this.roomData = freshData;

    const msg = {
      type: 'ROOM_STATE',
      id: this._newMsgId(),
      roomData: freshData,
      event
    };

    // 1. Notify Host locally with fresh object reference
    this.onStateChange?.(freshData);

    // 2. Trigger event locally on Host
    if (event) {
      this.onEvent?.(event.type, event.data);
    }

    // 3. Broadcast to all remote clients
    this._broadcast(msg);
  }

  _broadcast(msg) {
    // Send to all connected WebRTC clients
    this.connections.forEach((conn) => {
      try {
        if (conn.open) conn.send(msg);
      } catch (err) {
        console.warn('Broadcast send error:', err);
      }
    });

    // Also mirror to local BroadcastChannel
    this._sendBroadcast(msg);
  }

  _sendTo(recipient, msg) {
    if (!recipient) return;
    if (recipient === 'broadcast') {
      this._sendBroadcast(msg);
    } else if (typeof recipient.send === 'function' && recipient.open) {
      try {
        recipient.send(msg);
      } catch (err) {
        console.warn('Send error:', err);
      }
    }
  }

  _sendToHost(msg) {
    if (this.hostConnection && this.hostConnection.open) {
      try {
        this.hostConnection.send(msg);
      } catch (err) {
        console.warn('Send to host error:', err);
      }
    }
    // Also send via local BroadcastChannel
    this._sendBroadcast(msg);
  }

  _sendBroadcast(msg) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.debug('Broadcast postMessage error:', err);
      }
    }
  }

  // Cleanup
  destroy() {
    if (this.joinTimeout) {
      clearTimeout(this.joinTimeout);
      this.joinTimeout = null;
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch (err) {
        console.debug('Error closing channel:', err);
      }
      this.broadcastChannel = null;
    }

    this.connections.forEach((conn) => {
      try {
        conn.close();
      } catch (err) {
        console.debug('Error closing conn:', err);
      }
    });
    this.connections.clear();

    if (this.hostConnection) {
      try {
        this.hostConnection.close();
      } catch (err) {
        console.debug('Error closing host conn:', err);
      }
      this.hostConnection = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (err) {
        console.debug('Error destroying peer:', err);
      }
      this.peer = null;
    }

    this.roomData = null;
    this.isHost = false;
    this.roomCode = null;
  }
}

// Global singleton instance
export const onlineManager = new OnlineManager();
