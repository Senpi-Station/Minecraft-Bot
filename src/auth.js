import { config, term } from './config.js'

const AUTH_WAIT = 4000
const AUTH_RETRY = 3

export function setupAuth(bot, state) {
  let sentAuth = false
  let authTimer = null
  let authTries = 0
  let hinted = null

  function sendAuth(mode) {
    if (state.authed || sentAuth) return
    sentAuth = true
    state.authMode = mode
    authTries++
    const cmd = mode === 'register' ? config.registerCmd : config.loginCmd
    const msg = cmd.replace(/\{pw\}/g, config.password)
    term.auth(`>> ****** (${mode})`)
    bot.chat(msg)
    authTimer = setTimeout(() => {
      sentAuth = false
      if (authTries >= AUTH_RETRY) {
        term.err(`Auth failed after ${AUTH_RETRY} tries, reconnecting`)
        bot.end('Auth failed')
        return
      }
      const retryMode = state.authMode || mode
      term.auth(`Timed out, retrying ${retryMode} (${authTries}/${AUTH_RETRY})`)
      sendAuth(retryMode)
    }, AUTH_WAIT)
  }

  function cancelTimer() {
    if (authTimer) { clearTimeout(authTimer); authTimer = null }
  }

  bot.on('login', () => { authTries = 0; hinted = null; sentAuth = false })

  bot.on('messagestr', (json) => {
    const raw = typeof json === 'string' ? json : ''
    if (!raw || state.authed) return
    const lower = raw.toLowerCase()

    if (/successfully registered|registration succeeded|you have been registered/i.test(lower)) {
      cancelTimer()
      state.authed = true
      term.auth('Registered!')
      return
    }

    if (/logged in|successfully logged/i.test(lower)) {
      cancelTimer()
      state.authed = true
      term.auth('Logged in!')
      return
    }

    if (/wrong password|login failed|incorrect password|bad login/i.test(lower)) {
      cancelTimer()
      if (authTries < AUTH_RETRY) {
        term.auth('Wrong password, will retry on next reconnect')
      }
      bot.end('Bad password')
      return
    }

    if (/already registered|already exists|account.*already/i.test(lower)) {
      term.auth('Already registered, switching to login')
      cancelTimer()
      sentAuth = false
      if (!state.authed) sendAuth('login')
      return
    }

    if (/not registered|choose a password|type your password|register.*password/i.test(lower)) {
      term.auth('Server asks to register')
      if (!state.authed) hinted = 'register'
      return
    }

    if (/enter.*password|login.*password/i.test(lower)) {
      term.auth('Server asks for login')
      if (!state.authed) hinted = 'login'
      return
    }
  })

  bot.once('spawn', () => {
    if (state.authed) return

    setTimeout(() => {
      if (state.authed || sentAuth) return

      if (hinted === 'register') {
        term.auth('Registering (from hint)')
        sendAuth('register')
      } else if (hinted === 'login') {
        term.auth('Logging in (from hint)')
        sendAuth('login')
      } else {
        term.auth('No hint received, trying register first')
        sendAuth('register')
      }
    }, 2000)
  })

  bot.on('kicked', (reason, loggedIn) => {
    cancelTimer()
    sentAuth = false
    let msg = reason || ''
    if (typeof reason === 'string' && reason.startsWith('{')) {
      try {
        const p = JSON.parse(reason)
        msg = p.text || p.translate || p.extra?.[0]?.text || reason
      } catch (e) {}
    }
    term.err(`Kicked: ${msg}`)
    state.authed = false
  })

  bot.on('end', () => { cancelTimer(); sentAuth = false })
}
