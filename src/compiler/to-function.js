/* @flow */

import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'
import { generateCodeFrame } from './codeframe'

type CompiledFunctionResult = {
  render: Function;
  staticRenderFns: Array<Function>;
};

function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    errors.push({ err, code })
    return noop
  }
}

// compileToFunctions 含义为 "编译器转为渲染函数"
// createCompileToFunctionFn 含义为 "创建编译器转为渲染函数"
// 所以这个函数返回 compileToFunctions, 而 createCompileToFunctionFn 的作用仅仅是参数柯里化
export function createCompileToFunctionFn (compile: Function): Function {
  const cache = Object.create(null)

  // 这个函数实际上就是 Web 端将 template 编译为 render 的本体
  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {

    options = extend({}, options)

    const warn = options.warn || baseWarn
    delete options.warn

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction
      // 检测是否存在 CSP(内容安全策略) 限制
      // CSP 可以禁止页面执行不安全的代码, 而 Vue 正是利用这点进行编译的
      try {
        new Function('return 1')
      } catch (e) {
        if (e.toString().match(/unsafe-eval|CSP/)) {
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
            'environment with Content Security Policy that prohibits unsafe-eval. ' +
            'The template compiler cannot work in this environment. Consider ' +
            'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
            'templates into render functions.'
          )
        }
      }
    }

    // check cache
    // 检测是否存在缓存
    // 如果提供了 delimiters  see https://cn.vuejs.org/v2/api/#delimiters
    // 则将 delimiters 和 template 结合起来作为键名
    // 用于在 cache 中去重
    const key = options.delimiters
      ? String(options.delimiters) + template
      : template
    // 返回缓存的内容(如果缓存中存在内容)
    if (cache[key]) {
      return cache[key]
    }
    
    // 对于 web 平台来说等同于执行 compile->baseCompile 函数调用
    const compiled = compile(template, options)

    // 在 compile 函数中迭代了编译出的 ast 节点
    // 找出语法问题或者提示后挂载到了 compiled.erros 和 compiled.tips 上
    if (process.env.NODE_ENV !== 'production') {
      if (compiled.errors && compiled.errors.length) {
        if (options.outputSourceRange) {
          compiled.errors.forEach(e => {
            warn(
              `Error compiling template:\n\n${e.msg}\n\n` +
              generateCodeFrame(template, e.start, e.end),
              vm
            )
          })
        } else {
          warn(
            `Error compiling template:\n\n${template}\n\n` +
            compiled.errors.map(e => `- ${e}`).join('\n') + '\n',
            vm
          )
        }
      }
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach(e => tip(e.msg, vm))
        } else {
          compiled.tips.forEach(msg => tip(msg, vm))
        }
      }
    }

    // turn code into functions
    // 将编译完成的符合 vdom 接口的字符串代码转为渲染函数
    const res = {}
    const fnGenErrors = []

    // 将诸如
    // with(this){return _c('div',{attrs:{"id":"root"}},[_v("\n    "+_s(message)+"\n    "+_s(hello)+"\n  ")])}
    // 传入到 new Function() 中获取返回的函数
    res.render = createFunction(compiled.render, fnGenErrors)
    // staticRenderFns 是一个静态渲染的集合
    // 对于每一个元素执行系统的操作收集返回值
    res.staticRenderFns = compiled.staticRenderFns.map(code => {
      return createFunction(code, fnGenErrors)
    })

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    // 检查代码生成错误.
    // 这种错误一般只发生在编译器自己存在问题的时候, 大部分情况是给代码生成的开发使用的.
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn(
          `Failed to generate render function:\n\n` +
          fnGenErrors.map(({ err, code }) => `${err.toString()} in\n\n${code}\n`).join('\n'),
          vm
        )
      }
    }

    // 缓存编译结果
    // 且响应 res 对象
    return (cache[key] = res)
  }
}
