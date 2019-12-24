/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

/**
 * 负责 Vue 实例上有关 状态数据(data)的初始化
 * @param {Object} vm 
 */
export function initState(vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  // 如果存在 props 则初始化 props
  if (opts.props) initProps(vm, opts.props)
  // 如果存在 methods 则初始化 methods
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else { // 如果 data 不存在则跳过了上个分支中不必要的检测, 直接监听 data
    observe(vm._data = {}, true /* asRootData */)
  }
  // 如果存在 computed 则初始化它
  if (opts.computed) initComputed(vm, opts.computed)
  // 如果存在 watch 则初始化它
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

/**
 * 
 * @param {Object} vm 
 * @param {Object} propsOptions 
 */
function initProps(vm: Component, propsOptions: Object) {
  // 获取用于测试的 propsData
  const propsData = vm.$options.propsData || {}
  // 获取 props, 注意数组类型的 props 在通过 mergeOptions 后变为对象类型
  const props = vm._props = {}
  // 缓存 prop 的键, 在随后的执行中便于迭代使用, 用于替代 Object.keys 动态获取.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

/**
 * 用于初始化 data
 * @example 实例格式
 * new Vue({
 *   data:{
 *     xxx:'xxx'
 *   }
 * })
 * @example 组件格式
 * Vue.component('name',{
 *   data(){
 *     return {
 *       xxx:'xxx'
 *     }
 *   }
 * })
 */
function initData(vm: Component) {
  let data = vm.$options.data
  // 获取 data 中的值,如果传入了data 则此时的data 经过了 mergeOptions 变成了函数
  // 为了防止在 beforeCreate 中修改了 vm.$options.data 所以这里继续判断函数然后获取结果
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}

  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }

  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    // data 和 methods 重名警告
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    // data 和 props 重名警告
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )

    } else if (!isReserved(key)) { // 不是 $ 和 _ 开头
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  observe(data, true /* asRootData */)
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 在初始化期间停止依赖收集, 避免触发多次更新
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

/**
 * 用于初始化计算属性, 利用给定的 vm 实例和给定的计算属性
 * 这里特殊提示一下, 请牢记:
 * 用户提供计算属性就是一个 getter 一个特殊的 getter.  
 * 为什么特殊, 因为和 data 上的属性不同它是函数, 函数中可以利用上下文来引用其他的响应式属性.
 * 而计算属性这个功能的根本目的就是定义一个 getter, 这个 getter 具有一些独到的优化理念请思考:
 * 1. 由于可以引用其他的响应式属性, 如果其他的响应式属性被修改, 让这个 getter 自动计算新的值
 * 2. 计算属性只在必要的时候求值(只在被需要使用的时候), 其余的时候不需要立即求值
 */
function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  // 在 SSR 期间 computed 是立即计算 getters
  const isSSR = isServerRendering()

  // 迭代 computed
  for (const key in computed) {
    const userDef = computed[key]
    /**
     * 不要忘了, getter 不仅仅可以是函数, 还可以是下方的代码:
     * @example
     * {
     *   get(){},
     *   set(){}
     * }
     */
    const getter = typeof userDef === 'function' ? userDef : userDef.get

    // 如果没有提供可以执行的函数则提示错误
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    // 在非 SSR 的情况下, 将 computed 上的每一个初始化完成的属性
    // 添加到 vm._computedWatchers 上
    // 在 SSR 的情况下 Watcher 是不会执行的, 因为 SSR 只会渲染组件部分状态去渲染一个 HTML 快照
    // 响应式系统根本没有初始化的必要
    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 计算属性在 vm 实例上是唯一的
    // 如果存在重名则不会进行初始化
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()

  // 计算属性是函数分支
  if (typeof userDef === 'function') {
    // 在服务端渲染下 shouldCache 为 false 反之为 true
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key) // 返回的是具有缓存的闭包函数
      : createGetterInvoker(userDef) // 返回的是无缓存执行的闭包函数
    sharedPropertyDefinition.set = noop
  } else {
    // 计算属性是 get 函数分支
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }

  // 如果计算属性提供 get 函数但是不没有提供 set 函数
  // 当给计算属性赋值的时候提示 set 不存在
  if (process.env.NODE_ENV !== 'production' &&
    sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }

  // 计算属性以
  // getter/setter 的方式被定义到 vm 实例身上
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter(key) {
  // computedGetter 实际上被置换为计算属性真正的 getter
  // 在这个函数中你可以看到缓存的处理

  /**
   * 请试想一下你在 render 函数中使用了计算属性
   * 计算属性在 render 中被读取对应的 getter 被执行
   * 也就是这个函数, 每一个计算属性都有对应的一个针对计算属性创建的 Watcher
   * 这个 Watcher.evaluate 被调用进行了求值, 实际上执行的是这个 Watcher.get 方法
   * 而 Watcher.get 中存储的是计算属性上定义的函数, 函数执行, 会有如下的情况:
   * 1. 这个函数引用了其他的计算属性或者响应式属性
   *   其他的响应式属性会订阅这个 Watcher 后返回对应的属性值
   *   当被依赖的响应式属性变化的时候会触发这个 Watcher
   *   
   * 2. 没有引用任何响应式属性
   *   直接返回
   */
  return function computedGetter() {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      
      /**
       * 关键字: 脏检查(脏数据检查). 
       * 理解这里请牢记几个原则:
       * 计算属性是惰性求值的, 依赖的响应式属性值虽然发生了变化, 但是计算属性并不一定立即计算
       * 当计算属性求值的时候如果数据发生了变化这里的 dirty 会发生变化, 那么说明依赖的数据发生了变化
       * 需要重新求值此时的 dirty 为 true, 当然求完值以后 dirty 就变成了 false
       */
      if (watcher.dirty) {
        watcher.evaluate()
      }
      
      // TODO: 待证实
      // 计算属性本身不是响应式属性, 但是可以被 Watcher 进行观察
      // 如何做到呢? 很简单如果计算属性依赖的响应式属性去收集 "观察计算属性的 Watcher"
      // 那么当依赖的数据发生变化, 对应的 Watcher 会被触发, 从而让计算属性重新计算
      if (Dep.target) {
        watcher.depend()
      }
      
      // 计算出的值会被缓存在 Watcher 上面, 这里就返回好了在 evaluate 方法中会获取最新的计算值
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this)
  }
}

function initMethods(vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

/**
 * 此处的 watch 就是初始化实例时候使用的 watch 属性
 */
function initWatch(vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    // TODO 待证实
    // 如果组件使用了 extend 或者 mixin
    // 该组件经过 mergeOptions 后同名的 watch 可能是个数组
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

/**
 * 负责处理 initWatcher 以及 用户添加的 Watcher, 即下方例子中的对象:
 * @example
 * Vue.$watch('a.b',{
 *   immediate:true,
 *   handler(){},
 *   deep:true
 * })
 */
function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  /**
   * 目的是从 methods 上取出一个同名方法
   * 来当作 handler
   * @example
   * new Vue({
   *   watch:{
   *     name:'hello'
   *   },
   *   methods:{
   *     hello(){}
   *   }
   * })
   */
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  // 取出关键的参数利用 vm.$watch 来创建监听
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin(Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // set 函数以及 del 函数
  // 用于向响应式对象添加以及删除内容
  // 确保修改可以触发响应式更新
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  /**
   * $watch 方法 相信大家都不陌生
   * $watch 方法接收多种类型的参数组合.  
   * 但是总的来说这个方法会将给定的参数进行处理
   * 然后交由 Watcher 类作为构造函数的参数使用
   */
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {

    const vm: Component = this

    /**
     * $watch()
     */
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }

    options = options || {}
    // 标记为用户定义的 Watcher
    // 用户定义的 Watcher 会有错误提示
    options.user = true

    // 利用给定的参数创建一个 Watcher
    const watcher = new Watcher(vm, expOrFn, cb, options)

    // 如果提供了 immediate
    // 说明要求在建立监听的同时
    // 就要触发一次回调
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }

    // $watch 返回一个钩子
    // 调用后销毁 Watcher
    // 这里返回一个函数闭包中调用了 Watcher 的 teardown 方法
    return function unwatchFn() {
      watcher.teardown()
    }
  }
}
