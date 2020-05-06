# Vue SSR 即时编译技术

[English](/PRINCIPLE.md)

> 当我们在服务端渲染 Vue 应用时，无论服务器执行多少次渲染，大部分 VNode 渲染出的字符串是不变的，它们有一些来自于模板的静态 html，另一些则来自模板动态渲染的节点（虽然在客户端动态节点有可能会变化，但是在服务端它们是不变的）。将这两种类型的节点提取出来，仅在服务端渲染真正动态的节点（serverPrefetch 预取数据相关联的节点），可以显著的提升服务端的渲染性能。

提取模板中静态的 html 只需在编译期对模板结构做解析，而判断动态节点在服务端渲染阶段是否为静态，需在运行时对 VNode 做 Diff，将动态节点转化成静态 html 需要修改渲染函数的源代码，我们将这种在运行时优化服务端渲染函数的技术称作 SSR 即时编译技术（JIT）。

## 如何 Diff VNode

首要面对的问题是如何 Diff，完成这项工作需要两个 VNode，其中一个通过 serverPrefetch / asyncData 载入动态数据，我们称之为 Dynamic VNode，另一个未载入任何数据，我们称之为 Static VNode。我们做了一个大胆的假设，对任何用户来说，Static VNode 渲染出的 html 是一致的，并且 Static VNode 是 Dynamic VNode 的子集，不同用户的差异点在 Static VNode 相对 Dynamic VNode 的补集当中。

![补集](/material/complementary-set.png)

> 以上假设对绝大部分的 Web 应用都是成立的，某些意料之外的情况将在文末做讨论

Diff 的核心在于从 Staitc VNode 中标记 Dynamic VNode，下一次仅渲染被标记的 Dynamic VNode，Diff 算法的技术示意图如下所示：

![Diff](/material/diff.gif)

优化前的 Dynamic VNode 渲染流程图如下

![Diff](/material/before.gif)

优化后的 Dynamic VNode 渲染流程图如下

![Diff](/material/after.gif)

## 如何修改渲染函数的源代码

修改渲染函数的难点在于如何建立 VNode 与源代码的对应关系，否则我们无从得知需要优化的节点是哪段代码生成的，这看起来非常困难。幸运的是 Vue 的模板语法提供了很不错的约束，内置的编译引擎也确保了渲染函数代码结构可预测。

如下模板代码编译生成的渲染函数结构是有章可循的

```html
<template>
  <div>
    <static-view/>
    <dynamic-view/>
  </div>
</template>
```
```js
_c("div", [
  _c("static-view"),
  _c("dynamic-view")
], 1)
```

执行 `_c(xxx)` 会生成一个 VNode 节点，解析 `_c(xxx)` 会生成一个固定结构的 AST，将 AST 与 VNode 做绑定，如果当前 VNode 为静态节点，则修改对应的 AST，VNode 树遍历结束后再将 AST 转化成可执行的代码，代码里便变包含了我们对 VNode 做的优化。详细的技术实现可参考项目中的 [patch.js](/src/server/patch.js) 和 [patch-context.js](/src/server/patch-context.js) 文件。

如下流程图演示了修改渲染函数源代码的过程：

![ast](/material/ast.png)

## 这些场景会导致优化失败

### cookie

不要在服务端渲染周期内使用 cookie，除非你确定此数据与用户无关。可以在 serverPrefetch / asyncData 方法内使用 cookie，服务端渲染周期结束后也可以被使用，例如：`mounted`，`updated` 等等。

不推荐用法
```js
data() {
  let cookie = cookie;
  try {
    cookie = document.cookie;
  } catch(e) {
    cookie = global.xxx.cookie;
  }
  return {
    cookie
  };
},
```

推荐用法
```js
mounted() {
  this.cookie = document.cookie;
},
```


### v-for
v-for 指令建议用 dom 元素单独包裹，不建议和其他组件并排使用，由于 for 循环会扰乱抽象语法树与 VNode 节点的对应关系，除非 v-for 指令所在的整个节点层级全为静态，否则将不会对包含 v-for 指令的层级及子级做优化。

不推荐用法
```html
<template>
  <div>
    <div v-for="item in items" :key="item.id">{{item.value}}</div>
    <static-view></static-view>
  </div>
</template>
```

推荐用法
```html
<template>
  <div>
    <div>
      <div v-for="item in items" :key="item.id">{{item.value}}</div>
    </div>
    <static-view></static-view>
  </div>
</template>
```

### 闭包
某些场景下，渲染函数引用了闭包变量，同时这个闭包变量又影响着一个动态的节点，通过 ast 逆向生成的渲染函数暂时无法追踪到之前的闭包引用，执行时会因找不到变量而报错，碰到这种情况，解析引擎将放弃当前组件的 ast 优化，转而使用优化前的渲染函数。

不推荐用法：
```html
<template>
  <img :src="require(`@/assets/${img}`)" >
</template>
```

推荐用法：
```html
<template>
  <img :src="getImgUrl(img)" >
</template>
```
