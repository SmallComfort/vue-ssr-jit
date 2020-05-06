# vue-ssr-jit

[English](/README.md)

一种用于服务端渲染的即时编译技术。在运行时使用 Diff 算法推导动静节点，生成并运行新的渲染树，从而大幅提升渲染性能。

如下 vue 模板：
```html
<template>
  <div>
    <router-link to="/">{{name}}</router-link>
    <router-view></router-view>
  </div>
</template>

<script>
export default {
  data() {
    return {
      name: 'vue-ssr-jit'
    }
  }
}
</script>
```
官方编译器生成的代码：
```js
_c("div", [
  _c("router-link", {attrs: { to: "/" }}, [
    _vm._v(_vm._s(_vm.name))
  ]),
  _c("router-view")
], 1)
```
使用 vue-ssr-jit 生成的代码：
```js
_c("div", [
  _vm._ssrNode(
    "<a href=\"/\" class=\"router-link-active\">vue-ssr-jit</a>"
  ),
  _c("router-view")
], 1);
```

## 用法

```js
npm install --save vue-ssr-jit
```

```js
const { createBundleRenderer } = require('vue-ssr-jit')
```

`createBundleRenderer` 与官方同名函数接口一致，参考 [vue ssr 指南](https://ssr.vuejs.org/zh/api/#createbundlerenderer)

推荐使用 [serverPrefetch](https://ssr.vuejs.org/api/#serverprefetch) 预取数据，也支持使用 [asyncData](https://ssr.vuejs.org/zh/guide/data.html#%E5%B8%A6%E6%9C%89%E9%80%BB%E8%BE%91%E9%85%8D%E7%BD%AE%E7%9A%84%E7%BB%84%E4%BB%B6-logic-collocation-with-components) 预取数据，参考 [demo](https://github.com/SmallComfort/vue-ssr-jit-demo)

## 实现原理
[Vue SSR 即时编译技术](/PRINCIPLE.CN.md)

## 注意
这项技术目前处于试验阶段

## License

[MIT](http://opensource.org/licenses/MIT)
