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
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {
    // 初始化赋值
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0

    /**
     * Object.defineProperty 的简写方式, 通过 def 定义的属性
     * 在默认的情况下是不可枚举的
     * @example 效果
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
     * @example 等同于
     * Object.defineProperty(value, '__ob__', {
     *   value,
     *   enumerable: false,
     *   writable: true,
     *   configurable: true
     * })
     */
    def(value, '__ob__', this)

    // 数组和对象的处理方式不同
    if (Array.isArray(value)) {
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
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
      // 定义属性为响应式属性
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
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
 * @param {any} value 要被监听的数据
 * @param {boolean} asRootData 数据是否是根级数据
 * @returns {Observer} 返回该数据对象的观察实例
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
 * 在一个对象上定义一个响应式属性
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

  // 1. 创建一个观察对象
  const dep = new Dep()

  // 停止对定义了属性操作符 configurable:false 的属性进行创建响应式的操作
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // 获取已经定义了的 getter/setters 如果没有定义值为 false
  const getter = property && property.get
  const setter = property && property.set
  
  // 有 getter 没有 setter 以及调用参数只有两个(observe.walk() 进入的此方法就是这种情况)
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // shallow 表示浅层监听如果 shallow=false 则表示需要递归监听
  let childOb = !shallow && observe(val)

  // 2. 通过 Object.defineProperty 给指定的属性定义 get 和 set 创建响应式属性
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
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
