import { InjectionKey } from 'vue'
import {
  Store,
  useStore as baseUseStore,
  createStore,
} from 'vuex'

export const key: InjectionKey<Store<State>> = Symbol()

export function useStore() {
  return baseUseStore(key)
}

export interface State {
  status: 'disconnected' | 'connecting' | 'connected'
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
    metrics: [],
    error: null,
  },
  actions: {
    async connect({ state, commit }): Promise<void> {
      commit(SET_CONNECTING)

      await sleep(1000)
      commit(SET_CONNECTED)

      await sleep(1000)
      commit(SET_METRICS, {
        metrics: [
          {
            label: 'Apples',
            value: 5
          },
          {
            label: 'Bananas',
            value: 30
          },
        ]
      })
    },
    async attack({ state, commit }): Promise<void> {
      const metrics = state.metrics
        .map(({ label, value }) => {
          return {
            label,
            value: (parseInt(value) - 1).toString()
          }
        })
        .filter(({ value }) => parseInt(value) > 0)
      commit(SET_METRICS, { metrics })

      if (metrics.length < 2) {
        await sleep(2000)
        commit(SET_DISCONNECTED, { error: new Error('connection closed') })
      }
    }
  },
  mutations: {
    [SET_DISCONNECTED](state, { error }) {
      state.status = 'disconnected'
      state.metrics = []
      state.error = error
    },
    [SET_CONNECTING](state) {
      state.status = 'connecting'
      state.error = null
    },
    [SET_CONNECTED](state) {
      state.status = 'connected'
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
