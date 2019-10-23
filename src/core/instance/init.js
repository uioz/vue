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
     * 初始化状态, 主要负责:
     * 挂载 vm._watchers 为后续的 Watcher 的保存做准备
     * 
     * 1. props 初始化, props中的 default和校验函数在此时执行
     *   1.1 执行后获取到的值赋作为属性挂载到 vm._props 上
     *   1.2 props 初始化成功的属性定位为响应式属性
     *   1.3 为 vm 添加一层拦截, 允许使用 this.xxx 来获取 props 上的key.
     * 2. methods 初始化, 检测 methods 是否为 function
     *   2.1 检测methods 是否与 props 保留关键字重名
     *   2.2 绑定函数执行上下文为 vm
     * 3. data 的初始化
     *   3.1 如果 data 是工厂模式, 使用 vm 作为上下文调用后获取结果
     *   3.2 拿到计算完成的 data 挂载到 vm._data 上
     *   3.3 如果 data 不是 object 抛出错误
     *   3.4 和 methods 或者 props 或者保留关键字重名警告
     *   3.5 为 vm 添加一层拦截, 允许使用 this.xxx 来获取 data
     *   4.6 对 data(vm._data) 执行 observe()
     * 4. computed 的初始化, 向vm添加 vm._computedWatchers 用于挂载初始化完成的 computed
     *   4.1 非 SSR 的情况下, 为每一个 computed 属性通过 Watcher 包装并将结果挂载到 _computedWatchers 上
     *   4.2 通过 defineComputed 允许通过 this.xxx 来获取数据
     *     4.2.1 SSR 模式下 computed 会直接获取数据
     *     4.2.2 非 SSR 模式下, computed 会利用 Watcher 进行缓存处理
     * 5. watcher 的初始化, 遍历 watch 对其属性调用 vm.$watch 建立包装
     *   5.1 如果 watch 传入的是对象格式且包含 immediate 则会在初始化 Watcher 后立即调用 handler 一次
     */
    initState(vm)
    /**
     * 也就是说 vue 实例来说都是先处理 inject 后才处理 Provide
     * 挂载 vm._provided 其值为 Provide 提供的最终内容 (Provide 可以是函数)
     */
    initProvide(vm) // resolve provide after data/props
    /**
     * 挂载 vm._data 其值为最终计算后的 data (data可以是函数)
     */
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

    /**
     * @example 在下列情况下执行
     * new Vue({
     *   el:'#root'
     * })
     */
    if (vm.$options.el) {
      // 不要忘记了这个函数实在运行时调用的
      // 而 vm.$mount 是通过外部包装添加的  
      // 根据构建目标的不同实现也不同, 例如在 runtime 版本(src\platforms\web\runtime\index.js)中  
      // 没有编译器, 创建Vue实例参数中传入 template 会报错, 而在含有编译器版本中
      // vm.$mount 前会将 template 编译成 render 函数
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
