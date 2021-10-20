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
  metrics: Metric[]
  error: Error | null
}

export interface Metric {
  label: string
  value: string
}

const SET_DISCONNECTED = 'Disconnected'
const SET_CONNECTING = 'Connecting'
const SET_CONNECTED = 'Connected'
const SET_METRICS = 'Set Metrics'

export const store = createStore<State>({
  state: {
    status: 'disconnected',
    client: new frida.Client('127.0.0.1:27042'),
    script: null,
    metrics: [],
    error: null,
  },
  actions: {
    async connect({ state, commit }): Promise<void> {
      commit(SET_CONNECTING)

      try {
        let quake: frida.Process | undefined
        do {
          const processes = await state.client.enumerateProcesses()

          quake = processes.find(({ name }) => name === 'QuakeSpasm')
          if (quake === undefined) {
            await sleep(1000)
            continue
          }
        } while (quake === undefined)

        const session = await state.client.attach(quake.pid)
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
          let handled = false

          if (message.type === frida.MessageType.Send) {
            const { payload } = message

            if (payload.type === 'metrics') {
              commit(SET_METRICS, { metrics: payload.metrics })
              handled = true
            }
          }

          if (!handled) {
            console.warn('Unhandled message:', message)
          }
        })
        await script.load()

        commit(SET_CONNECTED, { script })
      } catch (error) {
        commit(SET_DISCONNECTED, { error })
      }
    },
    async attack({ state }): Promise<void> {
      state.script!.exports.attack()
    }
  },
  mutations: {
    [SET_DISCONNECTED](state, { error }) {
      state.status = 'disconnected'
      state.script = null
      state.metrics = []
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
    [SET_METRICS](state, { metrics }) {
      state.metrics = metrics
    },
  }
})

function sleep(duration: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => { resolve() }, duration)
  })
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $store: Store<State>
  }
}
