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
    /**
     * Goal of the optimizer: walk the generated template AST tree
     * and detect sub-trees that are purely static, i.e. parts of
     * the DOM that never needs to change.
     *
     * 优化目标: 遍历整个 AST 将其完全静态的分支删除, 例如: 某些不需要变化的 DOM
     * 
     * 一旦我们删除了这些分支, 我们可以:
     * 1. 将其变为常量, 这样在每次的重渲染中我们不在需要刷新这部分节点
     * 2. 在 "打补丁" (patching process) 的过程中完全忽略它们
     * 
     * ps: 可以被优化的节点会被添加 flag 表示可以被静态化
     */
    optimize(ast, options)
  }
  // ast 仅仅是模板对应的树状结构而已
  // Vue 还需要进行下一步利用 ast 来生成
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
