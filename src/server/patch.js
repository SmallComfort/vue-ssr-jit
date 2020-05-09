/* @flow */
const vm = require('vm')
import { escape } from 'web/server/util'
import { getVNodeAstChildren, getVNodeRenderAst, isLCallExpression } from './util'
import { PatchContext } from './patch-context'
import { resolveAsset } from 'core/util/options'
import { generateComponentTrace } from 'core/util/debug'
import { ssrCompileToFunctions } from 'web/server/compiler'
import { installSSRHelpers } from './optimizing-compiler/runtime-helpers'
import type { RenderOptions } from './create-renderer'
import { isDef, isUndef, isTrue } from 'shared/util'
import { parse } from '@babel/parser'
import generate from '@babel/generator'

import {
  createComponent,
  createComponentInstanceForVnode
} from 'core/vdom/create-component'
import { isConditionalExpression } from '@babel/types';
import { SSR_ATTR } from 'shared/constants'

const onCompilationError = (err, vm) => {
  const trace = vm ? generateComponentTrace(vm) : ''
  throw new Error(`\n\u001b[31m${err}${trace}\u001b[39m\n`)
}

const normalizeRender = vm => {
  const { render, template, _scopeId } = vm.$options
  if (isUndef(render)) {
    if (template) {
      const compiled = ssrCompileToFunctions(template, {
        scopeId: _scopeId,
        warn: onCompilationError
      }, vm)

      vm.$options.render = compiled.render
      vm.$options.staticRenderFns = compiled.staticRenderFns
    } else {
      throw new Error(
        `render function or template not defined in component: ${
          vm.$options.name || vm.$options._componentTag || 'anonymous'
        }`
      )
    }
  }
}

function waitForServerPrefetch (vm, resolve, reject) {
  let handlers = vm.$options.serverPrefetch
  if (isDef(handlers)) {
    if (!Array.isArray(handlers)) handlers = [handlers]
    try {
      const promises = []
      for (let i = 0, j = handlers.length; i < j; i++) {
        const result = handlers[i].call(vm, vm)
        if (result && typeof result.then === 'function') {
          promises.push(result)
        }
      }
      Promise.all(promises).then(resolve).catch(reject)
      return
    } catch (e) {
      reject(e)
    }
  }
  resolve()
}

function hasAncestorData (node: VNode) {
  const parentNode = node.parent
  return isDef(parentNode) && (isDef(parentNode.data) || hasAncestorData(parentNode))
}

function getVShowDirectiveInfo (node: VNode): ?VNodeDirective {
  let dir: VNodeDirective
  let tmp

  while (isDef(node)) {
    if (node.data && node.data.directives) {
      tmp = node.data.directives.find(dir => dir.name === 'show')
      if (tmp) {
        dir = tmp
      }
    }
    node = node.parent
  }
  return dir
}

function renderStartingTag (node: VNode, context: PatchContext, activeInstance: Component) {
  let markup = `<${node.tag}`
  const { directives, modules } = context

  // construct synthetic data for module processing
  // because modules like style also produce code by parent VNode data
  if (isUndef(node.data) && hasAncestorData(node)) {
    node.data = {}
  }
  if (isDef(node.data)) {
    // check directives
    const dirs = node.data.directives
    if (dirs) {
      for (let i = 0; i < dirs.length; i++) {
        const name = dirs[i].name
        if (name !== 'show') {
          const dirRenderer = resolveAsset(context, 'directives', name)
          if (dirRenderer) {
            // directives mutate the node's data
            // which then gets rendered by modules
            dirRenderer(node, dirs[i])
          }
        }
      }
    }

    // v-show directive needs to be merged from parent to child
    const vshowDirectiveInfo = getVShowDirectiveInfo(node)
    if (vshowDirectiveInfo) {
      directives.show(node, vshowDirectiveInfo)
    }

    // apply other modules
    for (let i = 0; i < modules.length; i++) {
      const res = modules[i](node)
      if (res) {
        markup += res
      }
    }
  }
  // attach scoped CSS ID
  let scopeId
  if (isDef(activeInstance) &&
    activeInstance !== node.context &&
    isDef(scopeId = activeInstance.$options._scopeId)
  ) {
    markup += ` ${(scopeId: any)}`
  }
  if (isDef(node.fnScopeId)) {
    markup += ` ${node.fnScopeId}`
  } else {
    while (isDef(node)) {
      if (isDef(scopeId = node.context.$options._scopeId)) {
        markup += ` ${scopeId}`
      }
      node = node.parent
    }
  }
  return markup + '>'
}

/**
 * 计算条件表达式的语法树的值
 * @param {context} context 抽象语法树的上下文
 * @param {Object} ast
 */

function calcuConditionalExpression(context, ast) {
  if (!isConditionalExpression(ast)) {
    return ast
  }
  const boolFn = new vm.Script(`
    (function() {
      var _h = _vm.$createElement
      var _c = _vm._self._c || _h
      return ${generate(ast.test).code}
    })()
  `)
  const result = boolFn.runInNewContext({_vm: context})
  if (result === true) {
    return calcuConditionalExpression(context, ast.consequent)
  } else {
    return calcuConditionalExpression(context, ast.alternate)
  }
}

/**
 * 设置 VNode 子节点的抽象语法树
 * 对于条件判断语句，通过 VNode 上下文对其求值
 * 如果子语法树里面有循环语句，则当前语法树和子语法树全部都置为 unMatchedAst
 * @param {VNode} node VNode 节点
 * @param {Object} ast 抽象语法树
 */
function setVNodeChildrenAst(node, ast, context) {
  const astChildren = getVNodeAstChildren(ast)
  const nodeChildren = node.children

  let unMatchedAst = !astChildren || astChildren.elements.length !== nodeChildren.length

  // 如果子语法树里面有循环语句，则当前语法树和子语法树全部都置为 unMatchedAst
  if (astChildren && Array.isArray(astChildren.elements)) {
    astChildren.elements.forEach(node => {
      if (isLCallExpression(node)) {
        ast.unMatchedAst = true
        unMatchedAst = true
      }
    })
  }

  if (unMatchedAst === false) {
    node.children.forEach((v, i) => {
      let ast = astChildren.elements[i]
      // 子语法树如果是 ConditionalExpression 类型，需要进行一次求值，获取到真正的 CallExpression
      if (isConditionalExpression(ast)) {
        ast = calcuConditionalExpression(context, ast)
      }

      v.ast = ast
    })
  } else {
    node.children.forEach(v => {
      v.ast = {
        unMatchedAst
      }
    })
  }
}

/**
 * 比较组件节点
 * 所有其他类型都经过 patchComponent 产生
 *
 * @param {VNode} staticVNode  VNode that didn't make any data requests.
 * @param {VNode} dynamicVNode  VNode populated with asynchronous data
 * @param {PatchContext} patchContext  VNode context，record patch data
 * @param {boolean} isRoot  The root node adds the additional property SSR_ATTR
 */
function patchComponent(staticVNode, dynamicVNode, patchContext, isRoot) {
  const ast = staticVNode.ast
  const prevStaticActive = patchContext.staticActiveInstance
  const prevDynamicActive = patchContext.dynamicActiveInstance

  staticVNode.ssrContext = patchContext.userContext
  dynamicVNode.ssrContext = patchContext.userContext

  const staticChild = patchContext.staticActiveInstance = createComponentInstanceForVnode(
    staticVNode,
    patchContext.staticActiveInstance
  )
  const dynamicChild = patchContext.dynamicActiveInstance = createComponentInstanceForVnode(
    dynamicVNode,
    patchContext.dynamicActiveInstance
  )
  normalizeRender(staticChild)
  normalizeRender(dynamicChild)

  ast.ssrStyles = patchContext.userContext._styles
  delete patchContext.userContext._styles

  const staticRenderStr = staticChild.$options.render.toString()
  const staticAst = parse(`var render = ${staticRenderStr}`)
  ast.ssrRenderAst = staticAst
  ast.render = staticChild.$options.render

  const resolve = () => {
    const staticChildNode = staticChild._render()
    const dynamicChildNode = dynamicChild._render()

    staticChildNode.parent = staticVNode
    dynamicChildNode.parent = dynamicVNode

    patchContext.patchStates.push({
      type: 'Component',
      prevAst: ast,
      prevStaticActive,
      prevDynamicActive
    })

    /**
     * 当前组件有可能不是通过 <template></template> 模板语法创建
     * 这种情况不对当前组件做语法树节点级别的优化
     * 转而判断当前组件是否完全是静态组件，如果是，则对整个组件做静态优化
     */
    const childAst = getVNodeRenderAst(staticAst)
    if (childAst) {
      staticChildNode.ast = childAst
    } else {
      staticChildNode.ast = Object.assign(staticAst, { unMatchedAst: true })
    }
    patchNode(staticChildNode, dynamicChildNode, patchContext, isRoot)
  }

  const reject = patchContext.done

  waitForServerPrefetch(dynamicChild, resolve, reject)
}

/**
 * 比较异步组件
 *
 * @param {VNode} staticVNode  VNode that didn't make any data requests.
 * @param {VNode} dynamicVNode  VNode populated with asynchronous data
 * @param {PatchContext} patchContext  VNode context，record patch data
 * @param {boolean} isRoot  The root node adds the additional property SSR_ATTR
 */
function patchAsyncComponent(staticVNode, dynamicVNode, patchContext, isRoot) {
  const ast = staticVNode.ast
  const staticFactory = staticVNode.asyncFactory
  const dynamicFactory = dynamicVNode.asyncFactory

  const resolve = (staticComp, dynamicComp) => {
    const staticResolvedNode = getResolevdNode(staticVNode, staticComp)
    const dynamicRedolvedNode = getResolevdNode(dynamicVNode, dynamicComp)
    if (staticResolvedNode && dynamicRedolvedNode) {
      staticResolvedNode.ast = Object.assign(ast, {unMatchedAst: true })
      if (staticResolvedNode.componentOptions && dynamicRedolvedNode.componentOptions) {
        patchComponent(staticResolvedNode, dynamicRedolvedNode, patchContext, isRoot)
        return
      }
      if (!Array.isArray(staticResolvedNode) && !Array.isArray(dynamicRedolvedNode)) {
        patchNode(staticResolvedNode, dynamicRedolvedNode, patchContext, isRoot)
        return
      }
      if (Array.isArray(staticResolvedNode) && Array.isArray(dynamicRedolvedNode)) {
        patchContext.patchStates.push({
          type: 'Fragment',
          staticChildren: staticResolvedNode,
          dynamicChildren: dynamicRedolvedNode,
          rendered: 0,
          ast,
          total: staticResolvedNode.length
        })
        patchContext.next()
        return
      }
    }

    // invalid component, but this does not throw on the client
    // so render empty comment node
    ast.ssrString = `<!---->`
    ast.ssrStatic = true
    patchContext.next()
  }

  if (staticFactory.resolved && dynamicFactory.resolved) {
    resolve(staticFactory.resolved, dynamicFactory.resolved)
    return
  }

  const reject = patchContext.done
  let staticRes
  let dynamicRes
  try {
    Promise.all([
      new Promise((resolve, reject) => {
        staticRes = staticFactory(comp => resolve(comp), reject)
      }),
      new Promise((resolve, reject) => {
        dynamicRes = dynamicFactory(comp => resolve(comp), reject)
      })
    ]).then(res => {
      resolve(res[0], res[1])
    }).catch(reject)
  } catch (e) {
    reject(e)
  }

  if (staticRes && dynamicRes) {
    if (typeof staticRes.then === 'function' && typeof dynamicRes.then === 'function') {
      Promise.all([staticRes, dynamicRes]).then(res => {
        resolve(res[0], res[1])
      }).catch(reject)
      return
    } 
    const staticComponent = staticRes.component
    const dynamicComponent = dynamicRes.component
    if (typeof staticComponent.then === 'function' && typeof dynamicComponent.then === 'function') {
      Promise.all([staticComponent, dynamicComponent]).then(res => {
        resolve(res[0], res[1])
      }).catch(reject)
      return
    }
  }
  patchContext.next()
}

function getResolevdNode(node, comp) {
  if (comp.__esModule && comp.default) {
    comp = comp.default
  }
  const { data, children, tag } = node.asyncMeta
  const nodeContext = node.asyncMeta.context
  return createComponent(
    comp,
    data,
    nodeContext,
    children,
    tag
  )
}

/**
 * 比较字符串型节点，这种节点为 ssr 特有，是模板编译器的一种渲染优化
 *
 * @param {VNode} staticVNode  VNode that didn't make any data requests.
 * @param {VNode} dynamicVNode  VNode populated with asynchronous data
 * @param {PatchContext} patchContext  VNode context，record patch data
 */
function patchStringNode(staticVNode, dynamicVNode, patchContext) {
  const ast = staticVNode.ast
  if ((isUndef(staticVNode.children) && isUndef(dynamicVNode.children)) ||
    (staticVNode.children.length === 0 && dynamicVNode.children.length === 0)) {
      const staticString = staticVNode.open + (staticVNode.close || '')
      const dynamicString = dynamicVNode.open + (dynamicVNode.close || '')
      if (staticString.trim() === dynamicString.trim()) {
        ast.ssrString = staticString
        ast.ssrStatic = true
      }
  } else if (staticVNode.children.length === dynamicVNode.children.length) {
    if (staticVNode.open === dynamicVNode.open && staticVNode.close === dynamicVNode.close) {
      setVNodeChildrenAst(staticVNode, ast, patchContext.staticActiveInstance)
      patchContext.patchStates.push({
        type: 'Element',
        staticChildren: staticVNode.children,
        dynamicChildren: dynamicVNode.children,
        rendered: 0,
        ast,
        total: staticVNode.children.length,
        endTag: staticVNode.close
      })
      ast.ssrString = staticVNode.open
    }
  }
  patchContext.next()
}

/**
 * 比较元素节点
 *
 * @param {VNode} staticVNode  VNode that didn't make any data requests.
 * @param {VNode} dynamicVNode  VNode populated with asynchronous data
 * @param {PatchContext} patchContext  VNode context，record patch data
 * @param {boolean} isRoot  The root node adds the additional property SSR_ATTR
 */
function patchElement(staticVNode, dynamicVNode, patchContext, isRoot) {
  if (isTrue(isRoot)) {
    if (!staticVNode.data) staticVNode.data = {}
    if (!staticVNode.data.attrs) staticVNode.data.attrs = {}
    staticVNode.data.attrs[SSR_ATTR] = 'true'
    if (!dynamicVNode.data) dynamicVNode.data = {}
    if (!dynamicVNode.data.attrs) dynamicVNode.data.attrs = {}
    dynamicVNode.data.attrs[SSR_ATTR] = 'true'
  }
  
  const ast = staticVNode.ast
  const staticStartTag = renderStartingTag(staticVNode, patchContext, patchContext.staticActiveInstance)
  const dynamicStartTag = renderStartingTag(dynamicVNode, patchContext, patchContext.dynamicActiveInstance)
  const staticEndTag = `</${staticVNode.tag}>`
  const dynamicEndTag = `</${dynamicVNode.tag}>`
  if (patchContext.isUnaryTag(staticVNode.tag) && patchContext.isUnaryTag(dynamicVNode.tag)) {
    if (staticStartTag === dynamicStartTag) {
      ast.ssrString = staticStartTag
      ast.ssrStatic = true
    }
  } else if ((isUndef(staticVNode.children) && isUndef(dynamicVNode.children)) ||
    (staticVNode.children.length === 0 && dynamicVNode.children.length === 0)) {
    if (staticStartTag + staticEndTag === dynamicStartTag + dynamicEndTag) {
      ast.ssrString = staticStartTag + staticEndTag
      ast.ssrStatic = true
    }
  } else if (staticVNode.children.length === dynamicVNode.children.length) {
    if (staticStartTag === dynamicStartTag && staticEndTag === dynamicEndTag) {
      setVNodeChildrenAst(staticVNode, ast, patchContext.staticActiveInstance)
      patchContext.patchStates.push({
        type: 'Element',
        staticChildren: staticVNode.children,
        dynamicChildren: dynamicVNode.children,
        rendered: 0,
        ast,
        total: staticVNode.children.length,
        endTag: staticEndTag
      })
      ast.ssrString = staticStartTag
    }
  }
  patchContext.next()
}

/**
 * 对比虚拟 dom ，收集静态节点与动态节点
 *
 * @param {VNode} staticVNode  VNode that didn't make any data requests.
 * @param {VNode} dynamicVNode  VNode populated with asynchronous data
 * @param {PatchContext} patchContext  VNode context，record patch data
 * @param {boolean} isRoot  The root node adds the additional property SSR_ATTR
 */
function patchNode(staticVNode, dynamicVNode, patchContext, isRoot) {

  const ast = staticVNode.ast

  if (staticVNode.isString && dynamicVNode.isString) {
    patchStringNode(staticVNode, dynamicVNode, patchContext)
  }
  else if (isDef(staticVNode.componentOptions) && isDef(dynamicVNode.componentOptions)) {
    patchComponent(staticVNode, dynamicVNode, patchContext, isRoot)
  }
  else if (isDef(staticVNode.tag) && isDef(dynamicVNode.tag)) {
    patchElement(staticVNode, dynamicVNode, patchContext, isRoot)
  }
  else if (isTrue(staticVNode.isComment) && isTrue(dynamicVNode.isComment)) {
    if (isDef(staticVNode.asyncFactory) && isDef(dynamicVNode.asyncFactory)) {
      patchAsyncComponent(staticVNode, dynamicVNode, patchContext, isRoot)
    }
    else {
      if (staticVNode.text === dynamicVNode.text) {
        ast.ssrString = `<!--${staticVNode.text}-->`
        ast.ssrStatic = true
      }
      patchContext.next()
    }
  }
  else if (isDef(staticVNode.text) && isDef(dynamicVNode.text)){
    const staticText = staticVNode.raw ? staticVNode.text : escape(String(staticVNode.text))
    const dynamicText = dynamicVNode.raw ? dynamicVNode.text : escape(String(dynamicVNode.text))
    if (staticText === dynamicText) {
      ast.ssrString = staticText
      ast.ssrStatic = true
    }
    patchContext.next()
  } else  {
    patchContext.next()
  }
}

export function createPatchFunction ({
  modules,
  directives,
  isUnaryTag,
  cache
}: RenderOptions) {
  /**
   * 中文：
   * VNode diff
   * 如果检测到节点是静态的，修改的是静态组件的 ast (staticAst)
   * 如果检测到节点是动态的
   * staticAst 不做任何网络请求
   * ast.ssrString 如果有值，则表示当前节点是静态节点，但不一定表示子节点是静态节点
   * ast.ssrStatic === true，表示当前节点和子节点都是静态节点
   * ast.unMatchedAst === true，表示当前节点没有匹配到抽象语法树，这种情况只有当节点和子节点全部都为静态，才做优化
   */
  return function patcher (
    staticComponent: Component,
    dynamiComponent: Component,
    userContext: ?Object,
    done: Function
  ) {
    const render = staticComponent.$options.render
    const staticAst = parse(`var render = ${render.toString()}`)

    const patchContext = new PatchContext({
      staticActiveInstance: staticComponent,
      dynamicActiveInstance: dynamiComponent,
      userContext,
      staticAst,
      done,
      patchNode,
      isUnaryTag, modules, directives,
      cache
    })

    installSSRHelpers(staticComponent)
    installSSRHelpers(dynamiComponent)
    normalizeRender(staticComponent)
    normalizeRender(dynamiComponent)

    const resolve = () => {
      const staticVNode = staticComponent._render()
      const dynamicVNode = dynamiComponent._render()

      const childAst = getVNodeRenderAst(staticAst)
      if (childAst) {
        staticVNode.ast = childAst
      } else {
        staticVNode.ast = Object.assign(staticAst, { unMatchedAst: true })
      }


      patchContext.patchStates.push({
        type: 'Component',
        prevAst: {
          ssrRenderAst: staticAst,
          render: staticComponent.$options.render
        }
      })

      try {
        patchNode(staticVNode, dynamicVNode, patchContext, true)
      } catch(e) {
        done(e)
      }
    }

    waitForServerPrefetch(dynamiComponent, resolve, done)
  }
}
