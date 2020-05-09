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
   * 合并子元素节点
   * 注意：基于抽象语法树的推导优化依赖于稳定的模板结构，如果开发者使用了自定义 render，则无法对其进行语法树级别的推导优化
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

    /** 子节点是否全部都是静态节点 */
    const childStatic = elements.length === 0 || (elements.length === 1 && typeof elements[0] === 'string')

    /** 如果当前语法树并未匹配到组件 render 模板 则仅判断当前节点及其子节点是否全是静态 */
    if (ast.unMatchedAst) {
      if (ast.ssrString !== undefined && childStatic) {
        const str = ast.ssrString + elements[0] + endTag
        Object.assign(ast, { ssrString: str, ssrStatic: true })
      }
      return
    }

    /**
     * 重新设置当前节点抽象语法树的子树
     * ast 不一定有 children 子元素，但是其子元素有可能全部都是静态的，例如常量for循环
     */
    const children = getVNodeAstChildren(ast)
    /** 如果存在 AST 子元素，并且子元素非静态，则构建抽象语法树 */
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

    /** 如果当前节点和子节点都是静态节点，则将节点合并 */
    if (ast.ssrString !== undefined && childStatic){
      const str = ast.ssrString + elements[0] + endTag
      Object.assign(ast, callExpression(
        memberExpression(identifier('_vm'), identifier('_ssrNode')),
        [stringLiteral(str)]
      ), { ssrString: str, ssrStatic: true })
    }

    /**
     * 优化当前节点抽象语法树的子树
     */
    this.reduceAstChildren(patchState)
  }

  /**
   * 合并组件级节点
   * 如果整个组件都是静态的，则将结果向上传递，如果组件是动态的，则保留渲染函数
   *     * todo astComponentShaking 里面需要考虑到 unMatchedAst 静态情况
   */
  astComponentShaking(patchState: PatchState) {
    const prevAst = patchState.prevAst
    const ssrRenderAst = prevAst.ssrRenderAst

    /**
     * 当前组件无优化
     */
    if (ssrRenderAst.unMatchedAst && !ssrRenderAst.ssrStatic) {
      return this.setSSRRenderTree(prevAst)
    }

    let renderAst = null

    /**
     * 当前组件虽未匹配 ast，但是为静态组件
     */
    if (ssrRenderAst.unMatchedAst && ssrRenderAst.ssrStatic) {
      renderAst = ssrRenderAst
    } else {
      renderAst = getVNodeRenderAst(ssrRenderAst)
    }

    /**
     * 如果当前组件已被优化成静态组件
     * 则将当前组件的值与父组件关联
     */
    const value = getStatisAstComponentValue(renderAst)
    if (value) {
      prevAst.ssrString = value
      prevAst.ssrStatic = true
    }

    this.setSSRRenderTree(prevAst)
  }

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
   * 优化当前节点抽象语法树的子树
   * @param {*} patchState
   */
  reduceAstChildren(patchState: PatchState) {
    const ast = patchState.ast
    const children = getVNodeAstChildren(ast)
    /**
     * 如果当前元素节点为 ssrNode 节点，且只有一个 ssrNode 子节点，并且子节点没有孙节点，则把子节点提升
     */
    if (
      children && children.elements.length === 1 && //只有一个子节点
      isSSRNodeAst(ast) && isSSRNodeAst(children.elements[0]) && //当前元素节点为 ssrNode 节点， 子节点为 ssrNode 节点
      children.elements[0].arguments.length === 1 // 子节点没有孙节点
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
