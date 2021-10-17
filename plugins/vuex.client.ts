import { defineNuxtPlugin } from '#app'
import { store, key } from '@/store'

export default defineNuxtPlugin(ctx => {
  ctx.vueApp.use(store, key)
})
