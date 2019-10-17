/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // 全局唯一组件标识
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      /**
       * 用来记录开发模式下标记组件创建时间
       */
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // 一个防止vm实例自身被响应式数据监听的 flag
    vm._isVue = true

    /**
     * TODO 待证实
     * 合并组件配置, 子组件和父组件, 继承,混入
     */
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // 将全局 Vue 构造函数上的 options 和传入的 options 进行合并
      /**
       * Vue 实例选项和 Vue 构造函数配置进行合并
       */
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor), // resolveConstructorOptions 处理了使用了 extends 情况下的 options
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      /**
       * 在开发模式下 提供一层数据代理 
       * 当访问 vm 上的属性时候, 如果数据不存在或者语法错误, 会提示错误
       */
      initProxy(vm)
    } else {
      /**
       * 非开发模式下不存在错误提示这层代理也就没有了
       */
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    // 初始化与生命周期有关的内容
    initLifecycle(vm)
    // 初始化事件有关的内容
    initEvents(vm)
    /**
     * 初始化渲染, 主要向 vm 实例挂载了如下功能:
     * 1. $slots
     * 2. $scopedSlots
     * 3. _c TODO 等待证明 渲染
     * 4. $createElement TODO 等待证明 渲染(含有格式化校验用于用户编写的 render 的情况)
     * 5. 定义 $attrs 和 $listeners 属性为响应式属性, 分为开发模式和生产模式两种(开发模式有错误提示)
     */
    initRender(vm)
    /**
     * 调用 beforeCreate 钩子, 此时 vnode 未建立, 响应式未创建
     * Event 和 lifeCycle 已经创建完成
     */
    callHook(vm, 'beforeCreate')
    /**
     * 初始化注入 主要将 inject 和 provide 进行关联
     */
    initInjections(vm) // resolve injections before data/props
    /**
     * 负责 Vue 实例上有关 状态数据(data)的初始化
     * 挂载了 vm._watchers
     */
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      /**
       * 用来标记开发模式下组件创建完成时间
       */
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  /**
   * TODO 待验证
   * 使用 Vue.extends 或者添加 extends 选项的时候, 父元素中会存在 super 属性, 所以常见的 Vue 实例不会走这个环节
   * if 内部的代码目的是合并父类的 options 和 子类的 options
   */
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
