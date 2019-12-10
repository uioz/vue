/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  /**
   * 
   * @param {Vue} vm Vue 实例
   * @param {string|function} expOrFn 表达式或者函数
   * @param {function} cb 就是 watch api 中提供的回调函数(或者是 handler) 当数据改变后会被调用
   * @param {object} options 
   * @param {boolean} isRenderWatcher 用于渲染函数的 Watcher?
   */
  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {

    this.vm = vm

    if (isRenderWatcher) {
      vm._watcher = this
    }

    vm._watchers.push(this)
    // 将函数选项转为内部成员变量
    if (options) {
      this.deep = !!options.deep // 是否启动深度观测
      this.user = !!options.user // (Watcher)是否由用户定义
      this.lazy = !!options.lazy // computed 惰性求值
      this.sync = !!options.sync // 数据发生变化同步求值且执行回调
      this.before = options.before // 数据变化后更新前的会调用这个钩子
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }

    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true // Watcher 是否激活
    this.dirty = this.lazy // for lazy watchers

    // 存放收集到的依赖
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    // 获取表达式
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''

    // parse expression for getter
    // 如果 expOrFn 是函数 getter 就是 expOrFn
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 反之返回一个闭包函数, 这个函数接收一个对象, 调用后会返回给定路径的内容
      this.getter = parsePath(expOrFn)
      // 路径解析错误说明该路径不是正确的对象路径
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }

    }
    // 简单理解如果是计算属性默认 undefined 反之获取值
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {

    // 调用该函数会将当前的 Watcher 压入到 targetStack 栈中
    // 并且挂载到 Dep.target 作为静态属性
    // 这意味者 Dep 的所有实例都可以引用到 Dep.target
    pushTarget(this)

    let value
    const vm = this.vm

    try {
      // 对 getter 进行切换上下文的调用并传入 vm 本身作为第一个参数
      // 这一行代码非常关键因为这里会触发依赖收集
      // 对于 watch API 来说, 监听 'a.b.c'
      // getter 存放的闭包会进行迭代获取对象属性直到获取到属性 c
      // 先获取 a 在获取 b 在获取 c 就会让 a b c 这个三个属性都进行依赖收集, 收集这个 Watcher
      // 不要忘记了这会触发响应式属性上的 getter 然后进行依赖收集
      // 一定要去看 defineReactive 上的操作这里调用后会执行该函数中定义的 getter 中的代码
      value = this.getter.call(vm, vm)

    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {

      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 如果提供了 deep 选项
      // 那么针对这个属性进行递归
      // 让这个属性下的所有子节点孙节点都收集到依赖
      if (this.deep) {
        traverse(value)
      }

      // 将 Wacher 从 Dep.target 上移除
      // 这样一来这个 Watcher 就不会被继续收集
      popTarget()
      // 
      this.cleanupDeps()
    }
    
    return value
  }

  /**
   * Add a dependency to this directive.
   * 该方法会 Dep 类的实例进行添加到本 Watcher 内部
   * 当然不会重复添加, 每一个 Dep 都有自己的唯一 id
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 防止重复添加 dep 
    // 实际上是避免了重复收集同一个依赖
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // addDep 方法实际上是被 dep 所调用的
      // Watcher 建立将自己挂载到 Dep.target 上
      // 然后 Watcher 会读取要监听属性
      // 或者执行 render 在这个过程中会触碰到响应式属性
      // 从而让触碰到的这些属性对应的 Dep 却收集这个 Watcher
      // 而 Dep 会将 Dep 放入 Watcher 中, 这个步骤称为依赖收集
      // Watcher 会将 Watcher 放入 Dep 中, 这个步骤称为订阅
      // 当 Dep 所对应的属性被修改后让 Dep 去迭代执行 Dep
      // 关联的所有 Watcher
      // 当数据改变后 -> 通知 Watcher -> Dep.target = Watcher -> 调用 render -> 渲染函数读取响应式属性 -> 触发 getter 
      // Dep 去收集依赖 -> 执行这个方法 -> 在这里发现这里已经存储对应 ID 的 Dep 了
      // 跳过多余的订阅
      if (!this.depIds.has(id)) {
        // 向 dep 中添加订阅
        // 不要忘记了订阅是如何触发的
        // 当响应式修改的时候通过 setter
        // 会执行 dep 的 notify 后会调用存储在 dep 中的 Watcher
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    // 将在 get 方法执行后新收集到的 Dep
    // 于在 get 方法调用之前收集到的 Dep 进行比较
    // 将在 deps 中存在但是不存在于 newDeps 中的 Dep 进行与当前 Watcher 的解绑
    // newDeps 中存在的 Dep 是比 deps 中的多还是少呢?
    // 答案是, 可能多也可能少, 我们的目的是 收集新的依赖以及移除不需要的依赖
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }

    // newDepIds 赋值给 depIds
    // 原有的 depIds 是一个 set
    // 清空后指向 newDepIds
    // 这里完成一个新老 dep 的交换
    // 真是一点性能都不浪费, 不知道函数开销与新开辟一片内存区域那个大
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    // 清空 newDepIds
    this.newDepIds.clear()

    // 三方交换
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    // 清空数组
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * 这个方法会在依赖被修改后调用
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) { // 惰性求值
      this.dirty = true
    } else if (this.sync) {
      // 是否同步执行(普通的 Watcher 都是同步执行的)
      // render 函数是异步执行的
      this.run()
    } else {
      // 将 Watcher 放入响应式任务队列
      // 这个队列全局唯一
      // 主要目的是将 Watcher 排队后 统一执行
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   * 该方法调用后会调用 Watcher, 他被任务调度器使用.
   */
  run () {
    // 如果 Watcher 是激活的状态
    if (this.active) {
      // 
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
