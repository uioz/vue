import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

initGlobalAPI(Vue)

// 下列的几个方法都使用了 Object.defineProperty 方式进行定义
// 使用 Object.defineProperty 定义的内容, 无法继续被
// - 赋值
// - 枚举
// - 再次修改描述符

// 添加服务端渲染的 flag, 这个 flag 是从打包工具提供的全局变量中获取的
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

// 向 $ssrContext 属性添加读取修饰符
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// 在 Vue 上挂载一个用于 "函数式渲染" 的构造函数, 用于添加了 functional 标志的组件.
// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

// 添加 Vue 版本, 从工具工具提供的环境变量中获取
Vue.version = '__VERSION__'

export default Vue
