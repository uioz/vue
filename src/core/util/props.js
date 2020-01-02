/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

/**
 * validateProp 会在 prop 初始化以及
 * 不要忘记了 props 是会变化的, 
 * 变化后依然使用需要校验, 此时调用的就是这个函数 
 */
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {

  // key 对应的校验对象
  // 我把它称为 prop声明(后文中会使用到)
  const prop = propOptions[key]
  // key 所对应的数据是否未被传入
  // true 表示仅仅声明了 key 的格式
  // 但是在初始化的过程中并未为其传递数据
  const absent = !hasOwn(propsData, key)
  let value = propsData[key]

  // boolean casting
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  // prop.type 中是否存在 boolean 类型
  if (booleanIndex > -1) {
    // 1. 没有向 props 传入数据
    // 2. 没有给定默认值
    if (absent && !hasOwn(prop, 'default')) {
      // 给定默认值 false
      value = false
      // 在 html 中 <div props="props" > 以及 <div props="" > 以及 <div props >
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      const stringIndex = getTypeIndex(String, prop.type)
      // 但是如果类型校验是一个数组且 Boolean 在 String 前面
      // 则默认值是 true 反之就是空串
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }

  // value 保存的是 props 传入的值
  // 如果没有传入则 value 值为 undefined
  // 此时来通过 prop声明 获取默认值
  if (value === undefined) {
    // 这个函数会获取默认值
    // 也就是 prop声明 上定义的默认函数
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    // 不要忘记了此时 shouldObserve 可能是 false
    // 但是我们需要为 value 建立观察
    // 所以预先缓存之前的状态
    const prevShouldObserve = shouldObserve
    // 然后允许观察
    toggleObserving(true)
    // 观察这个对象
    observe(value)
    // 切换回原来的状态
    toggleObserving(prevShouldObserve)
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    assertProp(prop, key, value, vm, absent)
  }

  // 将建立观察的值返回
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 */
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // 如果 prop 声明了 required
  // 又没有传入其他值
  // 提示错误
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  // undefined 或者 null
  // 直接返回没有校验的必要
  if (value == null && !prop.required) {
    return
  }


  let type = prop.type
  // valid = value是否合法 true 合法 false 不合法
  // type=true 表示不需要校验, 同时 vaild 默认合法
  let valid = !type || type === true
  const expectedTypes = []
  // 根据类型进行校验
  if (type) {
    // 如果 type 是非数组例如 Number String
    // 转为数组
    if (!Array.isArray(type)) {
      type = [type]
    }
    for (let i = 0; i < type.length && !valid; i++) {
      // 判断给定的 value 是否符合 type 期待的类型
      const assertedType = assertType(value, type[i])
      // 收集返回的错误类型
      // 当验证失败的时候提示用户 value 的类型不在期待类型中
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }
  // 不合法的参数进行提示
  if (!valid) {
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }
  // 执行用户自定义的校验函数
  const validator = prop.validator
  if (validator) {
    // 如果不合法就提示错误
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 * 
 * 在不同的 JavaScript 运行环境中构造函数的地址不同所以简单的
 * 相等性判断会失效这里将函数转为字符串确保后续的比较准确无误
 */
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex (type, expectedTypes): number {
  // 不是数组 [Number,String] 由构造函数组成的数组
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  // 如果是 [Number,String] 这种类型的属性
  // 尝试进行类型判断, 只要 type 和和期待的类型
  // 存在匹配就返回类型所对应的数组下标
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (expectedTypes.length === 1 &&
      isExplicable(expectedType) &&
      !isBoolean(expectedType, receivedType)) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable (value) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
