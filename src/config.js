export const C = {
  reset: '\x1b[0m',
  gray: '\x1b[90m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
}

function ts() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
const tag = (c, l) => `${C.dim}[${C.reset}${c}${l}${C.dim}]${C.reset}`

export const config = {
  host: 'CreeperSMP-95.aternos.me',
  port: 59031,
  username: 'afk_bot',
  password: 'amazing#2026',
  auth: 'offline',
  version: false,
  registerCmd: '/register {pw}',
  loginCmd: '/login {pw}',
  owner: 'SenpiStation77',
  reconnectMin: 5000,
  reconnectMax: 60000,
}

if (isNaN(config.port) || config.port < 1 || config.port > 65535) config.port = 25565

export function pfx(c, l) {
  return `${C.dim}[${ts()}]${C.reset} ${tag(c, l)}`
}

export function log(...a) {
  console.log(`${C.dim}[${ts()}]${C.reset}`, ...a)
}

export const term = {
  chat(u, m) { console.log(`${pfx(C.cyan, 'CHAT')} ${C.cyan}<${u}>${C.reset} ${m}`) },
  cmd(s, c) { console.log(`${pfx(C.yellow, 'CMD')} ${C.yellow}${s}: !${c}${C.reset}`) },
  bot(m) { console.log(`${pfx(C.green, 'BOT')} ${C.green}${m}${C.reset}`) },
  auth(m) { console.log(`${pfx(C.magenta, 'AUTH')} ${C.magenta}${m}${C.reset}`) },
  sys(m) { console.log(`${pfx(C.cyan, 'SYS')} ${m}`) },
  err(m) { console.log(`${pfx(C.red, 'ERR')} ${C.red}${m}${C.reset}`) },
  ter(m) { console.log(`${C.dim}[${C.reset}${ts()}${C.dim}]${C.reset} ${C.yellow}[TERM]${C.reset} ${m}`) },
  raw(m) { console.log(`${C.dim}[${ts()}]${C.reset} ${m}`) },
}
