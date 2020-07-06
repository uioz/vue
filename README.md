# 简介

Vue.js 2.16.10 源码阅读.  
注释覆盖范围, 80% 核心 50% 编译器 10% 其他部分.

# 结构

Vue.js 源码结构和目录关联性是非常强的.

```
├───compiler 编译器将 HTML 编译为 render 函数
│   ├───codegen
│   ├───directives
│   └───parser
├───core 内核部分, 在 web 端中除了编译器外的所有内容.
│   ├───components 内置的组件
│   ├───global-api Vue 构造函数的对外 API
│   ├───instance Vue 实例化对象部分
│   │   └───render-helpers 
│   ├───observer 响应式系统
│   ├───util
│   └───vdom 虚拟DOM
│       ├───helpers
│       └───modules
├───platforms 打包工具的入口, 构建的目标可以是 web 和 weex, 两端之间存在差异而且构建的目标不同也存在差异, 这些差异的部分会从这里抹消.
│   ├───web 阅读入口在这里 entry-runtime-with-compiler.js 构建的目标就是 web 端含有编译器版本的 vue.js 包含了所有 Vue 的主要功能.
│   │   ├───compiler
│   │   │   ├───directives
│   │   │   └───modules
│   │   ├───runtime
│   │   │   ├───components
│   │   │   ├───directives
│   │   │   └───modules
│   │   ├───server
│   │   │   ├───directives
│   │   │   └───modules
│   │   └───util
│   └───weex
│       ├───compiler
│       │   ├───directives
│       │   └───modules
│       │       └───recycle-list
│       ├───runtime
│       │   ├───components
│       │   ├───directives
│       │   ├───modules
│       │   └───recycle-list
│       └───util
├───server 服务端渲染使用
│   ├───bundle-renderer
│   ├───optimizing-compiler
│   ├───template-renderer
│   └───webpack-plugin
```
