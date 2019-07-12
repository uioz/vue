/* @flow */

import {
  warn,
  invokeWithErrorHandling
} from 'core/util/index'
import {
  cached,
  isUndef,
  isTrue,
  isPlainObject
} from 'shared/util'

const normalizeEvent = cached((name: string): {
  name: string,
  once: boolean,
  capture: boolean,
  passive: boolean,
  handler?: Function,
  params?: Array<any>
} => {
  const passive = name.charAt(0) === '&'
  name = passive ? name.slice(1) : name
  const once = name.charAt(0) === '~' // Prefixed last, checked first
  name = once ? name.slice(1) : name
  const capture = name.charAt(0) === '!'
  name = capture ? name.slice(1) : name
  return {
    name,
    once,
    capture,
    passive
  }
})

/**
 * 
 */
export function createFnInvoker (fns: Function | Array<Function>, vm: ?Component): Function {
  function invoker () {
    const fns = invoker.fns
    if (Array.isArray(fns)) {
      const cloned = fns.slice()
      for (let i = 0; i < cloned.length; i++) {
        invokeWithErrorHandling(cloned[i], null, arguments, vm, `v-on handler`)
      }
    } else {
      // return handler return value for single handlers
      return invokeWithErrorHandling(fns, null, arguments, vm, `v-on handler`)
    }
  }
  invoker.fns = fns
  return invoker
}

/**
 * 用于更新事件监听器的方法, 被设计为通用使用
 * src\core\instance\events.js 也引用了他
 */
export function updateListeners (
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  createOnceHandler: Function,
  vm: Component
) {
  let name, def, cur, old, event

  /**
   * 迭代新旧两个 on 对象
   * 但是实际触发的事件不是 on 上直接挂载的方法, 是被包装过的
   * 为了节约性能, 如果发现旧的监听器上有旧的 handler
   * 重复的 handler 就不在创建直接从旧的 copy 过来
   */
  for (name in on) {
    def = cur = on[name]
    old = oldOn[name]
    /**
     * 过滤掉方法名称中的以 ~ ! & 开头的方法, 根据这些特殊符号返回不同结构的事件描述对象
     * 这些特殊符号代表了几个内置的指令, 而这几个指令会影响事件行为
     */
    event = normalizeEvent(name)

    /* istanbul ignore if */
    // 作用于 WEEX 的代码暂时不明白作用
    if (__WEEX__ && isPlainObject(def)) {
      cur = def.handler
      event.params = def.params
    }

    /**
     * @example
     * // 如果没有提供对于的方法体
     * <div @click="handleClick"></div>
     * // 下方代码会提示错误
     */
    if (isUndef(cur)) {
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid handler for event "${event.name}": got ` + String(cur),
        vm
      )
    // 没有旧的事件
    } else if (isUndef(old)) {
      // 没有 createFnInvoker 的标记
      // 将 cur 这个事件监听器替换为 createFnInvoker 创建一层外壳
      // 这个返回的 cur.fns 是原来的事件监听器
      // 之所以这样设计不直接使用原来的钩子, 目前猜测是为了可以添加多个事件在一个事件钩子上
      if (isUndef(cur.fns)) {
        cur = on[name] = createFnInvoker(cur, vm)
      }
      // 处理添加了 once 修饰符的事件, 不要忘记了 createOnceHandler 是由外部传入到本函数中的
      if (isTrue(event.once)) {
        cur = on[name] = createOnceHandler(event.name, cur, event.capture)
      }
      // 添加事件到元素身上, 不要忘记了这个函数是外部提供的
      add(event.name, cur, event.capture, event.passive, event.params)
    } else if (cur !== old) {
      old.fns = cur
      on[name] = old
    }
  }
  // 移除所有的旧的事件
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name)
      remove(event.name, oldOn[name], event.capture)
    }
  }
}
