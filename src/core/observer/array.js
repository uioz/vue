/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 * 拦截变异方法且触发监听.
 * 这个方法只会拦截那些 methodsToPatch 集合中的 key.
 * 由于 arrayMethods 的原型和 Array 一致, 所以未拦截的部分
 * 会通过原型链向上查找也就是查找 Array 的原型链.
 * **注意**: arrayMethods的最终通途是用于替换掉一个数组的原型对象, 而不是当做一个数组来使用
 * @example 
 * let a = [];
 * a.__proto__ = arrayMethods
 * a.push // 这个方法是经过代理的
 * a.indexOf // 这个方法依然是 Array 的
 */
methodsToPatch.forEach(function (method) {
  // 缓存原有的数组原型上的方法
  const original = arrayProto[method]
  // 定义给定方法名称的拦截函数
  def(arrayMethods, method, function mutator(...args) {
    // 将传入的参数利用当前上下文去调用 Array 上的同名方法获取结果
    const result = original.apply(this, args)
    /**
     * ob 即这个 Observer 实例，结构如下
     * {
     *   value:any,
     *   dep:Dep,
     *   vmCount:number
     * }
     */
    const ob = this.__ob__

    // 如果针对数组添加了一些新的元素
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 则将这些新添加的元素定义为响应式属性
    if (inserted) ob.observeArray(inserted)

    // 通知依赖发生了改变
    ob.dep.notify()
    // 返回结果
    return result
  })
})
