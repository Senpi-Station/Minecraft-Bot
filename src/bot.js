#!/usr/bin/env node

import mineflayer from 'mineflayer'
import readline from 'readline'
import { config, term, C } from './config.js'
import { setupAuth } from './auth.js'
import { setupAutoEat } from './auto-eat.js'
import { setupCommands } from './commands.js'
import { setupEffects } from './effects.js'

const SPAWN_TIMEOUT = 60000

const state = {
  authMode: 'auto',
  authed: false,
  attempts: 0,
}

let botInstance = null
let cmds = null
let spawnTimer = null
let inputQueue = []
let reconnectTimer = null

function createBot() {
  state.authed = false

  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: config.auth,
    version: config.version || false,
    viewDistance: 6,
    logErrors: false,
    autoRespawn: true,
  })

  bot.on('login', () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    botInstance = bot
    state.attempts = 0
    term.sys(`Connected as ${config.username}`)
    if (bot.game) {
      term.sys(`Server: ${bot.game.serverBrand}, ${bot.game.levelType}, ${bot.game.gameMode}, ${bot.version}`)
    }

    const eatFn = setupAutoEat(bot, state)
    setupAuth(bot, state)
    const effects = setupEffects(bot, state)
    const commands = setupCommands(bot, state, eatFn, effects)
    cmds = commands
    state.cmds = commands
    state.effects = effects
  })

  bot.on('spawn', () => {
    if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null }
    term.auth('Spawned')
    bot.chat('/attribute @s minecraft:scale base set 0.9999999')
    flushQueue()
    setTimeout(() => {
      if (state.authed && state.effects) state.effects.start()
    }, 2000)
  })

  bot.on('error', (err) => {
    if (err.message !== 'read ECONNRESET' && err.message !== 'write ECONNRESET') {
      term.err(err.message)
    }
  })

  bot.on('end', (reason) => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (botInstance === bot) botInstance = null
    if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null }
    const msg = reason && reason !== 'socketClosed' ? `: ${reason}` : ''
    term.err(`Disconnected${msg}`)
    scheduleReconnect()
  })

  bot.on('kicked', () => {
    if (botInstance === bot) botInstance = null
  })

  bot.on('playerJoined', (player) => {
    if (player.username !== config.username) term.sys(`${player.username} joined`)
  })

  bot.on('playerLeft', (player) => {
    if (player.username !== config.username) term.sys(`${player.username} left`)
  })

  bot.on('health', () => {
    if (bot.health > 0 && bot.health < 6) term.err(`Low health: ${bot.health.toFixed(1)}`)
  })

  bot.on('messagestr', (msg) => {
    if (typeof msg !== 'string' || !msg) return
    if (msg.startsWith('[') || msg.startsWith('<')) return
    if (!state.authed) return
    term.raw(msg)
  })

  spawnTimer = setTimeout(() => {
    if (!botInstance || botInstance !== bot) return
    if (bot.entity?.position) return
    term.err('Spawn timeout, reconnecting')
    bot.end('Spawn timeout')
  }, SPAWN_TIMEOUT)
}

function scheduleReconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  state.attempts++
  const delay = Math.min(config.reconnectMin * state.attempts, config.reconnectMax)
  term.sys(`Reconnect in ${delay / 1000}s (attempt ${state.attempts})`)
  reconnectTimer = setTimeout(createBot, delay)
}

function flushQueue() {
  if (!inputQueue.length) return
  const queue = inputQueue.splice(0)
  for (const input of queue) processInput(input)
}

function processInput(input) {
  if (!botInstance || !cmds) {
    inputQueue.push(input)
    return
  }

  if (input.startsWith('!')) {
    cmds.handle('terminal', input.slice(1).trim())
  } else {
    botInstance.chat(input)
    term.ter(`>> ${input}`)
  }
}

console.log(`\n${C.cyan}${C.dim}┌─${'─'.repeat(48)}─┐${C.reset}`)
console.log(`${C.cyan}${C.dim}│${C.reset}  ${C.yellow}Minecraft Bot${C.reset}`)
console.log(`${C.cyan}${C.dim}│${C.reset}  ${C.cyan}${config.host}:${config.port}${C.reset}`)
console.log(`${C.cyan}${C.dim}│${C.reset}  ${C.dim}Type !help or anything to chat${C.reset}`)
console.log(`${C.cyan}${C.dim}└─${'─'.repeat(48)}─┘${C.reset}\n`)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
function showPrompt() { rl.prompt(true) }

rl.on('line', (line) => {
  const input = line.trim()
  if (!input) { showPrompt(); return }
  processInput(input)
  showPrompt()
})

rl.on('SIGINT', () => {
  console.log()
  term.ter('Shutting down')
  if (botInstance) botInstance.quit('Terminal shutdown')
  process.exit(0)
})

process.on('unhandledRejection', (err) => {
  term.err(`Unhandled: ${err.message || err}`)
})

createBot()
showPrompt()
