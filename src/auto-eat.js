import { term } from './config.js'

const FOOD_THRESHOLD = 18
const COOLDOWN = 2000

export function setupAutoEat(bot, state) {
  let eating = false
  let lastEat = 0

  bot.on('health', () => {
    if (eating || !state.authed || bot.food > FOOD_THRESHOLD) return
    eat()
  })

  return eat

  async function eat() {
    if (eating || Date.now() - lastEat < COOLDOWN) return 'cooldown'
    const food = bot.inventory.items().find(i =>
      (i.foodPoints ?? 0) > 0 ||
      /cooked_|bread|apple|carrot|potato|beetroot|stew|soup|fish|salmon|cod|beef|chicken|porkchop|mutton|rabbit|cake|cookie|melon|pie|mushroom|kelp|berries|chorus/.test(i.name)
    )
    if (!food) { term.sys('No food to eat'); return 'none' }
    eating = true
    try {
      await bot.equip(food, 'hand')
      await bot.consume()
      term.sys(`Ate ${food.displayName || food.name}`)
      return 'ok'
    } catch (err) {
      term.err(`Eat failed: ${err.message || err}`)
      return 'fail'
    } finally {
      eating = false
      lastEat = Date.now()
    }
  }
}
