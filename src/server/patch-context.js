/* @flow */
const vm = require('vm')
import { isUndef } from 'shared/util'
import { stringLiteral, callExpression, memberExpression, identifier } from '@babel/types'
import {
  getVNodeRenderAst, getVNodeAstChildren, isSSRNodeAst,
  binaryExpressionPlus, getStatisAstComponentValue
} from './util'
import generate from '@babel/generator'
import { ssrRender } from 'core/instance/render'

type PatchState = {
  type: 'Element';
  rendered: number;
  total: number;
  ast: Object;
  staticChildren: Array<VNode>;
  dynamicChildren: Array<VNode>;
  endTag: string;
} | {
  type: 'Fragment';
  rendered: number;
  total: number;
  ast: Object;
  staticChildren: Array<VNode>;
  dynamicChildren: Array<VNode>;
} | {
  type: 'Component';
  prevAst: Object;
  prevStaticActive: Component;
  prevDynamicActive: Component;
};

export class PatchContext {
  userContext: ?Object;
  staticActiveInstance: Component;
  dynamicActiveInstance: Component;
  patchStates: Array<PatchState>;
  patchNode: (staticNode: VNode, dynamicNode: VNode, context: PatchContext) => void;
  next: () => void;
  done: (err: ?Error) => void;
  isUnaryTag: (tag: string) => boolean;
  modules: Array<(node: VNode) => ?string>;
  directives: Object;
  staticAst: Object;
  ssrRenderTree: Object;

  constructor (options: Object) {
    this.userContext = options.userContext
    this.staticActiveInstance = options.staticActiveInstance
    this.dynamicActiveInstance = options.dynamicActiveInstance
    this.patchStates = []

    this.done = options.done
    this.patchNode = options.patchNode

    this.isUnaryTag = options.isUnaryTag
    this.modules = options.modules
    this.directives = options.directives

    this.staticAst = options.staticAst

    this.next = this.next.bind(this)

    this.ssrRenderTree = {}
  }

  next () {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const lastState = this.patchStates[this.patchStates.length - 1]
      if (isUndef(lastState)) {
        return this.done({success: true, ssrRenderTree: this.ssrRenderTree})
      }
      /* eslint-disable no-case-declarations */
      switch (lastState.type) {
        case 'Element':
        case 'Fragment':
          const { staticChildren, dynamicChildren, total } = lastState
          const rendered = lastState.rendered++
          if (rendered < total) {
            return this.patchNode(staticChildren[rendered], dynamicChildren[rendered], this, false)
          } else {
            this.patchStates.pop()
            if (lastState.type === 'Element') {
              this.astShaking(lastState)
              this.next()
              return
            }
          }
          break
        case 'Component':
          this.patchStates.pop()
          this.astComponentShaking(lastState)
          this.staticActiveInstance = lastState.prevStaticActive
          this.dynamicActiveInstance = lastState.prevDynamicActive
          break
      }
    }
  }

  /**
   * English:
   * Perform ast optimization on element type VNode.
   *
   * AST-based optimization relies on a stable template structure, which cannot be
   * optimized if the developer uses a custom render
   *
   * 中文：
   * 对元素类型节点执行 ast 优化
   * 基于 ast 的优化依赖于稳定的模板结构，如果开发者使用了自定义 render，则无法做出优化
   */
  astShaking(patchState: PatchState) {
    const { endTag, staticChildren, ast } = patchState

    const elements = staticChildren
      .map(v => v.ast)
      .reduce((preV, curV) => {
        if (curV.ssrString !== undefined && curV.ssrStatic === true) { // 静态节点
          if (typeof preV[preV.length - 1] === 'string') {
            preV[preV.length - 1] += curV.ssrString
          } else {
            preV.push(curV.ssrString)
          }
        } else {
          preV.push(curV)
        }
        return preV
      }, [])

    /**
     * English:
     * Detect whether all child nodes are static
     *
     * 中文：
     * 检测子节点是否全部都是静态节点
     */
    const childStatic = elements.length === 0 || (elements.length === 1 && typeof elements[0] === 'string')

    /**
     * English:
     * If the current ast does not match the component's rendering template, detect
     * whether the current node and its children are all static.
     *
     * 中文：
     * 如果当前 ast 并未匹配到组件 render 模板 则仅判断当前节点及其子节点是否全是静态
     */
    if (ast.unMatchedAst) {
      if (ast.ssrString !== undefined && childStatic) {
        const str = ast.ssrString + elements[0] + endTag
        Object.assign(ast, { ssrString: str, ssrStatic: true })
      }
      return
    }

    /**
     * English:
     * Resetting the current ast subtree.
     * If children exist and the child element is not static, the ast for children is reconstructed.
     *
     * 中文：
     * 重新设置当前节点抽象语法树的子树
     * 如果 children 存在，并且子元素非静态，则重新为 children 构建抽象语法树
     */
    const children = getVNodeAstChildren(ast)
    if (children && !childStatic) {
      children.elements = elements.map(v => {
        if (typeof v === 'string') {
          return callExpression(
            memberExpression(identifier('_vm'), identifier('_ssrNode')),
            [stringLiteral(v)]
          )
        }
        return v
      })
    }

    /**
     * English:
     * If both the current node and child nodes are static, the nodes are combined.
     *
     * 中文：
     * 如果当前节点和子节点都是静态节点，则将节点合并。
     * */
    if (ast.ssrString !== undefined && childStatic){
      const str = ast.ssrString + elements[0] + endTag
      Object.assign(ast, callExpression(
        memberExpression(identifier('_vm'), identifier('_ssrNode')),
        [stringLiteral(str)]
      ), { ssrString: str, ssrStatic: true })
    }

    /**
     * English:
     * Optimizing the child tree of the current node abstract syntax tree
     *
     * 中文：
     * 优化当前节点抽象语法树的子树
     */
    this.reduceAstChildren(patchState)
  }

  /**
   * English:
   * Merge component-level VNodes.
   * If the entire component is static, the result is passed up.
   * If the component is dynamic, retain the rendering function.
   *
   * 中文：
   * 合并组件级节点
   * 如果整个组件都是静态的，则将结果向上传递
   * 如果组件是动态的，则保留渲染函数
   */
  astComponentShaking(patchState: PatchState) {
    const prevAst = patchState.prevAst
    const ssrRenderAst = prevAst.ssrRenderAst

    /**
     * English:
     * Current component nodes are not optimized.
     *
     * 中文：
     * 当前组件节点无优化
     */
    if (ssrRenderAst.unMatchedAst && !ssrRenderAst.ssrStatic) {
      return this.setSSRRenderTree(prevAst)
    }

    let renderAst = null

    /**
     * English:
     * The current component does not match ast, but is a static component
     *
     * 中文：
     * 当前组件虽未匹配 ast，但是为静态组件
     */
    if (ssrRenderAst.unMatchedAst && ssrRenderAst.ssrStatic) {
      renderAst = ssrRenderAst
    } else {
      renderAst = getVNodeRenderAst(ssrRenderAst)
    }

    /**
     * English:
     * If the current component has been optimized to be static, associate the
     * value of the current component with the parent ast.
     *
     * 中文：
     * 如果当前组件已被优化成静态组件，则将当前组件的值与父 ast 节点关联
     */
    const value = getStatisAstComponentValue(renderAst)
    if (value) {
      prevAst.ssrString = value
      prevAst.ssrStatic = true
    }

    this.setSSRRenderTree(prevAst)
  }

  /**
   * English:
   * Generate a new rendering chain based on Ast's optimization information.
   *
   * The information for the rendering chain is stored in ssrRenderTree, which
   * has the following structure.
   *    {
   *      render() {},
   *      children: [
   *        {
   *          render() {},
   *          children: []
   *        },
   *        {
   *          render() {},
   *          children: []
   *        }
   *      ]
   *    }
   * Deep priority traverses ssrRenderTree and executes the render function to
   * render the application by optimized path.
   *
   * 中文：
   * 根据 Ast 的优化信息生成全新的渲染链
   * 渲染链的信息保存在 ssrRenderTree 中，ssrRenderTree 的结构如下所示：
   *    {
   *      render() {},
   *      children: [
   *        {
   *          render() {},
   *          children: []
   *        },
   *        {
   *          render() {},
   *          children: []
   *        }
   *      ]
   *    }
   * 深度优先遍历 ssrRenderTree，并执行 render 函数，即可按优化路径渲染应用
   *
   * @param {Object} ast
   */
  setSSRRenderTree(ast: Object) {
    let renderStr = 'function render() {}'
    if (ast.ssrStatic && ast.ssrString !== undefined) {
      renderStr = `(function() {
        function render() {
          return \`${ast.ssrString}\`
        }
        return render
      })()`
    } else {
      renderStr = `(function() {
        ${generate(ast.ssrRenderAst).code}
        return render
      })()`
    }
    const renderFn = new vm.Script(renderStr)
    let render = renderFn.runInThisContext()

    let renderValidate = true
    const originRender = this.staticActiveInstance.$options.render
    this.staticActiveInstance.$options.render = render
    try {
      ssrRender(this.staticActiveInstance)
    } catch (e) {
      renderValidate = false
    }
    this.staticActiveInstance.$options.render = originRender
    if (!renderValidate) {
      render = ast.render
    }

    const componentState = this.patchStates.filter(v => {
      return v.type === 'Component'
    })
    let i = 0
    let curRenderTree = this.ssrRenderTree
    while (i < componentState.length) {
      let tree = {}
      if (!Array.isArray(curRenderTree.children)) {
        curRenderTree.children = [tree]
      } else {
        const lastChild = curRenderTree.children[curRenderTree.children.length - 1]
        if (lastChild.render) {
          curRenderTree.children.push(tree)
        } else {
          tree = lastChild
        }
      }
      curRenderTree = tree
      i++
    }
    curRenderTree.render = render
    if (ast.ssrStatic) {
      curRenderTree.static = true
      curRenderTree.styles = ast.ssrStyles
    }

    if (renderValidate && Array.isArray(curRenderTree.children)) {
      curRenderTree.children = curRenderTree.children.filter(v => {
        if (v.static && v.styles) {
          curRenderTree.styles = Object.assign(curRenderTree.styles || {}, v.styles)
        }
        return !v.static
      })
      if (curRenderTree.children.length === 0) {
        delete curRenderTree.children
      }
    }
  }

  /**
   * English:
   * Optimizing the child tree of the current ast
   *
   * 中文：
   * 优化当前节点抽象语法树的子树
   * @param {PatchState} patchState
   */
  reduceAstChildren(patchState: PatchState) {
    const ast = patchState.ast
    const children = getVNodeAstChildren(ast)
    /**
     * English:
     * If the current element node is an ssrNode node, and there is only one ssrNode child,
     * and the child has no grandchildren, elevate the child node.
     *
     * 中文：
     * 如果当前元素节点为 ssrNode 节点，且只有一个 ssrNode 子节点，并且子节点没有孙节点，则把子节点提升
     */
    if (
      children && children.elements.length === 1 && // Only one child node.
      isSSRNodeAst(ast) && isSSRNodeAst(children.elements[0]) && // The current element node is an ssrNode node and the child node is an ssrNode node
      children.elements[0].arguments.length === 1 // Child node has no grand node.
    ) {
        const node = children.elements[0].arguments[0]
        const args = ast.arguments
        ast.arguments = [
          binaryExpressionPlus(
            binaryExpressionPlus(args[0], node),
            args[1]
          )
        ]
    }
  }
}
