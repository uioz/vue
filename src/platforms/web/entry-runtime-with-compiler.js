/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

/**
 * runtime/index 版本是不包含编译器的完整 Vue, 已经有了 Vue.prototype.$mount 方法了
 * 本文件(含有编译器版本)通过 mount 引用原有的挂载方法用于实际挂载, 然后重新定义一个
 * 含有编译功能的 $mount 方法.  
 * 调用后 vm.$options 会添加:
 *  - render
 *  - staticRenderFns
 * 就相当于在 new Vue() 是添加了 render
 */
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 注意后文中的 el 都是 element
  el = el && query(el)

  /* istanbul ignore if */
  // 禁止将 Vue 挂载到 <body> 和 <html> 元素上
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 解析 template/el 然后将其转为 render 函数
  if (!options.render) {
    let template = options.template
    // 如果提供了 new Vue({template:'xxxx'})
    if (template) {
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') { // 解析 X-Template
          /**
           * @example
           * new Vue({
          *   tmeplate: '#root' // X-Template
           * })
           */
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) { // 解析 element
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 获取 el 的父元素, 没有就创建一个包裹返回
      // TODO: 待证实, 用于 SSR , 因为此时 HTML 就是 template
      template = getOuterHTML(el)
    }
    if (template) {
      /* istanbul ignore if */
      // 用于记录编译性能
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      /**
       * 利用模板来进行渲染
       * **注意**: template 目前可能的类型有 string element
       * 返回两个渲染函数, render 就是标准的渲染函数
       * staticRenderFns 值渲染静态部分, 也就是说结果中不包含 v-if 这种动态的内容
       * 该函数的位置在 src\compiler\to-function.js 中
       */
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines, // 当模板字符串中的元素属性含有换行时, ie 会错误解析换行为 HTML编码的换行符号
        shouldDecodeNewlinesForHref, // 当模板字符串中的 <a href="" > 属性含有空格时, chrome 会错误解析换行为 HTML编码的换行符号
        delimiters: options.delimiters, // 改变纯文本插入分隔符。
        comments: options.comments // 当设为 true 时，将会保留且渲染模板中的 HTML 注释。默认行为是舍弃它们。
      }, this)

      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
