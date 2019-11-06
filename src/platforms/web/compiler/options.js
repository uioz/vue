/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  /**
   * ({
   *   staticKeys: string[];
   *   transformNode: (el: any, options: any) => void;
   *   genData: (el: any) => string;
   * } | {
   *    preTransformNode: (el: any, options: any) => any;
   *  })[]
   */
  modules,
  /**
   * {
   *   model: (el: any, dir: any, _warn: Function) => boolean;
   *   text: (el: any, dir: any) => void;
   *   html: (el: any, dir: any) => void;
   * }
   */
  directives,
  isPreTag, // 给定的字符串是否是 'pre'
  isUnaryTag, // 单 tag 的标签集合
  mustUseProp, // 默认返回 false
  canBeLeftOpenTag,// 可以左开的 tag(意义不明)
  isReservedTag, // 内联元素 ?
  getTagNamespace, // 返回 'svg' 和 'math' (命名空间?)
  staticKeys: genStaticKeys(modules) // 返回 staticClass,staticStyle
}
