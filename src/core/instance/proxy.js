/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

let initProxy

if (process.env.NODE_ENV !== 'production') {
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
  )

  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
      'referenced during render. Make sure that this property is reactive, ' +
      'either in the data option, or for class-based components, by ' +
      'initializing the property. ' +
      'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }

  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
      'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
      'prevent conflicts with Vue internals' +
      'See: https://vuejs.org/v2/api/#data',
      target
    )
  }

  const hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy)

  if (hasProxy) {
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact')
    config.keyCodes = new Proxy(config.keyCodes, {
      set (target, key, value) {
        if (isBuiltInModifier(key)) {
          warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
          return false
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  /**
   * 1. 用于创建 Proxy 对象的参数, 用于判断指定的键是否存在于 vm 实例(包括原型).
   * 2. 键存在在 vm 实例上 - 返回 true 
   * 3. 键不存在实例上
   *   - 是系统关键字或者是以 _开头的不存在于 $data 中的键 返回 false
   *   - 不符合上条规则
   *     - 键存在于 $data 中提示错误 提示访问 $data.xxx 因为响应式系统不会为 _ 或者 $ 开头的属性在vm上添加追踪 返回 true
   *     - 键不存在于 $data 中提示错误 提示找不到, 引用但是却未定义 返回 true
   * 4. 存在键 返回true
   * 
   * target - vm对象
   */
  const hasHandler = {
    has (target, key) {
      const has = key in target
      const isAllowed = allowedGlobals(key) ||
        (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data))
      if (!has && !isAllowed) {
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      return has || !isAllowed
    }
  }

  /**
   * - 如果键不存在与 vm实例上
   *  - 但是存在于 $data 中提示错误 提示访问 $data.xxx 因为响应式系统不会为 _ 或者 $ 开头的属性在vm上添加追踪
   *  - 键不存在于 $data 中提示错误 提示找不到, 引用但是却未定义
   * 始终返回键所对应的内容
   */
  const getHandler = {
    get (target, key) {
      if (typeof key === 'string' && !(key in target)) {
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      return target[key]
    }
  }

  /**
   * 向 vm 上挂载属性 vm._renderProxy 值有两种可能:
   * 1. 存在Proxy情况下 - Proxy 实例
   * 2. vm 等于原来的 vm
   * 如果存在 vm.options.render 会向 Proxy 添加:
   * - getHandler
   * - 反之 hasHandler
   */
  initProxy = function initProxy (vm) {
    /**
     * 如果有原生 Proxy 对象
     */
    if (hasProxy) {
      /**
       * 决定使用的 proxy 的类型
       */
      const options = vm.$options
      const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler
      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      vm._renderProxy = vm
    }
  }
}

export { initProxy }
