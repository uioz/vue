/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.

// `createCompilerCreator` 允许在创建的过程中使用指定的 解析器/优化器/代码生成器, 例如为 SSR 优化的编译器.
// 这里我们只是导出了默认的编译器
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 通过目标解析引擎解析为 ast
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    // 优化 ast
    optimize(ast, options)
  }
  // 生成代码
  const code = generate(ast, options)
  // 返回解析完成的内容
  // 对于 web 端来讲, 这个闭包函数被调用的位置在
  // src\compiler\create-compiler.js 中
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
