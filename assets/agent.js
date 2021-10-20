const METRIC_HEALTH = 0
const METRIC_SHELLS = 6

const clientState = importSymbol('cl')
const attackDown = new NativeFunction(importSymbol('IN_AttackDown'), 'void', [])
const attackUp = new NativeFunction(importSymbol('IN_AttackUp'), 'void', [])

const pendingUIThreadOps = []

rpc.exports = {
  async attack() {
    await perform(() => attackDown())
    await sleep(50)
    await perform(() => attackUp())

    await pushMetrics()
  }
}

pushMetrics()
setInterval(pushMetrics, 1000)

async function pushMetrics() {
  const metrics = await readMetrics()
  send({
    type: 'metrics',
    metrics
  })
}

function readMetrics() {
  return perform(() => {
    return [
      {
        label: 'Health',
        value: readMetric(METRIC_HEALTH)
      },
      {
        label: 'Shells',
        value: readMetric(METRIC_SHELLS)
      },
    ]
  })
}

function readMetric(metric) {
  return clientState.add(28 + metric * 4).readInt()
}

function perform(f) {
  return new Promise((resolve, reject) => {
    pendingUIThreadOps.push(() => {
      try {
        const result = f()
        resolve(result)
      } catch (e) {
        reject(e)
      }
    })
  })
}

Interceptor.attach(importSymbol('IN_SendKeyEvents'), {
  onEnter() {
    while (pendingUIThreadOps.length > 0) {
      const f = pendingUIThreadOps.shift()
      f()
    }
  }
})

function importSymbol(name) {
  return Module.getExportByName('QuakeSpasm-SDL2', name)
}

function sleep(duration) {
  return new Promise(resolve => {
    setTimeout(() => { resolve() }, duration)
  })
}
