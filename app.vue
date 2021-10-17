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
</style>

<template>
  <div class="app-container">
    <div class="app-content">
      <div v-if="status === 'disconnected'" class="disconnected-view">
        <h2>Disconnected</h2>
        <p>Reason: {{ error.message }}</p>
        <el-button type="primary" @click="connect">Connect</el-button>
      </div>
      <div v-else v-loading="status === 'connecting'" element-loading-text="Connecting…">
        <el-table :data="metrics" stripe>
          <el-table-column prop="label" label="Label" width="180" />
          <el-table-column prop="value" label="Value" />
        </el-table>
        <el-divider />
        <el-button type="danger" @click="attack">Attack</el-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { mapState, mapActions } from 'vuex'
import { useStore } from './store'

export default defineComponent({
  name: 'App',
  computed: mapState([
    'status',
    'metrics',
    'error',
  ]),
  methods: mapActions([
    'connect',
    'attack',
  ]),
  setup() {
    const store = useStore()
    store.dispatch('connect')
  }
})
</script>
