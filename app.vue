<style scoped>
.app-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

.app-content {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 25px;
  box-shadow: var(--el-box-shadow-base);
}

.disconnected-view h2 {
  margin: 5px 250px 15px 5px;
  font-weight: bold;
}

.disconnected-view p {
  margin: 0 5px 40px 5px;
}

.disconnected-view button {
  float: right;
}

.connected-view {
  width: 455px;
  height: 280px;
  background-color: slateblue;
}
</style>

<template>
  <div class="app-container">
    <Head>
      <Meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
      />
    </Head>

    <div class="app-content">
      <div v-if="status === 'disconnected'" class="disconnected-view">
        <h2>Disconnected</h2>
        <p>Reason: {{ error.message }}</p>
        <el-button type="primary" @click="connect">Connect</el-button>
      </div>
      <div v-else-if="status === 'connecting'">Connecting…</div>
      <div
        v-else
        class="connected-view"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      ></div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ComponentPublicInstance } from 'vue'
import { mapState, mapActions } from 'vuex'
import { useStore, Point } from './store'

export default defineComponent({
  name: 'App',
  data(): UIState {
    return {
      activeTouch: null,
    }
  },
  computed: mapState([
    'status',
    'metrics',
    'error',
  ]),
  methods: {
    ...mapActions([
      'connect',
      'attack',
    ]),
    onMouseDown(this: ComponentPublicInstance, event: MouseEvent) {
      this.$store.dispatch('down', pointFromMouseEvent(event))
    },
    onMouseMove(this: ComponentPublicInstance, event: MouseEvent) {
      this.$store.dispatch('move', pointFromMouseEvent(event))
    },
    onMouseUp(this: ComponentPublicInstance, event: MouseEvent) {
      this.$store.dispatch('up')
    },
    onTouchStart(this: ComponentPublicInstance, event: TouchEvent) {
      event.preventDefault()

      const uiState = this.$data as UIState
      if (uiState.activeTouch === null) {
        const touch = event.changedTouches[0]
        uiState.activeTouch = touch.identifier
        this.$store.dispatch('down', pointFromTouch(touch))
      }
    },
    onTouchMove(this: ComponentPublicInstance, event: TouchEvent) {
      event.preventDefault()

      const { activeTouch } = this.$data as UIState
      const changed = Array.prototype.slice.call(event.changedTouches)
      for (const touch of changed) {
        if (touch.identifier === activeTouch) {
          this.$store.dispatch('move', pointFromTouch(touch))
        }
      }
    },
    onTouchEnd(this: ComponentPublicInstance, event: TouchEvent) {
      event.preventDefault()

      const uiState = this.$data as UIState
      const changed = Array.prototype.slice.call(event.changedTouches)
      for (const touch of changed) {
        if (touch.identifier === uiState.activeTouch) {
          this.$store.dispatch('up')
          uiState.activeTouch = null
        }
      }
    },
  },
  setup() {
    const store = useStore()
    store.dispatch('connect')
  }
})

interface UIState {
  activeTouch: number | null
}

function pointFromMouseEvent(event: MouseEvent): Point {
  const element = event.target as Element
  const bounds = element.getBoundingClientRect()
  const x = event.clientX - bounds.left
  const y = event.clientY - bounds.top
  return { x, y }
}

function pointFromTouch(touch: Touch): Point {
  const element = touch.target as Element
  const bounds = element.getBoundingClientRect()
  const x = touch.clientX - bounds.left
  const y = touch.clientY - bounds.top
  return { x, y }
}
</script>
