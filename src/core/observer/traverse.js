/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 * 递归遍历给定的被观察的对象，触发所有属性的 getter，那么这个对象上的
 * 所有响应式属性都会将这个 Watcher 进行依赖收集. 
 */
export function traverse (val: any) {
  // 递归依赖收集
  _traverse(val, seenObjects)
  // 清空由 Dep.id 组成的 Set
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  // 1. 不是数组或者不是对象
  // 2. 被 Fronzen
  // 3. 是 VNode
  // 停止执行
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  // 如果对象存在 __ob__ 属性说明该对象被观测
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    // 如果这个 id 已经出现过了说明该 Dep 中已经进行了依赖收集(下个代码块中存在对应的逻辑)
    if (seen.has(depId)) {
      return
    }
    // 添加 id 防止重复
    seen.add(depId)
  }
  // 重头戏来了 这里的 _traverse(val[i], seen)
  // 获取了观测对象 getter 那么此时就会收集 Dep.target 上的 Watcher
  // 而且这里进行了递归调用
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    // 同样的方式进行迭代对象
    // 同样的通过 _traverse(val[keys[i]], seen) 来触发观测对象上
    // 响应式属性的 getter 进行 Dep.target 上的 Watcher
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
