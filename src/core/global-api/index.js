/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // 定义配置对象
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // 对外暴露一些工具函数, 这些函数在内部被 Vue 使用
  // 但是不是通过 Vue.util.xxx 的方式进行调用
  // 避免依赖这些工具, 因为它们可以重新修改
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // 定义 Vue 上的 set delete 和 nextTick
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // Vue 2.6+ 提供的 observable api
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  // options 保存那些需要被全局注册的内容
  Vue.options = Object.create(null)
  // 这个列表中向 options 挂载了 component directive filter 三个属性
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // 将原始的构造函数挂载到 options 上
  // 用于 Vue 内部使用
  Vue.options._base = Vue

  // 这个 extend 功能类似于 assign 将右侧对象使用 in 操作符
  // 进行遍历拷贝到左侧的对象上
  // 将内置的组件 keep-alive 拷贝到全局组件上
  extend(Vue.options.components, builtInComponents)

  // 添加 Vue.use 属性
  initUse(Vue)
  // 添加 Vue.mixin 属性
  initMixin(Vue)
  // 添加 Vue.extend 属性
  initExtend(Vue)
  // 将 Vue 上 component directive filter 三个属性代理到上的同名 Vue.options 方法
  initAssetRegisters(Vue)
}
