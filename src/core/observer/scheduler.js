/* @flow */

/**
 * 本文文件提供了一个队列, 用于优化数据改变触发的大量 Watcher
 * 在这个优化中将 Watcher 进行排队并且剔除了重复的 Watcher
 * 并且将 Watcher 的执行利用 nextTick 转为异步更新. 
 */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 * 重置 scheduler 的状态到初始状态
 * 1. 清空队列
 * 2. 重置变量
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  // 标记开始执行 Watcher 队列了
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  /**
   * 在执行前排序队列可以保证:
   * 1. 组件的更新是从父组件到子组件的. - 因为父组件总是先于子组件创建
   * 2. 在组件上由用户定义的 Watcher 要先于渲染函数. - 因为 Watcher 先于 render 创建
   * 3. 如果一个组件在他的父组件 Watcher 执行期间被销毁(Watcher 执行代码是存在副作用的). - 则这个组件的 Watcher 执行会被跳过
   */
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 不缓存 length 因为在我们执行已存在的 Watcher 的期间更多的 watcher 可能会被 push 到队列中
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]

    // 执行创建 watcher 时候提供的 before
    // 典型的当 render 执行前会触发 beforeUpdate 钩子
    // 如果是 render 函数那么 这里的 before 就是 beforeUpdate 钩子
    if (watcher.before) {
      watcher.before()
    }

    id = watcher.id
    has[id] = null
    // 最关键的代码, 对于用户定义的 Watcher 来说这里
    // 就是用户定义的回调的执行位置
    watcher.run()

    // in dev build, check and stop circular updates.
    // 在开发模式下检测是否存在无限循环的 Watcher 更新
    // 即在一个 Watcher 中修改了会触发这个 Watcher 本身的属性
    // 而且没有中断条件, 那么这个 Watcher 将会无限执行下去
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  // 在重置状态前保留它们的拷贝用于发布队列
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 重置Watcher queue状态
  resetSchedulerState()

  // call component updated and activated hooks
  // 调用组件的 updated 钩子和 activated(keep-alive) 钩子
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 * 将 watcher 推入 watcher 队列,
 * 拥有重复 id 的 watcher 会被跳过添加,
 * 除非队列已经被消耗完毕
 */
export function queueWatcher (watcher: Watcher) {

  const id = watcher.id

  // 如果一个 Watcher 已经执行过了 has[id] === null
  // 如果一个 Watcher 还为存在于队列中 has[id] === undefined
  // 这个分支支持上述的两种判断, 所以进入这个分支的 Watcher 不存在重复
  if (has[id] == null) {

    has[id] = true

    // Watcher 的添加都是密集的, 什么意思
    // 考虑一下什么时候会导致 Watcher 执行
    // 一定是依赖被修改的时候, 一个响应式属性
    // 的变化会导致相关联许多 Watcher 都需要执行
    // Vue 修改响应式属性一般集中在 methods 中或者 render(template) 中
    // 一般来讲修改的属性数量都不多, 但是代码是同步执行的
    // 这些属性关联的 Watcher 都会被添加到队列中
    // 也就是这里, 如果目前不在 异步刷新队列 任务中
    // 这些不重复的 Watcher 会被添加到队列中等待异步刷新执行
    if (!flushing) {
      queue.push(watcher)
    } else {
      // 如果在 异步刷新队列 任务中走到了这个分支
      // 说明这个 Watcher 的更新原因是
      // 执行 Watcher 的过程中产生了副作用修改了响应式属性, 导致新的 Watcher 被触发
      // 这些新的 Watcher 也要被添加到 Watcher 队列中等待执行
      // 既然当前就在刷新 Watcher 队列的过程中我们完全没有必要
      // 让这些 Watcher 在下一次 nextTick 中执行
      // 所以 Vue 在此处做了优化, 让这个 Watcher 插入到队列中
      // Watcher 在创建的时候根据创建的时间不同会产生一个自增的 id
      // 先创建的 Watcher 的 id 都比较小, 而后创建的都比较大
      // 也就是说父组件要比子组件的值要小
      // 数组是从小到大排序的
      // 这里为新的 Watcher 找到自己的位置然后把它插入
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }

    // 是不是在等待浏览器异步更新 Watcher 队列
    // 不是, 那么赶紧要求浏览器更新异步任务队列
    // 因为我们有任务了!
    if (!waiting) {
      // 正在等待浏览器异步更新 Watcher 
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }

      // 异步执行 flushSchedulerQueue 函数
      // 所以接下来的代码还都是同步执行的
      // 直到同步调用栈清空那么 flushSchedulerQueue 会被调用
      nextTick(flushSchedulerQueue)
    }
  }
}
