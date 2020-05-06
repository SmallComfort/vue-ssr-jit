/* @flow */
import {
  stringLiteral, isStringLiteral, isCallExpression,
  isMemberExpression, isIdentifier, binaryExpression,
  isBinaryExpression
} from "@babel/types";
import traverse from "@babel/traverse";

export const isJS = (file: string): boolean => /\.js(\?[^.]+)?$/.test(file)

export const isCSS = (file: string): boolean => /\.css(\?[^.]+)?$/.test(file)

export function createPromiseCallback () {
  let resolve, reject
  const promise: Promise<string> = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  const cb = (err: Error, res?: string) => {
    if (err) return reject(err)
    resolve(res || '')
  }
  return { promise, cb }
}

/**
 * 获取抽象语法树中创造 VNode 的函数参数中的数组参数，数组参数里定义了子节点的渲染函数
 * 用处：当对比得出当前节点为静态节点，则删除当前节点，提升子节点
 * @param {Ast} ast 抽象语法树
 */
export function getVNodeAstChildren(ast) {
  let children = null
  if (ast.type === 'CallExpression') {
    try {
      children = ast.arguments.filter(v => v.type === 'ArrayExpression')[0]
    } catch(e) {
      console.error('获取虚拟 dom 子元素失败，请查看 ast', ast)
    }
  }
  return children
}

/**
 * 当前节点是否是 ssrNode 函数节点
 * @param {Ast} ast 抽象语法树
 */
export function isSSRNodeAst(ast) {
  return ast && isCallExpression(ast) &&
    isMemberExpression(ast.callee) &&
    isIdentifier(ast.callee.property) &&
    ast.callee.property.name === '_ssrNode'
}

export function getLeftStringLiteral(ast) {
  if (isBinaryExpression(ast)) {
    return getLeftStringLiteral(ast.left)
  } else {
    return ast
  }
}

export function getRightStringLiteral(ast) {
  if (isBinaryExpression(ast)) {
    return getRightStringLiteral(ast.right)
  } else {
    return ast
  }
}

/**
 * 优化过的加法表达式，相邻的字符串类型直接进行字符拼接，不需要加法拼接
 */
export function binaryExpressionPlus(left, right) {
  // 两个都是纯字符串，直接做字符串拼接
  if (isStringLiteral(left) && isStringLiteral(right)) {
    return stringLiteral(left.value + right.value)
  }
  // 左边是纯字符串，右边是表达式
  else if (isStringLiteral(left) && isBinaryExpression(right)) {
    const mostLeft = getLeftStringLiteral(right)
    mostLeft.value = left.value + mostLeft.value
    return right
  }
  // 左边是表达式，右边是纯字符串
  else if (isBinaryExpression(left) && isStringLiteral(right)) {
    const mostRight = getRightStringLiteral(left)
    mostRight.value = mostRight.value + right.value
    return left
  }
  // 两边都是表达式
  else {
    return binaryExpression('+', left, right)
  }
}

/**
 * 判断当前节点是否是静态节点
 * @param {Object} ast
 * todo 要重构了，条件判断分支混乱，分不清了
 */
export function isStaticSSRNode(ast) {
  if (isCallExpression(ast)) {
    if (ast.ssrString) {
      return true;
    }
  }
  return false
}

/**
 * 获取 ast 语法树的子节点的静态节点
 * 如果子节点不是静态节点，则返回 ''
 * @param {Object} ast
 */
export function getStaticAstChildValue(ast) {
  let value = ''
  const children = getVNodeAstChildren(ast)
  if (children && children.elements.length === 1 &&
    children.elements[0].ssrRenderAst === undefined) {
    if (children.elements[0].arguments &&
      children.elements[0].arguments.length === 1) {
        const node = children.elements[0].arguments[0]
        if (isStringLiteral(node)) {
          value = node.value
        }
    }
  }
  return value
}

/**
 * 检测组件的抽象语法树是否是静态的
 * @param {Object} ast
 */
export function getStatisAstComponentValue(ast: Object) {
  let value = ''
  if (ast.ssrString !== undefined) {
    if (isSSRNodeAst(ast)) {
      if (ast.arguments.length === 1) {
        const node = ast.arguments[0]
        if (isStringLiteral(node)) {
          value = node.value
        }
      }
    } else if (ast.ssrStatic === true) {
      value = ast.ssrString
    }
  }
  return value
}

/**
 * 获取抽象语法树中创造 VNode 的函数节点
 * 注意只有被添加了 ssrKey 的节点才可做后续的优化
 * @param {Ast} ast 抽象语法树
 */
export function getVNodeRenderAst(ast) {
  let vNodeAst
  traverse(ast, {
    noScope: true,
    ReturnStatement(path) {
      const arg = path.node.argument;
      if (isCCallExpression(arg) || isSSRNodeCallExpression(arg)) {
        vNodeAst = arg
      }
      path.stop()
    }
  })
  return vNodeAst
}

/**
 * check if a call expression named ssrNode
 * match code example:
 *    vm._ssrNode('<div id="xx"/>')
 * @param {*} node
 * @param {*} node
 */
function isSSRNodeCallExpression(node) {
  if (!isCallExpression(node)) {
    return false
  }
  if (!isMemberExpression(node.callee)) {
    return false
  }
  const prop = node.callee.property
  if (!isIdentifier(prop)) {
    return false
  }
  if (prop.name === '_ssrNode') {
    return true
  }
  return false
}

/**
 * check if a call expression has name '_c'
 * match code example:
 *    _c("div", [_vm._v("8")])
 * @param {*} node
 */
export function isCCallExpression(node) {
  if (!isCallExpression(node)) {
    return false
  }
  if (!Array.isArray(node.arguments)) {
    return false
  }
  if (!isIdentifier(node.callee)) {
    return false
  }
  if (node.callee.name === '_c') {
    return true
  }

  return false
}

/**
 * check if a call expression has name '_l'
 * match code example:
 *    _vm._l()
 * @param {*} node
 */
export function isLCallExpression(node) {
  if (!isCallExpression(node)) {
    return false
  }
  if (!Array.isArray(node.arguments)) {
    return false
  }
  if (!isMemberExpression(node.callee)) {
    return false
  }
  if (!isIdentifier(node.callee.object)) {
    return false
  }
  if (!isIdentifier(node.callee.property)) {
    return false
  }
  if (node.callee.object.name === '_vm' && node.callee.property.name === '_l') {
    return true
  }

  return false
}

export function renderStyles (styles) {
  var css = ''
  for (var key in styles) {
    var style = styles[key]
    css += '<style data-vue-ssr-id="' + style.ids.join(' ') + '"' +
        (style.media ? ( ' media="' + style.media + '"' ) : '') + '>' +
        style.css + '</style>'
  }
  return css
}
