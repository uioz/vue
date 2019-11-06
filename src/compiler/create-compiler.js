/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

/**
 * 该函数返回一个函数构成一个闭包, 通过依赖注入的方式提供基本编译函数.  
 * TODO: 待证实, 通过基本编译函数可以在不同平台中提供编译阶段优化.  
 * @param baseCompile 基本编译函数
 */
export function createCompilerCreator (baseCompile: Function): Function {
  /**
   * 创建编译器, 例如 web 端调用方式:
   * @example src\platforms\web\compiler\index.js
   * const { compile, compileToFunctions } = createCompiler(baseOptions)
   */
  return function createCompiler (baseOptions: CompilerOptions) {

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
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn

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
