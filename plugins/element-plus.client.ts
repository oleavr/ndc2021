import { defineNuxtPlugin } from '#app'
import ElementPlus from 'element-plus'
import 'element-plus/theme-chalk/index.css'

export default defineNuxtPlugin(ctx => {
  ctx.vueApp.use(ElementPlus)
})
