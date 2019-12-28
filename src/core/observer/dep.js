/* @flow */

import type Watcher from './watcher'
// reomve 从数组中移除指定下标的内容
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * 
 * Dep 对象是一个可观测对象, 可以有多个指令订阅它.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }

  /**
   * 添加订阅
   * @param {*} sub 
   */
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  /**
   * 移除订阅的 Watcher
   */
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    // 在非生产模式下且使用了 vue.config.async = true 默认 false
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      // 在默认的情况下 Watcher 是异步执行的借助于 flushSchedulerQueue 函数, 该函数中
      // 在执行前也对 Watcher 进行了排序以确保 Watcher 的执行顺序和定义时一致
      // config.async=true 表示要同步执行, 我们不在利用 flushSchedulerQueue 函数
      // 所以这里我们进行手动排序
      subs.sort((a, b) => a.id - b.id)
    }
    // 循环 subs 执行其中的 Watcher 的 update 方法
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.

// 当前的 watcher 是已经被求值的.
// 它是全局唯一的因为在同一时刻只有一个watcher可以被求值.
Dep.target = null
const targetStack = []

export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
