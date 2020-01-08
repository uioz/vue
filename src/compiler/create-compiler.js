/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

/**
 * createCompilerCreator 接收一个基本编辑函数
 * @param baseCompile 基本编译器
 */
export function createCompilerCreator (baseCompile: Function): Function {
  /**
   * 创建编译器, 例如 web 端调用方式:
   * @example src\platforms\web\compiler\index.js
   * const { compile, compileToFunctions } = createCompiler(baseOptions)
   */
  return function createCompiler (baseOptions: CompilerOptions) {


    // 在当前的函数闭包中我们
    // 已经有一个 baseCompile 编译函数了
    // 为什么这里还有一个 compile 呢?
    // 因为 createCompiler 是一个高阶函数
    // createCompiler 本身不提供 "编译" 能力
    // 它接收一个 "编译选项"
    // 最后这里的 compile 函数将 "编译器" 与 "编译选项"(baseOptions) 相结合
    // 后进行编译
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) {

        // 在编译错误的时候提供更加详细的输出
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
        // merge custom modules
        // 合并用户提供的模块
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives
        // 合并用户提供的指令
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        // 将 options 上的其他选项移动到 finalOptions 上
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn

      // template 就是模板字符串
      // 已经合并后的编译选项
      // compiled 保存的就是编译结果
      // 对于 web 端带有编译器的版本
      // baseCompile 所在的位置为 src\compiler\index.js
      const compiled = baseCompile(template.trim(), finalOptions)
      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn)
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    /**
     * 返回编译器, 例如 web 端调用方式:
     * @example src\platforms\web\entry-runtime-with-compiler.js
     * const { render, staticRenderFns } = compileToFunctions(template, {
     *  outputSourceRange: process.env.NODE_ENV !== 'production',
     *  shouldDecodeNewlines,
     *  shouldDecodeNewlinesForHref,
     *  delimiters: options.delimiters,
     *  comments: options.comments
     * }, this)
     */
    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
