// ============================================================
//  Mineflayer AFK Bot — Improved & Hardened
// ============================================================

'use strict';

// ── Dependencies ─────────────────────────────────────────────
const mineflayer   = require('mineflayer');
const readline     = require('readline');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const autoeat      = require('mineflayer-auto-eat');

// ── Configuration ────────────────────────────────────────────
const config = {
  host   : '',
  port   : 25565),
  version:,
  username:,
  password:,
  auth   : 'offline'
};

// ── State ────────────────────────────────────────────────────
let bot              = null;
let afkInterval      = null;
let lastPosition     = null;

const POS_THRESHOLD       = 1;          
const AFK_ACTIONS         = Object.freeze(['jump', 'look', 'move', 'swing']);
const RECONNECT_BASE_MS   = 5_000;      //  base delay (was full 10 s per attempt)
const MAX_RECONNECT_DELAY = 120_000;    // cap exponential back-off at 2 min
const MAX_RECONNECT       = 100;
let reconnectAttempts     = 0;

// ── Terminal Interface ───────────────────────────────────────
const rl = readline.createInterface({
  input : process.stdin,
  output: process.stdout,
  prompt: 'BOT>> '
});

// ── Logging helpers ──────────────────────────────────────────
const log  = (...a) => console.log (`[${ts()}]`, ...a);
const warn = (...a) => console.warn (`[${ts()}] ⚠`, ...a);
const err  = (...a) => console.error(`[${ts()}] ✖`, ...a);
const ts   = ()     => new Date().toLocaleTimeString();

// ============================================================
//  Bot creation
// ============================================================
function createBot() {
  bot = mineflayer.createBot({
    host    : config.host,
    port    : config.port,
    version : config.version,
    username: config.username,
    auth    : config.auth.
  });

  // ── Plugin Loading ───────────────────────────────────────
  bot.loadPlugin(pathfinder);

  const eatPlugin = autoeat.plugin ?? autoeat;
  if (typeof eatPlugin === 'function') {
    bot.loadPlugin(eatPlugin);
  } else {
    warn('mineflayer-auto-eat could not be loaded — skipping.');
  }

  setupBotEvents();
}

// ============================================================
//  Event wiring
// ============================================================
function setupBotEvents() {

  // ── Spawn ────────────────────────────────────────────────
  bot.once('spawn', () => {
    reconnectAttempts = 0;

    const mcData = require('minecraft-data')(bot.version);
    const moves  = new Movements(bot, mcData);
    moves.allowParkour   = true;
    moves.allowSprinting = true;
    moves.canOpenDoors   = true;
    bot.pathfinder.setMovements(moves);

    if (bot.autoEat) {
      bot.autoEat.options = {
        priority   : 'foodValue',
        startAt    : 16,         
        bannedFood : ['rotten_flesh', 'spider_eye', 'poisonous_potato']
      };
      bot.autoEat.enable();    
    }

    log('Spawned — AntiAFK active.');
    startAntiAFK();
    rl.prompt();
  });

  // ── Auto-Auth ────────────────────────────────────────────
  // listen on 'message' (raw IChatComponent) instead of the deprecated
  //      'messagestr' which is stripped in newer mineflayer versions.
  bot.on('message', (jsonMsg) => {
    const text = jsonMsg.toString().toLowerCase();
    if (text.includes('register')) {
      bot.chat(`/register ${config.password} ${config.password}`);
    } else if (text.includes('login')) {
      bot.chat(`/login ${config.password}`);
    }
  });

  // ── Disconnect / Error ───────────────────────────────────
  bot.on('end',    (reason)  => { log(`Disconnected: ${reason ?? 'unknown'}`);  scheduleReconnect(); });
  bot.on('kicked', (reason)  => { warn(`Kicked: ${reason}`);                    scheduleReconnect(); });

  // distinguish fatal vs. transient errors; don't reconnect on auth failures
  bot.on('error',  (e) => {
    err(`Network error: ${e.message}`);
    if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(e.code)) {
      scheduleReconnect();
    }
  });

  // ── Chat mirror ──────────────────────────────────────────
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    log(`[CHAT] ${username}: ${message}`);
    rl.prompt();
  });

  // ── Entity tracking ──────────────────────────────────────
  bot.on('entityHurt', (entity) => {
    if (entity === bot.entity) return;           
    if (entity.type === 'player') {
      bot.lookAt(entity.position.offset(0, 1.6, 0), true);
    }
  });

  let lookThrottleTimer = null;
  bot.on('physicsTick', () => {
    if (lookThrottleTimer)                       return;
    if (bot.pathfinder?.isMoving())              return;

    lookThrottleTimer = setTimeout(() => { lookThrottleTimer = null; }, 500);

    const target = bot.nearestEntity(
      e => e.type === 'player' && e.username !== bot.username
    );
    if (target && bot.entity.position.distanceTo(target.position) < 16) {
      bot.lookAt(target.position.offset(0, 1.6, 0), true);
    }
  });
}

// ============================================================
//  Reconnect logic — exponential back-off with jitter
// ============================================================
function scheduleReconnect() {
  // FIX: variable was misspelled as maxReConnectAttempts in original
  if (reconnectAttempts >= MAX_RECONNECT) {
    err('Max reconnect attempts reached. Exiting.');
    process.exit(1);
  }

  if (afkInterval) { clearInterval(afkInterval); afkInterval = null; }

  // Exponential back-off: 5s, 10s, 20s … capped at 2 min, plus ±20 % jitter
  const base  = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY);
  const jitter = base * 0.2 * (Math.random() - 0.5);
  const delay  = Math.round(base + jitter);

  reconnectAttempts++;
  log(`Reconnecting in ${(delay / 1000).toFixed(1)} s (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);
  setTimeout(createBot, delay);
}

// ============================================================
//  Anti-AFK
// ============================================================
function startAntiAFK() {
  if (afkInterval) clearInterval(afkInterval);
  log('Anti-AFK started.');
  afkInterval = setInterval(() => {
    performRandomAction();
    checkIfStuck();
  }, 10_000);
}

function performRandomAction() {
  if (bot.pathfinder?.isMoving()) return;

  const action = AFK_ACTIONS[Math.floor(Math.random() * AFK_ACTIONS.length)];
  try {
    switch (action) {
      case 'jump':
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
        break;

      case 'look':
        bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI);
        break;

      case 'move': {
        const dirs = ['forward', 'back', 'left', 'right'];
        const dir  = dirs[Math.floor(Math.random() * dirs.length)];
        bot.setControlState(dir, true);
        setTimeout(() => bot.setControlState(dir, false), 1_000);
        break;
      }

      case 'swing':
        bot.swingArm();
        break;
    }
  } catch (e) {
    warn('performRandomAction error:', e.message);  
  }
}

function checkIfStuck() {
  if (!bot?.entity) return;
  const pos = bot.entity.position;

  if (lastPosition) {
    const moved = pos.distanceTo(lastPosition);
    if (moved < POS_THRESHOLD && !bot.pathfinder?.isMoving()) {
      const rx = pos.x + Math.random() * 6 - 3;
      const rz = pos.z + Math.random() * 6 - 3;
      log('Stuck detected — nudging to a random nearby position.');
      bot.pathfinder.setGoal(new goals.GoalNear(rx, pos.y, rz, 1));
    }
  }
  lastPosition = pos.clone();
}

// ============================================================
//  CLI Commands
// ============================================================
const commands = {
  help: () => {
    log(
      'Available commands:\n' +
      '  help                — show this message\n' +
      '  stop                — disconnect and exit\n' +
      '  say <message>       — send chat message\n' +
      '  move <x> <y> <z>   — navigate to coordinates\n' +
      '  follow <player>     — follow a player\n' +
      '  unfollow            — cancel follow / movement\n' +
      '  list                — list online players\n' +
      '  afk                 — show AFK status\n' +
      '  pos                 — print bot position'
    );
    rl.prompt();
  },

  stop: () => {
    if (afkInterval) clearInterval(afkInterval);
    bot?.pathfinder?.setGoal(null);
    bot?.end();
    rl.close();
    process.exit(0);
  },

  say: (args) => {
    if (!args.length) return warn('Usage: say <message>');
    bot.chat(args.join(' '));
    rl.prompt();
  },

  move: (args) => {
    if (args.length !== 3) return warn('Usage: move <x> <y> <z>');
    const [x, y, z] = args.map(Number);
    if ([x, y, z].some(isNaN)) return warn('Coordinates must be numbers.');   
    bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z));
    log(`Navigating to (${x}, ${y}, ${z})`);
    rl.prompt();
  },

  follow: (args) => {
    if (!args[0]) return warn('Usage: follow <player>');
    const player = bot.players[args[0]];
    if (!player?.entity) return warn(`Player "${args[0]}" not found or not in range.`);
    bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
    log(`Following ${args[0]}`);
    rl.prompt();
  },

  unfollow: () => {
    bot.pathfinder.setGoal(null);
    log('Stopped following.');
    rl.prompt();
  },

  list: () => {
    const players = Object.keys(bot.players);
    log(`Online (${players.length}): ${players.join(', ') || 'none'}`);
    rl.prompt();
  },

  afk: () => {
    log(`Anti-AFK: ${afkInterval ? '✔ active' : '✘ inactive'}`);
    rl.prompt();
  },

  pos: () => {
    const p = bot.entity?.position;
    if (!p) return warn('Position unavailable.');
    log(`Position: x=${p.x.toFixed(2)}  y=${p.y.toFixed(2)}  z=${p.z.toFixed(2)}`);
    rl.prompt();
  }
};

// ── REPL loop ────────────────────────────────────────────────
rl.on('line', (input) => {
  if (!bot?.entity) return warn('Bot is not ready yet.');

  const [command, ...args] = input.trim().split(/\s+/);
  if (!command) { rl.prompt(); return; }      

  const handler = commands[command.toLowerCase()];
  if (handler) {
    handler(args);
  } else {
    warn(`Unknown command: "${command}". Type "help" for a list.`);
  }
  rl.prompt();
});

rl.on('close', () => process.exit(0));         

// ── Unhandled rejection guard ────────────────────────────────
process.on('unhandledRejection', (reason) => {
  err('Unhandled promise rejection:', reason);
});

// ── Start ────────────────────────────────────────────────────
createBot();
