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
 * Engligh:
 * Get the array of parameters in the function argument, which defines the rendering function for the child node
 * 
 * 中文：
 * 获取 ast 中生成 VNode 的函数参数中的数组参数，数组参数里定义了子节点的渲染函数
 * 
 * Example:
 *    source code: _c("div", [_c("router-view")], 1)
 *    
 *    return [_c("router-view")]
 * 
 * @param {Object} ast
 */
export function getVNodeAstChildren(ast) {
  let children = null
  if (ast.type === 'CallExpression') {
    try {
      children = ast.arguments.filter(v => v.type === 'ArrayExpression')[0]
    } catch(e) {
      console.error('To get the virtual DOM sub-element failed, see AST', ast)
    }
  }
  return children
}

/**
 * English:
 * Detects if the ast fragment is an ssrNode function node.
 * 
 * 中文：
 * 检测 ast 片段是否是 ssrNode 函数节点。
 * 
 * Example:
 *    _vm._ssrNode("<div>vue-ssr-jit</div>")
 * 
 * @param {Object} ast
 */
export function isSSRNodeAst(ast) {
  return ast && isCallExpression(ast) &&
    isMemberExpression(ast.callee) &&
    isIdentifier(ast.callee.property) &&
    ast.callee.property.name === '_ssrNode'
}

/**
 * English：
 * Recursively obtain the leftmost string in a string splicing expression
 * 
 * 中文：
 * 递归获取字符串拼接表达式中最左边的字符串
 * 
 * @param {Object} ast 
 */
export function getLeftStringLiteral(ast) {
  if (isBinaryExpression(ast)) {
    return getLeftStringLiteral(ast.left)
  } else {
    return ast
  }
}

/**
 * English：
 * Recursively obtain the rightmost string in a string splicing expression
 * 
 * 中文：
 * 递归获取字符串拼接表达式中最右边的字符串
 * 
 * @param {Object} ast 
 */
export function getRightStringLiteral(ast) {
  if (isBinaryExpression(ast)) {
    return getRightStringLiteral(ast.right)
  } else {
    return ast
  }
}

/**
 * English:
 * Optimized string splicing expressions, where adjacent string types are merged directly into a single string, no splicing required
 * 
 * 中文：
 * 优化过的字符串拼接表达式，相邻的字符串类型直接合并成一个字符串，不需要拼接
 * 
 * Example:
 *    'a' + 'b' --> 'ab'
 *    'a' + 'b' + c --> 'ab' + c
 *    a + 'b' + 'c' --> a + 'bc'
 */
export function binaryExpressionPlus(left, right) {
  if (isStringLiteral(left) && isStringLiteral(right)) {
    return stringLiteral(left.value + right.value)
  }
  else if (isStringLiteral(left) && isBinaryExpression(right)) {
    const mostLeft = getLeftStringLiteral(right)
    mostLeft.value = left.value + mostLeft.value
    return right
  }
  else if (isBinaryExpression(left) && isStringLiteral(right)) {
    const mostRight = getRightStringLiteral(left)
    mostRight.value = mostRight.value + right.value
    return left
  }
  else {
    return binaryExpression('+', left, right)
  }
}

/**
 * English:
 * Returns the value of the node if the ast fragment is confirmed as a static node by diff, otherwise returns ''
 * 
 * 中文：
 * 如果 ast 片段经过 diff 确认是静态节点，则返回节点的值，否则返回 ''
 * 
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
 * English:
 * Get function call expression for generating VNode in ast fragment
 * 
 * 中文：
 * 获取 ast 片段中生成 VNode 的函数调用表达式
 * 
 * Example:
 *  function render() {
 *    return _c('div')
 *  }
 * 
 *  --->  _c('div')
 * 
 * @param {Object} ast
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
 * English:
 * Detects if the function name of the function call expression is _ssrNode
 * 
 * 中文：
 * 检测函数调用表达式的函数名是否为 _ssrNode
 * 
 * Example:
 *    vm._ssrNode('<div id="xx"/>')
 * 
 * @param {Object} node ast
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
 * English:
 * Detects if the function name of the function call expression is _c
 * 
 * 中文：
 * 检测函数调用表达式的函数名是否为 _c
 * 
 * Example:
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
 * English:
 * Detects if the function name of the function call expression is _c
 * 
 * 中文：
 * 检测函数调用表达式的函数名是否为 _c
 * 
 * Example:
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
