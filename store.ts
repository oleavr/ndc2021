import { InjectionKey } from 'vue'
import {
  Store,
  useStore as baseUseStore,
  createStore,
} from 'vuex'
import * as frida from '@frida/web-client'
import agent from 'assets/agent.js?raw'

export const key: InjectionKey<Store<State>> = Symbol()

export function useStore() {
  return baseUseStore(key)
}

export interface State {
  status: 'disconnected' | 'connecting' | 'connected'
  client: frida.Client
  script: frida.Script | null
  touch: 'idle' | 'active'
  error: Error | null
}

export interface Point {
  x: number
  y: number
}

const SET_DISCONNECTED = 'Disconnected'
const SET_CONNECTING = 'Connecting'
const SET_CONNECTED = 'Connected'

const LEFT_EDGE = 113

export const store = createStore<State>({
  state: {
    status: 'disconnected',
    client: new frida.Client(location.hostname + ':27042'),
    script: null,
    touch: 'idle',
    error: null,
  },
  actions: {
    async connect({ state, commit }): Promise<void> {
      commit(SET_CONNECTING)

      try {
        let target: frida.Process | undefined
        do {
          const processes = await state.client.enumerateProcesses()

          target = processes.find(({ name }) => name === 'MorphWiz')
          if (target === undefined) {
            await sleep(1000)
            continue
          }
        } while (target === undefined)

        const session = await state.client.attach(target.pid)
        session.detached.connect(reason => {
          if (state.status === 'connected') {
            let message = ''
            for (let c of frida.SessionDetachReason[reason]) {
              if (message.length > 0 && c === c.toUpperCase()) {
                message += ' '
              }
              message += c.toLowerCase()
            }
            commit(SET_DISCONNECTED, { error: new Error(message) })
          }
        })

        const script = await session.createScript(agent)
        script.message.connect(message => {
          if (message.type === frida.MessageType.Error) {
            console.error(message.stack)
          } else {
            console.warn('Unhandled message:', message)
          }
        })
        await script.load()

        commit(SET_CONNECTED, { script })
      } catch (error) {
        commit(SET_DISCONNECTED, { error })
      }
    },
    async down({ state }, { x, y }): Promise<void> {
      if (state.touch !== 'idle') {
        return
      }

      state.touch = 'active'

      try {
        await state.script!.exports.down(LEFT_EDGE + x, y)
      } catch (e) {
        state.touch = 'idle'
      }
    },
    move: throttle(
      ({ state }, { x, y }): void => {
        if (state.touch !== 'active') {
          return
        }

        state.script!.post({ type: 'move', x, y })
      }, 50),
    async up({ state }): Promise<void> {
      if (state.touch !== 'active') {
        return
      }

      state.touch = 'idle'

      return state.script!.exports.up()
    },
  },
  mutations: {
    [SET_DISCONNECTED](state, { error }) {
      state.status = 'disconnected'
      state.script = null
      state.error = error
    },
    [SET_CONNECTING](state) {
      state.status = 'connecting'
      state.error = null
    },
    [SET_CONNECTED](state, { script }) {
      state.status = 'connected'
      state.script = script
    },
  }
})

function sleep(duration: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => { resolve() }, duration)
  })
}

// Based on https://codeburst.io/throttling-and-debouncing-in-javascript-b01cad5c8edf
function throttle(func: (...args: any[]) => any, limit: number) {
  let lastFunc: NodeJS.Timeout | null = null
  let lastRan: number | null = null
  return function (this: any, ...args: any[]) {
    const context = this
    if (lastRan === null) {
      func.apply(context, args)
      lastRan = Date.now()
    } else {
      if (lastFunc !== null) {
        clearTimeout(lastFunc)
      }
      lastFunc = setTimeout(function () {
        if ((Date.now() - lastRan!) >= limit) {
          func.apply(context, args)
          lastRan = Date.now()
        }
      }, limit - (Date.now() - lastRan))
    }
  }
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $store: Store<State>
  }
}
