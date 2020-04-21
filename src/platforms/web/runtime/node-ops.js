/* @flow */

import { namespaceMap } from 'web/util/index'

/**
 * 这个文件中的所有函数都是针对于 web 平台下的节点操作.  
 * 简单的来说就是将 vnode 与真实的 DOM 节点相结合时所需要的一些操作.  
 * 例如 createElement 的所体现的就是当 vnode 需要创建对应的真实 DOM 的时候, 这个函数就会被调用.  
 * 而 createTextNode 则需要创建一个文本类型的 vnode 的时候调用
 * 
 * 其他的函数可以根据函数名词来理解其具体含义.
 */


export function createElement (tagName: string, vnode: VNode): Element {
  const elm = document.createElement(tagName)
  // 对与 select 元素后续进行了特殊处理
  if (tagName !== 'select') {
    return elm
  }
  // false or null will remove the attribute but undefined will not
  if (vnode.data && vnode.data.attrs && vnode.data.attrs.multiple !== undefined) {
    elm.setAttribute('multiple', 'multiple')
  }
  return elm
}

export function createElementNS (namespace: string, tagName: string): Element {
  return document.createElementNS(namespaceMap[namespace], tagName)
}

export function createTextNode (text: string): Text {
  return document.createTextNode(text)
}

export function createComment (text: string): Comment {
  return document.createComment(text)
}

export function insertBefore (parentNode: Node, newNode: Node, referenceNode: Node) {
  parentNode.insertBefore(newNode, referenceNode)
}

export function removeChild (node: Node, child: Node) {
  node.removeChild(child)
}

export function appendChild (node: Node, child: Node) {
  node.appendChild(child)
}

export function parentNode (node: Node): ?Node {
  return node.parentNode
}

export function nextSibling (node: Node): ?Node {
  return node.nextSibling
}

export function tagName (node: Element): string {
  return node.tagName
}

export function setTextContent (node: Node, text: string) {
  node.textContent = text
}

export function setStyleScope (node: Element, scopeId: string) {
  node.setAttribute(scopeId, '')
}
