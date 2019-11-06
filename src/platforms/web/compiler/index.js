/* @flow */

/**
 * baseOptions 提供了一系列在 web 编译下的选项, 编译器兼容多平台, 通过大量编译选项来抹消平台差异
 */
import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

// createCompiler 在 src\compiler\index.js 路径下
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
