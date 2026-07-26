import mineflayerPathfinder from 'mineflayer-pathfinder'
const { pathfinder, Movements } = mineflayerPathfinder
const { GoalNear, GoalFollow, GoalGetToBlock } = mineflayerPathfinder.goals
import { config, term } from './config.js'

const CMD_HELP =
  'Movement: !tpa <p>, !come, !go, !tpaccept, !goto <x y z>, !follow <p>, !unfollow, !stopmove, ' +
  'Info: !pos, !stats, !inv, !list, !time, !near, !dump, ' +
  'Actions: !jump, !eat, !effect [name], !look <p>, !attack <p|nearest>, !sleep, !wake, ' +
  'Items: !drop <item> [n], !equip <item> [slot], !deposit <item> [n], !discard <item>, !dropall, ' +
  'Chat: !say, !msg <p> <t>, !afk, !ping, ' +
  'Essentials: !sethome [name], !home [name], ' +
  'Owner: !open, !collect, !op <cmd>, !stop'

const PUBLIC = new Set([
  'help','ping','pos','stats','inv','list','time','near',
  'tpa','come','go','tpaccept','yes',
  'msg','tell','dm','say','afk','eat','jump','look','drop','equip','sleep','wake','attack','effects','effect','sethome','home','deposit',
])

const POSITIVE_EFFECTS = [
  'absorption', 'conduit_power', 'dolphins_grace', 'fire_resistance',
  'glowing', 'haste', 'health_boost', 'hero_of_the_village',
  'invisibility', 'jump_boost', 'luck', 'night_vision',
  'regeneration', 'resistance', 'saturation', 'slow_falling',
  'speed', 'strength', 'water_breathing',
]
const GOTO_TIMEOUT = 25000
const STUCK_INTERVAL = 3000
const STUCK_THRESHOLD = 0.5
const MAX_STUCK = 5

export function setupCommands(bot, state, eatFn, effects) {
  const owner = config.owner.toLowerCase()
  let movements = null
  let followTarget = null
  let followTimer = null
  let movingGoal = null
  let stuckTimer = null
  let lastPos = null
  let stuckCount = 0

  function cancelStuck() {
    if (stuckTimer) { clearInterval(stuckTimer); stuckTimer = null }
    lastPos = null; stuckCount = 0
  }

  function startStuckCheck() {
    cancelStuck()
    if (!bot.entity?.position) return
    lastPos = bot.entity.position.clone()
    stuckTimer = setInterval(() => {
      if (!movingGoal || !bot.entity?.position) { cancelStuck(); return }
      const cur = bot.entity.position
      const dist = cur.distanceTo(lastPos)
      if (dist < STUCK_THRESHOLD) {
        stuckCount++
        term.sys(`Stuck ${stuckCount}/${MAX_STUCK}`)
        if (stuckCount >= MAX_STUCK) {
          stopMoving()
          reply("I'm stuck! Stopping.")
          return
        }
        if (stuckCount > 1) {
          bot.setControlState('jump', true)
          setTimeout(() => bot.setControlState('jump', false), 400)
        }
      } else if (dist > 1) {
        stuckCount = Math.max(0, stuckCount - 1)
      }
      lastPos = cur.clone()
    }, STUCK_INTERVAL)
  }

  function configureMovements() {
    if (!movements) return
    movements.allowParkour = true
    movements.allow1by1towers = true
    movements.allowFreeMotion = true
    movements.allowSprinting = true
    movements.canDig = false
    movements.canOpenDoors = true
    movements.canOpenFenceGates = true
    movements.maxDropDown = 3
    movements.dontCreateFlow = true
    movements.dontMineUnderFallingBlock = true

    const b = bot.registry.blocksByName
    for (const name of ['cactus','fire','magma_block','campfire','sweet_berry_bush']) {
      if (b?.[name]) movements.blocksToAvoid.add(b[name].id)
    }
    for (const name of ['crafting_table','furnace','chest','ender_chest','anvil','enchanting_table','grindstone','barrel','shulker_box','trapped_chest']) {
      if (b?.[name]) movements.interactableBlocks.add(b[name].id)
    }

    const i = bot.registry.itemsByName
    for (const name of ['dirt','cobblestone','stone','andesite','diorite','granite','oak_planks','spruce_planks','birch_planks','deepslate','tuff']) {
      if (i?.[name]) movements.scafoldingBlocks.push(i[name].id)
    }
  }

  async function initPathfinder() {
    if (movements) return
    bot.loadPlugin(pathfinder)
    await bot.waitForChunksToLoad()
    movements = new Movements(bot, bot.registry)
    configureMovements()
    bot.pathfinder.setMovements(movements)
    bot.pathfinder.searchRadius = 50
    bot.pathfinder.thinkTimeout = 5000
    bot.pathfinder.tickTimeout = 50

    bot.on('path_update', (r) => {
      if (r.status === 'noPath' && movingGoal) {
        reply('No path found')
        stopMoving()
      }
    })
    bot.on('goal_reached', () => {
      if (movingGoal) cancelStuck()
    })
  }

  bot.once('spawn', initPathfinder)

  function stopMoving() {
    if (!bot.pathfinder) return
    movingGoal = null
    cancelStuck()
    bot.pathfinder.stop()
    bot.pathfinder.setGoal(null)
  }

  function stopFollow() {
    followTarget = null
    if (followTimer) { clearInterval(followTimer); followTimer = null }
    stopMoving()
  }

  async function goTo(goal, label, sender) {
    stopMoving()
    if (!movements) await initPathfinder()
    reply(label || 'Moving...', sender)
    movingGoal = true

    setTimeout(() => {
      if (!movingGoal) return
      startStuckCheck()
    }, 500)

    try {
      await Promise.race([
        bot.pathfinder.goto(goal),
        new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Timed out'), { name: 'Timeout' })), GOTO_TIMEOUT)),
      ])
      if (movingGoal) reply('Arrived', sender)
    } catch (err) {
      if (!movingGoal) return
      const name = err.name || 'Error'
      if (name === 'NoPath') reply('No path available', sender)
      else if (name === 'Timeout') reply('Pathfinding timed out', sender)
      else if (name === 'GoalChanged') {}
      else if (name === 'PathStopped') {}
      else reply(err.message || name, sender)
    } finally {
      movingGoal = null
      cancelStuck()
    }
  }

  function checkFollowSight() {
    if (!followTarget || !movingGoal) return
    const player = bot.players[followTarget]
    if (!player?.entity) {
      if (bot.pathfinder.isMoving()) return
      return
    }
    const currentGoal = bot.pathfinder?.goal
    if (!currentGoal || !(currentGoal instanceof GoalFollow)) {
      bot.pathfinder.setGoal(new GoalFollow(player.entity, 3), true)
    }
  }

  function isOwner(sender) {
    return sender === owner || sender === 'terminal'
  }

  function isDead() {
    return bot.health <= 0
  }

  bot.on('chat', (username, message) => {
    if (username === config.username) return
    term.chat(username, message)
    if (!message.startsWith('!')) return
    const action = message.slice(1).trim().split(/\s+/)[0].toLowerCase()
    if (!isOwner(username.toLowerCase()) && !PUBLIC.has(action)) return
    handle(username, message.slice(1).trim())
  })

  bot.on('whisper', (username, message) => {
    if (username === config.username) return
    term.chat(username, `(whisper) ${message}`)
    if (!message.startsWith('!')) return
    handle(username, message.slice(1).trim())
  })

  bot.on('death', () => {
    stopFollow(); stopMoving()
    term.sys('Bot died')
  })

  bot.on('spawn', () => {
    if (bot.health > 0 && state.authed) {
      term.sys('Respawned')
    }
  })

  let replyTarget = null

  function reply(msg, sender) {
    const target = sender || replyTarget || 'terminal'
    if (target === 'terminal') {
      term.bot(msg)
    } else {
      try { bot.whisper(target, msg) } catch (e) { term.err(`whisper failed: ${e.message}`) }
    }
  }

  async function handle(sender, cmd) {
    const parts = cmd.split(/\s+/)
    const action = parts[0].toLowerCase()
    const args = parts.slice(1)
    replyTarget = sender
    term.cmd(sender === 'terminal' ? 'TERM' : sender, cmd)

    if (isDead() && !['help','stats','ping'].includes(action)) {
      reply('Bot is dead, waiting to respawn')
      return
    }

    const needsSpawn = !['help','ping'].includes(action)
    if (needsSpawn && !bot.entity?.position) {
      reply('Still loading world, try again')
      return
    }

    try {
      switch (action) {
        case 'tpa':
          stopFollow()
          bot.chat(`/tpa ${args[0] || sender}`)
          reply('Sent teleport request')
          break

        case 'come':
          stopFollow()
          bot.chat(`/tpahere ${args[0] || sender}`)
          reply('Sent request')
          break

        case 'go':
          stopFollow()
          if (!args[0]) { reply('usage: !go <player>'); break }
          bot.chat(`/tpa ${args[0]}`)
          reply('Sent teleport request')
          break

        case 'tpaccept':
        case 'yes':
          bot.chat('/tpaccept')
          reply('Accepted')
          break

        case 'msg':
        case 'tell':
        case 'dm':
          if (!args[0]) { reply('usage: !msg <player> <text>'); break }
          bot.chat(`/msg ${args[0]} ${args.slice(1).join(' ')}`)
          break

        case 'say':
          bot.chat(args.join(' ') || '...')
          break

        case 'pos': {
          const p = bot.entity?.position
          if (!p) { reply('Position unknown'); break }
          const yaw = ((bot.entity.yaw || 0) * 180 / Math.PI).toFixed(1)
          reply(`x: ${p.x.toFixed(1)}, y: ${p.y.toFixed(1)}, z: ${p.z.toFixed(1)}, yaw: ${yaw}°`)
          break
        }

        case 'stats':
          reply(`HP: ${(bot.health ?? 0).toFixed(1)}/20, Food: ${bot.food ?? 0}/20, Sat: ${(bot.foodSaturation ?? 0).toFixed(1)}`)
          break

        case 'inv': {
          const items = bot.inventory.items()
          if (!items.length) { reply('Inventory empty'); break }
          const lines = items.map(i => `${i.name} x${i.count}`)
          for (let i = 0; i < lines.length; i += 5) {
            reply(lines.slice(i, i + 5).join(', '))
          }
          break
        }

        case 'dump': {
          const pos = bot.entity.position
          const byType = {}
          for (const e of Object.values(bot.entities)) {
            if (e === bot.entity || !e.position) continue
            const dist = Math.floor(e.position.distanceTo(pos))
            const name = e.username || e.name || e.displayName || e.type
            const type = e.type || 'unknown'
            if (!byType[type]) byType[type] = []
            byType[type].push(`${name}(${dist}m)`)
          }
          if (!Object.keys(byType).length) { reply('No entities'); break }
          for (const [type, list] of Object.entries(byType)) {
            for (let i = 0; i < list.length; i += 6) {
              reply(`${type}: ${list.slice(i, i + 6).join(', ')}`)
            }
          }
          break
        }

        case 'near': {
          const pos = bot.entity.position
          const lines = []
          for (const e of Object.values(bot.entities)) {
            if (e === bot.entity || !e.position) continue
            const dist = Math.floor(e.position.distanceTo(pos))
            if (dist > 20) continue
            const name = e.username || e.name || e.displayName || e.type
            lines.push(`${name}(${dist}m)`)
          }
          if (!lines.length) { reply('Nothing nearby'); break }
          reply('Nearby: ' + lines.join(', '))
          break
        }

        case 'list': {
          const names = Object.keys(bot.players).filter(n => n !== config.username)
          if (!names.length) { reply('No other players online'); break }
          reply('Players: ' + names.join(', '))
          break
        }

        case 'time':
          reply(`Day ${bot.time.day ?? '?'}, ${bot.time.timeOfDay ?? '?'} ticks (${bot.time.isDay ? 'day' : 'night'})`)
          break

        case 'goto': {
          if (args.length < 3) { reply('usage: !goto <x> <y> <z>'); break }
          const x = parseFloat(args[0]), y = parseFloat(args[1]), z = parseFloat(args[2])
          if (isNaN(x) || isNaN(y) || isNaN(z)) { reply('Invalid coordinates'); break }
          stopFollow()
          await goTo(new GoalNear(x, y, z, 1), `Going to ${x}, ${y}, ${z}`, sender)
          break
        }

        case 'collect': {
          stopFollow()
          const item = nearestItem(bot)
          if (!item) { reply(`No items within ${COLLECT_RANGE} blocks`); break }
          const p = item.position
          await goTo(new GoalNear(p.x, p.y, p.z, 2), `Collecting at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`, sender)
          break
        }

        case 'follow':
          if (!args[0]) { reply('usage: !follow <player>'); break }
          stopFollow()
          if (!movements) await initPathfinder()
          followTarget = args[0]
          const followEntity = bot.players[followTarget]?.entity
          if (followEntity) {
            movingGoal = true
            bot.pathfinder.setGoal(new GoalFollow(followEntity, 3), true)
          } else {
            movingGoal = true
            reply(`Can't see ${followTarget}, will follow when visible`)
          }
          reply(`Following ${followTarget}`)
          followTimer = setInterval(checkFollowSight, 3000)
          break

        case 'unfollow':
          stopFollow()
          reply('Stopped following')
          break

        case 'stopmove':
          stopFollow()
          reply('Stopped')
          break

        case 'jump':
          bot.setControlState('jump', true)
          setTimeout(() => bot.setControlState('jump', false), 400)
          reply('Jumped')
          break

        case 'look':
          if (!args[0]) { reply('usage: !look <player>'); break }
          await lookAtPlayer(bot, args[0], reply)
          break

        case 'attack':
          await attackTarget(bot, args, reply)
          break

        case 'drop': {
          if (!args[0]) { reply('usage: !drop <item> [count]'); break }
          const count = args[1] ? parseInt(args[1]) : 64
          const item = findItem(bot, args[0])
          if (!item) { reply(`No item matching "${args[0]}"`); break }
          const toDrop = Math.min(count, item.count)
          try {
            await bot.toss(item.type, null, toDrop)
            reply(`Dropped ${toDrop}x ${item.name}`)
          } catch (e) { reply(`Drop failed: ${e.message}`) }
          break
        }

        case 'deposit': {
          if (!args[0]) { reply('usage: !deposit <item> [count]'); break }
          const depItem = findItem(bot, args[0])
          if (!depItem) { reply(`No item matching "${args[0]}"`); break }
          const depCount = args[1] ? parseInt(args[1]) : depItem.count
          const chestBlock = bot.findBlock({
            matching: b => b.name?.includes('chest') || b.name?.includes('barrel') || b.name?.includes('shulker'),
            maxDistance: 5,
          })
          if (!chestBlock) { reply('No container within 5 blocks'); break }
          try {
            const container = await bot.openContainer(chestBlock)
            await container.deposit(depItem.type, null, depCount, null)
            container.close()
            reply(`Deposited ${depCount}x ${depItem.name}`)
          } catch (e) { reply(`Deposit failed: ${e.message}`) }
          break
        }

        case 'discard': {
          if (!args[0]) { reply('usage: !discard <item>'); break }
          let total = 0
          let items = bot.inventory.items().filter(i => i.name.includes(args[0].toLowerCase()))
          for (const item of items) {
            try {
              await bot.tossStack(item)
              total += item.count
            } catch (e) {}
          }
          reply(total ? `Discarded ${total} items` : `No items matching "${args[0]}"`)
          break
        }

        case 'dropall': {
          let total = 0
          let items = bot.inventory.items().filter(i => !i.name.includes('air'))
          for (const item of items) {
            try {
              await bot.tossStack(item)
              total += item.count
            } catch (e) {}
          }
          reply(`Dropped ${total} items`)
          break
        }

        case 'equip': {
          if (!args[0]) { reply('usage: !equip <item> [hand|head|torso|legs|feet|off-hand]'); break }
          const eqItem = findItem(bot, args[0])
          if (!eqItem) { reply(`No item matching "${args[0]}"`); break }
          const slot = args[1] || 'hand'
          try {
            await bot.equip(eqItem, slot)
            reply(`Equipped ${eqItem.name} on ${slot}`)
          } catch (e) { reply(`Equip failed: ${e.message}`) }
          break
        }

        case 'eat': {
          if (!eatFn) { reply('No eat function'); break }
          const r = await eatFn()
          if (r === 'none') reply('No food to eat')
          else if (r === 'ok') reply('Ate')
          else if (r === 'cooldown') reply('Already eating or on cooldown')
          else if (r === 'fail') reply('Eating failed')
          break
        }

        case 'effects':
        case 'effect':
          if (args[0] === 'help' || args[0] === 'list') {
            reply('Positive: ' + POSITIVE_EFFECTS.join(', '))
          } else if (args[0]) {
            bot.chat(`/effect give @s ${args[0]} infinite 255 true`)
            reply(`Applied ${args[0]}`)
          } else if (effects) {
            effects.start(); reply('Effects applied')
          } else {
            reply('Effects not available')
          }
          break

        case 'sethome':
          bot.chat(`/sethome ${args[0] || ''}`.trim())
          reply('Setting home')
          break

        case 'home':
          bot.chat(`/home ${args[0] || ''}`.trim())
          reply('Going home')
          break

        case 'sleep':
          await sleepInBed(bot, reply)
          break

        case 'wake':
          try {
            await bot.wake()
            reply('Woke up')
          } catch (e) { reply(`Can't wake: ${e.message}`) }
          break

        case 'open':
          await openContainer(bot, args, reply)
          break

        case 'afk':
          stopFollow()
          bot.chat('/afk')
          reply('Toggled AFK')
          break

        case 'ping':
          reply('pong')
          break

        case 'help':
          reply(CMD_HELP)
          break

        case 'op':
          bot.chat(`/${args.join(' ')}`)
          break

        case 'stop':
          term.sys('Stopping')
          stopFollow()
          bot.quit('Shutdown')
          process.exit(0)
          break

        default:
          if (!isOwner(sender)) { reply('Unknown command'); break }
          bot.chat(`/${action} ${args.join(' ')}`)
          break
      }
    } catch (err) {
      term.err(`Command error: ${err.message || err}`)
      reply(`Error: ${err.message || err}`)
    }
  }

  return { handle, send: reply }
}

function findItem(bot, search) {
  const lower = search.toLowerCase()
  let best = null
  let bestScore = 0
  for (const item of bot.inventory.items()) {
    if (item.name.includes(lower)) {
      const score = item.name === lower ? 2 : item.name.startsWith(lower) ? 1 : 0
      if (score > bestScore) { bestScore = score; best = item }
    }
  }
  return best
}

function nearestItem(bot) {
  let best = null
  let bestDist = Infinity
  const pos = bot.entity?.position
  if (!pos) return null
  for (const e of Object.values(bot.entities)) {
    if (e.type !== 'object' || !e.position) continue
    const dist = pos.distanceTo(e.position)
    if (dist < bestDist && dist <= COLLECT_RANGE) {
      bestDist = dist; best = e
    }
  }
  return best
}

async function lookAtPlayer(bot, name, reply) {
  const entity = bot.players[name]?.entity
  if (!entity) { reply(`Can't see ${name}`); return }
  try {
    await bot.lookAt(entity.position.offset(0, 1.6, 0), true)
    reply(`Looking at ${name}`)
  } catch (e) { reply(`Look failed: ${e.message}`) }
}

async function attackTarget(bot, args, reply) {
  let target = null

  if (args[0] && args[0] !== 'nearest') {
    const player = bot.players[args[0]]?.entity
    if (player && player.position) target = player
  }

  if (!target) {
    target = bot.nearestEntity(e =>
      e !== bot.entity && e.type !== 'object' && e.type !== 'misc'
      && e.position && e.health > 0
      && e.position.distanceTo(bot.entity.position) < 8
    )
  }

  if (!target) { reply('No target found'); return }
  try {
    await bot.lookAt(target.position.offset(0, 1, 0), true)
    bot.attack(target)
    reply(`Attacked ${target.username || target.name || target.type}`)
  } catch (e) { reply(`Attack failed: ${e.message}`) }
}

async function sleepInBed(bot, reply) {
  const bed = bot.findBlock({ matching: block => bot.isABed(block), maxDistance: 4 })
  if (!bed) { reply('No bed nearby'); return }
  try {
    await bot.sleep(bed)
    reply('Sleeping')
  } catch (e) { reply(`Can't sleep: ${e.message}`) }
}

async function openContainer(bot, args, reply) {
  const search = args[0] || 'chest'
  const block = bot.findBlock({
    matching: block => block.name && block.name.toLowerCase().includes(search.toLowerCase()),
    maxDistance: 5,
  })
  if (!block) { reply(`No ${search} within 5 blocks`); return }
  try {
    const container = await bot.openContainer(block)
    const items = container.containerItems()
    if (!items.length) { reply(`${block.name} is empty`); container.close(); return }
    const lines = items.map(i => `${i.name} x${i.count}`)
    for (let i = 0; i < lines.length; i += 5) {
      reply(lines.slice(i, i + 5).join(', '))
    }
    container.close()
  } catch (e) { reply(`Open failed: ${e.message}`) }
}
