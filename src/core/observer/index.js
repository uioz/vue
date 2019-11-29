/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

/**
 * 用于控制是否开启或者关闭 observing
 * @param {Boolean} value 值
 */
export function toggleObserving(value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 * 
 * Observer类会挂载到每一个被观察的对象身上, 一旦挂载, 原对象上的键(keys)会被转为对应名称的 getter/setter Vue 利用这些 getter/setter
 * 来实现依赖收集, 以及触发更新.
 * 
 * 总得来讲 Observer 工作环节如下 -- 就拿 data 来说:
 * 1. 为 data 挂载 __ob__ 属性
 * 2. 迭代 data 上的 key, 将其对应的属性通过 defineReactive 定义为响应式属性
 *   2.1 如果 key 下的内容是纯对象或者数组则利用对应的 key 获取 value 后创建 Observer (此处是递归)
 *   2.2 通过 Object.defineProperty 对对象上的属性定义 getter/setter 通过 getter 来进行依赖收集, 通过 setter 来派发更新
 * 
 * 
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {

    this.value = value
    this.dep = new Dep()
    this.vmCount = 0

    /**
     * Object.defineProperty 的简写方式, 通过 def 定义的属性, 在默认函数参数下是不可枚举的
     * @example 示例
     * const a = {
     *   b:10
     * }
     * 
     * def(a,'__ob__',this);
     * 
     * a === {
     *   b:10,
     *   __ob__:{
     *     value:a,
     *     dep:Dep,
     *     vmCount:0
     *   }
     * }
     * 
     * @example def 调用后的效果等同于
     * Object.defineProperty(value, '__ob__', {
     *   value,
     *   enumerable: false,
     *   writable: true,
     *   configurable: true
     * })
     */
    def(value, '__ob__', this)

    // 处理数组
    if (Array.isArray(value)) {
      // 判断所在环境中是否可以通过 __proto__ 去访问对象的原型链
      if (hasProto) {
        // 修改 value 对象的原型链, 令该对象的 __proto__ 为 arrayMethods
        // arrayMethods 是一个对象, 其 __proto__ 属性是 Array.prototype
        // 该对象上定义了一些 Array.prototype 中的同名方法这样在执行 Array.prototype 前会执行 arrayMethods 上的同名方法
        // 这样做的目的在于让这些方法具备触发通知修改的能力
        protoAugment(value, arrayMethods)
      } else {
        // 如果无法访问 __proto__ 则将 arrayMethods 上的实例方法定义到
        // 这个数组上作为数组的实例方法
        copyAugment(value, arrayMethods, arrayKeys)
      }

      // 迭代数组后将元素定义为响应式属性
      // observeArray 会为每一个元素上调用 observe 方法
      // 这样做的效果就是嵌套的元素都会被定义为响应式属性
      this.observeArray(value)
    } else {
      // 处理对象
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   * walk 方法遍历所有的键将其定义为响应式属性
   */
  walk(obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   * observeArray 方法监听给定数组的所有项目
   */
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 * 尝试建立给定对象的观察者实例借助于(Observer 类), 如果建立成功则返回这个对象, 如果传入的对象本身就是观察者实例那么会被直接返回.  
 * @param {any} value 要被监听的数据
 * @param {boolean} asRootData 数据是否是根级数据
 * @returns {Observer} 返回该数据对象的观察实例
 * 
 * @example 给定一个数据
 * const a = {
 *   b:{
 *     c:'hello world',
 *     '__ob__':{
 *       value:b,
 *       dep:Dep,
 *       vmCount:0
 *     }
 *   },
 *   '__ob__':{
 *     value:a,
 *     dep:Dep,
 *     vmCount:0
 *   }
 * }
 */
export function observe(value: any, asRootData: ?boolean): Observer | void {
  // 观察者函数不监听非 Object 以及 VNode 的子类
  if (!isObject(value) || value instanceof VNode) {
    return
  }

  // ob 是 Observer 的实例, 被观察的对象会以 __ob__ 的形式存在
  let ob: Observer | void

  // 根据 __ob__ 判断该对象是否已经被观察, 避免重复观测
  // 如果是的话获取 ob 对象, 在最后返回它
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve && // 该值表示是否允许观察该对象, 存在需要避免观察的特殊情况
    !isServerRendering() && // 不用于在服务端渲染, 在服务端渲染中响应式系统是不工作的
    (Array.isArray(value) || isPlainObject(value)) && // 对象是数组或者纯对象
    Object.isExtensible(value) && // 该对象是可被扩展的通过 Object.preventExtensions() Object.freeze() Object.seal() 处理的对象无法进行扩展
    !value._isVue // 对身上没有 _isVue 的标记, vm 实例存在这个标记, 为了避免观测 vm 本身
  ) {
    // 观测给定的对象
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * 将给定的对象上的键定义为响应式属性, 值得注意的是函数内部使用了 Object.defineProperty 通过闭包
 * 引用了对应属性的 dep(依赖收集) value(属性值) 以及如果属性的值是对象的话, 通过 childOb 来引用
 * 对应对象属性的 Observer 实例.
 * @param {Object} obj 要定义响应式属性的对象
 * @param {String} key 属性名称
 * @param {Any} val obj[key] 对应的值
 * @param {Function} customSetter 自定义 setter 函数
 * @param {Boolean} shallow 浅层监听
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {

  // 1. 创建一个依赖收集对象, 用于存储依赖
  const dep = new Dep()

  // 停止对定义了属性操作符 configurable:false 的属性进行创建响应式的操作
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // 获取已经定义了的 getter/setters 如果没有定义值为 undefined
  // 因为后面会重新定义 getter
  const getter = property && property.get
  const setter = property && property.set
  
  // 响应式属性不可以只定义 getter 而不定义 setter, 会导致后面 val === undefined 所以不会对 val 的内容监听
  // 只定义 getter 而不定义 setter 这意味着这个值是 writable:false 所以 vue 不对其进行观测
  // 但是如果一个属性既定义了 getter 又定义了 setter 为什么要对其进行观测呢
  // 因为后面我们通过 Object.defineProperty 重新为这个属性定义了 getter和setter
  // 重新定义后和定义前这个属性都有 getter/setter 这是符合属性创建的实际情况的
  // 所以需要监听其
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // shallow 表示浅层监听如果 shallow=falsy 则表示需要递归监听
  // 默认情况下 shallow = undfined 默认就是深度观测
  // 另外对于非对象以及数组来说这里返回的是 undefined
  // 对于对象或者数组来说这里返回的是目标观测对象的观测对象引用(也就是该 value 的 __ob__ 属性)
  let childOb = !shallow && observe(val)

  // 2. 通过 Object.defineProperty 给指定的属性定义 get 和 set 创建响应式属性
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    /**
     * get 拦截器主要进行依赖收集
     */
    get: function reactiveGetter() {
      // 1. 属性含有 getter 则调用 getter 来获取数据
      // 2. 反之获取原有的值 
      const value = getter ? getter.call(obj) : val
      // Dep.target 中存放的是需要被收集的函数
      // 需要被依赖收集的函数会挂载到 Dep.target 上
      // 而 Dep.target 是一个静态属性, 可以被所有的 Dep 实例引用到.  
      if (Dep.target) {
        // 收集依赖
        dep.depend()
        // 这个键对应的值如果也是可被观察的内容的话
        // 此处是一个 Observer 实例
        if (childOb) {
          // Observer 实例也有一个 dep 属性, 这里让 Observer 实例
          // 中的 dep 去收集依赖, 这样一来它就和当前闭包中的 dep 收集的依赖一样了
          // 之所以这样做是因为 Vue 没有能力去响应嵌套属性中发生的变化
          // 而 Vue.set 以及 Vue.delete 方法会利用这个 Observer.dep 去触发响应式更新
          // 如果 a.b 中的 b 发生了变化, a 的监听器是不会触发的, 通过 Vue.set(a,'b',any)
          // Vue.set 会使用 a.b.__ob__.dep 去派发更新, 让监听 a 的watcher 响应 a.b 发生的变化
          childOb.dep.depend()
          // 针对数组进行额外处理
          if (Array.isArray(value)) {
            // 递归数组元素, 让所有元素都持有这个依赖
            dependArray(value)
          }
        }
      }
      // 正确的返回 value 原有的值
      return value
    },
    /**
     * set 拦截器主要用来通知 "依赖" 数据已经改变
     */
    set: function reactiveSetter(newVal) {
      // 1. 属性含有 getter 则调用 getter 来获取数据
      // 2. 反之获取原有的值 
      const value = getter ? getter.call(obj) : val

      // 新值等于旧的值不通知依赖
      // 这里处理了 NaN 的情况, NaN 不等于自身, 所以将 NaN 赋值给 NaN 也是不会处理
      // 反之给非 NaN 的值赋值 NaN, 或者给 NaN 赋值非 NaN 的值是被允许的
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }

      // 如果给定了 customSetter 则执行它
      // Vue 在不允许修改的属性上使用了这个 getter, 例如 $props $attrs
      // 一旦修改这些数据, 就会在控制台中输出提示
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      
      // #7981: for accessor properties without setter
      // 如果这个属性在定义之初就没有定义 setter
      // 由于通过 Object.defineProperty 为其定义了 setter
      // 所以这里也不处理 setter 的后续执行, 来模拟初始定义的效果
      if (getter && !setter) return

      // 如果提供了 setter
      if (setter) {
        // 调用执行
        setter.call(obj, newVal)
      } else {
        // 闭包中的旧 val 等于新的值
        val = newVal
      }
      // 观察新加入的属性
      childOb = !shallow && observe(newVal)
      // 通知依赖收集
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * 当 Array 元素被访问到的时候去收集依赖,  
 * 因为我们无法拦截通过 getter 来拦截数组元素的访问
 * 这个函数的主要功能是将数组的依赖收集到 Observer.dep 中.
 * 因为数组通过索引修改内容 a[0] = 10 是无法触发响应式的, 通过将
 * 依赖收集到 Observer.dep 在通过 Vue.set 以及 Vue.delete 操作可以触发
 * 响应式更新
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
