/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  // 如果传入的选项中存在 provide
  if (provide) {
    // provide 被要求为一个对象或者返回对象的函数  
    // 如果是函数就调用它拿到结果赋值到 _provided 上
    // 在后代组件使用 inject 的时候, 数据源就来自于此
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

/**
 * 初始化组件的 inject
 * @param {Object} vm 组件或者Vue实例
 */
export function initInjections (vm: Component) {
  const result = resolveInject(vm.$options.inject, vm)
  if (result) {
    // 停止 Observing
    toggleObserving(false)
    // 遍历获取的结果, 将对应的属性定义为响应式(已经是响应式的属性不会出现在 result 上)
    Object.keys(result).forEach(key => {
      if (process.env.NODE_ENV !== 'production') {
        // 开发模式下定义的响应式属性如果受到修改则会含有错误提示
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        // 非开发模式的下的响应式属性没有错误提示
        defineReactive(vm, key, result[key])
      }
    })
    // 允许 Observing
    toggleObserving(true)
  }
}

/**
 * 获取 inject 指定的参数的实际值, 从父组件 provide 中进行获取
 * @param {Array<string> | { [key: string]: string | Symbol | Object }} inject 
 * @param {Object} vm 
 */
export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    const keys = hasSymbol
      ? Reflect.ownKeys(inject)
      : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      // 忽略已经成为响应式的属性
      if (key === '__ob__') continue
      // 在合并选项的时候数组类型的 inject ['foobar'] 会被转为对象格式 { foobar:{form:'foobar'} }
      const provideKey = inject[key].from
      let source = vm
      // 向上遍历组件的 _provided 直到找到对应的 provided
      while (source) {
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      // 向上遍历后没有找到, 提示没有找到该 key 对应的 provide
      if (!source) {
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}
