import mineflayer from 'mineflayer'
import readline from 'readline'

const config = {
  host: process.env.MC_HOST || 'CreeperSMP-95.aternos.me',
  port: parseInt(process.env.MC_PORT || '59031'),
  username: process.env.MC_USERNAME || 'afk_bot',
  password: process.env.MC_PASSWORD || 'amazing#2026',
  auth: 'offline',
  version: process.env.MC_VERSION || false,
  registerCmd: '/register {pw} {pw}',
  loginCmd: '/login {pw}',
  owner: process.env.MC_OWNER || 'SenpiStation77',
  verbose: process.env.VERBOSE !== 'false',
}

const owner = config.owner.toLowerCase()
let reconnectTimer = null
let attempts = 0
let authMode = 'auto'
let authed = false

function reset() {
  attempts = 0
  authed = false
}

function send(bot, msg) {
  log(`>> ${msg}`)
  bot.chat(msg)
}

function doLogin(bot) {
  send(bot, config.loginCmd.replace(/\{pw\}/g, config.password))
}

function doRegister(bot) {
  send(bot, config.registerCmd.replace(/\{pw\}/g, config.password))
}

function createBot() {
  reset()
  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: config.auth,
    version: config.version || false,
    viewDistance: 6,
    logErrors: true,
  })

  bot.on('login', () => {
    botInstance = bot
    log(`Connected as ${config.username}`)
  })

  bot.on('spawn', () => {
    log('Spawned')
    attempts = 0
  })

  let sentAuth = false

  bot.on('messagestr', (json) => {
    const msg = typeof json === 'string' ? json : ''
    if (!msg) return
    const lower = msg.toLowerCase()

    if (lower.includes('successfully registered') || lower.includes('registration succeeded')) {
      authed = true
      authMode = 'login'
      log('Registered!')
      return
    }
    if (lower.includes('logged in') || lower.includes('successfully logged')) {
      authed = true
      log('Logged in!')
      return
    }

    if (authed || sentAuth) return

    const needReg = lower.includes('register') || lower.includes('not registered') || lower.includes('choose a password') || (lower.includes('type your password') && lower.includes('twice'))
    const needLog = lower.includes('login') || lower.includes('/log') || lower.includes('type your password') || lower.includes('enter your password')

    if (needReg) {
      sentAuth = true
      if (authMode === 'auto') authMode = 'register'
      log('Need register')
      doRegister(bot)
    } else if (needLog) {
      sentAuth = true
      log('Need login')
      doLogin(bot)
    }
  })

  bot.on('chat', (username, message) => {
    if (username === config.username) return
    log(`[CHAT] ${username}: ${message}`)

    const sender = username.toLowerCase()
    if (sender === owner && message.startsWith('!')) {
      handleCmd(bot, username, message.slice(1).trim())
    }
  })

  function handleCmd(bot, sender, cmd) {
    const parts = cmd.split(/\s+/)
    const action = parts[0].toLowerCase()
    const args = parts.slice(1)
    log(`Cmd: ${cmd}`)

    switch (action) {
      case 'tpa':
      case 'come':
        send(bot, `/tpa ${args[0] || sender}`)
        break
      case 'go':
        send(bot, `/tpahere ${args[0] || sender}`)
        break
      case 'tpaccept':
      case 'yes':
        send(bot, '/tpaccept')
        break
      case 'msg':
      case 'tell':
      case 'dm':
        send(bot, `/msg ${args[0]} ${args.slice(1).join(' ')}`)
        break
      case 'say':
        send(bot, args.join(' '))
        break
      case 'afk':
        send(bot, '/afk')
        break
      case 'ping':
        send(bot, 'pong')
        break
      case 'help':
        send(bot, '!tpa <p>, !come, !go, !tpaccept, !msg, !say, !ping')
        break
      case 'stop':
        log('Stopping')
        bot.end('Shutdown')
        process.exit(0)
        break
      default:
        send(bot, `/${action} ${args.join(' ')}`)
        break
    }
  }

  bot.on('kicked', (reason) => {
    const msg = typeof reason === 'string' ? reason : JSON.stringify(reason)
    log(`Kicked: ${msg}`)
    if (!authed && msg.toLowerCase().includes('not registered')) {
      authMode = 'register'
    }
    reconnect()
  })

  bot.on('error', (err) => log(`Error: ${err.message}`))

  bot.on('end', (reason) => {
    botInstance = null
    log(`Disconnected: ${reason}`)
    reconnect()
  })
}

function reconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  attempts++
  const delay = Math.min(5000 * attempts, 60000)
  log(`Reconnect in ${delay/1000}s (${attempts})`)
  reconnectTimer = setTimeout(() => { attempts = 0; createBot() }, delay)
}

function log(msg) {
  if (config.verbose) console.log(`[BOT] ${msg}`)
}

let botInstance = null

const rl = readline.createInterface({ input: process.stdin, prompt: '' })
rl.on('line', (line) => {
  const input = line.trim()
  if (!input || !botInstance) return
  botInstance.chat(input.startsWith('/') ? input : `/${input}`)
})

createBot()
