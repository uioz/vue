/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

/**
 * 初始化与渲染相关的方法与属性
 * @param {Object} vm Vue 实例或者组件实例
 */
export function initRender (vm: Component) {
  vm._vnode = null // 子树的根节点
  vm._staticTrees = null // 用于 v-once 指令的缓存树
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // 父节点树中的占位节点 对于一个纯粹的 Vue 实例来说变量的值是 undefined
  const renderContext = parentVnode && parentVnode.context // 对于一个纯粹的 Vue 实例来说变量的值是 undefined
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject
  // 将函数 createElement 绑定到vm实例上
  // 通过这样做可以获取一个含有渲染上下文的渲染函数
  // 参数顺序: tag, data, children, normalizationType, alwaysNormalize
  // 内置(编译器)的版本通过 template 编译成 render 函数
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // 规范化工具始终应用于公共版本(TODO 什么是公共版本?)，用于用户编写的呈现函数。 PS: 启用标志就是 true
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // 为了更加容易的创建 HOC(高阶组件) 需要 $attrs & $listeners 对外暴露
  // 它们必须是响应式的这样 HOC 使用它们的时候总是获取的是最新的内容
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    // 定义 $attrs 为不深度监听的响应式属性
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    // 定义 $listeners 为不深度监听的响应式属性
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export let currentRenderingInstance: Component | null = null

// for testing only
export function setCurrentRenderingInstance (vm: Component) {
  currentRenderingInstance = vm
}

export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  /**
   * _render 函数是 "将 ast 编译成的操作 vdom 函数生成结构的代码" 进行执行
   * 
   */
  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    const { render, _parentVnode } = vm.$options

    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    // 设置为父 vnode. 这允许渲染函数可以访问占位符节点上的数据.
    // TODO: 还不清楚这里的 "占位符" 指代的是什么.
    vm.$vnode = _parentVnode
    // render self
    // 开始渲染
    let vnode
    try {
      // There's no need to maintain a stack because all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      // 不需要再维护一个渲染堆栈, 因为所有的渲染函数都是彼此独立调用的.
      // 嵌套组件的渲染函数在父组件打补丁后调用.
      currentRenderingInstance = vm
      // render 是一个匿名函数, 其中使用了 this 关键字
      // 而 this 关键字实际上指向的就是 vm 实例
      // 而 _renderProxy 通过名字可以看出是一层代理
      // 这玩意儿本质访问的就是 vm 实例, 如果浏览器支持代理在 template 中访问不存在的值的时候
      // 会在控制台中提示错误, 否则就不提示
      // ps: 被执行的生成代码会调用诸如 _v _c _s ... 等方法这些方法可以前往
      // src\core\instance\render-helpers\index.js 中去寻找
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      handleError(e, vm, `render`)
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production' && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
        } catch (e) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      currentRenderingInstance = null
    }
    // if the returned array contains only a single node, allow it
    // 如果返回了一个长度为 1 的数组其中包含了一个元素, 允许它为 vnode
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0]
    }

    // return empty vnode in case the render function errored out
    // 当渲染过程中发生了错误返回一个空的节点
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }
    // set parent
    // 设置父节点
    vnode.parent = _parentVnode

    // 返回 vnode
    return vnode
  }
}
