import { term } from './config.js'

const EFFECTS = [
  { id: 'invisibility', name: 'Invisibility' },
  { id: 'saturation', name: 'Saturation' },
]
const AMPLIFIER = 255

export function setupEffects(bot, state) {
  function start() {
    for (const e of EFFECTS) {
      bot.chat(`/effect give @s ${e.id} infinite ${AMPLIFIER} true`)
    }
    term.sys('Effects applied')
  }

  return { start, stop: () => {} }
}
