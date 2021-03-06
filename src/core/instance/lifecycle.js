/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance
  activeInstance = vm
  return () => {
    activeInstance = prevActiveInstance
  }
}

export function initLifecycle (vm: Component) {
  const options = vm.$options

  // locate first non-abstract parent
  /**
   * 利用组件的$parent 引用链向上获取父组件
   * 一直到获取不到父组件或者父组件是抽象组件才会停止, 此时这个实例就是当前组件的 $root 挂载
   * 
   * 另外获取到的第一个父级的 $children 中 push 当前实例
   * 抽象组件就是那些不会被渲染的组件例如 keep-alive 或者 component
   */
  let parent = options.parent
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    parent.$children.push(vm)
  }

  vm.$parent = parent
  vm.$root = parent ? parent.$root : vm

  /**
   * 初始化一些变量
   */

  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    const prevEl = vm.$el
    // 在 vm 实例建立的过程中 _vnode 被标记为 null
    // 在首次更新的时候 vonde 的值为 null
    const prevVnode = vm._vnode
    const restoreActiveInstance = setActiveInstance(vm)
    vm._vnode = vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    // Vue.prototype.__patch__ 根据渲染所使用的后端在入口处注入.
    // 没有 preVnode (即没有旧的 vnode) 则说明这是首次渲染
    if (!prevVnode) {
      // initial render
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
    // update __vue__ reference
    // vnode 对应的元素会和 vnode 建立关联
    // 既然旧的元素已经消失则解除关联
    if (prevEl) {
      prevEl.__vue__ = null
    }
    // vnode 和新的 vm 建立关联
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    // 如果父级是一个 HOC, 对父级执行同样的操作
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
    // 更新钩子被执行器调用, 确保子组件的更新钩子再父更新钩子中调用
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    vm.__patch__(vm._vnode, null)
    // fire destroyed hook
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

/**
 * 挂载组件.
 * 挂载 vm.$el 属性为挂载点
 */
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  vm.$el = el
  // 这里要通过 render 函数来进行渲染
  // 如果未添加 render 则很有可能使用了 template
  // 在没有编译器的版本中, mountComponent 会在 vm.$mount 中直接调用 因为 template 已经被编译为了 render
  // 在含有编译器的版本中, mountComponent 执行前会将 template 转为 render
  if (!vm.$options.render) {
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /**
       * 在使用未包含编译器的 Vue 中  
       * 使用 template 则提示错误  
       * **注意**: 
       * 带有编译器(compiler)的版本是在部分方法的实现是不同的, 带有编译器的版本是不会走这个分支的  
       * 简单来讲在挂载前通过编译器将 template 转为了 render 函数.
       */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        // 由于 render 不存在无法继续执行
        // 而 render 可以通过编译 <template> 或者直接给定 render 函数
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }

  // 调用挂载前的钩子
  callHook(vm, 'beforeMount')

  let updateComponent
  // 这里的判断主要是为了非生产环境中向调试工具提供组件的渲染性能信息
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {

    updateComponent = () => {
      // name = 组件名词 id = 组件全局唯一 id(创建时自增产生)
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      // 通过 render 来获取 vnode 结构
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      // 通过 vnode 来更新 DOM
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => {
      // _render 通过调用 vm.$options.render 方法来创建 vnode 结构
      // 并且对 vnode 结构的生成进行优化
      // 而 update 则通过 vnode 结构来生成对应的 dom 结构
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // Watcher 将会向 updateComponent 函数进行求值
  // 而 updateComponent 执行的过程中将会触发依赖收集, 因为 updateComponent
  // 会执行 render 而 render 的执行上下文就是 vm(通过更改上下文的方式) 可以引用到 vm 上的响应式属性
  // 这里会向 vm._watcher 挂载这个 Watcher 实例, 在 Watcher 的构造函数执行过程中
  new Watcher(vm, updateComponent, noop, {
    // 数据改变后更新发生前 before 会被执行
    before () {
      // vm 已经挂载且没有销毁的情况下
      // 每次数据改变后, 更新发生前
      // 调用 beforeUpdate 钩子
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)

  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) {
    vm._isMounted = true
    callHook(vm, 'mounted')
  }

  return vm
}

/**
 * 功能就如同其名字一样 "更新子组件" 
 * 这个函数会在父组件重渲染时重渲染同一个子组件时候调用.  
 * 众所周知, 父组件的重新渲染会建立一份新的 VNode 结构, 而 VNode 上存在着组件所需要的数据(见函数参数)
 * 这个函数就是将这个新的 VNode 上的组件所需要的数据更新到 vm 实例上.
 */
export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

/**
 * 用于调用生命周期钩子
 * @param {Object} vm 
 * @param {String} hook 钩子的名称
 */
export function callHook (vm: Component, hook: string) {
  // #7573 触发生命周期钩子的时候禁用依赖收集
  pushTarget()
  // 获取 handlers 经过 mergeOptions 的处理后此时的钩子是数组, 例如使用过 mixins 后可以存在多个钩子
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  // 循环调用钩子
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      // 通过含有错误拦截的函数来执行钩子
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  // 事件是通过 $on 方法添加的
  // 如果监听器使用 HOOK($on('hook:beforeDestroy',listener)) 添加事件则 _hasHookEvent 为 true
  if (vm._hasHookEvent) {
    // 触发这些 Hook
    vm.$emit('hook:' + hook)
  }
  // 弹出
  popTarget()
}
