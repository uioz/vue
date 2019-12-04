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
   * @param {function} cb 
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
      // 这一行代码非常关键因为这里会触发依赖收集, 这里涉及到两种情况
      /**
       * 1. watch compute 等用户指定的 Watcher
       * 2. render 函数
       */
      // 就那定义一个 watch 来说, 监听 'a.b.c'
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
    // 防止重复添加
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // TODO: 到这里为止
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
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
