# vue-ssr-jit

vue ssr 运行时优化

## 安装
```
npm install --save-dev vue-ssr-jit
```

## 使用
> vue 最低版本为 2.6.x ，vue-loader 最低版本为 15.x

```js
/*
 * 将官方 ssr 渲染器替换成如下渲染器
 */
const { createBundleRenderer } = require('vue-ssr')
```

如下为要被替换的官方渲染器
```js
const { createBundleRenderer } = require('vue-server-renderer')
```

vue-loader webpack 配置 修改如下，添加自定义 compiler
```js
const compiler = require('vue-ssr/compiler')

...

{
    test: /\.vue$/,
    loader: 'vue-loader',
    options: {
        compiler,
    }
}
```


#### entry-server.js 写法一
适用于在实例化前就需要载入数据的应用

```js
/* entry-server.js */

import { createApp } from './app'

/*
 * base 方法用于导出一个静态的 vue 实例
 */
export const base = () => {
    const {app} = createApp()
    return Promise.resolve(app)
}

/*
 * 默认导出的 vue 实例
 */
export default (context) => {
    return base().then((app) => {
        return context.initSyncData(app.$store, context.payload).then(() => {
            context.state = app.$store.state
            return app
        })
    })
}
```

#### entry-server.js 写法二
适用于在渲染过程中载入数据的应用

```js
/* entry-server.js */

import { createApp } from './app'

/*
 * 直接导出 Vue 实例，渲染器自动根据动静配置选择是否载入 serverPrefetch
 */
export default (context) => {
    const {app} = createApp()
    return Promise.resolve(app)
}
```

## 注意

ssr 推导需要取一份静态实例作为优化基准，在静态实例服务端渲染周期内不要出现与特定用户相关的代码操作，类似如下操作不建议使用，除非你确定此数据与用户无关

```js
data() {
    let cookie = cookie
    try {
        cookie = document.cookie
    } catch(e) {
        // 以某种方式取到了后台 cookie
        cookie = global.xxx.cookie
    }
    return {
        cookie
    }
},
```

cookie 在 serverPrefetch 方法内可被使用，以及在服务端渲染周期结束后也可以被使用，例如：`mounted`，`updated` 等等

可以使用如下插件检测页面代码是否在服务端渲染周期内使用了 cookie
```js
/* entry-client.js*/
import ssrSafety from 'vue-ssr/ssr-safety'

Vue.use(ssrSafety)

```

