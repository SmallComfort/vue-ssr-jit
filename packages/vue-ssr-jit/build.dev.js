'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var he = _interopDefault(require('he'));
var types = require('@babel/types');
var traverse$1 = _interopDefault(require('@babel/traverse'));
var generate$2 = _interopDefault(require('@babel/generator'));

/*  */

var emptyObject = Object.freeze({});

// These helpers produce better VM code in JS engines due to their
// explicitness and function inlining.
function isUndef (v) {
  return v === undefined || v === null
}

function isDef (v) {
  return v !== undefined && v !== null
}

function isTrue (v) {
  return v === true
}

function isFalse (v) {
  return v === false
}

/**
 * Check if value is primitive.
 */
function isPrimitive (value) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    // $flow-disable-line
    typeof value === 'symbol' ||
    typeof value === 'boolean'
  )
}

/**
 * Quick object check - this is primarily used to tell
 * Objects from primitive values when we know the value
 * is a JSON-compliant type.
 */
function isObject (obj) {
  return obj !== null && typeof obj === 'object'
}

/**
 * Get the raw type string of a value, e.g., [object Object].
 */
var _toString = Object.prototype.toString;

function toRawType (value) {
  return _toString.call(value).slice(8, -1)
}

/**
 * Strict object type check. Only returns true
 * for plain JavaScript objects.
 */
function isPlainObject (obj) {
  return _toString.call(obj) === '[object Object]'
}

/**
 * Check if val is a valid array index.
 */
function isValidArrayIndex (val) {
  var n = parseFloat(String(val));
  return n >= 0 && Math.floor(n) === n && isFinite(val)
}

function isPromise (val) {
  return (
    isDef(val) &&
    typeof val.then === 'function' &&
    typeof val.catch === 'function'
  )
}

/**
 * Convert a value to a string that is actually rendered.
 */
function toString (val) {
  return val == null
    ? ''
    : Array.isArray(val) || (isPlainObject(val) && val.toString === _toString)
      ? JSON.stringify(val, null, 2)
      : String(val)
}

/**
 * Convert an input value to a number for persistence.
 * If the conversion fails, return original string.
 */
function toNumber (val) {
  var n = parseFloat(val);
  return isNaN(n) ? val : n
}

/**
 * Make a map and return a function for checking if a key
 * is in that map.
 */
function makeMap (
  str,
  expectsLowerCase
) {
  var map = Object.create(null);
  var list = str.split(',');
  for (var i = 0; i < list.length; i++) {
    map[list[i]] = true;
  }
  return expectsLowerCase
    ? function (val) { return map[val.toLowerCase()]; }
    : function (val) { return map[val]; }
}

/**
 * Check if a tag is a built-in tag.
 */
var isBuiltInTag = makeMap('slot,component', true);

/**
 * Check if an attribute is a reserved attribute.
 */
var isReservedAttribute = makeMap('key,ref,slot,slot-scope,is');

/**
 * Remove an item from an array.
 */
function remove (arr, item) {
  if (arr.length) {
    var index = arr.indexOf(item);
    if (index > -1) {
      return arr.splice(index, 1)
    }
  }
}

/**
 * Check whether an object has the property.
 */
var hasOwnProperty = Object.prototype.hasOwnProperty;
function hasOwn (obj, key) {
  return hasOwnProperty.call(obj, key)
}

/**
 * Create a cached version of a pure function.
 */
function cached (fn) {
  var cache = Object.create(null);
  return (function cachedFn (str) {
    var hit = cache[str];
    return hit || (cache[str] = fn(str))
  })
}

/**
 * Camelize a hyphen-delimited string.
 */
var camelizeRE = /-(\w)/g;
var camelize = cached(function (str) {
  return str.replace(camelizeRE, function (_, c) { return c ? c.toUpperCase() : ''; })
});

/**
 * Capitalize a string.
 */
var capitalize = cached(function (str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
});

/**
 * Hyphenate a camelCase string.
 */
var hyphenateRE = /\B([A-Z])/g;
var hyphenate = cached(function (str) {
  return str.replace(hyphenateRE, '-$1').toLowerCase()
});

/**
 * Mix properties into target object.
 */
function extend (to, _from) {
  for (var key in _from) {
    to[key] = _from[key];
  }
  return to
}

/**
 * Merge an Array of Objects into a single Object.
 */
function toObject (arr) {
  var res = {};
  for (var i = 0; i < arr.length; i++) {
    if (arr[i]) {
      extend(res, arr[i]);
    }
  }
  return res
}

/* eslint-disable no-unused-vars */

/**
 * Perform no operation.
 * Stubbing args to make Flow happy without leaving useless transpiled code
 * with ...rest (https://flow.org/blog/2017/05/07/Strict-Function-Call-Arity/).
 */
function noop (a, b, c) {}

/**
 * Always return false.
 */
var no = function (a, b, c) { return false; };

/* eslint-enable no-unused-vars */

/**
 * Return the same value.
 */
var identity = function (_) { return _; };

/**
 * Generate a string containing static keys from compiler modules.
 */
function genStaticKeys (modules) {
  return modules.reduce(function (keys, m) {
    return keys.concat(m.staticKeys || [])
  }, []).join(',')
}

/**
 * Check if two values are loosely equal - that is,
 * if they are plain objects, do they have the same shape?
 */
function looseEqual (a, b) {
  if (a === b) { return true }
  var isObjectA = isObject(a);
  var isObjectB = isObject(b);
  if (isObjectA && isObjectB) {
    try {
      var isArrayA = Array.isArray(a);
      var isArrayB = Array.isArray(b);
      if (isArrayA && isArrayB) {
        return a.length === b.length && a.every(function (e, i) {
          return looseEqual(e, b[i])
        })
      } else if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime()
      } else if (!isArrayA && !isArrayB) {
        var keysA = Object.keys(a);
        var keysB = Object.keys(b);
        return keysA.length === keysB.length && keysA.every(function (key) {
          return looseEqual(a[key], b[key])
        })
      } else {
        /* istanbul ignore next */
        return false
      }
    } catch (e) {
      /* istanbul ignore next */
      return false
    }
  } else if (!isObjectA && !isObjectB) {
    return String(a) === String(b)
  } else {
    return false
  }
}

/**
 * Return the first index at which a loosely equal value can be
 * found in the array (if value is a plain object, the array must
 * contain an object of the same shape), or -1 if it is not present.
 */
function looseIndexOf (arr, val) {
  for (var i = 0; i < arr.length; i++) {
    if (looseEqual(arr[i], val)) { return i }
  }
  return -1
}

/*  */

var isAttr = makeMap(
  'accept,accept-charset,accesskey,action,align,alt,async,autocomplete,' +
  'autofocus,autoplay,autosave,bgcolor,border,buffered,challenge,charset,' +
  'checked,cite,class,code,codebase,color,cols,colspan,content,' +
  'contenteditable,contextmenu,controls,coords,data,datetime,default,' +
  'defer,dir,dirname,disabled,download,draggable,dropzone,enctype,for,' +
  'form,formaction,headers,height,hidden,high,href,hreflang,http-equiv,' +
  'icon,id,ismap,itemprop,keytype,kind,label,lang,language,list,loop,low,' +
  'manifest,max,maxlength,media,method,GET,POST,min,multiple,email,file,' +
  'muted,name,novalidate,open,optimum,pattern,ping,placeholder,poster,' +
  'preload,radiogroup,readonly,rel,required,reversed,rows,rowspan,sandbox,' +
  'scope,scoped,seamless,selected,shape,size,type,text,password,sizes,span,' +
  'spellcheck,src,srcdoc,srclang,srcset,start,step,style,summary,tabindex,' +
  'target,title,usemap,value,width,wrap'
);

var unsafeAttrCharRE = /[>/="'\u0009\u000a\u000c\u0020]/; // eslint-disable-line no-control-regex
var isSSRUnsafeAttr = function (name) {
  return unsafeAttrCharRE.test(name)
};

/* istanbul ignore next */
var isRenderableAttr = function (name) {
  return (
    isAttr(name) ||
    name.indexOf('data-') === 0 ||
    name.indexOf('aria-') === 0
  )
};

var propsToAttrMap = {
  acceptCharset: 'accept-charset',
  className: 'class',
  htmlFor: 'for',
  httpEquiv: 'http-equiv'
};

var ESC = {
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '&': '&amp;'
};

function escape (s) {
  return s.replace(/[<>"&]/g, escapeChar)
}

function escapeChar (a) {
  return ESC[a] || a
}

var noUnitNumericStyleProps = {
  "animation-iteration-count": true,
  "border-image-outset": true,
  "border-image-slice": true,
  "border-image-width": true,
  "box-flex": true,
  "box-flex-group": true,
  "box-ordinal-group": true,
  "column-count": true,
  "columns": true,
  "flex": true,
  "flex-grow": true,
  "flex-positive": true,
  "flex-shrink": true,
  "flex-negative": true,
  "flex-order": true,
  "grid-row": true,
  "grid-row-end": true,
  "grid-row-span": true,
  "grid-row-start": true,
  "grid-column": true,
  "grid-column-end": true,
  "grid-column-span": true,
  "grid-column-start": true,
  "font-weight": true,
  "line-clamp": true,
  "line-height": true,
  "opacity": true,
  "order": true,
  "orphans": true,
  "tab-size": true,
  "widows": true,
  "z-index": true,
  "zoom": true,
  // SVG
  "fill-opacity": true,
  "flood-opacity": true,
  "stop-opacity": true,
  "stroke-dasharray": true,
  "stroke-dashoffset": true,
  "stroke-miterlimit": true,
  "stroke-opacity": true,
  "stroke-width": true
};

/*  */

// these are reserved for web because they are directly compiled away
// during template compilation
var isReservedAttr = makeMap('style,class');

// attributes that should be using props for binding
var acceptValue = makeMap('input,textarea,option,select,progress');
var mustUseProp = function (tag, type, attr) {
  return (
    (attr === 'value' && acceptValue(tag)) && type !== 'button' ||
    (attr === 'selected' && tag === 'option') ||
    (attr === 'checked' && tag === 'input') ||
    (attr === 'muted' && tag === 'video')
  )
};

var isEnumeratedAttr = makeMap('contenteditable,draggable,spellcheck');

var isValidContentEditableValue = makeMap('events,caret,typing,plaintext-only');

var convertEnumeratedValue = function (key, value) {
  return isFalsyAttrValue(value) || value === 'false'
    ? 'false'
    // allow arbitrary string value for contenteditable
    : key === 'contenteditable' && isValidContentEditableValue(value)
      ? value
      : 'true'
};

var isBooleanAttr = makeMap(
  'allowfullscreen,async,autofocus,autoplay,checked,compact,controls,declare,' +
  'default,defaultchecked,defaultmuted,defaultselected,defer,disabled,' +
  'enabled,formnovalidate,hidden,indeterminate,inert,ismap,itemscope,loop,multiple,' +
  'muted,nohref,noresize,noshade,novalidate,nowrap,open,pauseonexit,readonly,' +
  'required,reversed,scoped,seamless,selected,sortable,translate,' +
  'truespeed,typemustmatch,visible'
);

var isFalsyAttrValue = function (val) {
  return val == null || val === false
};

/*  */

function renderAttrs (node) {
  var attrs = node.data.attrs;
  var res = '';

  var opts = node.parent && node.parent.componentOptions;
  if (isUndef(opts) || opts.Ctor.options.inheritAttrs !== false) {
    var parent = node.parent;
    while (isDef(parent)) {
      if (isDef(parent.data) && isDef(parent.data.attrs)) {
        attrs = extend(extend({}, attrs), parent.data.attrs);
      }
      parent = parent.parent;
    }
  }

  if (isUndef(attrs)) {
    return res
  }

  for (var key in attrs) {
    if (isSSRUnsafeAttr(key)) {
      continue
    }
    if (key === 'style') {
      // leave it to the style module
      continue
    }
    res += renderAttr(key, attrs[key]);
  }
  return res
}

function renderAttr (key, value) {
  if (isBooleanAttr(key)) {
    if (!isFalsyAttrValue(value)) {
      return (" " + key + "=\"" + key + "\"")
    }
  } else if (isEnumeratedAttr(key)) {
    return (" " + key + "=\"" + (escape(convertEnumeratedValue(key, value))) + "\"")
  } else if (!isFalsyAttrValue(value)) {
    return (" " + key + "=\"" + (escape(String(value))) + "\"")
  }
  return ''
}

/*  */

var VNode = function VNode (
  tag,
  data,
  children,
  text,
  elm,
  context,
  componentOptions,
  asyncFactory
) {
  this.tag = tag;
  this.data = data;
  this.children = children;
  this.text = text;
  this.elm = elm;
  this.ns = undefined;
  this.context = context;
  this.fnContext = undefined;
  this.fnOptions = undefined;
  this.fnScopeId = undefined;
  this.key = data && data.key;
  this.componentOptions = componentOptions;
  this.componentInstance = undefined;
  this.parent = undefined;
  this.raw = false;
  this.isStatic = false;
  this.isRootInsert = true;
  this.isComment = false;
  this.isCloned = false;
  this.isOnce = false;
  this.asyncFactory = asyncFactory;
  this.asyncMeta = undefined;
  this.isAsyncPlaceholder = false;
};

var prototypeAccessors = { child: { configurable: true } };

// DEPRECATED: alias for componentInstance for backwards compat.
/* istanbul ignore next */
prototypeAccessors.child.get = function () {
  return this.componentInstance
};

Object.defineProperties( VNode.prototype, prototypeAccessors );

var createEmptyVNode = function (text) {
  if ( text === void 0 ) text = '';

  var node = new VNode();
  node.text = text;
  node.isComment = true;
  return node
};

function createTextVNode (val) {
  return new VNode(undefined, undefined, undefined, String(val))
}

// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
function cloneVNode (vnode) {
  var cloned = new VNode(
    vnode.tag,
    vnode.data,
    // #7975
    // clone children array to avoid mutating original in case of cloning
    // a child.
    vnode.children && vnode.children.slice(),
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  );
  cloned.ns = vnode.ns;
  cloned.isStatic = vnode.isStatic;
  cloned.key = vnode.key;
  cloned.isComment = vnode.isComment;
  cloned.fnContext = vnode.fnContext;
  cloned.fnOptions = vnode.fnOptions;
  cloned.fnScopeId = vnode.fnScopeId;
  cloned.asyncMeta = vnode.asyncMeta;
  cloned.isCloned = true;
  return cloned
}

/*  */

function renderDOMProps (node) {
  var props = node.data.domProps;
  var res = '';

  var parent = node.parent;
  while (isDef(parent)) {
    if (parent.data && parent.data.domProps) {
      props = extend(extend({}, props), parent.data.domProps);
    }
    parent = parent.parent;
  }

  if (isUndef(props)) {
    return res
  }

  var attrs = node.data.attrs;
  for (var key in props) {
    if (key === 'innerHTML') {
      setText(node, props[key], true);
    } else if (key === 'textContent') {
      setText(node, props[key], false);
    } else if (key === 'value' && node.tag === 'textarea') {
      setText(node, props[key], false);
    } else {
      // $flow-disable-line (WTF?)
      var attr = propsToAttrMap[key] || key.toLowerCase();
      if (isRenderableAttr(attr) &&
        // avoid rendering double-bound props/attrs twice
        !(isDef(attrs) && isDef(attrs[attr]))
      ) {
        res += renderAttr(attr, props[key]);
      }
    }
  }
  return res
}

function setText (node, text, raw) {
  var child = new VNode(undefined, undefined, undefined, text);
  child.raw = raw;
  node.children = [child];
}

/*  */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
var unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/;

/**
 * Define a property.
 */
function def (obj, key, val, enumerable) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  });
}

/*  */

// can we use __proto__?
var hasProto = '__proto__' in {};

// Browser environment sniffing
var inBrowser = typeof window !== 'undefined';
var inWeex = typeof WXEnvironment !== 'undefined' && !!WXEnvironment.platform;
var weexPlatform = inWeex && WXEnvironment.platform.toLowerCase();
var UA = inBrowser && window.navigator.userAgent.toLowerCase();
var isIE = UA && /msie|trident/.test(UA);
var isIE9 = UA && UA.indexOf('msie 9.0') > 0;
var isEdge = UA && UA.indexOf('edge/') > 0;
var isAndroid = (UA && UA.indexOf('android') > 0) || (weexPlatform === 'android');
var isIOS = (UA && /iphone|ipad|ipod|ios/.test(UA)) || (weexPlatform === 'ios');
var isChrome = UA && /chrome\/\d+/.test(UA) && !isEdge;
var isPhantomJS = UA && /phantomjs/.test(UA);
var isFF = UA && UA.match(/firefox\/(\d+)/);

// Firefox has a "watch" function on Object.prototype...
var nativeWatch = ({}).watch;

var supportsPassive = false;
if (inBrowser) {
  try {
    var opts = {};
    Object.defineProperty(opts, 'passive', ({
      get: function get () {
        /* istanbul ignore next */
        supportsPassive = true;
      }
    })); // https://github.com/facebook/flow/issues/285
    window.addEventListener('test-passive', null, opts);
  } catch (e) {}
}

// this needs to be lazy-evaled because vue may be required before
// vue-server-renderer can set VUE_ENV
var _isServer;
var isServerRendering = function () {
  if (_isServer === undefined) {
    /* istanbul ignore if */
    if (!inBrowser && !inWeex && typeof global !== 'undefined') {
      // detect presence of vue-server-renderer and avoid
      // Webpack shimming the process
      _isServer = global['process'] && global['process'].env.VUE_ENV === 'server';
    } else {
      _isServer = false;
    }
  }
  return _isServer
};

/* istanbul ignore next */
function isNative (Ctor) {
  return typeof Ctor === 'function' && /native code/.test(Ctor.toString())
}

var hasSymbol =
  typeof Symbol !== 'undefined' && isNative(Symbol) &&
  typeof Reflect !== 'undefined' && isNative(Reflect.ownKeys);

var _Set;
/* istanbul ignore if */ // $flow-disable-line
if (typeof Set !== 'undefined' && isNative(Set)) {
  // use native Set when available.
  _Set = Set;
} else {
  // a non-standard Set polyfill that only works with primitive keys.
  _Set = /*@__PURE__*/(function () {
    function Set () {
      this.set = Object.create(null);
    }
    Set.prototype.has = function has (key) {
      return this.set[key] === true
    };
    Set.prototype.add = function add (key) {
      this.set[key] = true;
    };
    Set.prototype.clear = function clear () {
      this.set = Object.create(null);
    };

    return Set;
  }());
}

var SSR_ATTR = 'data-server-rendered';

var ASSET_TYPES = [
  'component',
  'directive',
  'filter'
];

var LIFECYCLE_HOOKS = [
  'beforeCreate',
  'created',
  'beforeMount',
  'mounted',
  'beforeUpdate',
  'updated',
  'beforeDestroy',
  'destroyed',
  'activated',
  'deactivated',
  'errorCaptured',
  'serverPrefetch'
];

/*  */



var config = ({
  /**
   * Option merge strategies (used in core/util/options)
   */
  // $flow-disable-line
  optionMergeStrategies: Object.create(null),

  /**
   * Whether to suppress warnings.
   */
  silent: false,

  /**
   * Show production mode tip message on boot?
   */
  productionTip: "development" !== 'production',

  /**
   * Whether to enable devtools
   */
  devtools: "development" !== 'production',

  /**
   * Whether to record perf
   */
  performance: false,

  /**
   * Error handler for watcher errors
   */
  errorHandler: null,

  /**
   * Warn handler for watcher warns
   */
  warnHandler: null,

  /**
   * Ignore certain custom elements
   */
  ignoredElements: [],

  /**
   * Custom user key aliases for v-on
   */
  // $flow-disable-line
  keyCodes: Object.create(null),

  /**
   * Check if a tag is reserved so that it cannot be registered as a
   * component. This is platform-dependent and may be overwritten.
   */
  isReservedTag: no,

  /**
   * Check if an attribute is reserved so that it cannot be used as a component
   * prop. This is platform-dependent and may be overwritten.
   */
  isReservedAttr: no,

  /**
   * Check if a tag is an unknown element.
   * Platform-dependent.
   */
  isUnknownElement: no,

  /**
   * Get the namespace of an element
   */
  getTagNamespace: noop,

  /**
   * Parse the real tag name for the specific platform.
   */
  parsePlatformTagName: identity,

  /**
   * Check if an attribute must be bound using property, e.g. value
   * Platform-dependent.
   */
  mustUseProp: no,

  /**
   * Perform updates asynchronously. Intended to be used by Vue Test Utils
   * This will significantly reduce performance if set to false.
   */
  async: true,

  /**
   * Exposed for legacy reasons
   */
  _lifecycleHooks: LIFECYCLE_HOOKS
});

/*  */

var warn = noop;
var tip = noop;
var generateComponentTrace = (noop); // work around flow check
var formatComponentName = (noop);

{
  var hasConsole = typeof console !== 'undefined';
  var classifyRE = /(?:^|[-_])(\w)/g;
  var classify = function (str) { return str
    .replace(classifyRE, function (c) { return c.toUpperCase(); })
    .replace(/[-_]/g, ''); };

  warn = function (msg, vm) {
    var trace = vm ? generateComponentTrace(vm) : '';

    if (config.warnHandler) {
      config.warnHandler.call(null, msg, vm, trace);
    } else if (hasConsole && (!config.silent)) {
      console.error(("[Vue warn]: " + msg + trace));
    }
  };

  tip = function (msg, vm) {
    if (hasConsole && (!config.silent)) {
      console.warn("[Vue tip]: " + msg + (
        vm ? generateComponentTrace(vm) : ''
      ));
    }
  };

  formatComponentName = function (vm, includeFile) {
    if (vm.$root === vm) {
      return '<Root>'
    }
    var options = typeof vm === 'function' && vm.cid != null
      ? vm.options
      : vm._isVue
        ? vm.$options || vm.constructor.options
        : vm;
    var name = options.name || options._componentTag;
    var file = options.__file;
    if (!name && file) {
      var match = file.match(/([^/\\]+)\.vue$/);
      name = match && match[1];
    }

    return (
      (name ? ("<" + (classify(name)) + ">") : "<Anonymous>") +
      (file && includeFile !== false ? (" at " + file) : '')
    )
  };

  var repeat = function (str, n) {
    var res = '';
    while (n) {
      if (n % 2 === 1) { res += str; }
      if (n > 1) { str += str; }
      n >>= 1;
    }
    return res
  };

  generateComponentTrace = function (vm) {
    if (vm._isVue && vm.$parent) {
      var tree = [];
      var currentRecursiveSequence = 0;
      while (vm) {
        if (tree.length > 0) {
          var last = tree[tree.length - 1];
          if (last.constructor === vm.constructor) {
            currentRecursiveSequence++;
            vm = vm.$parent;
            continue
          } else if (currentRecursiveSequence > 0) {
            tree[tree.length - 1] = [last, currentRecursiveSequence];
            currentRecursiveSequence = 0;
          }
        }
        tree.push(vm);
        vm = vm.$parent;
      }
      return '\n\nfound in\n\n' + tree
        .map(function (vm, i) { return ("" + (i === 0 ? '---> ' : repeat(' ', 5 + i * 2)) + (Array.isArray(vm)
            ? ((formatComponentName(vm[0])) + "... (" + (vm[1]) + " recursive calls)")
            : formatComponentName(vm))); })
        .join('\n')
    } else {
      return ("\n\n(found in " + (formatComponentName(vm)) + ")")
    }
  };
}

/*  */

var uid = 0;

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
var Dep = function Dep () {
  this.id = uid++;
  this.subs = [];
};

Dep.prototype.addSub = function addSub (sub) {
  this.subs.push(sub);
};

Dep.prototype.removeSub = function removeSub (sub) {
  remove(this.subs, sub);
};

Dep.prototype.depend = function depend () {
  if (Dep.target) {
    Dep.target.addDep(this);
  }
};

Dep.prototype.notify = function notify () {
  // stabilize the subscriber list first
  var subs = this.subs.slice();
  if ( !config.async) {
    // subs aren't sorted in scheduler if not running async
    // we need to sort them now to make sure they fire in correct
    // order
    subs.sort(function (a, b) { return a.id - b.id; });
  }
  for (var i = 0, l = subs.length; i < l; i++) {
    subs[i].update();
  }
};

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null;
var targetStack = [];

function pushTarget (target) {
  targetStack.push(target);
  Dep.target = target;
}

function popTarget () {
  targetStack.pop();
  Dep.target = targetStack[targetStack.length - 1];
}

/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

var arrayProto = Array.prototype;
var arrayMethods = Object.create(arrayProto);

var methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
];

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  var original = arrayProto[method];
  def(arrayMethods, method, function mutator () {
    var args = [], len = arguments.length;
    while ( len-- ) args[ len ] = arguments[ len ];

    var result = original.apply(this, args);
    var ob = this.__ob__;
    var inserted;
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args;
        break
      case 'splice':
        inserted = args.slice(2);
        break
    }
    if (inserted) { ob.observeArray(inserted); }
    // notify change
    ob.dep.notify();
    return result
  });
});

/*  */

var arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
var shouldObserve = true;

function toggleObserving (value) {
  shouldObserve = value;
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
var Observer = function Observer (value) {
  this.value = value;
  this.dep = new Dep();
  this.vmCount = 0;
  def(value, '__ob__', this);
  if (Array.isArray(value)) {
    if (hasProto) {
      protoAugment(value, arrayMethods);
    } else {
      copyAugment(value, arrayMethods, arrayKeys);
    }
    this.observeArray(value);
  } else {
    this.walk(value);
  }
};

/**
 * Walk through all properties and convert them into
 * getter/setters. This method should only be called when
 * value type is Object.
 */
Observer.prototype.walk = function walk (obj) {
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    defineReactive(obj, keys[i]);
  }
};

/**
 * Observe a list of Array items.
 */
Observer.prototype.observeArray = function observeArray (items) {
  for (var i = 0, l = items.length; i < l; i++) {
    observe(items[i]);
  }
};

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src) {
  /* eslint-disable no-proto */
  target.__proto__ = src;
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target, src, keys) {
  for (var i = 0, l = keys.length; i < l; i++) {
    var key = keys[i];
    def(target, key, src[key]);
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
function observe (value, asRootData) {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  var ob;
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__;
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value);
  }
  if (asRootData && ob) {
    ob.vmCount++;
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
function defineReactive (
  obj,
  key,
  val,
  customSetter,
  shallow
) {
  var dep = new Dep();

  var property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  var getter = property && property.get;
  var setter = property && property.set;
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  var childOb = !shallow && observe(val);
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      var value = getter ? getter.call(obj) : val;
      if (Dep.target) {
        dep.depend();
        if (childOb) {
          childOb.dep.depend();
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      var value = getter ? getter.call(obj) : val;
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if ( customSetter) {
        customSetter();
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) { return }
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      childOb = !shallow && observe(newVal);
      dep.notify();
    }
  });
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
function set (target, key, val) {
  if (
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(("Cannot set reactive property on undefined, null, or primitive value: " + ((target))));
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key);
    target.splice(key, 1, val);
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val
  }
  var ob = (target).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
     warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    );
    return val
  }
  if (!ob) {
    target[key] = val;
    return val
  }
  defineReactive(ob.value, key, val);
  ob.dep.notify();
  return val
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value) {
  for (var e = (void 0), i = 0, l = value.length; i < l; i++) {
    e = value[i];
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}

/*  */

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
var strats = config.optionMergeStrategies;

/**
 * Options with restrictions
 */
{
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        "option \"" + key + "\" can only be used during instance " +
        'creation with the `new` keyword.'
      );
    }
    return defaultStrat(parent, child)
  };
}

/**
 * Helper that recursively merges two data objects together.
 */
function mergeData (to, from) {
  if (!from) { return to }
  var key, toVal, fromVal;

  var keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from);

  for (var i = 0; i < keys.length; i++) {
    key = keys[i];
    // in case the object is already observed...
    if (key === '__ob__') { continue }
    toVal = to[key];
    fromVal = from[key];
    if (!hasOwn(to, key)) {
      set(to, key, fromVal);
    } else if (
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal);
    }
  }
  return to
}

/**
 * Data
 */
function mergeDataOrFn (
  parentVal,
  childVal,
  vm
) {
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    return function mergedInstanceDataFn () {
      // instance merge
      var instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal;
      var defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal;
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

strats.data = function (
  parentVal,
  childVal,
  vm
) {
  if (!vm) {
    if (childVal && typeof childVal !== 'function') {
       warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      );

      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
};

/**
 * Hooks and props are merged as arrays.
 */
function mergeHook (
  parentVal,
  childVal
) {
  var res = childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal;
  return res
    ? dedupeHooks(res)
    : res
}

function dedupeHooks (hooks) {
  var res = [];
  for (var i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i]);
    }
  }
  return res
}

LIFECYCLE_HOOKS.forEach(function (hook) {
  strats[hook] = mergeHook;
});

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal,
  childVal,
  vm,
  key
) {
  var res = Object.create(parentVal || null);
  if (childVal) {
     assertObjectType(key, childVal, vm);
    return extend(res, childVal)
  } else {
    return res
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets;
});

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
strats.watch = function (
  parentVal,
  childVal,
  vm,
  key
) {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) { parentVal = undefined; }
  if (childVal === nativeWatch) { childVal = undefined; }
  /* istanbul ignore if */
  if (!childVal) { return Object.create(parentVal || null) }
  {
    assertObjectType(key, childVal, vm);
  }
  if (!parentVal) { return childVal }
  var ret = {};
  extend(ret, parentVal);
  for (var key$1 in childVal) {
    var parent = ret[key$1];
    var child = childVal[key$1];
    if (parent && !Array.isArray(parent)) {
      parent = [parent];
    }
    ret[key$1] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child];
  }
  return ret
};

/**
 * Other object hashes.
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal,
  childVal,
  vm,
  key
) {
  if (childVal && "development" !== 'production') {
    assertObjectType(key, childVal, vm);
  }
  if (!parentVal) { return childVal }
  var ret = Object.create(null);
  extend(ret, parentVal);
  if (childVal) { extend(ret, childVal); }
  return ret
};
strats.provide = mergeDataOrFn;

/**
 * Default strategy.
 */
var defaultStrat = function (parentVal, childVal) {
  return childVal === undefined
    ? parentVal
    : childVal
};

/**
 * Validate component names
 */
function checkComponents (options) {
  for (var key in options.components) {
    validateComponentName(key);
  }
}

function validateComponentName (name) {
  if (!new RegExp(("^[a-zA-Z][\\-\\.0-9_" + (unicodeRegExp.source) + "]*$")).test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'should conform to valid custom element name in html5 specification.'
    );
  }
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    );
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
function normalizeProps (options, vm) {
  var props = options.props;
  if (!props) { return }
  var res = {};
  var i, val, name;
  if (Array.isArray(props)) {
    i = props.length;
    while (i--) {
      val = props[i];
      if (typeof val === 'string') {
        name = camelize(val);
        res[name] = { type: null };
      } else {
        warn('props must be strings when using array syntax.');
      }
    }
  } else if (isPlainObject(props)) {
    for (var key in props) {
      val = props[key];
      name = camelize(key);
      res[name] = isPlainObject(val)
        ? val
        : { type: val };
    }
  } else {
    warn(
      "Invalid value for option \"props\": expected an Array or an Object, " +
      "but got " + (toRawType(props)) + ".",
      vm
    );
  }
  options.props = res;
}

/**
 * Normalize all injections into Object-based format
 */
function normalizeInject (options, vm) {
  var inject = options.inject;
  if (!inject) { return }
  var normalized = options.inject = {};
  if (Array.isArray(inject)) {
    for (var i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] };
    }
  } else if (isPlainObject(inject)) {
    for (var key in inject) {
      var val = inject[key];
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val };
    }
  } else {
    warn(
      "Invalid value for option \"inject\": expected an Array or an Object, " +
      "but got " + (toRawType(inject)) + ".",
      vm
    );
  }
}

/**
 * Normalize raw function directives into object format.
 */
function normalizeDirectives (options) {
  var dirs = options.directives;
  if (dirs) {
    for (var key in dirs) {
      var def = dirs[key];
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def };
      }
    }
  }
}

function assertObjectType (name, value, vm) {
  if (!isPlainObject(value)) {
    warn(
      "Invalid value for option \"" + name + "\": expected an Object, " +
      "but got " + (toRawType(value)) + ".",
      vm
    );
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
function mergeOptions (
  parent,
  child,
  vm
) {
  {
    checkComponents(child);
  }

  if (typeof child === 'function') {
    child = child.options;
  }

  normalizeProps(child, vm);
  normalizeInject(child, vm);
  normalizeDirectives(child);

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  if (!child._base) {
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm);
    }
    if (child.mixins) {
      for (var i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm);
      }
    }
  }

  var options = {};
  var key;
  for (key in parent) {
    mergeField(key);
  }
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key);
    }
  }
  function mergeField (key) {
    var strat = strats[key] || defaultStrat;
    options[key] = strat(parent[key], child[key], vm, key);
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
function resolveAsset (
  options,
  type,
  id,
  warnMissing
) {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  var assets = options[type];
  // check local registration variations first
  if (hasOwn(assets, id)) { return assets[id] }
  var camelizedId = camelize(id);
  if (hasOwn(assets, camelizedId)) { return assets[camelizedId] }
  var PascalCaseId = capitalize(camelizedId);
  if (hasOwn(assets, PascalCaseId)) { return assets[PascalCaseId] }
  // fallback to prototype chain
  var res = assets[id] || assets[camelizedId] || assets[PascalCaseId];
  if ( warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    );
  }
  return res
}

/*  */



function validateProp (
  key,
  propOptions,
  propsData,
  vm
) {
  var prop = propOptions[key];
  var absent = !hasOwn(propsData, key);
  var value = propsData[key];
  // boolean casting
  var booleanIndex = getTypeIndex(Boolean, prop.type);
  if (booleanIndex > -1) {
    if (absent && !hasOwn(prop, 'default')) {
      value = false;
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      var stringIndex = getTypeIndex(String, prop.type);
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true;
      }
    }
  }
  // check default value
  if (value === undefined) {
    value = getPropDefaultValue(vm, prop, key);
    // since the default value is a fresh copy,
    // make sure to observe it.
    var prevShouldObserve = shouldObserve;
    toggleObserving(true);
    observe(value);
    toggleObserving(prevShouldObserve);
  }
  {
    assertProp(prop, key, value, vm, absent);
  }
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue (vm, prop, key) {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  var def = prop.default;
  // warn against non-factory defaults for Object & Array
  if ( isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    );
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 */
function assertProp (
  prop,
  name,
  value,
  vm,
  absent
) {
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    );
    return
  }
  if (value == null && !prop.required) {
    return
  }
  var type = prop.type;
  var valid = !type || type === true;
  var expectedTypes = [];
  if (type) {
    if (!Array.isArray(type)) {
      type = [type];
    }
    for (var i = 0; i < type.length && !valid; i++) {
      var assertedType = assertType(value, type[i]);
      expectedTypes.push(assertedType.expectedType || '');
      valid = assertedType.valid;
    }
  }

  if (!valid) {
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    );
    return
  }
  var validator = prop.validator;
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      );
    }
  }
}

var simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/;

function assertType (value, type) {
  var valid;
  var expectedType = getType(type);
  if (simpleCheckRE.test(expectedType)) {
    var t = typeof value;
    valid = t === expectedType.toLowerCase();
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type;
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value);
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value);
  } else {
    valid = value instanceof type;
  }
  return {
    valid: valid,
    expectedType: expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType (fn) {
  var match = fn && fn.toString().match(/^\s*function (\w+)/);
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex (type, expectedTypes) {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (var i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  var message = "Invalid prop: type check failed for prop \"" + name + "\"." +
    " Expected " + (expectedTypes.map(capitalize).join(', '));
  var expectedType = expectedTypes[0];
  var receivedType = toRawType(value);
  var expectedValue = styleValue(value, expectedType);
  var receivedValue = styleValue(value, receivedType);
  // check if we need to specify expected value
  if (expectedTypes.length === 1 &&
      isExplicable(expectedType) &&
      !isBoolean(expectedType, receivedType)) {
    message += " with value " + expectedValue;
  }
  message += ", got " + receivedType + " ";
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += "with value " + receivedValue + ".";
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return ("\"" + value + "\"")
  } else if (type === 'Number') {
    return ("" + (Number(value)))
  } else {
    return ("" + value)
  }
}

function isExplicable (value) {
  var explicitTypes = ['string', 'number', 'boolean'];
  return explicitTypes.some(function (elem) { return value.toLowerCase() === elem; })
}

function isBoolean () {
  var args = [], len = arguments.length;
  while ( len-- ) args[ len ] = arguments[ len ];

  return args.some(function (elem) { return elem.toLowerCase() === 'boolean'; })
}

/*  */

function handleError (err, vm, info) {
  // Deactivate deps tracking while processing error handler to avoid possible infinite rendering.
  // See: https://github.com/vuejs/vuex/issues/1505
  pushTarget();
  try {
    if (vm) {
      var cur = vm;
      while ((cur = cur.$parent)) {
        var hooks = cur.$options.errorCaptured;
        if (hooks) {
          for (var i = 0; i < hooks.length; i++) {
            try {
              var capture = hooks[i].call(cur, err, vm, info) === false;
              if (capture) { return }
            } catch (e) {
              globalHandleError(e, cur, 'errorCaptured hook');
            }
          }
        }
      }
    }
    globalHandleError(err, vm, info);
  } finally {
    popTarget();
  }
}

function invokeWithErrorHandling (
  handler,
  context,
  args,
  vm,
  info
) {
  var res;
  try {
    res = args ? handler.apply(context, args) : handler.call(context);
    if (res && !res._isVue && isPromise(res) && !res._handled) {
      res.catch(function (e) { return handleError(e, vm, info + " (Promise/async)"); });
      // issue #9511
      // avoid catch triggering multiple times when nested calls
      res._handled = true;
    }
  } catch (e) {
    handleError(e, vm, info);
  }
  return res
}

function globalHandleError (err, vm, info) {
  if (config.errorHandler) {
    try {
      return config.errorHandler.call(null, err, vm, info)
    } catch (e) {
      // if the user intentionally throws the original error in the handler,
      // do not log it twice
      if (e !== err) {
        logError(e, null, 'config.errorHandler');
      }
    }
  }
  logError(err, vm, info);
}

function logError (err, vm, info) {
  {
    warn(("Error in " + info + ": \"" + (err.toString()) + "\""), vm);
  }
  /* istanbul ignore else */
  if ((inBrowser || inWeex) && typeof console !== 'undefined') {
    console.error(err);
  } else {
    throw err
  }
}

/*  */

var callbacks = [];

function flushCallbacks () {
  var copies = callbacks.slice(0);
  callbacks.length = 0;
  for (var i = 0; i < copies.length; i++) {
    copies[i]();
  }
}

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) ; else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  var counter = 1;
  var observer = new MutationObserver(flushCallbacks);
  var textNode = document.createTextNode(String(counter));
  observer.observe(textNode, {
    characterData: true
  });
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) ;

/*  */

function genClassForVnode (vnode) {
  var data = vnode.data;
  var parentNode = vnode;
  var childNode = vnode;
  while (isDef(childNode.componentInstance)) {
    childNode = childNode.componentInstance._vnode;
    if (childNode && childNode.data) {
      data = mergeClassData(childNode.data, data);
    }
  }
  while (isDef(parentNode = parentNode.parent)) {
    if (parentNode && parentNode.data) {
      data = mergeClassData(data, parentNode.data);
    }
  }
  return renderClass(data.staticClass, data.class)
}

function mergeClassData (child, parent) {
  return {
    staticClass: concat(child.staticClass, parent.staticClass),
    class: isDef(child.class)
      ? [child.class, parent.class]
      : parent.class
  }
}

function renderClass (
  staticClass,
  dynamicClass
) {
  if (isDef(staticClass) || isDef(dynamicClass)) {
    return concat(staticClass, stringifyClass(dynamicClass))
  }
  /* istanbul ignore next */
  return ''
}

function concat (a, b) {
  return a ? b ? (a + ' ' + b) : a : (b || '')
}

function stringifyClass (value) {
  if (Array.isArray(value)) {
    return stringifyArray(value)
  }
  if (isObject(value)) {
    return stringifyObject(value)
  }
  if (typeof value === 'string') {
    return value
  }
  /* istanbul ignore next */
  return ''
}

function stringifyArray (value) {
  var res = '';
  var stringified;
  for (var i = 0, l = value.length; i < l; i++) {
    if (isDef(stringified = stringifyClass(value[i])) && stringified !== '') {
      if (res) { res += ' '; }
      res += stringified;
    }
  }
  return res
}

function stringifyObject (value) {
  var res = '';
  for (var key in value) {
    if (value[key]) {
      if (res) { res += ' '; }
      res += key;
    }
  }
  return res
}

/*  */

var isHTMLTag = makeMap(
  'html,body,base,head,link,meta,style,title,' +
  'address,article,aside,footer,header,h1,h2,h3,h4,h5,h6,hgroup,nav,section,' +
  'div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,' +
  'a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,rtc,ruby,' +
  's,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,' +
  'embed,object,param,source,canvas,script,noscript,del,ins,' +
  'caption,col,colgroup,table,thead,tbody,td,th,tr,' +
  'button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,' +
  'output,progress,select,textarea,' +
  'details,dialog,menu,menuitem,summary,' +
  'content,element,shadow,template,blockquote,iframe,tfoot'
);

// this map is intentionally selective, only covering SVG elements that may
// contain child elements.
var isSVG = makeMap(
  'svg,animate,circle,clippath,cursor,defs,desc,ellipse,filter,font-face,' +
  'foreignObject,g,glyph,image,line,marker,mask,missing-glyph,path,pattern,' +
  'polygon,polyline,rect,switch,symbol,text,textpath,tspan,use,view',
  true
);

var isPreTag = function (tag) { return tag === 'pre'; };

var isReservedTag = function (tag) {
  return isHTMLTag(tag) || isSVG(tag)
};

function getTagNamespace (tag) {
  if (isSVG(tag)) {
    return 'svg'
  }
  // basic support for MathML
  // note it doesn't support other MathML elements being component roots
  if (tag === 'math') {
    return 'math'
  }
}

var isTextInputType = makeMap('text,number,password,search,email,tel,url');

/*  */

function renderClass$1 (node) {
  var classList = genClassForVnode(node);
  if (classList !== '') {
    return (" class=\"" + (escape(classList)) + "\"")
  }
}

/*  */

var parseStyleText = cached(function (cssText) {
  var res = {};
  var listDelimiter = /;(?![^(]*\))/g;
  var propertyDelimiter = /:(.+)/;
  cssText.split(listDelimiter).forEach(function (item) {
    if (item) {
      var tmp = item.split(propertyDelimiter);
      tmp.length > 1 && (res[tmp[0].trim()] = tmp[1].trim());
    }
  });
  return res
});

// merge static and dynamic style data on the same vnode
function normalizeStyleData (data) {
  var style = normalizeStyleBinding(data.style);
  // static style is pre-processed into an object during compilation
  // and is always a fresh object, so it's safe to merge into it
  return data.staticStyle
    ? extend(data.staticStyle, style)
    : style
}

// normalize possible array / string values into Object
function normalizeStyleBinding (bindingStyle) {
  if (Array.isArray(bindingStyle)) {
    return toObject(bindingStyle)
  }
  if (typeof bindingStyle === 'string') {
    return parseStyleText(bindingStyle)
  }
  return bindingStyle
}

/**
 * parent component style should be after child's
 * so that parent component's style could override it
 */
function getStyle (vnode, checkChild) {
  var res = {};
  var styleData;

  if (checkChild) {
    var childNode = vnode;
    while (childNode.componentInstance) {
      childNode = childNode.componentInstance._vnode;
      if (
        childNode && childNode.data &&
        (styleData = normalizeStyleData(childNode.data))
      ) {
        extend(res, styleData);
      }
    }
  }

  if ((styleData = normalizeStyleData(vnode.data))) {
    extend(res, styleData);
  }

  var parentNode = vnode;
  while ((parentNode = parentNode.parent)) {
    if (parentNode.data && (styleData = normalizeStyleData(parentNode.data))) {
      extend(res, styleData);
    }
  }
  return res
}

/*  */

function genStyle (style) {
  var styleText = '';
  for (var key in style) {
    var value = style[key];
    var hyphenatedKey = hyphenate(key);
    if (Array.isArray(value)) {
      for (var i = 0, len = value.length; i < len; i++) {
        styleText += normalizeValue(hyphenatedKey, value[i]);
      }
    } else {
      styleText += normalizeValue(hyphenatedKey, value);
    }
  }
  return styleText
}

function normalizeValue(key, value) {
  if (
    typeof value === 'string' ||
    (typeof value === 'number' && noUnitNumericStyleProps[key]) ||
    value === 0
  ) {
    return (key + ":" + value + ";")
  } else {
    // invalid values
    return ""
  }
}

function renderStyle (vnode) {
  var styleText = genStyle(getStyle(vnode, false));
  if (styleText !== '') {
    return (" style=" + (JSON.stringify(escape(styleText))))
  }
}

var modules = [
  renderAttrs,
  renderDOMProps,
  renderClass$1,
  renderStyle
];

/*  */

function show (node, dir) {
  if (!dir.value) {
    var style = node.data.style || (node.data.style = {});
    if (Array.isArray(style)) {
      style.push({ display: 'none' });
    } else {
      style.display = 'none';
    }
  }
}

/*  */

// this is only applied for <select v-model> because it is the only edge case
// that must be done at runtime instead of compile time.
function model (node, dir) {
  if (!node.children) { return }
  var value = dir.value;
  var isMultiple = node.data.attrs && node.data.attrs.multiple;
  for (var i = 0, l = node.children.length; i < l; i++) {
    var option = node.children[i];
    if (option.tag === 'option') {
      if (isMultiple) {
        var selected =
          Array.isArray(value) &&
          (looseIndexOf(value, getValue(option)) > -1);
        if (selected) {
          setSelected(option);
        }
      } else {
        if (looseEqual(value, getValue(option))) {
          setSelected(option);
          return
        }
      }
    }
  }
}

function getValue (option) {
  var data = option.data || {};
  return (
    (data.attrs && data.attrs.value) ||
    (data.domProps && data.domProps.value) ||
    (option.children && option.children[0] && option.children[0].text)
  )
}

function setSelected (option) {
  var data = option.data || (option.data = {});
  var attrs = data.attrs || (data.attrs = {});
  attrs.selected = '';
}

var baseDirectives = {
  show: show,
  model: model
};

/*  */

var isUnaryTag = makeMap(
  'area,base,br,col,embed,frame,hr,img,input,isindex,keygen,' +
  'link,meta,param,source,track,wbr'
);

// Elements that you can, intentionally, leave open
// (and which close themselves)
var canBeLeftOpenTag = makeMap(
  'colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr,source'
);

// HTML5 tags https://html.spec.whatwg.org/multipage/indices.html#elements-3
// Phrasing Content https://html.spec.whatwg.org/multipage/dom.html#phrasing-content
var isNonPhrasingTag = makeMap(
  'address,article,aside,base,blockquote,body,caption,col,colgroup,dd,' +
  'details,dialog,div,dl,dt,fieldset,figcaption,figure,footer,form,' +
  'h1,h2,h3,h4,h5,h6,head,header,hgroup,hr,html,legend,li,menuitem,meta,' +
  'optgroup,option,param,rp,rt,source,style,summary,tbody,td,tfoot,th,thead,' +
  'title,tr,track'
);

/*  */

var MAX_STACK_DEPTH = 800;
var noop$1 = function (_) { return _; };

var defer = typeof process !== 'undefined' && process.nextTick
  ? process.nextTick
  : typeof Promise !== 'undefined'
    ? function (fn) { return Promise.resolve().then(fn); }
    : typeof setTimeout !== 'undefined'
      ? setTimeout
      : noop$1;

if (defer === noop$1) {
  throw new Error(
    'Your JavaScript runtime does not support any asynchronous primitives ' +
    'that are required by vue-server-renderer. Please use a polyfill for ' +
    'either Promise or setTimeout.'
  )
}

function createWriteFunction (
  write,
  onError
) {
  var stackDepth = 0;
  var cachedWrite = function (text, next) {
    if (text && cachedWrite.caching) {
      cachedWrite.cacheBuffer[cachedWrite.cacheBuffer.length - 1] += text;
    }
    var waitForNext = write(text, next);
    if (waitForNext !== true) {
      if (stackDepth >= MAX_STACK_DEPTH) {
        defer(function () {
          try { next(); } catch (e) {
            onError(e);
          }
        });
      } else {
        stackDepth++;
        next();
        stackDepth--;
      }
    }
  };
  cachedWrite.caching = false;
  cachedWrite.cacheBuffer = [];
  cachedWrite.componentBuffer = [];
  return cachedWrite
}

/*  */

/**
 * Original RenderStream implementation by Sasha Aickin (@aickin)
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Modified by Evan You (@yyx990803)
 */

var stream = require('stream');

var RenderStream = /*@__PURE__*/(function (superclass) {
  function RenderStream (render) {
    var this$1 = this;

    superclass.call(this);
    this.buffer = '';
    this.render = render;
    this.expectedSize = 0;

    this.write = createWriteFunction(function (text, next) {
      var n = this$1.expectedSize;
      this$1.buffer += text;
      if (this$1.buffer.length >= n) {
        this$1.next = next;
        this$1.pushBySize(n);
        return true // we will decide when to call next
      }
      return false
    }, function (err) {
      this$1.emit('error', err);
    });

    this.end = function () {
      this$1.emit('beforeEnd');
      // the rendering is finished; we should push out the last of the buffer.
      this$1.done = true;
      this$1.push(this$1.buffer);
    };
  }

  if ( superclass ) RenderStream.__proto__ = superclass;
  RenderStream.prototype = Object.create( superclass && superclass.prototype );
  RenderStream.prototype.constructor = RenderStream;

  RenderStream.prototype.pushBySize = function pushBySize (n) {
    var bufferToPush = this.buffer.substring(0, n);
    this.buffer = this.buffer.substring(n);
    this.push(bufferToPush);
  };

  RenderStream.prototype.tryRender = function tryRender () {
    try {
      this.render(this.write, this.end);
    } catch (e) {
      this.emit('error', e);
    }
  };

  RenderStream.prototype.tryNext = function tryNext () {
    try {
      this.next();
    } catch (e) {
      this.emit('error', e);
    }
  };

  RenderStream.prototype._read = function _read (n) {
    this.expectedSize = n;
    // it's possible that the last chunk added bumped the buffer up to > 2 * n,
    // which means we will need to go through multiple read calls to drain it
    // down to < n.
    if (isTrue(this.done)) {
      this.push(null);
      return
    }
    if (this.buffer.length >= n) {
      this.pushBySize(n);
      return
    }
    if (isUndef(this.next)) {
      // start the rendering chain.
      this.tryRender();
    } else {
      // continue with the rendering.
      this.tryNext();
    }
  };

  return RenderStream;
}(stream.Readable));

/*  */



var RenderContext = function RenderContext (options) {
  this.userContext = options.userContext;
  this.activeInstance = options.activeInstance;
  this.renderStates = [];

  this.write = options.write;
  this.done = options.done;
  this.renderNode = options.renderNode;

  this.isUnaryTag = options.isUnaryTag;
  this.modules = options.modules;
  this.directives = options.directives;

  var cache = options.cache;
  if (cache && (!cache.get || !cache.set)) {
    throw new Error('renderer cache must implement at least get & set.')
  }
  this.cache = cache;
  this.get = cache && normalizeAsync(cache, 'get');
  this.has = cache && normalizeAsync(cache, 'has');

  this.next = this.next.bind(this);
};

RenderContext.prototype.next = function next () {
  // eslint-disable-next-line
  while (true) {
    var lastState = this.renderStates[this.renderStates.length - 1];
    if (isUndef(lastState)) {
      return this.done()
    }
    /* eslint-disable no-case-declarations */
    switch (lastState.type) {
      case 'Element':
      case 'Fragment':
        var children = lastState.children;
      var total = lastState.total;
        var rendered = lastState.rendered++;
        if (rendered < total) {
          return this.renderNode(children[rendered], false, this, lastState.renderTree)
        } else {
          this.renderStates.pop();
          if (lastState.type === 'Element') {
            return this.write(lastState.endTag, this.next)
          }
        }
        break
      case 'Component':
        this.renderStates.pop();
        this.activeInstance = lastState.prevActive;
        break
      case 'ComponentWithCache':
        this.renderStates.pop();
        var buffer = lastState.buffer;
      var bufferIndex = lastState.bufferIndex;
      var componentBuffer = lastState.componentBuffer;
      var key = lastState.key;
        var result = {
          html: buffer[bufferIndex],
          components: componentBuffer[bufferIndex]
        };
        this.cache.set(key, result);
        if (bufferIndex === 0) {
          // this is a top-level cached component,
          // exit caching mode.
          this.write.caching = false;
        } else {
          // parent component is also being cached,
          // merge self into parent's result
          buffer[bufferIndex - 1] += result.html;
          var prev = componentBuffer[bufferIndex - 1];
          result.components.forEach(function (c) { return prev.add(c); });
        }
        buffer.length = bufferIndex;
        componentBuffer.length = bufferIndex;
        break
    }
  }
};

function normalizeAsync (cache, method) {
  var fn = cache[method];
  if (isUndef(fn)) {
    return
  } else if (fn.length > 1) {
    return function (key, cb) { return fn.call(cache, key, cb); }
  } else {
    return function (key, cb) { return cb(fn.call(cache, key)); }
  }
}

/*  */

var validDivisionCharRE = /[\w).+\-_$\]]/;

function parseFilters (exp) {
  var inSingle = false;
  var inDouble = false;
  var inTemplateString = false;
  var inRegex = false;
  var curly = 0;
  var square = 0;
  var paren = 0;
  var lastFilterIndex = 0;
  var c, prev, i, expression, filters;

  for (i = 0; i < exp.length; i++) {
    prev = c;
    c = exp.charCodeAt(i);
    if (inSingle) {
      if (c === 0x27 && prev !== 0x5C) { inSingle = false; }
    } else if (inDouble) {
      if (c === 0x22 && prev !== 0x5C) { inDouble = false; }
    } else if (inTemplateString) {
      if (c === 0x60 && prev !== 0x5C) { inTemplateString = false; }
    } else if (inRegex) {
      if (c === 0x2f && prev !== 0x5C) { inRegex = false; }
    } else if (
      c === 0x7C && // pipe
      exp.charCodeAt(i + 1) !== 0x7C &&
      exp.charCodeAt(i - 1) !== 0x7C &&
      !curly && !square && !paren
    ) {
      if (expression === undefined) {
        // first filter, end of expression
        lastFilterIndex = i + 1;
        expression = exp.slice(0, i).trim();
      } else {
        pushFilter();
      }
    } else {
      switch (c) {
        case 0x22: inDouble = true; break         // "
        case 0x27: inSingle = true; break         // '
        case 0x60: inTemplateString = true; break // `
        case 0x28: paren++; break                 // (
        case 0x29: paren--; break                 // )
        case 0x5B: square++; break                // [
        case 0x5D: square--; break                // ]
        case 0x7B: curly++; break                 // {
        case 0x7D: curly--; break                 // }
      }
      if (c === 0x2f) { // /
        var j = i - 1;
        var p = (void 0);
        // find first non-whitespace prev char
        for (; j >= 0; j--) {
          p = exp.charAt(j);
          if (p !== ' ') { break }
        }
        if (!p || !validDivisionCharRE.test(p)) {
          inRegex = true;
        }
      }
    }
  }

  if (expression === undefined) {
    expression = exp.slice(0, i).trim();
  } else if (lastFilterIndex !== 0) {
    pushFilter();
  }

  function pushFilter () {
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim());
    lastFilterIndex = i + 1;
  }

  if (filters) {
    for (i = 0; i < filters.length; i++) {
      expression = wrapFilter(expression, filters[i]);
    }
  }

  return expression
}

function wrapFilter (exp, filter) {
  var i = filter.indexOf('(');
  if (i < 0) {
    // _f: resolveFilter
    return ("_f(\"" + filter + "\")(" + exp + ")")
  } else {
    var name = filter.slice(0, i);
    var args = filter.slice(i + 1);
    return ("_f(\"" + name + "\")(" + exp + (args !== ')' ? ',' + args : args))
  }
}

/*  */

var defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g;
var regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g;

var buildRegex = cached(function (delimiters) {
  var open = delimiters[0].replace(regexEscapeRE, '\\$&');
  var close = delimiters[1].replace(regexEscapeRE, '\\$&');
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
});



function parseText (
  text,
  delimiters
) {
  var tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE;
  if (!tagRE.test(text)) {
    return
  }
  var tokens = [];
  var rawTokens = [];
  var lastIndex = tagRE.lastIndex = 0;
  var match, index, tokenValue;
  while ((match = tagRE.exec(text))) {
    index = match.index;
    // push text token
    if (index > lastIndex) {
      rawTokens.push(tokenValue = text.slice(lastIndex, index));
      tokens.push(JSON.stringify(tokenValue));
    }
    // tag token
    var exp = parseFilters(match[1].trim());
    tokens.push(("_s(" + exp + ")"));
    rawTokens.push({ '@binding': exp });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex));
    tokens.push(JSON.stringify(tokenValue));
  }
  return {
    expression: tokens.join('+'),
    tokens: rawTokens
  }
}

/*  */



/* eslint-disable no-unused-vars */
function baseWarn (msg, range) {
  console.error(("[Vue compiler]: " + msg));
}
/* eslint-enable no-unused-vars */

function pluckModuleFunction (
  modules,
  key
) {
  return modules
    ? modules.map(function (m) { return m[key]; }).filter(function (_) { return _; })
    : []
}

function addProp (el, name, value, range, dynamic) {
  (el.props || (el.props = [])).push(rangeSetItem({ name: name, value: value, dynamic: dynamic }, range));
  el.plain = false;
}

function addAttr (el, name, value, range, dynamic) {
  var attrs = dynamic
    ? (el.dynamicAttrs || (el.dynamicAttrs = []))
    : (el.attrs || (el.attrs = []));
  attrs.push(rangeSetItem({ name: name, value: value, dynamic: dynamic }, range));
  el.plain = false;
}

// add a raw attr (use this in preTransforms)
function addRawAttr (el, name, value, range) {
  el.attrsMap[name] = value;
  el.attrsList.push(rangeSetItem({ name: name, value: value }, range));
}

function addDirective (
  el,
  name,
  rawName,
  value,
  arg,
  isDynamicArg,
  modifiers,
  range
) {
  (el.directives || (el.directives = [])).push(rangeSetItem({
    name: name,
    rawName: rawName,
    value: value,
    arg: arg,
    isDynamicArg: isDynamicArg,
    modifiers: modifiers
  }, range));
  el.plain = false;
}

function prependModifierMarker (symbol, name, dynamic) {
  return dynamic
    ? ("_p(" + name + ",\"" + symbol + "\")")
    : symbol + name // mark the event as captured
}

function addHandler (
  el,
  name,
  value,
  modifiers,
  important,
  warn,
  range,
  dynamic
) {
  modifiers = modifiers || emptyObject;
  // warn prevent and passive modifier
  /* istanbul ignore if */
  if (
     warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.',
      range
    );
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  if (modifiers.right) {
    if (dynamic) {
      name = "(" + name + ")==='click'?'contextmenu':(" + name + ")";
    } else if (name === 'click') {
      name = 'contextmenu';
      delete modifiers.right;
    }
  } else if (modifiers.middle) {
    if (dynamic) {
      name = "(" + name + ")==='click'?'mouseup':(" + name + ")";
    } else if (name === 'click') {
      name = 'mouseup';
    }
  }

  // check capture modifier
  if (modifiers.capture) {
    delete modifiers.capture;
    name = prependModifierMarker('!', name, dynamic);
  }
  if (modifiers.once) {
    delete modifiers.once;
    name = prependModifierMarker('~', name, dynamic);
  }
  /* istanbul ignore if */
  if (modifiers.passive) {
    delete modifiers.passive;
    name = prependModifierMarker('&', name, dynamic);
  }

  var events;
  if (modifiers.native) {
    delete modifiers.native;
    events = el.nativeEvents || (el.nativeEvents = {});
  } else {
    events = el.events || (el.events = {});
  }

  var newHandler = rangeSetItem({ value: value.trim(), dynamic: dynamic }, range);
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers;
  }

  var handlers = events[name];
  /* istanbul ignore if */
  if (Array.isArray(handlers)) {
    important ? handlers.unshift(newHandler) : handlers.push(newHandler);
  } else if (handlers) {
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler];
  } else {
    events[name] = newHandler;
  }

  el.plain = false;
}

function getRawBindingAttr (
  el,
  name
) {
  return el.rawAttrsMap[':' + name] ||
    el.rawAttrsMap['v-bind:' + name] ||
    el.rawAttrsMap[name]
}

function getBindingAttr (
  el,
  name,
  getStatic
) {
  var dynamicValue =
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name);
  if (dynamicValue != null) {
    return parseFilters(dynamicValue)
  } else if (getStatic !== false) {
    var staticValue = getAndRemoveAttr(el, name);
    if (staticValue != null) {
      return JSON.stringify(staticValue)
    }
  }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.
function getAndRemoveAttr (
  el,
  name,
  removeFromMap
) {
  var val;
  if ((val = el.attrsMap[name]) != null) {
    var list = el.attrsList;
    for (var i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        list.splice(i, 1);
        break
      }
    }
  }
  if (removeFromMap) {
    delete el.attrsMap[name];
  }
  return val
}

function getAndRemoveAttrByRegex (
  el,
  name
) {
  var list = el.attrsList;
  for (var i = 0, l = list.length; i < l; i++) {
    var attr = list[i];
    if (name.test(attr.name)) {
      list.splice(i, 1);
      return attr
    }
  }
}

function rangeSetItem (
  item,
  range
) {
  if (range) {
    if (range.start != null) {
      item.start = range.start;
    }
    if (range.end != null) {
      item.end = range.end;
    }
  }
  return item
}

/*  */

function transformNode (el, options) {
  var warn = options.warn || baseWarn;
  var staticClass = getAndRemoveAttr(el, 'class');
  if ( staticClass) {
    var res = parseText(staticClass, options.delimiters);
    if (res) {
      warn(
        "class=\"" + staticClass + "\": " +
        'Interpolation inside attributes has been removed. ' +
        'Use v-bind or the colon shorthand instead. For example, ' +
        'instead of <div class="{{ val }}">, use <div :class="val">.',
        el.rawAttrsMap['class']
      );
    }
  }
  if (staticClass) {
    el.staticClass = JSON.stringify(staticClass);
  }
  var classBinding = getBindingAttr(el, 'class', false /* getStatic */);
  if (classBinding) {
    el.classBinding = classBinding;
  }
}

function genData (el) {
  var data = '';
  if (el.staticClass) {
    data += "staticClass:" + (el.staticClass) + ",";
  }
  if (el.classBinding) {
    data += "class:" + (el.classBinding) + ",";
  }
  return data
}

var klass = {
  staticKeys: ['staticClass'],
  transformNode: transformNode,
  genData: genData
};

/*  */

function transformNode$1 (el, options) {
  var warn = options.warn || baseWarn;
  var staticStyle = getAndRemoveAttr(el, 'style');
  if (staticStyle) {
    /* istanbul ignore if */
    {
      var res = parseText(staticStyle, options.delimiters);
      if (res) {
        warn(
          "style=\"" + staticStyle + "\": " +
          'Interpolation inside attributes has been removed. ' +
          'Use v-bind or the colon shorthand instead. For example, ' +
          'instead of <div style="{{ val }}">, use <div :style="val">.',
          el.rawAttrsMap['style']
        );
      }
    }
    el.staticStyle = JSON.stringify(parseStyleText(staticStyle));
  }

  var styleBinding = getBindingAttr(el, 'style', false /* getStatic */);
  if (styleBinding) {
    el.styleBinding = styleBinding;
  }
}

function genData$1 (el) {
  var data = '';
  if (el.staticStyle) {
    data += "staticStyle:" + (el.staticStyle) + ",";
  }
  if (el.styleBinding) {
    data += "style:(" + (el.styleBinding) + "),";
  }
  return data
}

var style = {
  staticKeys: ['staticStyle'],
  transformNode: transformNode$1,
  genData: genData$1
};

/**
 * Not type-checking this file because it's mostly vendor code.
 */

// Regular Expressions for parsing tags and attributes
var attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
var dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/;
var ncname = "[a-zA-Z_][\\-\\.0-9_a-zA-Z" + (unicodeRegExp.source) + "]*";
var qnameCapture = "((?:" + ncname + "\\:)?" + ncname + ")";
var startTagOpen = new RegExp(("^<" + qnameCapture));
var startTagClose = /^\s*(\/?)>/;
var endTag = new RegExp(("^<\\/" + qnameCapture + "[^>]*>"));
var doctype = /^<!DOCTYPE [^>]+>/i;
// #7298: escape - to avoid being passed as HTML comment when inlined in page
var comment = /^<!\--/;
var conditionalComment = /^<!\[/;

// Special Elements (can contain anything)
var isPlainTextElement = makeMap('script,style,textarea', true);
var reCache = {};

var decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
};
var encodedAttr = /&(?:lt|gt|quot|amp|#39);/g;
var encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g;

// #5992
var isIgnoreNewlineTag = makeMap('pre,textarea', true);
var shouldIgnoreFirstNewline = function (tag, html) { return tag && isIgnoreNewlineTag(tag) && html[0] === '\n'; };

function decodeAttr (value, shouldDecodeNewlines) {
  var re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr;
  return value.replace(re, function (match) { return decodingMap[match]; })
}

function parseHTML (html, options) {
  var stack = [];
  var expectHTML = options.expectHTML;
  var isUnaryTag = options.isUnaryTag || no;
  var canBeLeftOpenTag = options.canBeLeftOpenTag || no;
  var index = 0;
  var last, lastTag;
  while (html) {
    last = html;
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {
      var textEnd = html.indexOf('<');
      if (textEnd === 0) {
        // Comment:
        if (comment.test(html)) {
          var commentEnd = html.indexOf('-->');

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3);
            }
            advance(commentEnd + 3);
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          var conditionalEnd = html.indexOf(']>');

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2);
            continue
          }
        }

        // Doctype:
        var doctypeMatch = html.match(doctype);
        if (doctypeMatch) {
          advance(doctypeMatch[0].length);
          continue
        }

        // End tag:
        var endTagMatch = html.match(endTag);
        if (endTagMatch) {
          var curIndex = index;
          advance(endTagMatch[0].length);
          parseEndTag(endTagMatch[1], curIndex, index);
          continue
        }

        // Start tag:
        var startTagMatch = parseStartTag();
        if (startTagMatch) {
          handleStartTag(startTagMatch);
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1);
          }
          continue
        }
      }

      var text = (void 0), rest = (void 0), next = (void 0);
      if (textEnd >= 0) {
        rest = html.slice(textEnd);
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1);
          if (next < 0) { break }
          textEnd += next;
          rest = html.slice(textEnd);
        }
        text = html.substring(0, textEnd);
      }

      if (textEnd < 0) {
        text = html;
      }

      if (text) {
        advance(text.length);
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index);
      }
    } else {
      var endTagLength = 0;
      var stackedTag = lastTag.toLowerCase();
      var reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'));
      var rest$1 = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length;
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1);
        }
        if (options.chars) {
          options.chars(text);
        }
        return ''
      });
      index += html.length - rest$1.length;
      html = rest$1;
      parseEndTag(stackedTag, index - endTagLength, index);
    }

    if (html === last) {
      options.chars && options.chars(html);
      if ( !stack.length && options.warn) {
        options.warn(("Mal-formatted tag at end of template: \"" + html + "\""), { start: index + html.length });
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag();

  function advance (n) {
    index += n;
    html = html.substring(n);
  }

  function parseStartTag () {
    var start = html.match(startTagOpen);
    if (start) {
      var match = {
        tagName: start[1],
        attrs: [],
        start: index
      };
      advance(start[0].length);
      var end, attr;
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index;
        advance(attr[0].length);
        attr.end = index;
        match.attrs.push(attr);
      }
      if (end) {
        match.unarySlash = end[1];
        advance(end[0].length);
        match.end = index;
        return match
      }
    }
  }

  function handleStartTag (match) {
    var tagName = match.tagName;
    var unarySlash = match.unarySlash;

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag);
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName);
      }
    }

    var unary = isUnaryTag(tagName) || !!unarySlash;

    var l = match.attrs.length;
    var attrs = new Array(l);
    for (var i = 0; i < l; i++) {
      var args = match.attrs[i];
      var value = args[3] || args[4] || args[5] || '';
      var shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines;
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      };
      if ( options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length;
        attrs[i].end = args.end;
      }
    }

    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end });
      lastTag = tagName;
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end);
    }
  }

  function parseEndTag (tagName, start, end) {
    var pos, lowerCasedTagName;
    if (start == null) { start = index; }
    if (end == null) { end = index; }

    // Find the closest opened tag of the same type
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase();
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0;
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      for (var i = stack.length - 1; i >= pos; i--) {
        if (
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            ("tag <" + (stack[i].tag) + "> has no matching end tag."),
            { start: stack[i].start, end: stack[i].end }
          );
        }
        if (options.end) {
          options.end(stack[i].tag, start, end);
        }
      }

      // Remove the open elements from the stack
      stack.length = pos;
      lastTag = pos && stack[pos - 1].tag;
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end);
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end);
      }
      if (options.end) {
        options.end(tagName, start, end);
      }
    }
  }
}

/*  */

/**
 * Cross-platform code generation for component v-model
 */
function genComponentModel (
  el,
  value,
  modifiers
) {
  var ref = modifiers || {};
  var number = ref.number;
  var trim = ref.trim;

  var baseValueExpression = '$$v';
  var valueExpression = baseValueExpression;
  if (trim) {
    valueExpression =
      "(typeof " + baseValueExpression + " === 'string'" +
      "? " + baseValueExpression + ".trim()" +
      ": " + baseValueExpression + ")";
  }
  if (number) {
    valueExpression = "_n(" + valueExpression + ")";
  }
  var assignment = genAssignmentCode(value, valueExpression);

  el.model = {
    value: ("(" + value + ")"),
    expression: JSON.stringify(value),
    callback: ("function (" + baseValueExpression + ") {" + assignment + "}")
  };
}

/**
 * Cross-platform codegen helper for generating v-model value assignment code.
 */
function genAssignmentCode (
  value,
  assignment
) {
  var res = parseModel(value);
  if (res.key === null) {
    return (value + "=" + assignment)
  } else {
    return ("$set(" + (res.exp) + ", " + (res.key) + ", " + assignment + ")")
  }
}

/**
 * Parse a v-model expression into a base path and a final key segment.
 * Handles both dot-path and possible square brackets.
 *
 * Possible cases:
 *
 * - test
 * - test[key]
 * - test[test1[key]]
 * - test["a"][key]
 * - xxx.test[a[a].test1[key]]
 * - test.xxx.a["asa"][test1[key]]
 *
 */

var len, str, chr, index, expressionPos, expressionEndPos;



function parseModel (val) {
  // Fix https://github.com/vuejs/vue/pull/7730
  // allow v-model="obj.val " (trailing whitespace)
  val = val.trim();
  len = val.length;

  if (val.indexOf('[') < 0 || val.lastIndexOf(']') < len - 1) {
    index = val.lastIndexOf('.');
    if (index > -1) {
      return {
        exp: val.slice(0, index),
        key: '"' + val.slice(index + 1) + '"'
      }
    } else {
      return {
        exp: val,
        key: null
      }
    }
  }

  str = val;
  index = expressionPos = expressionEndPos = 0;

  while (!eof()) {
    chr = next();
    /* istanbul ignore if */
    if (isStringStart(chr)) {
      parseString(chr);
    } else if (chr === 0x5B) {
      parseBracket(chr);
    }
  }

  return {
    exp: val.slice(0, expressionPos),
    key: val.slice(expressionPos + 1, expressionEndPos)
  }
}

function next () {
  return str.charCodeAt(++index)
}

function eof () {
  return index >= len
}

function isStringStart (chr) {
  return chr === 0x22 || chr === 0x27
}

function parseBracket (chr) {
  var inBracket = 1;
  expressionPos = index;
  while (!eof()) {
    chr = next();
    if (isStringStart(chr)) {
      parseString(chr);
      continue
    }
    if (chr === 0x5B) { inBracket++; }
    if (chr === 0x5D) { inBracket--; }
    if (inBracket === 0) {
      expressionEndPos = index;
      break
    }
  }
}

function parseString (chr) {
  var stringQuote = chr;
  while (!eof()) {
    chr = next();
    if (chr === stringQuote) {
      break
    }
  }
}

/*  */

var onRE = /^@|^v-on:/;
var dirRE =  /^v-|^@|^:|^#/;
var forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
var forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
var stripParensRE = /^\(|\)$/g;
var dynamicArgRE = /^\[.*\]$/;

var argRE = /:(.*)$/;
var bindRE = /^:|^\.|^v-bind:/;
var modifierRE = /\.[^.\]]+(?=[^\]]*$)/g;

var slotRE = /^v-slot(:|$)|^#/;

var lineBreakRE = /[\r\n]/;
var whitespaceRE = /\s+/g;

var invalidAttributeRE = /[\s"'<>\/=]/;

var decodeHTMLCached = cached(he.decode);

var emptySlotScopeToken = "_empty_";

// configurable state
var warn$1;
var delimiters;
var transforms;
var preTransforms;
var postTransforms;
var platformIsPreTag;
var platformMustUseProp;
var platformGetTagNamespace;
var maybeComponent;

function createASTElement (
  tag,
  attrs,
  parent
) {
  return {
    type: 1,
    tag: tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    parent: parent,
    children: []
  }
}

/**
 * Convert HTML string to AST.
 */
function parse (
  template,
  options
) {
  warn$1 = options.warn || baseWarn;

  platformIsPreTag = options.isPreTag || no;
  platformMustUseProp = options.mustUseProp || no;
  platformGetTagNamespace = options.getTagNamespace || no;
  var isReservedTag = options.isReservedTag || no;
  maybeComponent = function (el) { return !!el.component || !isReservedTag(el.tag); };

  transforms = pluckModuleFunction(options.modules, 'transformNode');
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode');
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode');

  delimiters = options.delimiters;

  var stack = [];
  var preserveWhitespace = options.preserveWhitespace !== false;
  var whitespaceOption = options.whitespace;
  var root;
  var currentParent;
  var inVPre = false;
  var inPre = false;
  var warned = false;

  function warnOnce (msg, range) {
    if (!warned) {
      warned = true;
      warn$1(msg, range);
    }
  }

  function closeElement (element) {
    trimEndingWhitespace(element);
    if (!inVPre && !element.processed) {
      element = processElement(element, options);
    }
    // tree management
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      if (root.if && (element.elseif || element.else)) {
        {
          checkRootConstraints(element);
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        });
      } else {
        warnOnce(
          "Component template should contain exactly one root element. " +
          "If you are using v-if on multiple elements, " +
          "use v-else-if to chain them instead.",
          { start: element.start }
        );
      }
    }
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent);
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          var name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element;
        }
        currentParent.children.push(element);
        element.parent = currentParent;
      }
    }

    // final children cleanup
    // filter out scoped slots
    element.children = element.children.filter(function (c) { return !(c).slotScope; });
    // remove trailing whitespace node again
    trimEndingWhitespace(element);

    // check pre state
    if (element.pre) {
      inVPre = false;
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false;
    }
    // apply post-transforms
    for (var i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options);
    }
  }

  function trimEndingWhitespace (el) {
    // remove trailing whitespace node
    if (!inPre) {
      var lastNode;
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === ' '
      ) {
        el.children.pop();
      }
    }
  }

  function checkRootConstraints (el) {
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        "Cannot use <" + (el.tag) + "> as component root element because it may " +
        'contain multiple nodes.',
        { start: el.start }
      );
    }
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
        'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      );
    }
  }

  parseHTML(template, {
    warn: warn$1,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    start: function start (tag, attrs, unary, start$1, end) {
      // check namespace.
      // inherit parent ns if there is one
      var ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag);

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs);
      }

      var element = createASTElement(tag, attrs, currentParent);
      if (ns) {
        element.ns = ns;
      }

      {
        if (options.outputSourceRange) {
          element.start = start$1;
          element.end = end;
          element.rawAttrsMap = element.attrsList.reduce(function (cumulated, attr) {
            cumulated[attr.name] = attr;
            return cumulated
          }, {});
        }
        attrs.forEach(function (attr) {
          if (invalidAttributeRE.test(attr.name)) {
            warn$1(
              "Invalid dynamic argument expression: attribute names cannot contain " +
              "spaces, quotes, <, >, / or =.",
              {
                start: attr.start + attr.name.indexOf("["),
                end: attr.start + attr.name.length
              }
            );
          }
        });
      }

      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true;
         warn$1(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          "<" + tag + ">" + ', as they will not be parsed.',
          { start: element.start }
        );
      }

      // apply pre-transforms
      for (var i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element;
      }

      if (!inVPre) {
        processPre(element);
        if (element.pre) {
          inVPre = true;
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true;
      }
      if (inVPre) {
        processRawAttrs(element);
      } else if (!element.processed) {
        // structural directives
        processFor(element);
        processIf(element);
        processOnce(element);
      }

      if (!root) {
        root = element;
        {
          checkRootConstraints(root);
        }
      }

      if (!unary) {
        currentParent = element;
        stack.push(element);
      } else {
        closeElement(element);
      }
    },

    end: function end (tag, start, end$1) {
      var element = stack[stack.length - 1];
      // pop stack
      stack.length -= 1;
      currentParent = stack[stack.length - 1];
      if ( options.outputSourceRange) {
        element.end = end$1;
      }
      closeElement(element);
    },

    chars: function chars (text, start, end) {
      if (!currentParent) {
        {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start: start }
            );
          } else if ((text = text.trim())) {
            warnOnce(
              ("text \"" + text + "\" outside root element will be ignored."),
              { start: start }
            );
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      var children = currentParent.children;
      if (inPre || text.trim()) {
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text);
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        text = '';
      } else if (whitespaceOption) {
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' ';
        } else {
          text = ' ';
        }
      } else {
        text = preserveWhitespace ? ' ' : '';
      }
      if (text) {
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ');
        }
        var res;
        var child;
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text: text
          };
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          child = {
            type: 3,
            text: text
          };
        }
        if (child) {
          if ( options.outputSourceRange) {
            child.start = start;
            child.end = end;
          }
          children.push(child);
        }
      }
    },
    comment: function comment (text, start, end) {
      // adding anyting as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      if (currentParent) {
        var child = {
          type: 3,
          text: text,
          isComment: true
        };
        if ( options.outputSourceRange) {
          child.start = start;
          child.end = end;
        }
        currentParent.children.push(child);
      }
    }
  });
  return root
}

function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true;
  }
}

function processRawAttrs (el) {
  var list = el.attrsList;
  var len = list.length;
  if (len) {
    var attrs = el.attrs = new Array(len);
    for (var i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value)
      };
      if (list[i].start != null) {
        attrs[i].start = list[i].start;
        attrs[i].end = list[i].end;
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true;
  }
}

function processElement (
  element,
  options
) {
  processKey(element);

  // determine whether this is a plain element after
  // removing structural attributes
  element.plain = (
    !element.key &&
    !element.scopedSlots &&
    !element.attrsList.length
  );

  processRef(element);
  processSlotContent(element);
  processSlotOutlet(element);
  processComponent(element);
  for (var i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element;
  }
  processAttrs(element);
  return element
}

function processKey (el) {
  var exp = getBindingAttr(el, 'key');
  if (exp) {
    {
      if (el.tag === 'template') {
        warn$1(
          "<template> cannot be keyed. Place the key on real elements instead.",
          getRawBindingAttr(el, 'key')
        );
      }
      if (el.for) {
        var iterator = el.iterator2 || el.iterator1;
        var parent = el.parent;
        if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
          warn$1(
            "Do not use v-for index as key on <transition-group> children, " +
            "this is the same as not using keys.",
            getRawBindingAttr(el, 'key'),
            true /* tip */
          );
        }
      }
    }
    el.key = exp;
  }
}

function processRef (el) {
  var ref = getBindingAttr(el, 'ref');
  if (ref) {
    el.ref = ref;
    el.refInFor = checkInFor(el);
  }
}

function processFor (el) {
  var exp;
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    var res = parseFor(exp);
    if (res) {
      extend(el, res);
    } else {
      warn$1(
        ("Invalid v-for expression: " + exp),
        el.rawAttrsMap['v-for']
      );
    }
  }
}



function parseFor (exp) {
  var inMatch = exp.match(forAliasRE);
  if (!inMatch) { return }
  var res = {};
  res.for = inMatch[2].trim();
  var alias = inMatch[1].trim().replace(stripParensRE, '');
  var iteratorMatch = alias.match(forIteratorRE);
  if (iteratorMatch) {
    res.alias = alias.replace(forIteratorRE, '').trim();
    res.iterator1 = iteratorMatch[1].trim();
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim();
    }
  } else {
    res.alias = alias;
  }
  return res
}

function processIf (el) {
  var exp = getAndRemoveAttr(el, 'v-if');
  if (exp) {
    el.if = exp;
    addIfCondition(el, {
      exp: exp,
      block: el
    });
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true;
    }
    var elseif = getAndRemoveAttr(el, 'v-else-if');
    if (elseif) {
      el.elseif = elseif;
    }
  }
}

function processIfConditions (el, parent) {
  var prev = findPrevElement(parent.children);
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    });
  } else {
    warn$1(
      "v-" + (el.elseif ? ('else-if="' + el.elseif + '"') : 'else') + " " +
      "used on element <" + (el.tag) + "> without corresponding v-if.",
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    );
  }
}

function findPrevElement (children) {
  var i = children.length;
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if ( children[i].text !== ' ') {
        warn$1(
          "text \"" + (children[i].text.trim()) + "\" between v-if and v-else(-if) " +
          "will be ignored.",
          children[i]
        );
      }
      children.pop();
    }
  }
}

function addIfCondition (el, condition) {
  if (!el.ifConditions) {
    el.ifConditions = [];
  }
  el.ifConditions.push(condition);
}

function processOnce (el) {
  var once = getAndRemoveAttr(el, 'v-once');
  if (once != null) {
    el.once = true;
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
function processSlotContent (el) {
  var slotScope;
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope');
    /* istanbul ignore if */
    if ( slotScope) {
      warn$1(
        "the \"scope\" attribute for scoped slots have been deprecated and " +
        "replaced by \"slot-scope\" since 2.5. The new \"slot-scope\" attribute " +
        "can also be used on plain elements in addition to <template> to " +
        "denote scoped slots.",
        el.rawAttrsMap['scope'],
        true
      );
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope');
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    if ( el.attrsMap['v-for']) {
      warn$1(
        "Ambiguous combined usage of slot-scope and v-for on <" + (el.tag) + "> " +
        "(v-for takes higher priority). Use a wrapper <template> for the " +
        "scoped slot to make it clearer.",
        el.rawAttrsMap['slot-scope'],
        true
      );
    }
    el.slotScope = slotScope;
  }

  // slot="xxx"
  var slotTarget = getBindingAttr(el, 'slot');
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget;
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot']);
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'));
    }
  }

  // 2.6 v-slot syntax
  {
    if (el.tag === 'template') {
      // v-slot on <template>
      var slotBinding = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding) {
        {
          if (el.slotTarget || el.slotScope) {
            warn$1(
              "Unexpected mixed usage of different slot syntaxes.",
              el
            );
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn$1(
              "<template v-slot> can only appear at the root level inside " +
              "the receiving component",
              el
            );
          }
        }
        var ref = getSlotName(slotBinding);
        var name = ref.name;
        var dynamic = ref.dynamic;
        el.slotTarget = name;
        el.slotTargetDynamic = dynamic;
        el.slotScope = slotBinding.value || emptySlotScopeToken; // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot
      var slotBinding$1 = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding$1) {
        {
          if (!maybeComponent(el)) {
            warn$1(
              "v-slot can only be used on components or <template>.",
              slotBinding$1
            );
          }
          if (el.slotScope || el.slotTarget) {
            warn$1(
              "Unexpected mixed usage of different slot syntaxes.",
              el
            );
          }
          if (el.scopedSlots) {
            warn$1(
              "To avoid scope ambiguity, the default slot should also use " +
              "<template> syntax when there are other named slots.",
              slotBinding$1
            );
          }
        }
        // add the component's children to its default slot
        var slots = el.scopedSlots || (el.scopedSlots = {});
        var ref$1 = getSlotName(slotBinding$1);
        var name$1 = ref$1.name;
        var dynamic$1 = ref$1.dynamic;
        var slotContainer = slots[name$1] = createASTElement('template', [], el);
        slotContainer.slotTarget = name$1;
        slotContainer.slotTargetDynamic = dynamic$1;
        slotContainer.children = el.children.filter(function (c) {
          if (!c.slotScope) {
            c.parent = slotContainer;
            return true
          }
        });
        slotContainer.slotScope = slotBinding$1.value || emptySlotScopeToken;
        // remove children as they are returned from scopedSlots now
        el.children = [];
        // mark el non-plain so data gets generated
        el.plain = false;
      }
    }
  }
}

function getSlotName (binding) {
  var name = binding.name.replace(slotRE, '');
  if (!name) {
    if (binding.name[0] !== '#') {
      name = 'default';
    } else {
      warn$1(
        "v-slot shorthand syntax requires a slot name.",
        binding
      );
    }
  }
  return dynamicArgRE.test(name)
    // dynamic [name]
    ? { name: name.slice(1, -1), dynamic: true }
    // static name
    : { name: ("\"" + name + "\""), dynamic: false }
}

// handle <slot/> outlets
function processSlotOutlet (el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name');
    if ( el.key) {
      warn$1(
        "`key` does not work on <slot> because slots are abstract outlets " +
        "and can possibly expand into multiple elements. " +
        "Use the key on a wrapping element instead.",
        getRawBindingAttr(el, 'key')
      );
    }
  }
}

function processComponent (el) {
  var binding;
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding;
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true;
  }
}

function processAttrs (el) {
  var list = el.attrsList;
  var i, l, name, rawName, value, modifiers, syncGen, isDynamic;
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name;
    value = list[i].value;
    if (dirRE.test(name)) {
      // mark element as dynamic
      el.hasBindings = true;
      // modifiers
      modifiers = parseModifiers(name.replace(dirRE, ''));
      // support .foo shorthand syntax for the .prop modifier
      if (modifiers) {
        name = name.replace(modifierRE, '');
      }
      if (bindRE.test(name)) { // v-bind
        name = name.replace(bindRE, '');
        value = parseFilters(value);
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          name = name.slice(1, -1);
        }
        if (
          
          value.trim().length === 0
        ) {
          warn$1(
            ("The value for a v-bind expression cannot be empty. Found in \"v-bind:" + name + "\"")
          );
        }
        if (modifiers) {
          if (modifiers.prop && !isDynamic) {
            name = camelize(name);
            if (name === 'innerHtml') { name = 'innerHTML'; }
          }
          if (modifiers.camel && !isDynamic) {
            name = camelize(name);
          }
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, "$event");
            if (!isDynamic) {
              addHandler(
                el,
                ("update:" + (camelize(name))),
                syncGen,
                null,
                false,
                warn$1,
                list[i]
              );
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  ("update:" + (hyphenate(name))),
                  syncGen,
                  null,
                  false,
                  warn$1,
                  list[i]
                );
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                ("\"update:\"+(" + name + ")"),
                syncGen,
                null,
                false,
                warn$1,
                list[i],
                true // dynamic
              );
            }
          }
        }
        if ((modifiers && modifiers.prop) || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value, list[i], isDynamic);
        } else {
          addAttr(el, name, value, list[i], isDynamic);
        }
      } else if (onRE.test(name)) { // v-on
        name = name.replace(onRE, '');
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          name = name.slice(1, -1);
        }
        addHandler(el, name, value, modifiers, false, warn$1, list[i], isDynamic);
      } else { // normal directives
        name = name.replace(dirRE, '');
        // parse arg
        var argMatch = name.match(argRE);
        var arg = argMatch && argMatch[1];
        isDynamic = false;
        if (arg) {
          name = name.slice(0, -(arg.length + 1));
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1);
            isDynamic = true;
          }
        }
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i]);
        if ( name === 'model') {
          checkForAliasModel(el, value);
        }
      }
    } else {
      // literal attribute
      {
        var res = parseText(value, delimiters);
        if (res) {
          warn$1(
            name + "=\"" + value + "\": " +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          );
        }
      }
      addAttr(el, name, JSON.stringify(value), list[i]);
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true', list[i]);
      }
    }
  }
}

function checkInFor (el) {
  var parent = el;
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent;
  }
  return false
}

function parseModifiers (name) {
  var match = name.match(modifierRE);
  if (match) {
    var ret = {};
    match.forEach(function (m) { ret[m.slice(1)] = true; });
    return ret
  }
}

function makeAttrsMap (attrs) {
  var map = {};
  for (var i = 0, l = attrs.length; i < l; i++) {
    if (
      
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn$1('duplicate attribute: ' + attrs[i].name, attrs[i]);
    }
    map[attrs[i].name] = attrs[i].value;
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el) {
  return el.tag === 'script' || el.tag === 'style'
}

function isForbiddenTag (el) {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

var ieNSBug = /^xmlns:NS\d+/;
var ieNSPrefix = /^NS\d+:/;

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  var res = [];
  for (var i = 0; i < attrs.length; i++) {
    var attr = attrs[i];
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '');
      res.push(attr);
    }
  }
  return res
}

function checkForAliasModel (el, value) {
  var _el = el;
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn$1(
        "<" + (el.tag) + " v-model=\"" + value + "\">: " +
        "You are binding v-model directly to a v-for iteration alias. " +
        "This will not be able to modify the v-for source array because " +
        "writing to the alias is like modifying a function local variable. " +
        "Consider using an array of objects and use v-model on an object property instead.",
        el.rawAttrsMap['v-model']
      );
    }
    _el = _el.parent;
  }
}

/*  */

function preTransformNode (el, options) {
  if (el.tag === 'input') {
    var map = el.attrsMap;
    if (!map['v-model']) {
      return
    }

    var typeBinding;
    if (map[':type'] || map['v-bind:type']) {
      typeBinding = getBindingAttr(el, 'type');
    }
    if (!map.type && !typeBinding && map['v-bind']) {
      typeBinding = "(" + (map['v-bind']) + ").type";
    }

    if (typeBinding) {
      var ifCondition = getAndRemoveAttr(el, 'v-if', true);
      var ifConditionExtra = ifCondition ? ("&&(" + ifCondition + ")") : "";
      var hasElse = getAndRemoveAttr(el, 'v-else', true) != null;
      var elseIfCondition = getAndRemoveAttr(el, 'v-else-if', true);
      // 1. checkbox
      var branch0 = cloneASTElement(el);
      // process for on the main node
      processFor(branch0);
      addRawAttr(branch0, 'type', 'checkbox');
      processElement(branch0, options);
      branch0.processed = true; // prevent it from double-processed
      branch0.if = "(" + typeBinding + ")==='checkbox'" + ifConditionExtra;
      addIfCondition(branch0, {
        exp: branch0.if,
        block: branch0
      });
      // 2. add radio else-if condition
      var branch1 = cloneASTElement(el);
      getAndRemoveAttr(branch1, 'v-for', true);
      addRawAttr(branch1, 'type', 'radio');
      processElement(branch1, options);
      addIfCondition(branch0, {
        exp: "(" + typeBinding + ")==='radio'" + ifConditionExtra,
        block: branch1
      });
      // 3. other
      var branch2 = cloneASTElement(el);
      getAndRemoveAttr(branch2, 'v-for', true);
      addRawAttr(branch2, ':type', typeBinding);
      processElement(branch2, options);
      addIfCondition(branch0, {
        exp: ifCondition,
        block: branch2
      });

      if (hasElse) {
        branch0.else = true;
      } else if (elseIfCondition) {
        branch0.elseif = elseIfCondition;
      }

      return branch0
    }
  }
}

function cloneASTElement (el) {
  return createASTElement(el.tag, el.attrsList.slice(), el.parent)
}

var model$1 = {
  preTransformNode: preTransformNode
};

var modules$1 = [
  klass,
  style,
  model$1
];

/*  */

var warn$2;

// in some cases, the event used has to be determined at runtime
// so we used some reserved tokens during compile.
var RANGE_TOKEN = '__r';

function model$2 (
  el,
  dir,
  _warn
) {
  warn$2 = _warn;
  var value = dir.value;
  var modifiers = dir.modifiers;
  var tag = el.tag;
  var type = el.attrsMap.type;

  {
    // inputs with type="file" are read only and setting the input's
    // value will throw an error.
    if (tag === 'input' && type === 'file') {
      warn$2(
        "<" + (el.tag) + " v-model=\"" + value + "\" type=\"file\">:\n" +
        "File inputs are read only. Use a v-on:change listener instead.",
        el.rawAttrsMap['v-model']
      );
    }
  }

  if (el.component) {
    genComponentModel(el, value, modifiers);
    // component v-model doesn't need extra runtime
    return false
  } else if (tag === 'select') {
    genSelect(el, value, modifiers);
  } else if (tag === 'input' && type === 'checkbox') {
    genCheckboxModel(el, value, modifiers);
  } else if (tag === 'input' && type === 'radio') {
    genRadioModel(el, value, modifiers);
  } else if (tag === 'input' || tag === 'textarea') {
    genDefaultModel(el, value, modifiers);
  } else if (!config.isReservedTag(tag)) {
    genComponentModel(el, value, modifiers);
    // component v-model doesn't need extra runtime
    return false
  } else {
    warn$2(
      "<" + (el.tag) + " v-model=\"" + value + "\">: " +
      "v-model is not supported on this element type. " +
      'If you are working with contenteditable, it\'s recommended to ' +
      'wrap a library dedicated for that purpose inside a custom component.',
      el.rawAttrsMap['v-model']
    );
  }

  // ensure runtime directive metadata
  return true
}

function genCheckboxModel (
  el,
  value,
  modifiers
) {
  var number = modifiers && modifiers.number;
  var valueBinding = getBindingAttr(el, 'value') || 'null';
  var trueValueBinding = getBindingAttr(el, 'true-value') || 'true';
  var falseValueBinding = getBindingAttr(el, 'false-value') || 'false';
  addProp(el, 'checked',
    "Array.isArray(" + value + ")" +
    "?_i(" + value + "," + valueBinding + ")>-1" + (
      trueValueBinding === 'true'
        ? (":(" + value + ")")
        : (":_q(" + value + "," + trueValueBinding + ")")
    )
  );
  addHandler(el, 'change',
    "var $$a=" + value + "," +
        '$$el=$event.target,' +
        "$$c=$$el.checked?(" + trueValueBinding + "):(" + falseValueBinding + ");" +
    'if(Array.isArray($$a)){' +
      "var $$v=" + (number ? '_n(' + valueBinding + ')' : valueBinding) + "," +
          '$$i=_i($$a,$$v);' +
      "if($$el.checked){$$i<0&&(" + (genAssignmentCode(value, '$$a.concat([$$v])')) + ")}" +
      "else{$$i>-1&&(" + (genAssignmentCode(value, '$$a.slice(0,$$i).concat($$a.slice($$i+1))')) + ")}" +
    "}else{" + (genAssignmentCode(value, '$$c')) + "}",
    null, true
  );
}

function genRadioModel (
  el,
  value,
  modifiers
) {
  var number = modifiers && modifiers.number;
  var valueBinding = getBindingAttr(el, 'value') || 'null';
  valueBinding = number ? ("_n(" + valueBinding + ")") : valueBinding;
  addProp(el, 'checked', ("_q(" + value + "," + valueBinding + ")"));
  addHandler(el, 'change', genAssignmentCode(value, valueBinding), null, true);
}

function genSelect (
  el,
  value,
  modifiers
) {
  var number = modifiers && modifiers.number;
  var selectedVal = "Array.prototype.filter" +
    ".call($event.target.options,function(o){return o.selected})" +
    ".map(function(o){var val = \"_value\" in o ? o._value : o.value;" +
    "return " + (number ? '_n(val)' : 'val') + "})";

  var assignment = '$event.target.multiple ? $$selectedVal : $$selectedVal[0]';
  var code = "var $$selectedVal = " + selectedVal + ";";
  code = code + " " + (genAssignmentCode(value, assignment));
  addHandler(el, 'change', code, null, true);
}

function genDefaultModel (
  el,
  value,
  modifiers
) {
  var type = el.attrsMap.type;

  // warn if v-bind:value conflicts with v-model
  // except for inputs with v-bind:type
  {
    var value$1 = el.attrsMap['v-bind:value'] || el.attrsMap[':value'];
    var typeBinding = el.attrsMap['v-bind:type'] || el.attrsMap[':type'];
    if (value$1 && !typeBinding) {
      var binding = el.attrsMap['v-bind:value'] ? 'v-bind:value' : ':value';
      warn$2(
        binding + "=\"" + value$1 + "\" conflicts with v-model on the same element " +
        'because the latter already expands to a value binding internally',
        el.rawAttrsMap[binding]
      );
    }
  }

  var ref = modifiers || {};
  var lazy = ref.lazy;
  var number = ref.number;
  var trim = ref.trim;
  var needCompositionGuard = !lazy && type !== 'range';
  var event = lazy
    ? 'change'
    : type === 'range'
      ? RANGE_TOKEN
      : 'input';

  var valueExpression = '$event.target.value';
  if (trim) {
    valueExpression = "$event.target.value.trim()";
  }
  if (number) {
    valueExpression = "_n(" + valueExpression + ")";
  }

  var code = genAssignmentCode(value, valueExpression);
  if (needCompositionGuard) {
    code = "if($event.target.composing)return;" + code;
  }

  addProp(el, 'value', ("(" + value + ")"));
  addHandler(el, event, code, null, true);
  if (trim || number) {
    addHandler(el, 'blur', '$forceUpdate()');
  }
}

/*  */

function text (el, dir) {
  if (dir.value) {
    addProp(el, 'textContent', ("_s(" + (dir.value) + ")"), dir);
  }
}

/*  */

function html (el, dir) {
  if (dir.value) {
    addProp(el, 'innerHTML', ("_s(" + (dir.value) + ")"), dir);
  }
}

var directives = {
  model: model$2,
  text: text,
  html: html
};

/*  */

var baseOptions = {
  expectHTML: true,
  modules: modules$1,
  directives: directives,
  isPreTag: isPreTag,
  isUnaryTag: isUnaryTag,
  mustUseProp: mustUseProp,
  canBeLeftOpenTag: canBeLeftOpenTag,
  isReservedTag: isReservedTag,
  getTagNamespace: getTagNamespace,
  staticKeys: genStaticKeys(modules$1)
};

/*  */

var fnExpRE = /^([\w$_]+|\([^)]*?\))\s*=>|^function(?:\s+[\w$]+)?\s*\(/;
var fnInvokeRE = /\([^)]*?\);*$/;
var simplePathRE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/;

// KeyboardEvent.keyCode aliases
var keyCodes = {
  esc: 27,
  tab: 9,
  enter: 13,
  space: 32,
  up: 38,
  left: 37,
  right: 39,
  down: 40,
  'delete': [8, 46]
};

// KeyboardEvent.key aliases
var keyNames = {
  // #7880: IE11 and Edge use `Esc` for Escape key name.
  esc: ['Esc', 'Escape'],
  tab: 'Tab',
  enter: 'Enter',
  // #9112: IE11 uses `Spacebar` for Space key name.
  space: [' ', 'Spacebar'],
  // #7806: IE11 uses key names without `Arrow` prefix for arrow keys.
  up: ['Up', 'ArrowUp'],
  left: ['Left', 'ArrowLeft'],
  right: ['Right', 'ArrowRight'],
  down: ['Down', 'ArrowDown'],
  // #9112: IE11 uses `Del` for Delete key name.
  'delete': ['Backspace', 'Delete', 'Del']
};

// #4868: modifiers that prevent the execution of the listener
// need to explicitly return null so that we can determine whether to remove
// the listener for .once
var genGuard = function (condition) { return ("if(" + condition + ")return null;"); };

var modifierCode = {
  stop: '$event.stopPropagation();',
  prevent: '$event.preventDefault();',
  self: genGuard("$event.target !== $event.currentTarget"),
  ctrl: genGuard("!$event.ctrlKey"),
  shift: genGuard("!$event.shiftKey"),
  alt: genGuard("!$event.altKey"),
  meta: genGuard("!$event.metaKey"),
  left: genGuard("'button' in $event && $event.button !== 0"),
  middle: genGuard("'button' in $event && $event.button !== 1"),
  right: genGuard("'button' in $event && $event.button !== 2")
};

function genHandlers (
  events,
  isNative
) {
  var prefix = isNative ? 'nativeOn:' : 'on:';
  var staticHandlers = "";
  var dynamicHandlers = "";
  for (var name in events) {
    var handlerCode = genHandler(events[name]);
    if (events[name] && events[name].dynamic) {
      dynamicHandlers += name + "," + handlerCode + ",";
    } else {
      staticHandlers += "\"" + name + "\":" + handlerCode + ",";
    }
  }
  staticHandlers = "{" + (staticHandlers.slice(0, -1)) + "}";
  if (dynamicHandlers) {
    return prefix + "_d(" + staticHandlers + ",[" + (dynamicHandlers.slice(0, -1)) + "])"
  } else {
    return prefix + staticHandlers
  }
}

function genHandler (handler) {
  if (!handler) {
    return 'function(){}'
  }

  if (Array.isArray(handler)) {
    return ("[" + (handler.map(function (handler) { return genHandler(handler); }).join(',')) + "]")
  }

  var isMethodPath = simplePathRE.test(handler.value);
  var isFunctionExpression = fnExpRE.test(handler.value);
  var isFunctionInvocation = simplePathRE.test(handler.value.replace(fnInvokeRE, ''));

  if (!handler.modifiers) {
    if (isMethodPath || isFunctionExpression) {
      return handler.value
    }
    return ("function($event){" + (isFunctionInvocation ? ("return " + (handler.value)) : handler.value) + "}") // inline statement
  } else {
    var code = '';
    var genModifierCode = '';
    var keys = [];
    for (var key in handler.modifiers) {
      if (modifierCode[key]) {
        genModifierCode += modifierCode[key];
        // left/right
        if (keyCodes[key]) {
          keys.push(key);
        }
      } else if (key === 'exact') {
        var modifiers = (handler.modifiers);
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            .filter(function (keyModifier) { return !modifiers[keyModifier]; })
            .map(function (keyModifier) { return ("$event." + keyModifier + "Key"); })
            .join('||')
        );
      } else {
        keys.push(key);
      }
    }
    if (keys.length) {
      code += genKeyFilter(keys);
    }
    // Make sure modifiers like prevent and stop get executed after key filtering
    if (genModifierCode) {
      code += genModifierCode;
    }
    var handlerCode = isMethodPath
      ? ("return " + (handler.value) + "($event)")
      : isFunctionExpression
        ? ("return (" + (handler.value) + ")($event)")
        : isFunctionInvocation
          ? ("return " + (handler.value))
          : handler.value;
    return ("function($event){" + code + handlerCode + "}")
  }
}

function genKeyFilter (keys) {
  return (
    // make sure the key filters only apply to KeyboardEvents
    // #9441: can't use 'keyCode' in $event because Chrome autofill fires fake
    // key events that do not have keyCode property...
    "if(!$event.type.indexOf('key')&&" +
    (keys.map(genFilterCode).join('&&')) + ")return null;"
  )
}

function genFilterCode (key) {
  var keyVal = parseInt(key, 10);
  if (keyVal) {
    return ("$event.keyCode!==" + keyVal)
  }
  var keyCode = keyCodes[key];
  var keyName = keyNames[key];
  return (
    "_k($event.keyCode," +
    (JSON.stringify(key)) + "," +
    (JSON.stringify(keyCode)) + "," +
    "$event.key," +
    "" + (JSON.stringify(keyName)) +
    ")"
  )
}

/*  */

function on (el, dir) {
  if ( dir.modifiers) {
    warn("v-on without argument does not support modifiers.");
  }
  el.wrapListeners = function (code) { return ("_g(" + code + "," + (dir.value) + ")"); };
}

/*  */

function bind (el, dir) {
  el.wrapData = function (code) {
    return ("_b(" + code + ",'" + (el.tag) + "'," + (dir.value) + "," + (dir.modifiers && dir.modifiers.prop ? 'true' : 'false') + (dir.modifiers && dir.modifiers.sync ? ',true' : '') + ")")
  };
}

/*  */

var baseDirectives$1 = {
  on: on,
  bind: bind,
  cloak: noop
};

/*  */





var CodegenState = function CodegenState (options) {
  this.options = options;
  this.warn = options.warn || baseWarn;
  this.transforms = pluckModuleFunction(options.modules, 'transformCode');
  this.dataGenFns = pluckModuleFunction(options.modules, 'genData');
  this.directives = extend(extend({}, baseDirectives$1), options.directives);
  var isReservedTag = options.isReservedTag || no;
  this.maybeComponent = function (el) { return !!el.component || !isReservedTag(el.tag); };
  this.onceId = 0;
  this.staticRenderFns = [];
  this.pre = false;
};



function generate (
  ast,
  options
) {
  var state = new CodegenState(options);
  var code = ast ? genElement(ast, state) : '_c("div")';
  return {
    render: ("with(this){return " + code + "}"),
    staticRenderFns: state.staticRenderFns
  }
}

function genElement (el, state) {
  if (el.parent) {
    el.pre = el.pre || el.parent.pre;
  }

  if (el.staticRoot && !el.staticProcessed) {
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) {
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) {
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) {
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) {
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    return genSlot(el, state)
  } else {
    // component or element
    var code;
    if (el.component) {
      code = genComponent(el.component, el, state);
    } else {
      var data;
      if (!el.plain || (el.pre && state.maybeComponent(el))) {
        data = genData$2(el, state);
      }

      var children = el.inlineTemplate ? null : genChildren(el, state, true);
      code = "_c('" + (el.tag) + "'" + (data ? ("," + data) : '') + (children ? ("," + children) : '') + ")";
    }
    // module transforms
    for (var i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code);
    }
    return code
  }
}

// hoist static sub-trees out
function genStatic (el, state) {
  el.staticProcessed = true;
  // Some elements (templates) need to behave differently inside of a v-pre
  // node.  All pre nodes are static roots, so we can use this as a location to
  // wrap a state change and reset it upon exiting the pre node.
  var originalPreState = state.pre;
  if (el.pre) {
    state.pre = el.pre;
  }
  state.staticRenderFns.push(("with(this){return " + (genElement(el, state)) + "}"));
  state.pre = originalPreState;
  return ("_m(" + (state.staticRenderFns.length - 1) + (el.staticInFor ? ',true' : '') + ")")
}

// v-once
function genOnce (el, state) {
  el.onceProcessed = true;
  if (el.if && !el.ifProcessed) {
    return genIf(el, state)
  } else if (el.staticInFor) {
    var key = '';
    var parent = el.parent;
    while (parent) {
      if (parent.for) {
        key = parent.key;
        break
      }
      parent = parent.parent;
    }
    if (!key) {
       state.warn(
        "v-once can only be used inside v-for that is keyed. ",
        el.rawAttrsMap['v-once']
      );
      return genElement(el, state)
    }
    return ("_o(" + (genElement(el, state)) + "," + (state.onceId++) + "," + key + ")")
  } else {
    return genStatic(el, state)
  }
}

function genIf (
  el,
  state,
  altGen,
  altEmpty
) {
  el.ifProcessed = true; // avoid recursion
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}

function genIfConditions (
  conditions,
  state,
  altGen,
  altEmpty
) {
  if (!conditions.length) {
    return altEmpty || '_e()'
  }

  var condition = conditions.shift();
  if (condition.exp) {
    return ("(" + (condition.exp) + ")?" + (genTernaryExp(condition.block)) + ":" + (genIfConditions(conditions, state, altGen, altEmpty)))
  } else {
    return ("" + (genTernaryExp(condition.block)))
  }

  // v-if with v-once should generate code like (a)?_m(0):_m(1)
  function genTernaryExp (el) {
    return altGen
      ? altGen(el, state)
      : el.once
        ? genOnce(el, state)
        : genElement(el, state)
  }
}

function genFor (
  el,
  state,
  altGen,
  altHelper
) {
  var exp = el.for;
  var alias = el.alias;
  var iterator1 = el.iterator1 ? ("," + (el.iterator1)) : '';
  var iterator2 = el.iterator2 ? ("," + (el.iterator2)) : '';

  if (
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn(
      "<" + (el.tag) + " v-for=\"" + alias + " in " + exp + "\">: component lists rendered with " +
      "v-for should have explicit keys. " +
      "See https://vuejs.org/guide/list.html#key for more info.",
      el.rawAttrsMap['v-for'],
      true /* tip */
    );
  }

  el.forProcessed = true; // avoid recursion
  return (altHelper || '_l') + "((" + exp + ")," +
    "function(" + alias + iterator1 + iterator2 + "){" +
      "return " + ((altGen || genElement)(el, state)) +
    '})'
}

function genData$2 (el, state) {
  var data = '{';

  // directives first.
  // directives may mutate the el's other properties before they are generated.
  var dirs = genDirectives(el, state);
  if (dirs) { data += dirs + ','; }

  // key
  if (el.key) {
    data += "key:" + (el.key) + ",";
  }
  // ref
  if (el.ref) {
    data += "ref:" + (el.ref) + ",";
  }
  if (el.refInFor) {
    data += "refInFor:true,";
  }
  // pre
  if (el.pre) {
    data += "pre:true,";
  }
  // record original tag name for components using "is" attribute
  if (el.component) {
    data += "tag:\"" + (el.tag) + "\",";
  }
  // module data generation functions
  for (var i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el);
  }
  // attributes
  if (el.attrs) {
    data += "attrs:" + (genProps(el.attrs)) + ",";
  }
  // DOM props
  if (el.props) {
    data += "domProps:" + (genProps(el.props)) + ",";
  }
  // event handlers
  if (el.events) {
    data += (genHandlers(el.events, false)) + ",";
  }
  if (el.nativeEvents) {
    data += (genHandlers(el.nativeEvents, true)) + ",";
  }
  // slot target
  // only for non-scoped slots
  if (el.slotTarget && !el.slotScope) {
    data += "slot:" + (el.slotTarget) + ",";
  }
  // scoped slots
  if (el.scopedSlots) {
    data += (genScopedSlots(el, el.scopedSlots, state)) + ",";
  }
  // component v-model
  if (el.model) {
    data += "model:{value:" + (el.model.value) + ",callback:" + (el.model.callback) + ",expression:" + (el.model.expression) + "},";
  }
  // inline-template
  if (el.inlineTemplate) {
    var inlineTemplate = genInlineTemplate(el, state);
    if (inlineTemplate) {
      data += inlineTemplate + ",";
    }
  }
  data = data.replace(/,$/, '') + '}';
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  if (el.dynamicAttrs) {
    data = "_b(" + data + ",\"" + (el.tag) + "\"," + (genProps(el.dynamicAttrs)) + ")";
  }
  // v-bind data wrap
  if (el.wrapData) {
    data = el.wrapData(data);
  }
  // v-on data wrap
  if (el.wrapListeners) {
    data = el.wrapListeners(data);
  }
  return data
}

function genDirectives (el, state) {
  var dirs = el.directives;
  if (!dirs) { return }
  var res = 'directives:[';
  var hasRuntime = false;
  var i, l, dir, needRuntime;
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i];
    needRuntime = true;
    var gen = state.directives[dir.name];
    if (gen) {
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      needRuntime = !!gen(el, dir, state.warn);
    }
    if (needRuntime) {
      hasRuntime = true;
      res += "{name:\"" + (dir.name) + "\",rawName:\"" + (dir.rawName) + "\"" + (dir.value ? (",value:(" + (dir.value) + "),expression:" + (JSON.stringify(dir.value))) : '') + (dir.arg ? (",arg:" + (dir.isDynamicArg ? dir.arg : ("\"" + (dir.arg) + "\""))) : '') + (dir.modifiers ? (",modifiers:" + (JSON.stringify(dir.modifiers))) : '') + "},";
    }
  }
  if (hasRuntime) {
    return res.slice(0, -1) + ']'
  }
}

function genInlineTemplate (el, state) {
  var ast = el.children[0];
  if ( (
    el.children.length !== 1 || ast.type !== 1
  )) {
    state.warn(
      'Inline-template components must have exactly one child element.',
      { start: el.start }
    );
  }
  if (ast && ast.type === 1) {
    var inlineRenderFns = generate(ast, state.options);
    return ("inlineTemplate:{render:function(){" + (inlineRenderFns.render) + "},staticRenderFns:[" + (inlineRenderFns.staticRenderFns.map(function (code) { return ("function(){" + code + "}"); }).join(',')) + "]}")
  }
}

function genScopedSlots (
  el,
  slots,
  state
) {
  // by default scoped slots are considered "stable", this allows child
  // components with only scoped slots to skip forced updates from parent.
  // but in some cases we have to bail-out of this optimization
  // for example if the slot contains dynamic names, has v-if or v-for on them...
  var needsForceUpdate = el.for || Object.keys(slots).some(function (key) {
    var slot = slots[key];
    return (
      slot.slotTargetDynamic ||
      slot.if ||
      slot.for ||
      containsSlotChild(slot) // is passing down slot from parent which may be dynamic
    )
  });

  // #9534: if a component with scoped slots is inside a conditional branch,
  // it's possible for the same component to be reused but with different
  // compiled slot content. To avoid that, we generate a unique key based on
  // the generated code of all the slot contents.
  var needsKey = !!el.if;

  // OR when it is inside another scoped slot or v-for (the reactivity may be
  // disconnected due to the intermediate scope variable)
  // #9438, #9506
  // TODO: this can be further optimized by properly analyzing in-scope bindings
  // and skip force updating ones that do not actually use scope variables.
  if (!needsForceUpdate) {
    var parent = el.parent;
    while (parent) {
      if (
        (parent.slotScope && parent.slotScope !== emptySlotScopeToken) ||
        parent.for
      ) {
        needsForceUpdate = true;
        break
      }
      if (parent.if) {
        needsKey = true;
      }
      parent = parent.parent;
    }
  }

  var generatedSlots = Object.keys(slots)
    .map(function (key) { return genScopedSlot(slots[key], state); })
    .join(',');

  return ("scopedSlots:_u([" + generatedSlots + "]" + (needsForceUpdate ? ",null,true" : "") + (!needsForceUpdate && needsKey ? (",null,false," + (hash(generatedSlots))) : "") + ")")
}

function hash(str) {
  var hash = 5381;
  var i = str.length;
  while(i) {
    hash = (hash * 33) ^ str.charCodeAt(--i);
  }
  return hash >>> 0
}

function containsSlotChild (el) {
  if (el.type === 1) {
    if (el.tag === 'slot') {
      return true
    }
    return el.children.some(containsSlotChild)
  }
  return false
}

function genScopedSlot (
  el,
  state
) {
  var isLegacySyntax = el.attrsMap['slot-scope'];
  if (el.if && !el.ifProcessed && !isLegacySyntax) {
    return genIf(el, state, genScopedSlot, "null")
  }
  if (el.for && !el.forProcessed) {
    return genFor(el, state, genScopedSlot)
  }
  var slotScope = el.slotScope === emptySlotScopeToken
    ? ""
    : String(el.slotScope);
  var fn = "function(" + slotScope + "){" +
    "return " + (el.tag === 'template'
      ? el.if && isLegacySyntax
        ? ("(" + (el.if) + ")?" + (genChildren(el, state) || 'undefined') + ":undefined")
        : genChildren(el, state) || 'undefined'
      : genElement(el, state)) + "}";
  // reverse proxy v-slot without scope on this.$slots
  var reverseProxy = slotScope ? "" : ",proxy:true";
  return ("{key:" + (el.slotTarget || "\"default\"") + ",fn:" + fn + reverseProxy + "}")
}

function genChildren (
  el,
  state,
  checkSkip,
  altGenElement,
  altGenNode
) {
  var children = el.children;
  if (children.length) {
    var el$1 = children[0];
    // optimize single v-for
    if (children.length === 1 &&
      el$1.for &&
      el$1.tag !== 'template' &&
      el$1.tag !== 'slot'
    ) {
      var normalizationType = checkSkip
        ? state.maybeComponent(el$1) ? ",1" : ",0"
        : "";
      return ("" + ((altGenElement || genElement)(el$1, state)) + normalizationType)
    }
    var normalizationType$1 = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0;
    var gen = altGenNode || genNode;
    return ("[" + (children.map(function (c) { return gen(c, state); }).join(',')) + "]" + (normalizationType$1 ? ("," + normalizationType$1) : ''))
  }
}

// determine the normalization needed for the children array.
// 0: no normalization needed
// 1: simple normalization needed (possible 1-level deep nested array)
// 2: full normalization needed
function getNormalizationType (
  children,
  maybeComponent
) {
  var res = 0;
  for (var i = 0; i < children.length; i++) {
    var el = children[i];
    if (el.type !== 1) {
      continue
    }
    if (needsNormalization(el) ||
        (el.ifConditions && el.ifConditions.some(function (c) { return needsNormalization(c.block); }))) {
      res = 2;
      break
    }
    if (maybeComponent(el) ||
        (el.ifConditions && el.ifConditions.some(function (c) { return maybeComponent(c.block); }))) {
      res = 1;
    }
  }
  return res
}

function needsNormalization (el) {
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot'
}

function genNode (node, state) {
  if (node.type === 1) {
    return genElement(node, state)
  } else if (node.type === 3 && node.isComment) {
    return genComment(node)
  } else {
    return genText(node)
  }
}

function genText (text) {
  return ("_v(" + (text.type === 2
    ? text.expression // no need for () because already wrapped in _s()
    : transformSpecialNewlines(JSON.stringify(text.text))) + ")")
}

function genComment (comment) {
  return ("_e(" + (JSON.stringify(comment.text)) + ")")
}

function genSlot (el, state) {
  var slotName = el.slotName || '"default"';
  var children = genChildren(el, state);
  var res = "_t(" + slotName + (children ? ("," + children) : '');
  var attrs = el.attrs || el.dynamicAttrs
    ? genProps((el.attrs || []).concat(el.dynamicAttrs || []).map(function (attr) { return ({
        // slot props are camelized
        name: camelize(attr.name),
        value: attr.value,
        dynamic: attr.dynamic
      }); }))
    : null;
  var bind = el.attrsMap['v-bind'];
  if ((attrs || bind) && !children) {
    res += ",null";
  }
  if (attrs) {
    res += "," + attrs;
  }
  if (bind) {
    res += (attrs ? '' : ',null') + "," + bind;
  }
  return res + ')'
}

// componentName is el.component, take it as argument to shun flow's pessimistic refinement
function genComponent (
  componentName,
  el,
  state
) {
  var children = el.inlineTemplate ? null : genChildren(el, state, true);
  return ("_c(" + componentName + "," + (genData$2(el, state)) + (children ? ("," + children) : '') + ")")
}

function genProps (props) {
  var staticProps = "";
  var dynamicProps = "";
  for (var i = 0; i < props.length; i++) {
    var prop = props[i];
    var value =  transformSpecialNewlines(prop.value);
    if (prop.dynamic) {
      dynamicProps += (prop.name) + "," + value + ",";
    } else {
      staticProps += "\"" + (prop.name) + "\":" + value + ",";
    }
  }
  staticProps = "{" + (staticProps.slice(0, -1)) + "}";
  if (dynamicProps) {
    return ("_d(" + staticProps + ",[" + (dynamicProps.slice(0, -1)) + "])")
  } else {
    return staticProps
  }
}

// #3895, #4268
function transformSpecialNewlines (text) {
  return text
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/*  */




var plainStringRE = /^"(?:[^"\\]|\\.)*"$|^'(?:[^'\\]|\\.)*'$/;

// let the model AST transform translate v-model into appropriate
// props bindings
function applyModelTransform (el, state) {
  if (el.directives) {
    for (var i = 0; i < el.directives.length; i++) {
      var dir = el.directives[i];
      if (dir.name === 'model') {
        state.directives.model(el, dir, state.warn);
        // remove value for textarea as its converted to text
        if (el.tag === 'textarea' && el.props) {
          el.props = el.props.filter(function (p) { return p.name !== 'value'; });
        }
        break
      }
    }
  }
}

function genAttrSegments (
  attrs
) {
  return attrs.map(function (ref) {
    var name = ref.name;
    var value = ref.value;

    return genAttrSegment(name, value);
  })
}

function genDOMPropSegments (
  props,
  attrs
) {
  var segments = [];
  props.forEach(function (ref) {
    var name = ref.name;
    var value = ref.value;

    name = propsToAttrMap[name] || name.toLowerCase();
    if (isRenderableAttr(name) &&
      !(attrs && attrs.some(function (a) { return a.name === name; }))
    ) {
      segments.push(genAttrSegment(name, value));
    }
  });
  return segments
}

function genAttrSegment (name, value) {
  if (plainStringRE.test(value)) {
    // force double quote
    value = value.replace(/^'|'$/g, '"');
    // force enumerated attr to "true"
    if (isEnumeratedAttr(name) && value !== "\"false\"") {
      value = "\"true\"";
    }
    return {
      type: RAW,
      value: isBooleanAttr(name)
        ? (" " + name + "=\"" + name + "\"")
        : value === '""'
          ? (" " + name)
          : (" " + name + "=\"" + (JSON.parse(value)) + "\"")
    }
  } else {
    return {
      type: EXPRESSION,
      value: ("_ssrAttr(" + (JSON.stringify(name)) + "," + value + ")")
    }
  }
}

function genClassSegments (
  staticClass,
  classBinding
) {
  if (staticClass && !classBinding) {
    return [{ type: RAW, value: (" class=\"" + (JSON.parse(staticClass)) + "\"") }]
  } else {
    return [{
      type: EXPRESSION,
      value: ("_ssrClass(" + (staticClass || 'null') + "," + (classBinding || 'null') + ")")
    }]
  }
}

function genStyleSegments (
  staticStyle,
  parsedStaticStyle,
  styleBinding,
  vShowExpression
) {
  if (staticStyle && !styleBinding && !vShowExpression) {
    return [{ type: RAW, value: (" style=" + (JSON.stringify(staticStyle))) }]
  } else {
    return [{
      type: EXPRESSION,
      value: ("_ssrStyle(" + (parsedStaticStyle || 'null') + "," + (styleBinding || 'null') + ", " + (vShowExpression
          ? ("{ display: (" + vShowExpression + ") ? '' : 'none' }")
          : 'null') + ")")
    }]
  }
}

/*  */

// optimizability constants
var optimizability = {
  FALSE: 0,    // whole sub tree un-optimizable
  FULL: 1,     // whole sub tree optimizable
  SELF: 2,     // self optimizable but has some un-optimizable children
  CHILDREN: 3, // self un-optimizable but have fully optimizable children
  PARTIAL: 4   // self un-optimizable with some un-optimizable children
};

var isPlatformReservedTag;

function optimize (root, options) {
  if (!root) { return }
  isPlatformReservedTag = options.isReservedTag || no;
  walk(root, true);
}

function walk (node, isRoot) {
  if (isUnOptimizableTree(node)) {
    node.ssrOptimizability = optimizability.FALSE;
    return
  }
  // root node or nodes with custom directives should always be a VNode
  var selfUnoptimizable = isRoot || hasCustomDirective(node);
  var check = function (child) {
    if (child.ssrOptimizability !== optimizability.FULL) {
      node.ssrOptimizability = selfUnoptimizable
        ? optimizability.PARTIAL
        : optimizability.SELF;
    }
  };
  if (selfUnoptimizable) {
    node.ssrOptimizability = optimizability.CHILDREN;
  }
  if (node.type === 1) {
    for (var i = 0, l = node.children.length; i < l; i++) {
      var child = node.children[i];
      walk(child);
      check(child);
    }
    if (node.ifConditions) {
      for (var i$1 = 1, l$1 = node.ifConditions.length; i$1 < l$1; i$1++) {
        var block = node.ifConditions[i$1].block;
        walk(block, isRoot);
        check(block);
      }
    }
    if (node.ssrOptimizability == null ||
      (!isRoot && (node.attrsMap['v-html'] || node.attrsMap['v-text']))
    ) {
      node.ssrOptimizability = optimizability.FULL;
    } else {
      node.children = optimizeSiblings(node);
    }
  } else {
    node.ssrOptimizability = optimizability.FULL;
  }
}

function optimizeSiblings (el) {
  var children = el.children;
  var optimizedChildren = [];

  var currentOptimizableGroup = [];
  var pushGroup = function () {
    if (currentOptimizableGroup.length) {
      optimizedChildren.push({
        type: 1,
        parent: el,
        tag: 'template',
        attrsList: [],
        attrsMap: {},
        rawAttrsMap: {},
        children: currentOptimizableGroup,
        ssrOptimizability: optimizability.FULL
      });
    }
    currentOptimizableGroup = [];
  };

  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    if (c.ssrOptimizability === optimizability.FULL) {
      currentOptimizableGroup.push(c);
    } else {
      // wrap fully-optimizable adjacent siblings inside a template tag
      // so that they can be optimized into a single ssrNode by codegen
      pushGroup();
      optimizedChildren.push(c);
    }
  }
  pushGroup();
  return optimizedChildren
}

function isUnOptimizableTree (node) {
  if (node.type === 2 || node.type === 3) { // text or expression
    return false
  }
  return (
    isBuiltInTag(node.tag) || // built-in (slot, component)
    !isPlatformReservedTag(node.tag) || // custom component
    !!node.component || // "is" component
    isSelectWithModel(node) // <select v-model> requires runtime inspection
  )
}

var isBuiltInDir = makeMap('text,html,show,on,bind,model,pre,cloak,once');

function hasCustomDirective (node) {
  return (
    node.type === 1 &&
    node.directives &&
    node.directives.some(function (d) { return !isBuiltInDir(d.name); })
  )
}

// <select v-model> cannot be optimized because it requires a runtime check
// to determine proper selected option
function isSelectWithModel (node) {
  return (
    node.type === 1 &&
    node.tag === 'select' &&
    node.directives != null &&
    node.directives.some(function (d) { return d.name === 'model'; })
  )
}

/*  */




// segment types
var RAW = 0;
var INTERPOLATION = 1;
var EXPRESSION = 2;

function generate$1 (
  ast,
  options
) {
  var state = new CodegenState(options);
  var code = ast ? genSSRElement(ast, state) : '_c("div")';
  return {
    render: ("with(this){return " + code + "}"),
    staticRenderFns: state.staticRenderFns
  }
}

function genSSRElement (el, state) {
  if (el.for && !el.forProcessed) {
    return genFor(el, state, genSSRElement)
  } else if (el.if && !el.ifProcessed) {
    return genIf(el, state, genSSRElement)
  } else if (el.tag === 'template' && !el.slotTarget) {
    return el.ssrOptimizability === optimizability.FULL
      ? genChildrenAsStringNode(el, state)
      : genSSRChildren(el, state) || 'void 0'
  }

  switch (el.ssrOptimizability) {
    case optimizability.FULL:
      // stringify whole tree
      return genStringElement(el, state)
    case optimizability.SELF:
      // stringify self and check children
      return genStringElementWithChildren(el, state)
    case optimizability.CHILDREN:
      // generate self as VNode and stringify children
      return genNormalElement(el, state, true)
    case optimizability.PARTIAL:
      // generate self as VNode and check children
      return genNormalElement(el, state, false)
    default:
      // bail whole tree
      return genElement(el, state)
  }
}

function genNormalElement (el, state, stringifyChildren) {
  var data = el.plain ? undefined : genData$2(el, state);
  var children = stringifyChildren
    ? ("[" + (genChildrenAsStringNode(el, state)) + "]")
    : genSSRChildren(el, state, true);
  return ("_c('" + (el.tag) + "'" + (data ? ("," + data) : '') + (children ? ("," + children) : '') + ")")
}

function genSSRChildren (el, state, checkSkip) {
  return genChildren(el, state, checkSkip, genSSRElement, genSSRNode)
}

function genSSRNode (el, state) {
  return el.type === 1
    ? genSSRElement(el, state)
    : genText(el)
}

function genChildrenAsStringNode (el, state) {
  return el.children.length
    ? ("_ssrNode(" + (flattenSegments(childrenToSegments(el, state))) + ")")
    : ''
}

function genStringElement (el, state) {
  return ("_ssrNode(" + (elementToString(el, state)) + ")")
}

function genStringElementWithChildren (el, state) {
  var children = genSSRChildren(el, state, true);
  return ("_ssrNode(" + (flattenSegments(elementToOpenTagSegments(el, state))) + ",\"</" + (el.tag) + ">\"" + (children ? ("," + children) : '') + ")")
}

function elementToString (el, state) {
  return ("(" + (flattenSegments(elementToSegments(el, state))) + ")")
}

function elementToSegments (el, state) {
  // v-for / v-if
  if (el.for && !el.forProcessed) {
    el.forProcessed = true;
    return [{
      type: EXPRESSION,
      value: genFor(el, state, elementToString, '_ssrList')
    }]
  } else if (el.if && !el.ifProcessed) {
    el.ifProcessed = true;
    return [{
      type: EXPRESSION,
      value: genIf(el, state, elementToString, '"<!---->"')
    }]
  } else if (el.tag === 'template') {
    return childrenToSegments(el, state)
  }

  var openSegments = elementToOpenTagSegments(el, state);
  var childrenSegments = childrenToSegments(el, state);
  var ref = state.options;
  var isUnaryTag = ref.isUnaryTag;
  var close = (isUnaryTag && isUnaryTag(el.tag))
    ? []
    : [{ type: RAW, value: ("</" + (el.tag) + ">") }];
  return openSegments.concat(childrenSegments, close)
}

function elementToOpenTagSegments (el, state) {
  applyModelTransform(el, state);
  var binding;
  var segments = [{ type: RAW, value: ("<" + (el.tag)) }];
  // attrs
  if (el.attrs) {
    segments.push.apply(segments, genAttrSegments(el.attrs));
  }
  // domProps
  if (el.props) {
    segments.push.apply(segments, genDOMPropSegments(el.props, el.attrs));
  }
  // v-bind="object"
  if ((binding = el.attrsMap['v-bind'])) {
    segments.push({ type: EXPRESSION, value: ("_ssrAttrs(" + binding + ")") });
  }
  // v-bind.prop="object"
  if ((binding = el.attrsMap['v-bind.prop'])) {
    segments.push({ type: EXPRESSION, value: ("_ssrDOMProps(" + binding + ")") });
  }
  // class
  if (el.staticClass || el.classBinding) {
    segments.push.apply(
      segments,
      genClassSegments(el.staticClass, el.classBinding)
    );
  }
  // style & v-show
  if (el.staticStyle || el.styleBinding || el.attrsMap['v-show']) {
    segments.push.apply(
      segments,
      genStyleSegments(
        el.attrsMap.style,
        el.staticStyle,
        el.styleBinding,
        el.attrsMap['v-show']
      )
    );
  }
  // _scopedId
  if (state.options.scopeId) {
    segments.push({ type: RAW, value: (" " + (state.options.scopeId)) });
  }
  segments.push({ type: RAW, value: ">" });
  return segments
}

function childrenToSegments (el, state) {
  var binding;
  if ((binding = el.attrsMap['v-html'])) {
    return [{ type: EXPRESSION, value: ("_s(" + binding + ")") }]
  }
  if ((binding = el.attrsMap['v-text'])) {
    return [{ type: INTERPOLATION, value: ("_s(" + binding + ")") }]
  }
  if (el.tag === 'textarea' && (binding = el.attrsMap['v-model'])) {
    return [{ type: INTERPOLATION, value: ("_s(" + binding + ")") }]
  }
  return el.children
    ? nodesToSegments(el.children, state)
    : []
}

function nodesToSegments (
  children,
  state
) {
  var segments = [];
  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    if (c.type === 1) {
      segments.push.apply(segments, elementToSegments(c, state));
    } else if (c.type === 2) {
      segments.push({ type: INTERPOLATION, value: c.expression });
    } else if (c.type === 3) {
      var text = escape(c.text);
      if (c.isComment) {
        text = '<!--' + text + '-->';
      }
      segments.push({ type: RAW, value: text });
    }
  }
  return segments
}

function flattenSegments (segments) {
  var mergedSegments = [];
  var textBuffer = '';

  var pushBuffer = function () {
    if (textBuffer) {
      mergedSegments.push(JSON.stringify(textBuffer));
      textBuffer = '';
    }
  };

  for (var i = 0; i < segments.length; i++) {
    var s = segments[i];
    if (s.type === RAW) {
      textBuffer += s.value;
    } else if (s.type === INTERPOLATION) {
      pushBuffer();
      mergedSegments.push(("_ssrEscape(" + (s.value) + ")"));
    } else if (s.type === EXPRESSION) {
      pushBuffer();
      mergedSegments.push(("(" + (s.value) + ")"));
    }
  }
  pushBuffer();

  return mergedSegments.join('+')
}

/*  */



// these keywords should not appear inside expressions, but operators like
// typeof, instanceof and in are allowed
var prohibitedKeywordRE = new RegExp('\\b' + (
  'do,if,for,let,new,try,var,case,else,with,await,break,catch,class,const,' +
  'super,throw,while,yield,delete,export,import,return,switch,default,' +
  'extends,finally,continue,debugger,function,arguments'
).split(',').join('\\b|\\b') + '\\b');

// these unary operators should not be used as property/method names
var unaryOperatorsRE = new RegExp('\\b' + (
  'delete,typeof,void'
).split(',').join('\\s*\\([^\\)]*\\)|\\b') + '\\s*\\([^\\)]*\\)');

// strip strings in expressions
var stripStringRE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*\$\{|\}(?:[^`\\]|\\.)*`|`(?:[^`\\]|\\.)*`/g;

// detect problematic expressions in a template
function detectErrors (ast, warn) {
  if (ast) {
    checkNode(ast, warn);
  }
}

function checkNode (node, warn) {
  if (node.type === 1) {
    for (var name in node.attrsMap) {
      if (dirRE.test(name)) {
        var value = node.attrsMap[name];
        if (value) {
          var range = node.rawAttrsMap[name];
          if (name === 'v-for') {
            checkFor(node, ("v-for=\"" + value + "\""), warn, range);
          } else if (name === 'v-slot' || name[0] === '#') {
            checkFunctionParameterExpression(value, (name + "=\"" + value + "\""), warn, range);
          } else if (onRE.test(name)) {
            checkEvent(value, (name + "=\"" + value + "\""), warn, range);
          } else {
            checkExpression(value, (name + "=\"" + value + "\""), warn, range);
          }
        }
      }
    }
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        checkNode(node.children[i], warn);
      }
    }
  } else if (node.type === 2) {
    checkExpression(node.expression, node.text, warn, node);
  }
}

function checkEvent (exp, text, warn, range) {
  var stripped = exp.replace(stripStringRE, '');
  var keywordMatch = stripped.match(unaryOperatorsRE);
  if (keywordMatch && stripped.charAt(keywordMatch.index - 1) !== '$') {
    warn(
      "avoid using JavaScript unary operator as property name: " +
      "\"" + (keywordMatch[0]) + "\" in expression " + (text.trim()),
      range
    );
  }
  checkExpression(exp, text, warn, range);
}

function checkFor (node, text, warn, range) {
  checkExpression(node.for || '', text, warn, range);
  checkIdentifier(node.alias, 'v-for alias', text, warn, range);
  checkIdentifier(node.iterator1, 'v-for iterator', text, warn, range);
  checkIdentifier(node.iterator2, 'v-for iterator', text, warn, range);
}

function checkIdentifier (
  ident,
  type,
  text,
  warn,
  range
) {
  if (typeof ident === 'string') {
    try {
      new Function(("var " + ident + "=_"));
    } catch (e) {
      warn(("invalid " + type + " \"" + ident + "\" in expression: " + (text.trim())), range);
    }
  }
}

function checkExpression (exp, text, warn, range) {
  try {
    new Function(("return " + exp));
  } catch (e) {
    var keywordMatch = exp.replace(stripStringRE, '').match(prohibitedKeywordRE);
    if (keywordMatch) {
      warn(
        "avoid using JavaScript keyword as property name: " +
        "\"" + (keywordMatch[0]) + "\"\n  Raw expression: " + (text.trim()),
        range
      );
    } else {
      warn(
        "invalid expression: " + (e.message) + " in\n\n" +
        "    " + exp + "\n\n" +
        "  Raw expression: " + (text.trim()) + "\n",
        range
      );
    }
  }
}

function checkFunctionParameterExpression (exp, text, warn, range) {
  try {
    new Function(exp, '');
  } catch (e) {
    warn(
      "invalid function parameter expression: " + (e.message) + " in\n\n" +
      "    " + exp + "\n\n" +
      "  Raw expression: " + (text.trim()) + "\n",
      range
    );
  }
}

/*  */

var range = 2;

function generateCodeFrame (
  source,
  start,
  end
) {
  if ( start === void 0 ) start = 0;
  if ( end === void 0 ) end = source.length;

  var lines = source.split(/\r?\n/);
  var count = 0;
  var res = [];
  for (var i = 0; i < lines.length; i++) {
    count += lines[i].length + 1;
    if (count >= start) {
      for (var j = i - range; j <= i + range || end > count; j++) {
        if (j < 0 || j >= lines.length) { continue }
        res.push(("" + (j + 1) + (repeat$1(" ", 3 - String(j + 1).length)) + "|  " + (lines[j])));
        var lineLength = lines[j].length;
        if (j === i) {
          // push underline
          var pad = start - (count - lineLength) + 1;
          var length = end > count ? lineLength - pad : end - start;
          res.push("   |  " + repeat$1(" ", pad) + repeat$1("^", length));
        } else if (j > i) {
          if (end > count) {
            var length$1 = Math.min(end - count, lineLength);
            res.push("   |  " + repeat$1("^", length$1));
          }
          count += lineLength + 1;
        }
      }
      break
    }
  }
  return res.join('\n')
}

function repeat$1 (str, n) {
  var result = '';
  if (n > 0) {
    while (true) { // eslint-disable-line
      if (n & 1) { result += str; }
      n >>>= 1;
      if (n <= 0) { break }
      str += str;
    }
  }
  return result
}

/*  */



function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    errors.push({ err: err, code: code });
    return noop
  }
}

function createCompileToFunctionFn (compile) {
  var cache = Object.create(null);

  return function compileToFunctions (
    template,
    options,
    vm
  ) {
    options = extend({}, options);
    var warn$1 = options.warn || warn;
    delete options.warn;

    /* istanbul ignore if */
    {
      // detect possible CSP restriction
      try {
        new Function('return 1');
      } catch (e) {
        if (e.toString().match(/unsafe-eval|CSP/)) {
          warn$1(
            'It seems you are using the standalone build of Vue.js in an ' +
            'environment with Content Security Policy that prohibits unsafe-eval. ' +
            'The template compiler cannot work in this environment. Consider ' +
            'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
            'templates into render functions.'
          );
        }
      }
    }

    // check cache
    var key = options.delimiters
      ? String(options.delimiters) + template
      : template;
    if (cache[key]) {
      return cache[key]
    }

    // compile
    var compiled = compile(template, options);

    // check compilation errors/tips
    {
      if (compiled.errors && compiled.errors.length) {
        if (options.outputSourceRange) {
          compiled.errors.forEach(function (e) {
            warn$1(
              "Error compiling template:\n\n" + (e.msg) + "\n\n" +
              generateCodeFrame(template, e.start, e.end),
              vm
            );
          });
        } else {
          warn$1(
            "Error compiling template:\n\n" + template + "\n\n" +
            compiled.errors.map(function (e) { return ("- " + e); }).join('\n') + '\n',
            vm
          );
        }
      }
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach(function (e) { return tip(e.msg, vm); });
        } else {
          compiled.tips.forEach(function (msg) { return tip(msg, vm); });
        }
      }
    }

    // turn code into functions
    var res = {};
    var fnGenErrors = [];
    res.render = createFunction(compiled.render, fnGenErrors);
    res.staticRenderFns = compiled.staticRenderFns.map(function (code) {
      return createFunction(code, fnGenErrors)
    });

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    {
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn$1(
          "Failed to generate render function:\n\n" +
          fnGenErrors.map(function (ref) {
            var err = ref.err;
            var code = ref.code;

            return ((err.toString()) + " in\n\n" + code + "\n");
        }).join('\n'),
          vm
        );
      }
    }

    return (cache[key] = res)
  }
}

/*  */

function createCompilerCreator (baseCompile) {
  return function createCompiler (baseOptions) {
    function compile (
      template,
      options
    ) {
      var finalOptions = Object.create(baseOptions);
      var errors = [];
      var tips = [];

      var warn = function (msg, range, tip) {
        (tip ? tips : errors).push(msg);
      };

      if (options) {
        if ( options.outputSourceRange) {
          // $flow-disable-line
          var leadingSpaceLength = template.match(/^\s*/)[0].length;

          warn = function (msg, range, tip) {
            var data = { msg: msg };
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength;
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength;
              }
            }
            (tip ? tips : errors).push(data);
          };
        }
        // merge custom modules
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules);
        }
        // merge custom directives
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          );
        }
        // copy other options
        for (var key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key];
          }
        }
      }

      finalOptions.warn = warn;

      var compiled = baseCompile(template.trim(), finalOptions);
      {
        detectErrors(compiled.ast, warn);
      }
      compiled.errors = errors;
      compiled.tips = tips;
      return compiled
    }

    return {
      compile: compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}

/*  */

var createCompiler = createCompilerCreator(function baseCompile (
  template,
  options
) {
  var ast = parse(template.trim(), options);
  optimize(ast, options);
  var code = generate$1(ast, options);
  return {
    ast: ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
});

/*  */

var ref = createCompiler(baseOptions);
var compileToFunctions = ref.compileToFunctions;

/*  */

// The template compiler attempts to minimize the need for normalization by
// statically analyzing the template at compile time.
//
// For plain HTML markup, normalization can be completely skipped because the
// generated render function is guaranteed to return Array<VNode>. There are
// two cases where extra normalization is needed:

// 1. When the children contains components - because a functional component
// may return an Array instead of a single root. In this case, just a simple
// normalization is needed - if any child is an Array, we flatten the whole
// thing with Array.prototype.concat. It is guaranteed to be only 1-level deep
// because functional components already normalize their own children.
function simpleNormalizeChildren (children) {
  for (var i = 0; i < children.length; i++) {
    if (Array.isArray(children[i])) {
      return Array.prototype.concat.apply([], children)
    }
  }
  return children
}

// 2. When the children contains constructs that always generated nested Arrays,
// e.g. <template>, <slot>, v-for, or when the children is provided by user
// with hand-written render functions / JSX. In such cases a full normalization
// is needed to cater to all possible types of children values.
function normalizeChildren (children) {
  return isPrimitive(children)
    ? [createTextVNode(children)]
    : Array.isArray(children)
      ? normalizeArrayChildren(children)
      : undefined
}

function isTextNode (node) {
  return isDef(node) && isDef(node.text) && isFalse(node.isComment)
}

function normalizeArrayChildren (children, nestedIndex) {
  var res = [];
  var i, c, lastIndex, last;
  for (i = 0; i < children.length; i++) {
    c = children[i];
    if (isUndef(c) || typeof c === 'boolean') { continue }
    lastIndex = res.length - 1;
    last = res[lastIndex];
    //  nested
    if (Array.isArray(c)) {
      if (c.length > 0) {
        c = normalizeArrayChildren(c, ((nestedIndex || '') + "_" + i));
        // merge adjacent text nodes
        if (isTextNode(c[0]) && isTextNode(last)) {
          res[lastIndex] = createTextVNode(last.text + (c[0]).text);
          c.shift();
        }
        res.push.apply(res, c);
      }
    } else if (isPrimitive(c)) {
      if (isTextNode(last)) {
        // merge adjacent text nodes
        // this is necessary for SSR hydration because text nodes are
        // essentially merged when rendered to HTML strings
        res[lastIndex] = createTextVNode(last.text + c);
      } else if (c !== '') {
        // convert primitive to vnode
        res.push(createTextVNode(c));
      }
    } else {
      if (isTextNode(c) && isTextNode(last)) {
        // merge adjacent text nodes
        res[lastIndex] = createTextVNode(last.text + c.text);
      } else {
        // default key for nested array children (likely generated by v-for)
        if (isTrue(children._isVList) &&
          isDef(c.tag) &&
          isUndef(c.key) &&
          isDef(nestedIndex)) {
          c.key = "__vlist" + nestedIndex + "_" + i + "__";
        }
        res.push(c);
      }
    }
  }
  return res
}

/*  */

var ssrHelpers = {
  _ssrEscape: escape,
  _ssrNode: renderStringNode,
  _ssrList: renderStringList,
  _ssrAttr: renderAttr,
  _ssrAttrs: renderAttrs$1,
  _ssrDOMProps: renderDOMProps$1,
  _ssrClass: renderSSRClass,
  _ssrStyle: renderSSRStyle
};

function installSSRHelpers (vm) {
  if (vm._ssrNode) {
    return
  }
  var Vue = vm.constructor;
  while (Vue.super) {
    Vue = Vue.super;
  }
  extend(Vue.prototype, ssrHelpers);
  if (Vue.FunctionalRenderContext) {
    extend(Vue.FunctionalRenderContext.prototype, ssrHelpers);
  }
}

var StringNode = function StringNode (
  open,
  close,
  children,
  normalizationType
) {
  this.isString = true;
  this.open = open;
  this.close = close;
  if (children) {
    this.children = normalizationType === 1
      ? simpleNormalizeChildren(children)
      : normalizationType === 2
        ? normalizeChildren(children)
        : children;
  } else {
    this.children = void 0;
  }
};

function renderStringNode (
  open,
  close,
  children,
  normalizationType
) {
  return new StringNode(open, close, children, normalizationType)
}

function renderStringList (
  val,
  render
) {
  var ret = '';
  var i, l, keys, key;
  if (Array.isArray(val) || typeof val === 'string') {
    for (i = 0, l = val.length; i < l; i++) {
      ret += render(val[i], i);
    }
  } else if (typeof val === 'number') {
    for (i = 0; i < val; i++) {
      ret += render(i + 1, i);
    }
  } else if (isObject(val)) {
    keys = Object.keys(val);
    for (i = 0, l = keys.length; i < l; i++) {
      key = keys[i];
      ret += render(val[key], key, i);
    }
  }
  return ret
}

function renderAttrs$1 (obj) {
  var res = '';
  for (var key in obj) {
    if (isSSRUnsafeAttr(key)) {
      continue
    }
    res += renderAttr(key, obj[key]);
  }
  return res
}

function renderDOMProps$1 (obj) {
  var res = '';
  for (var key in obj) {
    var attr = propsToAttrMap[key] || key.toLowerCase();
    if (isRenderableAttr(attr)) {
      res += renderAttr(attr, obj[key]);
    }
  }
  return res
}

function renderSSRClass (
  staticClass,
  dynamic
) {
  var res = renderClass(staticClass, dynamic);
  return res === '' ? res : (" class=\"" + (escape(res)) + "\"")
}

function renderSSRStyle (
  staticStyle,
  dynamic,
  extra
) {
  var style = {};
  if (staticStyle) { extend(style, staticStyle); }
  if (dynamic) { extend(style, normalizeStyleBinding(dynamic)); }
  if (extra) { extend(style, extra); }
  var res = genStyle(style);
  return res === '' ? res : (" style=" + (JSON.stringify(escape(res))))
}

/*  */

var isJS = function (file) { return /\.js(\?[^.]+)?$/.test(file); };

var isCSS = function (file) { return /\.css(\?[^.]+)?$/.test(file); };

function createPromiseCallback () {
  var resolve, reject;
  var promise = new Promise(function (_resolve, _reject) {
    resolve = _resolve;
    reject = _reject;
  });
  var cb = function (err, res) {
    if (err) { return reject(err) }
    resolve(res || '');
  };
  return { promise: promise, cb: cb }
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
function getVNodeAstChildren(ast) {
  var children = null;
  if (ast.type === 'CallExpression') {
    try {
      children = ast.arguments.filter(function (v) { return v.type === 'ArrayExpression'; })[0];
    } catch(e) {
      console.error('To get the virtual DOM sub-element failed, see AST', ast);
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
function isSSRNodeAst(ast) {
  return ast && types.isCallExpression(ast) &&
    types.isMemberExpression(ast.callee) &&
    types.isIdentifier(ast.callee.property) &&
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
function getLeftStringLiteral(ast) {
  if (types.isBinaryExpression(ast)) {
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
function getRightStringLiteral(ast) {
  if (types.isBinaryExpression(ast)) {
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
function binaryExpressionPlus(left, right) {
  if (types.isStringLiteral(left) && types.isStringLiteral(right)) {
    return types.stringLiteral(left.value + right.value)
  }
  else if (types.isStringLiteral(left) && types.isBinaryExpression(right)) {
    var mostLeft = getLeftStringLiteral(right);
    mostLeft.value = left.value + mostLeft.value;
    return right
  }
  else if (types.isBinaryExpression(left) && types.isStringLiteral(right)) {
    var mostRight = getRightStringLiteral(left);
    mostRight.value = mostRight.value + right.value;
    return left
  }
  else {
    return types.binaryExpression('+', left, right)
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
function getStatisAstComponentValue(ast) {
  var value = '';
  if (ast.ssrString !== undefined) {
    if (isSSRNodeAst(ast)) {
      if (ast.arguments.length === 1) {
        var node = ast.arguments[0];
        if (types.isStringLiteral(node)) {
          value = node.value;
        }
      }
    } else if (ast.ssrStatic === true) {
      value = ast.ssrString;
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
function getVNodeRenderAst(ast) {
  var vNodeAst;
  traverse$1(ast, {
    noScope: true,
    ReturnStatement: function ReturnStatement(path) {
      var arg = path.node.argument;
      if (isCCallExpression(arg) || isSSRNodeCallExpression(arg)) {
        vNodeAst = arg;
      }
      path.stop();
    }
  });
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
  if (!types.isCallExpression(node)) {
    return false
  }
  if (!types.isMemberExpression(node.callee)) {
    return false
  }
  var prop = node.callee.property;
  if (!types.isIdentifier(prop)) {
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
function isCCallExpression(node) {
  if (!types.isCallExpression(node)) {
    return false
  }
  if (!Array.isArray(node.arguments)) {
    return false
  }
  if (!types.isIdentifier(node.callee)) {
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
function isLCallExpression(node) {
  if (!types.isCallExpression(node)) {
    return false
  }
  if (!Array.isArray(node.arguments)) {
    return false
  }
  if (!types.isMemberExpression(node.callee)) {
    return false
  }
  if (!types.isIdentifier(node.callee.object)) {
    return false
  }
  if (!types.isIdentifier(node.callee.property)) {
    return false
  }
  if (node.callee.object.name === '_vm' && node.callee.property.name === '_l') {
    return true
  }

  return false
}

function renderStyles (styles) {
  var css = '';
  for (var key in styles) {
    var style = styles[key];
    css += '<style data-vue-ssr-id="' + style.ids.join(' ') + '"' +
        (style.media ? ( ' media="' + style.media + '"' ) : '') + '>' +
        style.css + '</style>';
  }
  return css
}

/* not type checking this file because flow doesn't play well with Proxy */

{
  var allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
  );

  var hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy);

  if (hasProxy) {
    var isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact');
    config.keyCodes = new Proxy(config.keyCodes, {
      set: function set (target, key, value) {
        if (isBuiltInModifier(key)) {
          warn(("Avoid overwriting built-in modifier in config.keyCodes: ." + key));
          return false
        } else {
          target[key] = value;
          return true
        }
      }
    });
  }
}

/*  */

var seenObjects = new _Set();

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
function traverse (val) {
  _traverse(val, seenObjects);
  seenObjects.clear();
}

function _traverse (val, seen) {
  var i, keys;
  var isA = Array.isArray(val);
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  if (val.__ob__) {
    var depId = val.__ob__.dep.id;
    if (seen.has(depId)) {
      return
    }
    seen.add(depId);
  }
  if (isA) {
    i = val.length;
    while (i--) { _traverse(val[i], seen); }
  } else {
    keys = Object.keys(val);
    i = keys.length;
    while (i--) { _traverse(val[keys[i]], seen); }
  }
}

{
  var perf = inBrowser && window.performance;
  /* istanbul ignore if */
  if (
    perf &&
    perf.mark &&
    perf.measure &&
    perf.clearMarks &&
    perf.clearMeasures
  ) ;
}

/*  */

var normalizeEvent = cached(function (name) {
  var passive = name.charAt(0) === '&';
  name = passive ? name.slice(1) : name;
  var once = name.charAt(0) === '~'; // Prefixed last, checked first
  name = once ? name.slice(1) : name;
  var capture = name.charAt(0) === '!';
  name = capture ? name.slice(1) : name;
  return {
    name: name,
    once: once,
    capture: capture,
    passive: passive
  }
});

function createFnInvoker (fns, vm) {
  function invoker () {
    var arguments$1 = arguments;

    var fns = invoker.fns;
    if (Array.isArray(fns)) {
      var cloned = fns.slice();
      for (var i = 0; i < cloned.length; i++) {
        invokeWithErrorHandling(cloned[i], null, arguments$1, vm, "v-on handler");
      }
    } else {
      // return handler return value for single handlers
      return invokeWithErrorHandling(fns, null, arguments, vm, "v-on handler")
    }
  }
  invoker.fns = fns;
  return invoker
}

function updateListeners (
  on,
  oldOn,
  add,
  remove,
  createOnceHandler,
  vm
) {
  var name, def, cur, old, event;
  for (name in on) {
    def = cur = on[name];
    old = oldOn[name];
    event = normalizeEvent(name);
    if (isUndef(cur)) {
       warn(
        "Invalid handler for event \"" + (event.name) + "\": got " + String(cur),
        vm
      );
    } else if (isUndef(old)) {
      if (isUndef(cur.fns)) {
        cur = on[name] = createFnInvoker(cur, vm);
      }
      if (isTrue(event.once)) {
        cur = on[name] = createOnceHandler(event.name, cur, event.capture);
      }
      add(event.name, cur, event.capture, event.passive, event.params);
    } else if (cur !== old) {
      old.fns = cur;
      on[name] = old;
    }
  }
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name);
      remove(event.name, oldOn[name], event.capture);
    }
  }
}

/*  */

function extractPropsFromVNodeData (
  data,
  Ctor,
  tag
) {
  // we are only extracting raw values here.
  // validation and default values are handled in the child
  // component itself.
  var propOptions = Ctor.options.props;
  if (isUndef(propOptions)) {
    return
  }
  var res = {};
  var attrs = data.attrs;
  var props = data.props;
  if (isDef(attrs) || isDef(props)) {
    for (var key in propOptions) {
      var altKey = hyphenate(key);
      {
        var keyInLowerCase = key.toLowerCase();
        if (
          key !== keyInLowerCase &&
          attrs && hasOwn(attrs, keyInLowerCase)
        ) {
          tip(
            "Prop \"" + keyInLowerCase + "\" is passed to component " +
            (formatComponentName(tag || Ctor)) + ", but the declared prop name is" +
            " \"" + key + "\". " +
            "Note that HTML attributes are case-insensitive and camelCased " +
            "props need to use their kebab-case equivalents when using in-DOM " +
            "templates. You should probably use \"" + altKey + "\" instead of \"" + key + "\"."
          );
        }
      }
      checkProp(res, props, key, altKey, true) ||
      checkProp(res, attrs, key, altKey, false);
    }
  }
  return res
}

function checkProp (
  res,
  hash,
  key,
  altKey,
  preserve
) {
  if (isDef(hash)) {
    if (hasOwn(hash, key)) {
      res[key] = hash[key];
      if (!preserve) {
        delete hash[key];
      }
      return true
    } else if (hasOwn(hash, altKey)) {
      res[key] = hash[altKey];
      if (!preserve) {
        delete hash[altKey];
      }
      return true
    }
  }
  return false
}

/*  */

var SIMPLE_NORMALIZE = 1;
var ALWAYS_NORMALIZE = 2;

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
function createElement (
  context,
  tag,
  data,
  children,
  normalizationType,
  alwaysNormalize
) {
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children;
    children = data;
    data = undefined;
  }
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE;
  }
  return _createElement(context, tag, data, children, normalizationType)
}

function _createElement (
  context,
  tag,
  data,
  children,
  normalizationType
) {
  if (isDef(data) && isDef((data).__ob__)) {
     warn(
      "Avoid using observed data object as vnode data: " + (JSON.stringify(data)) + "\n" +
      'Always create fresh vnode data objects in each render!',
      context
    );
    return createEmptyVNode()
  }
  // object syntax in v-bind
  if (isDef(data) && isDef(data.is)) {
    tag = data.is;
  }
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  if (
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      );
    }
  }
  // support single function children as default scoped slot
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {};
    data.scopedSlots = { default: children[0] };
    children.length = 0;
  }
  if (normalizationType === ALWAYS_NORMALIZE) {
    children = normalizeChildren(children);
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    children = simpleNormalizeChildren(children);
  }
  var vnode, ns;
  if (typeof tag === 'string') {
    var Ctor;
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag);
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      if ( isDef(data) && isDef(data.nativeOn)) {
        warn(
          ("The .native modifier for v-on is only valid on components but it was used on <" + tag + ">."),
          context
        );
      }
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      );
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // component
      vnode = createComponent(Ctor, data, context, children, tag);
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      );
    }
  } else {
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children);
  }
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) { applyNS(vnode, ns); }
    if (isDef(data)) { registerDeepBindings(data); }
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function applyNS (vnode, ns, force) {
  vnode.ns = ns;
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined;
    force = true;
  }
  if (isDef(vnode.children)) {
    for (var i = 0, l = vnode.children.length; i < l; i++) {
      var child = vnode.children[i];
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force);
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style);
  }
  if (isObject(data.class)) {
    traverse(data.class);
  }
}

/*  */

/**
 * Runtime helper for rendering v-for lists.
 */
function renderList (
  val,
  render
) {
  var ret, i, l, keys, key;
  if (Array.isArray(val) || typeof val === 'string') {
    ret = new Array(val.length);
    for (i = 0, l = val.length; i < l; i++) {
      ret[i] = render(val[i], i);
    }
  } else if (typeof val === 'number') {
    ret = new Array(val);
    for (i = 0; i < val; i++) {
      ret[i] = render(i + 1, i);
    }
  } else if (isObject(val)) {
    if (hasSymbol && val[Symbol.iterator]) {
      ret = [];
      var iterator = val[Symbol.iterator]();
      var result = iterator.next();
      while (!result.done) {
        ret.push(render(result.value, ret.length));
        result = iterator.next();
      }
    } else {
      keys = Object.keys(val);
      ret = new Array(keys.length);
      for (i = 0, l = keys.length; i < l; i++) {
        key = keys[i];
        ret[i] = render(val[key], key, i);
      }
    }
  }
  if (!isDef(ret)) {
    ret = [];
  }
  (ret)._isVList = true;
  return ret
}

/*  */

/**
 * Runtime helper for rendering <slot>
 */
function renderSlot (
  name,
  fallback,
  props,
  bindObject
) {
  var scopedSlotFn = this.$scopedSlots[name];
  var nodes;
  if (scopedSlotFn) { // scoped slot
    props = props || {};
    if (bindObject) {
      if ( !isObject(bindObject)) {
        warn(
          'slot v-bind without argument expects an Object',
          this
        );
      }
      props = extend(extend({}, bindObject), props);
    }
    nodes = scopedSlotFn(props) || fallback;
  } else {
    nodes = this.$slots[name] || fallback;
  }

  var target = props && props.slot;
  if (target) {
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}

/*  */

/**
 * Runtime helper for resolving filters
 */
function resolveFilter (id) {
  return resolveAsset(this.$options, 'filters', id, true) || identity
}

/*  */

function isKeyNotMatch (expect, actual) {
  if (Array.isArray(expect)) {
    return expect.indexOf(actual) === -1
  } else {
    return expect !== actual
  }
}

/**
 * Runtime helper for checking keyCodes from config.
 * exposed as Vue.prototype._k
 * passing in eventKeyName as last argument separately for backwards compat
 */
function checkKeyCodes (
  eventKeyCode,
  key,
  builtInKeyCode,
  eventKeyName,
  builtInKeyName
) {
  var mappedKeyCode = config.keyCodes[key] || builtInKeyCode;
  if (builtInKeyName && eventKeyName && !config.keyCodes[key]) {
    return isKeyNotMatch(builtInKeyName, eventKeyName)
  } else if (mappedKeyCode) {
    return isKeyNotMatch(mappedKeyCode, eventKeyCode)
  } else if (eventKeyName) {
    return hyphenate(eventKeyName) !== key
  }
}

/*  */

/**
 * Runtime helper for merging v-bind="object" into a VNode's data.
 */
function bindObjectProps (
  data,
  tag,
  value,
  asProp,
  isSync
) {
  if (value) {
    if (!isObject(value)) {
       warn(
        'v-bind without argument expects an Object or Array value',
        this
      );
    } else {
      if (Array.isArray(value)) {
        value = toObject(value);
      }
      var hash;
      var loop = function ( key ) {
        if (
          key === 'class' ||
          key === 'style' ||
          isReservedAttribute(key)
        ) {
          hash = data;
        } else {
          var type = data.attrs && data.attrs.type;
          hash = asProp || config.mustUseProp(tag, type, key)
            ? data.domProps || (data.domProps = {})
            : data.attrs || (data.attrs = {});
        }
        var camelizedKey = camelize(key);
        var hyphenatedKey = hyphenate(key);
        if (!(camelizedKey in hash) && !(hyphenatedKey in hash)) {
          hash[key] = value[key];

          if (isSync) {
            var on = data.on || (data.on = {});
            on[("update:" + key)] = function ($event) {
              value[key] = $event;
            };
          }
        }
      };

      for (var key in value) loop( key );
    }
  }
  return data
}

/*  */

/**
 * Runtime helper for rendering static trees.
 */
function renderStatic (
  index,
  isInFor
) {
  var cached = this._staticTrees || (this._staticTrees = []);
  var tree = cached[index];
  // if has already-rendered static tree and not inside v-for,
  // we can reuse the same tree.
  if (tree && !isInFor) {
    return tree
  }
  // otherwise, render a fresh tree.
  tree = cached[index] = this.$options.staticRenderFns[index].call(
    this._renderProxy,
    null,
    this // for render fns generated for functional component templates
  );
  markStatic(tree, ("__static__" + index), false);
  return tree
}

/**
 * Runtime helper for v-once.
 * Effectively it means marking the node as static with a unique key.
 */
function markOnce (
  tree,
  index,
  key
) {
  markStatic(tree, ("__once__" + index + (key ? ("_" + key) : "")), true);
  return tree
}

function markStatic (
  tree,
  key,
  isOnce
) {
  if (Array.isArray(tree)) {
    for (var i = 0; i < tree.length; i++) {
      if (tree[i] && typeof tree[i] !== 'string') {
        markStaticNode(tree[i], (key + "_" + i), isOnce);
      }
    }
  } else {
    markStaticNode(tree, key, isOnce);
  }
}

function markStaticNode (node, key, isOnce) {
  node.isStatic = true;
  node.key = key;
  node.isOnce = isOnce;
}

/*  */

function bindObjectListeners (data, value) {
  if (value) {
    if (!isPlainObject(value)) {
       warn(
        'v-on without argument expects an Object value',
        this
      );
    } else {
      var on = data.on = data.on ? extend({}, data.on) : {};
      for (var key in value) {
        var existing = on[key];
        var ours = value[key];
        on[key] = existing ? [].concat(existing, ours) : ours;
      }
    }
  }
  return data
}

/*  */

function resolveScopedSlots (
  fns, // see flow/vnode
  res,
  // the following are added in 2.6
  hasDynamicKeys,
  contentHashKey
) {
  res = res || { $stable: !hasDynamicKeys };
  for (var i = 0; i < fns.length; i++) {
    var slot = fns[i];
    if (Array.isArray(slot)) {
      resolveScopedSlots(slot, res, hasDynamicKeys);
    } else if (slot) {
      // marker for reverse proxying v-slot without scope on this.$slots
      if (slot.proxy) {
        slot.fn.proxy = true;
      }
      res[slot.key] = slot.fn;
    }
  }
  if (contentHashKey) {
    (res).$key = contentHashKey;
  }
  return res
}

/*  */

function bindDynamicKeys (baseObj, values) {
  for (var i = 0; i < values.length; i += 2) {
    var key = values[i];
    if (typeof key === 'string' && key) {
      baseObj[values[i]] = values[i + 1];
    } else if ( key !== '' && key !== null) {
      // null is a special value for explicitly removing a binding
      warn(
        ("Invalid value for dynamic directive argument (expected string or null): " + key),
        this
      );
    }
  }
  return baseObj
}

// helper to dynamically append modifier runtime markers to event names.
// ensure only append when value is already string, otherwise it will be cast
// to string and cause the type check to miss.
function prependModifier (value, symbol) {
  return typeof value === 'string' ? symbol + value : value
}

/*  */

function installRenderHelpers (target) {
  target._o = markOnce;
  target._n = toNumber;
  target._s = toString;
  target._l = renderList;
  target._t = renderSlot;
  target._q = looseEqual;
  target._i = looseIndexOf;
  target._m = renderStatic;
  target._f = resolveFilter;
  target._k = checkKeyCodes;
  target._b = bindObjectProps;
  target._v = createTextVNode;
  target._e = createEmptyVNode;
  target._u = resolveScopedSlots;
  target._g = bindObjectListeners;
  target._d = bindDynamicKeys;
  target._p = prependModifier;
}

/*  */



/**
 * Runtime helper for resolving raw children VNodes into a slot object.
 */
function resolveSlots (
  children,
  context
) {
  if (!children || !children.length) {
    return {}
  }
  var slots = {};
  for (var i = 0, l = children.length; i < l; i++) {
    var child = children[i];
    var data = child.data;
    // remove slot attribute if the node is resolved as a Vue slot node
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot;
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) {
      var name = data.slot;
      var slot = (slots[name] || (slots[name] = []));
      if (child.tag === 'template') {
        slot.push.apply(slot, child.children || []);
      } else {
        slot.push(child);
      }
    } else {
      (slots.default || (slots.default = [])).push(child);
    }
  }
  // ignore slots that contains only whitespace
  for (var name$1 in slots) {
    if (slots[name$1].every(isWhitespace)) {
      delete slots[name$1];
    }
  }
  return slots
}

function isWhitespace (node) {
  return (node.isComment && !node.asyncFactory) || node.text === ' '
}

/*  */

function normalizeScopedSlots (
  slots,
  normalSlots,
  prevSlots
) {
  var res;
  var hasNormalSlots = Object.keys(normalSlots).length > 0;
  var isStable = slots ? !!slots.$stable : !hasNormalSlots;
  var key = slots && slots.$key;
  if (!slots) {
    res = {};
  } else if (slots._normalized) {
    // fast path 1: child component re-render only, parent did not change
    return slots._normalized
  } else if (
    isStable &&
    prevSlots &&
    prevSlots !== emptyObject &&
    key === prevSlots.$key &&
    !hasNormalSlots &&
    !prevSlots.$hasNormal
  ) {
    // fast path 2: stable scoped slots w/ no normal slots to proxy,
    // only need to normalize once
    return prevSlots
  } else {
    res = {};
    for (var key$1 in slots) {
      if (slots[key$1] && key$1[0] !== '$') {
        res[key$1] = normalizeScopedSlot(normalSlots, key$1, slots[key$1]);
      }
    }
  }
  // expose normal slots on scopedSlots
  for (var key$2 in normalSlots) {
    if (!(key$2 in res)) {
      res[key$2] = proxyNormalSlot(normalSlots, key$2);
    }
  }
  // avoriaz seems to mock a non-extensible $scopedSlots object
  // and when that is passed down this would cause an error
  if (slots && Object.isExtensible(slots)) {
    (slots)._normalized = res;
  }
  def(res, '$stable', isStable);
  def(res, '$key', key);
  def(res, '$hasNormal', hasNormalSlots);
  return res
}

function normalizeScopedSlot(normalSlots, key, fn) {
  var normalized = function () {
    var res = arguments.length ? fn.apply(null, arguments) : fn({});
    res = res && typeof res === 'object' && !Array.isArray(res)
      ? [res] // single vnode
      : normalizeChildren(res);
    return res && (
      res.length === 0 ||
      (res.length === 1 && res[0].isComment) // #9658
    ) ? undefined
      : res
  };
  // this is a slot using the new v-slot syntax without scope. although it is
  // compiled as a scoped slot, render fn users would expect it to be present
  // on this.$slots because the usage is semantically a normal slot.
  if (fn.proxy) {
    Object.defineProperty(normalSlots, key, {
      get: normalized,
      enumerable: true,
      configurable: true
    });
  }
  return normalized
}

function proxyNormalSlot(slots, key) {
  return function () { return slots[key]; }
}

/*  */

function ssrRender(vm) {
  var ref = vm.$options;
  var render = ref.render;
  var _parentVnode = ref._parentVnode;

  if (_parentVnode) {
    vm.$scopedSlots = normalizeScopedSlots(
      _parentVnode.data.scopedSlots,
      vm.$slots,
      vm.$scopedSlots
    );
  }

  // set parent vnode. this allows render functions to have access
  // to the data on the placeholder node.
  vm.$vnode = _parentVnode;
  // render self
  var vnode = render.call(vm._renderProxy, vm.$createElement);

  return vnode
}

/*  */

function createAsyncPlaceholder (
  factory,
  data,
  context,
  children,
  tag
) {
  var node = createEmptyVNode();
  node.asyncFactory = factory;
  node.asyncMeta = { data: data, context: context, children: children, tag: tag };
  return node
}

function resolveAsyncComponent (
  factory,
  baseCtor
) {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }
}

/*  */

var target;

function add (event, fn) {
  target.$on(event, fn);
}

function remove$1 (event, fn) {
  target.$off(event, fn);
}

function createOnceHandler (event, fn) {
  var _target = target;
  return function onceHandler () {
    var res = fn.apply(null, arguments);
    if (res !== null) {
      _target.$off(event, onceHandler);
    }
  }
}

function updateComponentListeners (
  vm,
  listeners,
  oldListeners
) {
  target = vm;
  updateListeners(listeners, oldListeners || {}, add, remove$1, createOnceHandler, vm);
  target = undefined;
}

/*  */

var activeInstance = null;

function updateChildComponent (
  vm,
  propsData,
  listeners,
  parentVnode,
  renderChildren
) {

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  var newScopedSlots = parentVnode.data.scopedSlots;
  var oldScopedSlots = vm.$scopedSlots;
  var hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  );

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  var needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  );

  vm.$options._parentVnode = parentVnode;
  vm.$vnode = parentVnode; // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode;
  }
  vm.$options._renderChildren = renderChildren;

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject;
  vm.$listeners = listeners || emptyObject;

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false);
    var props = vm._props;
    var propKeys = vm.$options._propKeys || [];
    for (var i = 0; i < propKeys.length; i++) {
      var key = propKeys[i];
      var propOptions = vm.$options.props; // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm);
    }
    toggleObserving(true);
    // keep a copy of raw propsData
    vm.$options.propsData = propsData;
  }

  // update listeners
  listeners = listeners || emptyObject;
  var oldListeners = vm.$options._parentListeners;
  vm.$options._parentListeners = listeners;
  updateComponentListeners(vm, listeners, oldListeners);

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context);
    vm.$forceUpdate();
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) { return true }
  }
  return false
}

function activateChildComponent (vm, direct) {
  if (direct) {
    vm._directInactive = false;
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false;
    for (var i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i]);
    }
    callHook(vm, 'activated');
  }
}

function deactivateChildComponent (vm, direct) {
  if (direct) {
    vm._directInactive = true;
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true;
    for (var i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i]);
    }
    callHook(vm, 'deactivated');
  }
}

function callHook (vm, hook) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget();
  var handlers = vm.$options[hook];
  var info = hook + " hook";
  if (handlers) {
    for (var i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info);
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook);
  }
  popTarget();
}

/*  */

// Async edge case fix requires storing an event listener's attach timestamp.
var getNow = Date.now;

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  var performance = window.performance;
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = function () { return performance.now(); };
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
function queueActivatedComponent (vm) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false;
}

/*  */

function resolveInject (inject, vm) {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    var result = Object.create(null);
    var keys = hasSymbol
      ? Reflect.ownKeys(inject)
      : Object.keys(inject);

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      // #6574 in case the inject object is observed...
      if (key === '__ob__') { continue }
      var provideKey = inject[key].from;
      var source = vm;
      while (source) {
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey];
          break
        }
        source = source.$parent;
      }
      if (!source) {
        if ('default' in inject[key]) {
          var provideDefault = inject[key].default;
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault;
        } else {
          warn(("Injection \"" + key + "\" not found"), vm);
        }
      }
    }
    return result
  }
}

/*  */

function resolveConstructorOptions (Ctor) {
  var options = Ctor.options;
  if (Ctor.super) {
    var superOptions = resolveConstructorOptions(Ctor.super);
    var cachedSuperOptions = Ctor.superOptions;
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions;
      // check if there are any late-modified/attached options (#4976)
      var modifiedOptions = resolveModifiedOptions(Ctor);
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions);
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions);
      if (options.name) {
        options.components[options.name] = Ctor;
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor) {
  var modified;
  var latest = Ctor.options;
  var sealed = Ctor.sealedOptions;
  for (var key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) { modified = {}; }
      modified[key] = latest[key];
    }
  }
  return modified
}

/*  */

function FunctionalRenderContext (
  data,
  props,
  children,
  parent,
  Ctor
) {
  var this$1 = this;

  var options = Ctor.options;
  // ensure the createElement function in functional components
  // gets a unique context - this is necessary for correct named slot check
  var contextVm;
  if (hasOwn(parent, '_uid')) {
    contextVm = Object.create(parent);
    // $flow-disable-line
    contextVm._original = parent;
  } else {
    // the context vm passed in is a functional context as well.
    // in this case we want to make sure we are able to get a hold to the
    // real context instance.
    contextVm = parent;
    // $flow-disable-line
    parent = parent._original;
  }
  var isCompiled = isTrue(options._compiled);
  var needNormalization = !isCompiled;

  this.data = data;
  this.props = props;
  this.children = children;
  this.parent = parent;
  this.listeners = data.on || emptyObject;
  this.injections = resolveInject(options.inject, parent);
  this.slots = function () {
    if (!this$1.$slots) {
      normalizeScopedSlots(
        data.scopedSlots,
        this$1.$slots = resolveSlots(children, parent)
      );
    }
    return this$1.$slots
  };

  Object.defineProperty(this, 'scopedSlots', ({
    enumerable: true,
    get: function get () {
      return normalizeScopedSlots(data.scopedSlots, this.slots())
    }
  }));

  // support for compiled functional template
  if (isCompiled) {
    // exposing $options for renderStatic()
    this.$options = options;
    // pre-resolve slots for renderSlot()
    this.$slots = this.slots();
    this.$scopedSlots = normalizeScopedSlots(data.scopedSlots, this.$slots);
  }

  if (options._scopeId) {
    this._c = function (a, b, c, d) {
      var vnode = createElement(contextVm, a, b, c, d, needNormalization);
      if (vnode && !Array.isArray(vnode)) {
        vnode.fnScopeId = options._scopeId;
        vnode.fnContext = parent;
      }
      return vnode
    };
  } else {
    this._c = function (a, b, c, d) { return createElement(contextVm, a, b, c, d, needNormalization); };
  }
}

installRenderHelpers(FunctionalRenderContext.prototype);

function createFunctionalComponent (
  Ctor,
  propsData,
  data,
  contextVm,
  children
) {
  var options = Ctor.options;
  var props = {};
  var propOptions = options.props;
  if (isDef(propOptions)) {
    for (var key in propOptions) {
      props[key] = validateProp(key, propOptions, propsData || emptyObject);
    }
  } else {
    if (isDef(data.attrs)) { mergeProps(props, data.attrs); }
    if (isDef(data.props)) { mergeProps(props, data.props); }
  }

  var renderContext = new FunctionalRenderContext(
    data,
    props,
    children,
    contextVm,
    Ctor
  );

  var vnode = options.render.call(null, renderContext._c, renderContext);

  if (vnode instanceof VNode) {
    return cloneAndMarkFunctionalResult(vnode, data, renderContext.parent, options, renderContext)
  } else if (Array.isArray(vnode)) {
    var vnodes = normalizeChildren(vnode) || [];
    var res = new Array(vnodes.length);
    for (var i = 0; i < vnodes.length; i++) {
      res[i] = cloneAndMarkFunctionalResult(vnodes[i], data, renderContext.parent, options, renderContext);
    }
    return res
  }
}

function cloneAndMarkFunctionalResult (vnode, data, contextVm, options, renderContext) {
  // #7817 clone node before setting fnContext, otherwise if the node is reused
  // (e.g. it was from a cached normal slot) the fnContext causes named slots
  // that should not be matched to match.
  var clone = cloneVNode(vnode);
  clone.fnContext = contextVm;
  clone.fnOptions = options;
  {
    (clone.devtoolsMeta = clone.devtoolsMeta || {}).renderContext = renderContext;
  }
  if (data.slot) {
    (clone.data || (clone.data = {})).slot = data.slot;
  }
  return clone
}

function mergeProps (to, from) {
  for (var key in from) {
    to[camelize(key)] = from[key];
  }
}

/*  */

// inline hooks to be invoked on component VNodes during patch
var componentVNodeHooks = {
  init: function init (vnode, hydrating) {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      var mountedNode = vnode; // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode);
    } else {
      var child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      );
      child.$mount(hydrating ? vnode.elm : undefined, hydrating);
    }
  },

  prepatch: function prepatch (oldVnode, vnode) {
    var options = vnode.componentOptions;
    var child = vnode.componentInstance = oldVnode.componentInstance;
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    );
  },

  insert: function insert (vnode) {
    var context = vnode.context;
    var componentInstance = vnode.componentInstance;
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true;
      callHook(componentInstance, 'mounted');
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance);
      } else {
        activateChildComponent(componentInstance, true /* direct */);
      }
    }
  },

  destroy: function destroy (vnode) {
    var componentInstance = vnode.componentInstance;
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy();
      } else {
        deactivateChildComponent(componentInstance, true /* direct */);
      }
    }
  }
};

var hooksToMerge = Object.keys(componentVNodeHooks);

function createComponent (
  Ctor,
  data,
  context,
  children,
  tag
) {
  if (isUndef(Ctor)) {
    return
  }

  var baseCtor = context.$options._base;

  // plain options object: turn it into a constructor
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor);
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  if (typeof Ctor !== 'function') {
    {
      warn(("Invalid Component definition: " + (String(Ctor))), context);
    }
    return
  }

  // async component
  var asyncFactory;
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor;
    Ctor = resolveAsyncComponent(asyncFactory);
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {};

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  resolveConstructorOptions(Ctor);

  // transform component v-model data into props & events
  if (isDef(data.model)) {
    transformModel(Ctor.options, data);
  }

  // extract props
  var propsData = extractPropsFromVNodeData(data, Ctor, tag);

  // functional component
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  var listeners = data.on;
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn;

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    var slot = data.slot;
    data = {};
    if (slot) {
      data.slot = slot;
    }
  }

  // install component management hooks onto the placeholder node
  installComponentHooks(data);

  // return a placeholder vnode
  var name = Ctor.options.name || tag;
  var vnode = new VNode(
    ("vue-component-" + (Ctor.cid) + (name ? ("-" + name) : '')),
    data, undefined, undefined, undefined, context,
    { Ctor: Ctor, propsData: propsData, listeners: listeners, tag: tag, children: children },
    asyncFactory
  );

  return vnode
}

function createComponentInstanceForVnode (
  vnode, // we know it's MountedComponentVNode but flow doesn't
  parent // activeInstance in lifecycle state
) {
  var options = {
    _isComponent: true,
    _parentVnode: vnode,
    parent: parent
  };
  // check inline-template render functions
  var inlineTemplate = vnode.data.inlineTemplate;
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render;
    options.staticRenderFns = inlineTemplate.staticRenderFns;
  }
  return new vnode.componentOptions.Ctor(options)
}

function installComponentHooks (data) {
  var hooks = data.hook || (data.hook = {});
  for (var i = 0; i < hooksToMerge.length; i++) {
    var key = hooksToMerge[i];
    var existing = hooks[key];
    var toMerge = componentVNodeHooks[key];
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook$1(toMerge, existing) : toMerge;
    }
  }
}

function mergeHook$1 (f1, f2) {
  var merged = function (a, b) {
    // flow complains about extra args which is why we use any
    f1(a, b);
    f2(a, b);
  };
  merged._merged = true;
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel (options, data) {
  var prop = (options.model && options.model.prop) || 'value';
  var event = (options.model && options.model.event) || 'input'
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value;
  var on = data.on || (data.on = {});
  var existing = on[event];
  var callback = data.model.callback;
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing);
    }
  } else {
    on[event] = callback;
  }
}

/*  */

var warned = Object.create(null);
var warnOnce = function (msg) {
  if (!warned[msg]) {
    warned[msg] = true;
    // eslint-disable-next-line no-console
    console.warn(("\n\u001b[31m" + msg + "\u001b[39m\n"));
  }
};

var onCompilationError = function (err, vm) {
  var trace = vm ? generateComponentTrace(vm) : '';
  throw new Error(("\n\u001b[31m" + err + trace + "\u001b[39m\n"))
};

var normalizeRender = function (vm) {
  var ref = vm.$options;
  var render = ref.render;
  var template = ref.template;
  var _scopeId = ref._scopeId;
  if (isUndef(render)) {
    if (template) {
      var compiled = compileToFunctions(template, {
        scopeId: _scopeId,
        warn: onCompilationError
      }, vm);

      vm.$options.render = compiled.render;
      vm.$options.staticRenderFns = compiled.staticRenderFns;
    } else {
      throw new Error(
        ("render function or template not defined in component: " + (vm.$options.name || vm.$options._componentTag || 'anonymous'))
      )
    }
  }
};

function waitForServerPrefetch (vm, resolve, reject) {
  var handlers = vm.$options.serverPrefetch;
  if (isDef(handlers)) {
    if (!Array.isArray(handlers)) { handlers = [handlers]; }
    try {
      var promises = [];
      for (var i = 0, j = handlers.length; i < j; i++) {
        var result = handlers[i].call(vm, vm);
        if (result && typeof result.then === 'function') {
          promises.push(result);
        }
      }
      Promise.all(promises).then(resolve).catch(reject);
      return
    } catch (e) {
      reject(e);
    }
  }
  resolve();
}

function renderNode (node, isRoot, context, renderTree) {
  if (node.isString) {
    renderStringNode$1(node, context, renderTree);
  } else if (isDef(node.componentOptions)) {
    var _renderTree = null;
    if (renderTree && renderTree.children) {
      _renderTree = renderTree.children.shift();
    }
    renderComponent(node, isRoot, context, _renderTree);
  } else if (isDef(node.tag)) {
    renderElement(node, isRoot, context, renderTree);
  } else if (isTrue(node.isComment)) {
    if (isDef(node.asyncFactory)) {
      // async component
      renderAsyncComponent(node, isRoot, context, renderTree);
    } else {
      context.write(("<!--" + (node.text) + "-->"), context.next);
    }
  } else {
    context.write(
      node.raw ? node.text : escape(String(node.text)),
      context.next
    );
  }
}

function registerComponentForCache (options, write) {
  // exposed by vue-loader, need to call this if cache hit because
  // component lifecycle hooks will not be called.
  var register = options._ssrRegister;
  if (write.caching && isDef(register)) {
    write.componentBuffer[write.componentBuffer.length - 1].add(register);
  }
  return register
}

function renderComponent (node, isRoot, context, renderTree) {
  var write = context.write;
  var next = context.next;
  var userContext = context.userContext;

  // check cache hit
  var Ctor = node.componentOptions.Ctor;
  var getKey = Ctor.options.serverCacheKey;
  var name = Ctor.options.name;
  var cache = context.cache;
  var registerComponent = registerComponentForCache(Ctor.options, write);

  if (isDef(getKey) && isDef(cache) && isDef(name)) {
    var rawKey = getKey(node.componentOptions.propsData);
    if (rawKey === false) {
      renderComponentInner(node, isRoot, context, renderTree);
      return
    }
    var key = name + '::' + rawKey;
    var has = context.has;
    var get = context.get;
    if (isDef(has)) {
      has(key, function (hit) {
        if (hit === true && isDef(get)) {
          get(key, function (res) {
            if (isDef(registerComponent)) {
              registerComponent(userContext);
            }
            res.components.forEach(function (register) { return register(userContext); });
            write(res.html, next);
          });
        } else {
          renderComponentWithCache(node, isRoot, key, context, renderTree);
        }
      });
    } else if (isDef(get)) {
      get(key, function (res) {
        if (isDef(res)) {
          if (isDef(registerComponent)) {
            registerComponent(userContext);
          }
          res.components.forEach(function (register) { return register(userContext); });
          write(res.html, next);
        } else {
          renderComponentWithCache(node, isRoot, key, context, renderTree);
        }
      });
    }
  } else {
    if (isDef(getKey) && isUndef(cache)) {
      warnOnce(
        "[vue-server-renderer] Component " + (Ctor.options.name || '(anonymous)') + " implemented serverCacheKey, " +
        'but no cache was provided to the renderer.'
      );
    }
    if (isDef(getKey) && isUndef(name)) {
      warnOnce(
        "[vue-server-renderer] Components that implement \"serverCacheKey\" " +
        "must also define a unique \"name\" option."
      );
    }
    renderComponentInner(node, isRoot, context, renderTree);
  }
}

function renderComponentWithCache (node, isRoot, key, context, renderTree) {
  var write = context.write;
  write.caching = true;
  var buffer = write.cacheBuffer;
  var bufferIndex = buffer.push('') - 1;
  var componentBuffer = write.componentBuffer;
  componentBuffer.push(new Set());
  context.renderStates.push({
    type: 'ComponentWithCache',
    key: key,
    buffer: buffer,
    bufferIndex: bufferIndex,
    componentBuffer: componentBuffer
  });
  renderComponentInner(node, isRoot, context, renderTree);
}

function renderComponentInner (node, isRoot, context, renderTree) {
  if (renderTree && renderTree.static === true) {
    context.userContext._styles = Object.assign(context.userContext._styles || {}, renderTree.styles);
    context.write(renderTree.render(), context.next);
    return
  }

  var prevActive = context.activeInstance;
  // expose userContext on vnode
  node.ssrContext = context.userContext;
  var child = context.activeInstance = createComponentInstanceForVnode(
    node,
    context.activeInstance
  );
  normalizeRender(child);

  if (renderTree && renderTree.render) {
    child.$options.render = renderTree.render;
    context.userContext._styles = Object.assign(context.userContext._styles || {}, renderTree.styles);
  }

  var resolve = function () {
    var childNode = child._render();
    childNode.parent = node;
    context.renderStates.push({
      type: 'Component',
      prevActive: prevActive
    });
    renderNode(childNode, isRoot, context, renderTree);
  };

  var reject = context.done;

  waitForServerPrefetch(child, resolve, reject);
}

function renderAsyncComponent (node, isRoot, context, renderTree) {
  var factory = node.asyncFactory;

  var resolve = function (comp) {
    if (comp.__esModule && comp.default) {
      comp = comp.default;
    }
    var ref = node.asyncMeta;
    var data = ref.data;
    var children = ref.children;
    var tag = ref.tag;
    var nodeContext = node.asyncMeta.context;
    var resolvedNode = createComponent(
      comp,
      data,
      nodeContext,
      children,
      tag
    );
    if (resolvedNode) {
      if (resolvedNode.componentOptions) {
        // normal component
        var _renderTree = null;
        if (renderTree && renderTree.children) {
          _renderTree = renderTree.children.shift();
        }
        renderComponent(resolvedNode, isRoot, context, _renderTree);
      } else if (!Array.isArray(resolvedNode)) {
        // single return node from functional component
        renderNode(resolvedNode, isRoot, context, renderTree);
      } else {
        // multiple return nodes from functional component
        context.renderStates.push({
          type: 'Fragment',
          children: resolvedNode,
          rendered: 0,
          total: resolvedNode.length,
          renderTree: renderTree
        });
        context.next();
      }
    } else {
      // invalid component, but this does not throw on the client
      // so render empty comment node
      context.write("<!---->", context.next);
    }
  };

  if (factory.resolved) {
    resolve(factory.resolved);
    return
  }

  var reject = context.done;
  var res;
  try {
    res = factory(resolve, reject);
  } catch (e) {
    reject(e);
  }
  if (res) {
    if (typeof res.then === 'function') {
      res.then(resolve, reject).catch(reject);
    } else {
      // new syntax in 2.3
      var comp = res.component;
      if (comp && typeof comp.then === 'function') {
        comp.then(resolve, reject).catch(reject);
      }
    }
  }
}

function renderStringNode$1 (el, context, renderTree) {
  var write = context.write;
  var next = context.next;
  if (isUndef(el.children) || el.children.length === 0) {
    write(el.open + (el.close || ''), next);
  } else {
    var children = el.children;
    context.renderStates.push({
      type: 'Element',
      children: children,
      rendered: 0,
      total: children.length,
      endTag: el.close,
      renderTree: renderTree
    });
    write(el.open, next);
  }
}

function renderElement (el, isRoot, context, renderTree) {
  var write = context.write;
  var next = context.next;

  if (isTrue(isRoot)) {
    if (!el.data) { el.data = {}; }
    if (!el.data.attrs) { el.data.attrs = {}; }
    el.data.attrs[SSR_ATTR] = 'true';
  }

  if (el.fnOptions) {
    registerComponentForCache(el.fnOptions, write);
  }

  var startTag = renderStartingTag(el, context);
  var endTag = "</" + (el.tag) + ">";
  if (context.isUnaryTag(el.tag)) {
    write(startTag, next);
  } else if (isUndef(el.children) || el.children.length === 0) {
    write(startTag + endTag, next);
  } else {
    var children = el.children;
    context.renderStates.push({
      type: 'Element',
      children: children,
      rendered: 0,
      total: children.length,
      endTag: endTag,
      renderTree: renderTree
    });
    write(startTag, next);
  }
}

function hasAncestorData (node) {
  var parentNode = node.parent;
  return isDef(parentNode) && (isDef(parentNode.data) || hasAncestorData(parentNode))
}

function getVShowDirectiveInfo (node) {
  var dir;
  var tmp;

  while (isDef(node)) {
    if (node.data && node.data.directives) {
      tmp = node.data.directives.find(function (dir) { return dir.name === 'show'; });
      if (tmp) {
        dir = tmp;
      }
    }
    node = node.parent;
  }
  return dir
}

function renderStartingTag (node, context) {
  var markup = "<" + (node.tag);
  var directives = context.directives;
  var modules = context.modules;

  // construct synthetic data for module processing
  // because modules like style also produce code by parent VNode data
  if (isUndef(node.data) && hasAncestorData(node)) {
    node.data = {};
  }
  if (isDef(node.data)) {
    // check directives
    var dirs = node.data.directives;
    if (dirs) {
      for (var i = 0; i < dirs.length; i++) {
        var name = dirs[i].name;
        if (name !== 'show') {
          var dirRenderer = resolveAsset(context, 'directives', name);
          if (dirRenderer) {
            // directives mutate the node's data
            // which then gets rendered by modules
            dirRenderer(node, dirs[i]);
          }
        }
      }
    }

    // v-show directive needs to be merged from parent to child
    var vshowDirectiveInfo = getVShowDirectiveInfo(node);
    if (vshowDirectiveInfo) {
      directives.show(node, vshowDirectiveInfo);
    }

    // apply other modules
    for (var i$1 = 0; i$1 < modules.length; i$1++) {
      var res = modules[i$1](node);
      if (res) {
        markup += res;
      }
    }
  }
  // attach scoped CSS ID
  var scopeId;
  var activeInstance = context.activeInstance;
  if (isDef(activeInstance) &&
    activeInstance !== node.context &&
    isDef(scopeId = activeInstance.$options._scopeId)
  ) {
    markup += " " + ((scopeId));
  }
  if (isDef(node.fnScopeId)) {
    markup += " " + (node.fnScopeId);
  } else {
    while (isDef(node)) {
      if (isDef(scopeId = node.context.$options._scopeId)) {
        markup += " " + scopeId;
      }
      node = node.parent;
    }
  }
  return markup + '>'
}

function createRenderFunction (
  modules,
  directives,
  isUnaryTag,
  cache
) {
  return function render (
    component,
    write,
    userContext,
    done
  ) {

    var renderTree = userContext.ssrRenderTree;
    if (renderTree && renderTree.static === true) {
      if (userContext.styles === undefined) {
        userContext.styles = renderStyles(renderTree.styles);
      } else {
        userContext._styles = Object.assign(userContext._styles || {}, renderTree.styles);
      }
      write(renderTree.render(), done);
      return
    }

    warned = Object.create(null);
    var context = new RenderContext({
      activeInstance: component,
      userContext: userContext,
      write: write, done: done, renderNode: renderNode,
      isUnaryTag: isUnaryTag, modules: modules, directives: directives,
      cache: cache
    });
    installSSRHelpers(component);
    normalizeRender(component);

    var resolve = function () {
      var render = renderTree.render;
      if (render) {
        component.$options.render = render;
      }
      renderNode(component._render(), true, context, renderTree);
    };
    waitForServerPrefetch(component, resolve, done);
  }
}

/*  */

var Transform = require('stream').Transform;



var TemplateStream = /*@__PURE__*/(function (Transform) {
  function TemplateStream (
    renderer,
    template,
    context
  ) {
    Transform.call(this);
    this.started = false;
    this.renderer = renderer;
    this.template = template;
    this.context = context || {};
    this.inject = renderer.inject;
  }

  if ( Transform ) TemplateStream.__proto__ = Transform;
  TemplateStream.prototype = Object.create( Transform && Transform.prototype );
  TemplateStream.prototype.constructor = TemplateStream;

  TemplateStream.prototype._transform = function _transform (data, encoding, done) {
    if (!this.started) {
      this.emit('beforeStart');
      this.start();
    }
    this.push(data);
    done();
  };

  TemplateStream.prototype.start = function start () {
    this.started = true;
    this.push(this.template.head(this.context));

    if (this.inject) {
      // inline server-rendered head meta information
      if (this.context.head) {
        this.push(this.context.head);
      }

      // inline preload/prefetch directives for initial/async chunks
      var links = this.renderer.renderResourceHints(this.context);
      if (links) {
        this.push(links);
      }

      // CSS files and inline server-rendered CSS collected by vue-style-loader
      var styles = this.renderer.renderStyles(this.context);
      if (styles) {
        this.push(styles);
      }
    }

    this.push(this.template.neck(this.context));
  };

  TemplateStream.prototype._flush = function _flush (done) {
    this.emit('beforeEnd');

    if (this.inject) {
      // inline initial store state
      var state = this.renderer.renderState(this.context);
      if (state) {
        this.push(state);
      }

      // embed scripts needed
      var scripts = this.renderer.renderScripts(this.context);
      if (scripts) {
        this.push(scripts);
      }
    }

    this.push(this.template.tail(this.context));
    done();
  };

  return TemplateStream;
}(Transform));

/*  */

var compile = require('lodash.template');
var compileOptions = {
  escape: /{{([^{][\s\S]+?[^}])}}/g,
  interpolate: /{{{([\s\S]+?)}}}/g
};



function parseTemplate (
  template,
  contentPlaceholder
) {
  if ( contentPlaceholder === void 0 ) contentPlaceholder = '<!--vue-ssr-outlet-->';

  if (typeof template === 'object') {
    return template
  }

  var i = template.indexOf('</head>');
  var j = template.indexOf(contentPlaceholder);

  if (j < 0) {
    throw new Error("Content placeholder not found in template.")
  }

  if (i < 0) {
    i = template.indexOf('<body>');
    if (i < 0) {
      i = j;
    }
  }

  return {
    head: compile(template.slice(0, i), compileOptions),
    neck: compile(template.slice(i, j), compileOptions),
    tail: compile(template.slice(j + contentPlaceholder.length), compileOptions)
  }
}

/*  */

/**
 * Creates a mapper that maps components used during a server-side render
 * to async chunk files in the client-side build, so that we can inline them
 * directly in the rendered HTML to avoid waterfall requests.
 */





function createMapper (
  clientManifest
) {
  var map = createMap(clientManifest);
  // map server-side moduleIds to client-side files
  return function mapper (moduleIds) {
    var res = new Set();
    for (var i = 0; i < moduleIds.length; i++) {
      var mapped = map.get(moduleIds[i]);
      if (mapped) {
        for (var j = 0; j < mapped.length; j++) {
          res.add(mapped[j]);
        }
      }
    }
    return Array.from(res)
  }
}

function createMap (clientManifest) {
  var map = new Map();
  Object.keys(clientManifest.modules).forEach(function (id) {
    map.set(id, mapIdToFile(id, clientManifest));
  });
  return map
}

function mapIdToFile (id, clientManifest) {
  var files = [];
  var fileIndices = clientManifest.modules[id];
  if (fileIndices) {
    fileIndices.forEach(function (index) {
      var file = clientManifest.all[index];
      // only include async files or non-js, non-css assets
      if (clientManifest.async.indexOf(file) > -1 || !(/\.(js|css)($|\?)/.test(file))) {
        files.push(file);
      }
    });
  }
  return files
}

/*  */

var path = require('path');
var serialize = require('serialize-javascript');









var TemplateRenderer = function TemplateRenderer (options) {
  this.options = options;
  this.inject = options.inject !== false;
  // if no template option is provided, the renderer is created
  // as a utility object for rendering assets like preload links and scripts.
    
  var template = options.template;
  this.parsedTemplate = template
    ? typeof template === 'string'
      ? parseTemplate(template)
      : template
    : null;

  // function used to serialize initial state JSON
  this.serialize = options.serializer || (function (state) {
    return serialize(state, { isJSON: true })
  });

  // extra functionality with client manifest
  if (options.clientManifest) {
    var clientManifest = this.clientManifest = options.clientManifest;
    // ensure publicPath ends with /
    this.publicPath = clientManifest.publicPath === ''
      ? ''
      : clientManifest.publicPath.replace(/([^\/])$/, '$1/');
    // preload/prefetch directives
    this.preloadFiles = (clientManifest.initial || []).map(normalizeFile);
    this.prefetchFiles = (clientManifest.async || []).map(normalizeFile);
    // initial async chunk mapping
    this.mapFiles = createMapper(clientManifest);
  }
};

TemplateRenderer.prototype.bindRenderFns = function bindRenderFns (context) {
  var renderer = this
  ;['ResourceHints', 'State', 'Scripts', 'Styles'].forEach(function (type) {
    context[("render" + type)] = renderer[("render" + type)].bind(renderer, context);
  });
  // also expose getPreloadFiles, useful for HTTP/2 push
  context.getPreloadFiles = renderer.getPreloadFiles.bind(renderer, context);
};

// render synchronously given rendered app content and render context
TemplateRenderer.prototype.render = function render (content, context) {
  var template = this.parsedTemplate;
  if (!template) {
    throw new Error('render cannot be called without a template.')
  }
  context = context || {};

  if (typeof template === 'function') {
    return template(content, context)
  }

  if (this.inject) {
    return (
      template.head(context) +
      (context.head || '') +
      this.renderResourceHints(context) +
      this.renderStyles(context) +
      template.neck(context) +
      content +
      this.renderState(context) +
      this.renderScripts(context) +
      template.tail(context)
    )
  } else {
    return (
      template.head(context) +
      template.neck(context) +
      content +
      template.tail(context)
    )
  }
};

TemplateRenderer.prototype.renderStyles = function renderStyles (context) {
    var this$1 = this;

  var initial = this.preloadFiles || [];
  var async = this.getUsedAsyncFiles(context) || [];
  var cssFiles = initial.concat(async).filter(function (ref) {
      var file = ref.file;

      return isCSS(file);
    });
  return (
    // render links for css files
    (cssFiles.length
      ? cssFiles.map(function (ref) {
          var file = ref.file;

          return ("<link rel=\"stylesheet\" href=\"" + (this$1.publicPath) + file + "\">");
    }).join('')
      : '') +
    // context.styles is a getter exposed by vue-style-loader which contains
    // the inline component styles collected during SSR
    (context.styles || '')
  )
};

TemplateRenderer.prototype.renderResourceHints = function renderResourceHints (context) {
  return this.renderPreloadLinks(context) + this.renderPrefetchLinks(context)
};

TemplateRenderer.prototype.getPreloadFiles = function getPreloadFiles (context) {
  var usedAsyncFiles = this.getUsedAsyncFiles(context);
  if (this.preloadFiles || usedAsyncFiles) {
    return (this.preloadFiles || []).concat(usedAsyncFiles || [])
  } else {
    return []
  }
};

TemplateRenderer.prototype.renderPreloadLinks = function renderPreloadLinks (context) {
    var this$1 = this;

  var files = this.getPreloadFiles(context);
  var shouldPreload = this.options.shouldPreload;
  if (files.length) {
    return files.map(function (ref) {
        var file = ref.file;
        var extension = ref.extension;
        var fileWithoutQuery = ref.fileWithoutQuery;
        var asType = ref.asType;

      var extra = '';
      // by default, we only preload scripts or css
      if (!shouldPreload && asType !== 'script' && asType !== 'style') {
        return ''
      }
      // user wants to explicitly control what to preload
      if (shouldPreload && !shouldPreload(fileWithoutQuery, asType)) {
        return ''
      }
      if (asType === 'font') {
        extra = " type=\"font/" + extension + "\" crossorigin";
      }
      return ("<link rel=\"preload\" href=\"" + (this$1.publicPath) + file + "\"" + (asType !== '' ? (" as=\"" + asType + "\"") : '') + extra + ">")
    }).join('')
  } else {
    return ''
  }
};

TemplateRenderer.prototype.renderPrefetchLinks = function renderPrefetchLinks (context) {
    var this$1 = this;

  var shouldPrefetch = this.options.shouldPrefetch;
  if (this.prefetchFiles) {
    var usedAsyncFiles = this.getUsedAsyncFiles(context);
    var alreadyRendered = function (file) {
      return usedAsyncFiles && usedAsyncFiles.some(function (f) { return f.file === file; })
    };
    return this.prefetchFiles.map(function (ref) {
        var file = ref.file;
        var fileWithoutQuery = ref.fileWithoutQuery;
        var asType = ref.asType;

      if (shouldPrefetch && !shouldPrefetch(fileWithoutQuery, asType)) {
        return ''
      }
      if (alreadyRendered(file)) {
        return ''
      }
      return ("<link rel=\"prefetch\" href=\"" + (this$1.publicPath) + file + "\">")
    }).join('')
  } else {
    return ''
  }
};

TemplateRenderer.prototype.renderState = function renderState (context, options) {
  var ref = options || {};
    var contextKey = ref.contextKey; if ( contextKey === void 0 ) contextKey = 'state';
    var windowKey = ref.windowKey; if ( windowKey === void 0 ) windowKey = '__INITIAL_STATE__';
  var state = this.serialize(context[contextKey]);
  var autoRemove =  '';
  var nonceAttr = context.nonce ? (" nonce=\"" + (context.nonce) + "\"") : '';
  return context[contextKey]
    ? ("<script" + nonceAttr + ">window." + windowKey + "=" + state + autoRemove + "</script>")
    : ''
};

TemplateRenderer.prototype.renderScripts = function renderScripts (context) {
    var this$1 = this;

  if (this.clientManifest) {
    var initial = this.preloadFiles.filter(function (ref) {
        var file = ref.file;

        return isJS(file);
      });
    var async = (this.getUsedAsyncFiles(context) || []).filter(function (ref) {
        var file = ref.file;

        return isJS(file);
      });
    var needed = [initial[0]].concat(async, initial.slice(1));
    return needed.map(function (ref) {
        var file = ref.file;

      return ("<script src=\"" + (this$1.publicPath) + file + "\" defer></script>")
    }).join('')
  } else {
    return ''
  }
};

TemplateRenderer.prototype.getUsedAsyncFiles = function getUsedAsyncFiles (context) {
  if (!context._mappedFiles && context._registeredComponents && this.mapFiles) {
    var registered = Array.from(context._registeredComponents);
    context._mappedFiles = this.mapFiles(registered).map(normalizeFile);
  }
  return context._mappedFiles
};

// create a transform stream
TemplateRenderer.prototype.createStream = function createStream (context) {
  if (!this.parsedTemplate) {
    throw new Error('createStream cannot be called without a template.')
  }
  return new TemplateStream(this, this.parsedTemplate, context || {})
};

function normalizeFile (file) {
  var withoutQuery = file.replace(/\?.*/, '');
  var extension = path.extname(withoutQuery).slice(1);
  return {
    file: file,
    extension: extension,
    fileWithoutQuery: withoutQuery,
    asType: getPreloadType(extension)
  }
}

function getPreloadType (ext) {
  if (ext === 'js') {
    return 'script'
  } else if (ext === 'css') {
    return 'style'
  } else if (/jpe?g|png|svg|gif|webp|ico/.test(ext)) {
    return 'image'
  } else if (/woff2?|ttf|otf|eot/.test(ext)) {
    return 'font'
  } else {
    // not exhausting all possibilities here, but above covers common cases
    return ''
  }
}

/*  */








function createRenderer (ref) {
  if ( ref === void 0 ) ref = {};
  var modules = ref.modules; if ( modules === void 0 ) modules = [];
  var directives = ref.directives; if ( directives === void 0 ) directives = {};
  var isUnaryTag = ref.isUnaryTag; if ( isUnaryTag === void 0 ) isUnaryTag = (function () { return false; });
  var template = ref.template;
  var inject = ref.inject;
  var cache = ref.cache;
  var shouldPreload = ref.shouldPreload;
  var shouldPrefetch = ref.shouldPrefetch;
  var clientManifest = ref.clientManifest;
  var serializer = ref.serializer;

  var render = createRenderFunction(modules, directives, isUnaryTag, cache);
  var templateRenderer = new TemplateRenderer({
    template: template,
    inject: inject,
    shouldPreload: shouldPreload,
    shouldPrefetch: shouldPrefetch,
    clientManifest: clientManifest,
    serializer: serializer
  });

  return {
    renderToString: function renderToString (
      component,
      context,
      cb
    ) {
      var assign;

      if (typeof context === 'function') {
        cb = context;
        context = {};
      }
      if (context) {
        templateRenderer.bindRenderFns(context);
      }

      // no callback, return Promise
      var promise;
      if (!cb) {
        ((assign = createPromiseCallback(), promise = assign.promise, cb = assign.cb));
      }

      var result = '';
      var write = createWriteFunction(function (text) {
        result += text;
        return false
      }, cb);
      try {
        render(component, write, context, function (err) {
          if (err) {
            return cb(err)
          }
          if (context && context.rendered) {
            context.rendered(context);
          }
          if (template) {
            try {
              var res = templateRenderer.render(result, context);
              if (typeof res !== 'string') {
                // function template returning promise
                res
                  .then(function (html) { return cb(null, html); })
                  .catch(cb);
              } else {
                cb(null, res);
              }
            } catch (e) {
              cb(e);
            }
          } else {
            cb(null, result);
          }
        });
      } catch (e) {
        cb(e);
      }

      return promise
    },

    renderToStream: function renderToStream (
      component,
      context
    ) {
      if (context) {
        templateRenderer.bindRenderFns(context);
      }
      var renderStream = new RenderStream(function (write, done) {
        render(component, write, context, done);
      });
      if (!template) {
        if (context && context.rendered) {
          var rendered = context.rendered;
          renderStream.once('beforeEnd', function () {
            rendered(context);
          });
        }
        return renderStream
      } else if (typeof template === 'function') {
        throw new Error("function template is only supported in renderToString.")
      } else {
        var templateStream = templateRenderer.createStream(context);
        renderStream.on('error', function (err) {
          templateStream.emit('error', err);
        });
        renderStream.pipe(templateStream);
        if (context && context.rendered) {
          var rendered$1 = context.rendered;
          renderStream.once('beforeEnd', function () {
            rendered$1(context);
          });
        }
        return templateStream
      }
    }
  }
}

var vm = require('vm');
var path$1 = require('path');
var resolve = require('resolve');
var NativeModule = require('module');

function createSandbox (context) {
  var sandbox = {
    Buffer: Buffer,
    console: console,
    process: process,
    setTimeout: setTimeout,
    setInterval: setInterval,
    setImmediate: setImmediate,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
    clearImmediate: clearImmediate,
    __VUE_SSR_CONTEXT__: context
  };
  sandbox.global = sandbox;
  return sandbox
}

function compileModule (files, basedir, runInNewContext) {
  var compiledScripts = {};
  var resolvedModules = {};

  function getCompiledScript (filename) {
    if (compiledScripts[filename]) {
      return compiledScripts[filename]
    }
    var code = files[filename];
    var wrapper = NativeModule.wrap(code);
    var script = new vm.Script(wrapper, {
      filename: filename,
      displayErrors: true
    });
    compiledScripts[filename] = script;
    return script
  }

  function evaluateModule (filename, sandbox, evaluatedFiles) {
    if ( evaluatedFiles === void 0 ) evaluatedFiles = {};

    if (evaluatedFiles[filename]) {
      return evaluatedFiles[filename]
    }

    var script = getCompiledScript(filename);
    var compiledWrapper = runInNewContext === false
      ? script.runInThisContext()
      : script.runInNewContext(sandbox);
    var m = { exports: {}};
    var r = function (file) {
      file = path$1.posix.join('.', file);
      if (files[file]) {
        return evaluateModule(file, sandbox, evaluatedFiles)
      } else if (basedir) {
        return require(
          resolvedModules[file] ||
          (resolvedModules[file] = resolve.sync(file, { basedir: basedir }))
        )
      } else {
        return require(file)
      }
    };
    compiledWrapper.call(m.exports, m.exports, r, m);

    var res = Object.prototype.hasOwnProperty.call(m.exports, 'default')
      ? m.exports.default
      : m.exports;
    /**
     * 如果导出了 base 基础实例，则将基础实例挂载到 res，用于日后的 diff 推导
     */
    if (m.exports.base) {
      res.base = m.exports.base;
    }
    evaluatedFiles[filename] = res;
    return res
  }
  return evaluateModule
}

function deepClone (val) {
  if (isPlainObject(val)) {
    var res = {};
    for (var key in val) {
      res[key] = deepClone(val[key]);
    }
    return res
  } else if (Array.isArray(val)) {
    return val.slice()
  } else {
    return val
  }
}

function createBundleRunner (entry, files, basedir, runInNewContext) {
  var evaluate = compileModule(files, basedir, runInNewContext);
  if (runInNewContext !== false && runInNewContext !== 'once') {
    // new context mode: creates a fresh context and re-evaluate the bundle
    // on each render. Ensures entire application state is fresh for each
    // render, but incurs extra evaluation cost.
    return function (userContext) {
      if ( userContext === void 0 ) userContext = {};

      return new Promise(function (resolve) {
      userContext._registeredComponents = new Set();
      var res = evaluate(entry, createSandbox(userContext));
      resolve(res);
    });
    }
  } else {
    // direct mode: instead of re-evaluating the whole bundle on
    // each render, it simply calls the exported function. This avoids the
    // module evaluation costs but requires the source code to be structured
    // slightly differently.
    var runner; // lazy creation so that errors can be caught by user
    var initialContext;
    return function (userContext) {
      if ( userContext === void 0 ) userContext = {};

      return new Promise(function (resolve) {
      if (!runner) {
        var sandbox = runInNewContext === 'once'
          ? createSandbox()
          : global;
        // the initial context is only used for collecting possible non-component
        // styles injected by vue-style-loader.
        initialContext = sandbox.__VUE_SSR_CONTEXT__ = {};
        runner = evaluate(entry, sandbox);
        // On subsequent renders, __VUE_SSR_CONTEXT__ will not be available
        // to prevent cross-request pollution.
        delete sandbox.__VUE_SSR_CONTEXT__;
        if (typeof runner !== 'function') {
          throw new Error(
            'bundle export should be a function when using ' +
            '{ runInNewContext: false }.'
          )
        }
      }
      userContext._registeredComponents = new Set();

      // vue-style-loader styles imported outside of component lifecycle hooks
      if (initialContext._styles) {
        userContext._styles = deepClone(initialContext._styles);
        // #6353 ensure "styles" is exposed even if no styles are injected
        // in component lifecycles.
        // the renderStyles fn is exposed by vue-style-loader >= 3.0.3
        var renderStyles = initialContext._renderStyles;
        if (renderStyles) {
          Object.defineProperty(userContext, 'styles', {
            enumerable: true,
            get: function get () {
              return renderStyles(userContext._styles)
            }
          });
        }
      }
      resolve(runner);
    });
    }
  }
}

/*  */

var SourceMapConsumer = require('source-map').SourceMapConsumer;

var filenameRE = /\(([^)]+\.js):(\d+):(\d+)\)$/;

function createSourceMapConsumers (rawMaps) {
  var maps = {};
  Object.keys(rawMaps).forEach(function (file) {
    maps[file] = new SourceMapConsumer(rawMaps[file]);
  });
  return maps
}

function rewriteErrorTrace (e, mapConsumers) {
  if (e && typeof e.stack === 'string') {
    e.stack = e.stack.split('\n').map(function (line) {
      return rewriteTraceLine(line, mapConsumers)
    }).join('\n');
  }
}

function rewriteTraceLine (trace, mapConsumers) {
  var m = trace.match(filenameRE);
  var map = m && mapConsumers[m[1]];
  if (m != null && map) {
    var originalPosition = map.originalPositionFor({
      line: Number(m[2]),
      column: Number(m[3])
    });
    if (originalPosition.source != null) {
      var source = originalPosition.source;
      var line = originalPosition.line;
      var column = originalPosition.column;
      var mappedPosition = "(" + (source.replace(/^webpack:\/\/\//, '')) + ":" + (String(line)) + ":" + (String(column)) + ")";
      return trace.replace(filenameRE, mappedPosition)
    } else {
      return trace
    }
  } else {
    return trace
  }
}

/*  */
var vm$1 = require('vm');



var PatchContext = function PatchContext (options) {
  this.userContext = options.userContext;
  this.staticActiveInstance = options.staticActiveInstance;
  this.dynamicActiveInstance = options.dynamicActiveInstance;
  this.patchStates = [];

  this.done = options.done;
  this.patchNode = options.patchNode;

  this.isUnaryTag = options.isUnaryTag;
  this.modules = options.modules;
  this.directives = options.directives;

  this.staticAst = options.staticAst;

  this.next = this.next.bind(this);

  this.ssrRenderTree = {};
};

PatchContext.prototype.next = function next () {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    var lastState = this.patchStates[this.patchStates.length - 1];
    if (isUndef(lastState)) {
      return this.done({success: true, ssrRenderTree: this.ssrRenderTree})
    }
    /* eslint-disable no-case-declarations */
    switch (lastState.type) {
      case 'Element':
      case 'Fragment':
        var staticChildren = lastState.staticChildren;
      var dynamicChildren = lastState.dynamicChildren;
      var total = lastState.total;
        var rendered = lastState.rendered++;
        if (rendered < total) {
          return this.patchNode(staticChildren[rendered], dynamicChildren[rendered], this, false)
        } else {
          this.patchStates.pop();
          if (lastState.type === 'Element') {
            this.astShaking(lastState);
            this.next();
            return
          }
        }
        break
      case 'Component':
        this.patchStates.pop();
        this.astComponentShaking(lastState);
        this.staticActiveInstance = lastState.prevStaticActive;
        this.dynamicActiveInstance = lastState.prevDynamicActive;
        break
    }
  }
};

/**
 * 合并子元素节点
 * 注意：基于抽象语法树的推导优化依赖于稳定的模板结构，如果开发者使用了自定义 render，则无法对其进行语法树级别的推导优化
 */
PatchContext.prototype.astShaking = function astShaking (patchState) {
  var endTag = patchState.endTag;
    var staticChildren = patchState.staticChildren;
    var ast = patchState.ast;

  var elements = staticChildren
    .map(function (v) { return v.ast; })
    .reduce(function (preV, curV) {
      if (curV.ssrString !== undefined && curV.ssrStatic === true) { // 静态节点
        if (typeof preV[preV.length - 1] === 'string') {
          preV[preV.length - 1] += curV.ssrString;
        } else {
          preV.push(curV.ssrString);
        }
      } else {
        preV.push(curV);
      }
      return preV
    }, []);

  /** 子节点是否全部都是静态节点 */
  var childStatic = elements.length === 0 || (elements.length === 1 && typeof elements[0] === 'string');

  /** 如果当前语法树并未匹配到组件 render 模板 则仅判断当前节点及其子节点是否全是静态 */
  if (ast.unMatchedAst) {
    if (ast.ssrString !== undefined && childStatic) {
      var str = ast.ssrString + elements[0] + endTag;
      Object.assign(ast, { ssrString: str, ssrStatic: true });
    }
    return
  }

  /**
   * 重新设置当前节点抽象语法树的子树
   * ast 不一定有 children 子元素，但是其子元素有可能全部都是静态的，例如常量for循环
   */
  var children = getVNodeAstChildren(ast);
  /** 如果存在 AST 子元素，并且子元素非静态，则构建抽象语法树 */
  if (children && !childStatic) {
    children.elements = elements.map(function (v) {
      if (typeof v === 'string') {
        return types.callExpression(
          types.memberExpression(types.identifier('_vm'), types.identifier('_ssrNode')),
          [types.stringLiteral(v)]
        )
      }
      return v
    });
  }

  /** 如果当前节点和子节点都是静态节点，则将节点合并 */
  if (ast.ssrString !== undefined && childStatic){
    var str$1 = ast.ssrString + elements[0] + endTag;
    Object.assign(ast, types.callExpression(
      types.memberExpression(types.identifier('_vm'), types.identifier('_ssrNode')),
      [types.stringLiteral(str$1)]
    ), { ssrString: str$1, ssrStatic: true });
  }

  /**
   * 优化当前节点抽象语法树的子树
   */
  this.reduceAstChildren(patchState);
};

/**
 * 合并组件级节点
 * 如果整个组件都是静态的，则将结果向上传递，如果组件是动态的，则保留渲染函数
 *   * todo astComponentShaking 里面需要考虑到 unMatchedAst 静态情况
 */
PatchContext.prototype.astComponentShaking = function astComponentShaking (patchState) {
  var prevAst = patchState.prevAst;
  var ssrRenderAst = prevAst.ssrRenderAst;

  /**
   * 当前组件无优化
   */
  if (ssrRenderAst.unMatchedAst && !ssrRenderAst.ssrStatic) {
    return this.setSSRRenderTree(prevAst)
  }

  var renderAst = null;

  /**
   * 当前组件虽未匹配 ast，但是为静态组件
   */
  if (ssrRenderAst.unMatchedAst && ssrRenderAst.ssrStatic) {
    renderAst = ssrRenderAst;
  } else {
    renderAst = getVNodeRenderAst(ssrRenderAst);
  }

  /**
   * 如果当前组件已被优化成静态组件
   * 则将当前组件的值与父组件关联
   */
  var value = getStatisAstComponentValue(renderAst);
  if (value) {
    prevAst.ssrString = value;
    prevAst.ssrStatic = true;
  }

  this.setSSRRenderTree(prevAst);
};

PatchContext.prototype.setSSRRenderTree = function setSSRRenderTree (ast) {
  var renderStr = 'function render() {}';
  if (ast.ssrStatic && ast.ssrString !== undefined) {
    renderStr = "(function() {\n        function render() {\n          return `" + (ast.ssrString) + "`\n        }\n        return render\n      })()";
  } else {
    renderStr = "(function() {\n        " + (generate$2(ast.ssrRenderAst).code) + "\n        return render\n      })()";
  }
  var renderFn = new vm$1.Script(renderStr);
  var render = renderFn.runInThisContext();

  var renderValidate = true;
  var originRender = this.staticActiveInstance.$options.render;
  this.staticActiveInstance.$options.render = render;
  try {
    ssrRender(this.staticActiveInstance);
  } catch (e) {
    renderValidate = false;
  }
  this.staticActiveInstance.$options.render = originRender;
  if (!renderValidate) {
    render = ast.render;
  }

  var componentState = this.patchStates.filter(function (v) {
    return v.type === 'Component'
  });
  var i = 0;
  var curRenderTree = this.ssrRenderTree;
  while (i < componentState.length) {
    var tree = {};
    if (!Array.isArray(curRenderTree.children)) {
      curRenderTree.children = [tree];
    } else {
      var lastChild = curRenderTree.children[curRenderTree.children.length - 1];
      if (lastChild.render) {
        curRenderTree.children.push(tree);
      } else {
        tree = lastChild;
      }
    }
    curRenderTree = tree;
    i++;
  }
  curRenderTree.render = render;
  if (ast.ssrStatic) {
    curRenderTree.static = true;
    curRenderTree.styles = ast.ssrStyles;
  }

  if (renderValidate && Array.isArray(curRenderTree.children)) {
    curRenderTree.children = curRenderTree.children.filter(function (v) {
      if (v.static && v.styles) {
        curRenderTree.styles = Object.assign(curRenderTree.styles || {}, v.styles);
      }
      return !v.static
    });
    if (curRenderTree.children.length === 0) {
      delete curRenderTree.children;
    }
  }
};

/**
 * 优化当前节点抽象语法树的子树
 * @param {*} patchState
 */
PatchContext.prototype.reduceAstChildren = function reduceAstChildren (patchState) {
  var ast = patchState.ast;
  var children = getVNodeAstChildren(ast);
  /**
   * 如果当前元素节点为 ssrNode 节点，且只有一个 ssrNode 子节点，并且子节点没有孙节点，则把子节点提升
   */
  if (
    children && children.elements.length === 1 && //只有一个子节点
    isSSRNodeAst(ast) && isSSRNodeAst(children.elements[0]) && //当前元素节点为 ssrNode 节点， 子节点为 ssrNode 节点
    children.elements[0].arguments.length === 1 // 子节点没有孙节点
  ) {
      var node = children.elements[0].arguments[0];
      var args = ast.arguments;
      ast.arguments = [
        binaryExpressionPlus(
          binaryExpressionPlus(args[0], node),
          args[1]
        )
      ];
  }
};

function unwrapExports (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var lib = createCommonjsModule(function (module, exports) {


Object.defineProperty(exports, '__esModule', { value: true });

var beforeExpr = true;
var startsExpr = true;
var isLoop = true;
var isAssign = true;
var prefix = true;
var postfix = true;
var TokenType = function TokenType(label, conf) {
  if ( conf === void 0 ) conf = {};

  this.label = label;
  this.keyword = conf.keyword;
  this.beforeExpr = !!conf.beforeExpr;
  this.startsExpr = !!conf.startsExpr;
  this.rightAssociative = !!conf.rightAssociative;
  this.isLoop = !!conf.isLoop;
  this.isAssign = !!conf.isAssign;
  this.prefix = !!conf.prefix;
  this.postfix = !!conf.postfix;
  this.binop = conf.binop != null ? conf.binop : null;
  this.updateContext = null;
};
var keywords = new Map();

function createKeyword(name, options) {
  if ( options === void 0 ) options = {};

  options.keyword = name;
  var token = new TokenType(name, options);
  keywords.set(name, token);
  return token;
}

function createBinop(name, binop) {
  return new TokenType(name, {
    beforeExpr: beforeExpr,
    binop: binop
  });
}

var types = {
  num: new TokenType("num", {
    startsExpr: startsExpr
  }),
  bigint: new TokenType("bigint", {
    startsExpr: startsExpr
  }),
  regexp: new TokenType("regexp", {
    startsExpr: startsExpr
  }),
  string: new TokenType("string", {
    startsExpr: startsExpr
  }),
  name: new TokenType("name", {
    startsExpr: startsExpr
  }),
  eof: new TokenType("eof"),
  bracketL: new TokenType("[", {
    beforeExpr: beforeExpr,
    startsExpr: startsExpr
  }),
  bracketHashL: new TokenType("#[", {
    beforeExpr: beforeExpr,
    startsExpr: startsExpr
  }),
  bracketBarL: new TokenType("[|", {
    beforeExpr: beforeExpr,
    startsExpr: startsExpr
  }),
  bracketR: new TokenType("]"),
  bracketBarR: new TokenType("|]"),
  braceL: new TokenType("{", {
    beforeExpr: beforeExpr,
    startsExpr: startsExpr
  }),
  braceBarL: new TokenType("{|", {
    beforeExpr: beforeExpr,
    startsExpr: startsExpr
  }),
  braceHashL: new TokenType("#{", {
    beforeExpr: beforeExpr,
    startsExpr: startsExpr
  }),
  braceR: new TokenType("}"),
  braceBarR: new TokenType("|}"),
  parenL: new TokenType("(", {
    beforeExpr: beforeExpr,
    startsExpr: startsExpr
  }),
  parenR: new TokenType(")"),
  comma: new TokenType(",", {
    beforeExpr: beforeExpr
  }),
  semi: new TokenType(";", {
    beforeExpr: beforeExpr
  }),
  colon: new TokenType(":", {
    beforeExpr: beforeExpr
  }),
  doubleColon: new TokenType("::", {
    beforeExpr: beforeExpr
  }),
  dot: new TokenType("."),
  question: new TokenType("?", {
    beforeExpr: beforeExpr
  }),
  questionDot: new TokenType("?."),
  arrow: new TokenType("=>", {
    beforeExpr: beforeExpr
  }),
  template: new TokenType("template"),
  ellipsis: new TokenType("...", {
    beforeExpr: beforeExpr
  }),
  backQuote: new TokenType("`", {
    startsExpr: startsExpr
  }),
  dollarBraceL: new TokenType("${", {
    beforeExpr: beforeExpr,
    startsExpr: startsExpr
  }),
  at: new TokenType("@"),
  hash: new TokenType("#", {
    startsExpr: startsExpr
  }),
  interpreterDirective: new TokenType("#!..."),
  eq: new TokenType("=", {
    beforeExpr: beforeExpr,
    isAssign: isAssign
  }),
  assign: new TokenType("_=", {
    beforeExpr: beforeExpr,
    isAssign: isAssign
  }),
  incDec: new TokenType("++/--", {
    prefix: prefix,
    postfix: postfix,
    startsExpr: startsExpr
  }),
  bang: new TokenType("!", {
    beforeExpr: beforeExpr,
    prefix: prefix,
    startsExpr: startsExpr
  }),
  tilde: new TokenType("~", {
    beforeExpr: beforeExpr,
    prefix: prefix,
    startsExpr: startsExpr
  }),
  pipeline: createBinop("|>", 0),
  nullishCoalescing: createBinop("??", 1),
  logicalOR: createBinop("||", 1),
  logicalAND: createBinop("&&", 2),
  bitwiseOR: createBinop("|", 3),
  bitwiseXOR: createBinop("^", 4),
  bitwiseAND: createBinop("&", 5),
  equality: createBinop("==/!=/===/!==", 6),
  relational: createBinop("</>/<=/>=", 7),
  bitShift: createBinop("<</>>/>>>", 8),
  plusMin: new TokenType("+/-", {
    beforeExpr: beforeExpr,
    binop: 9,
    prefix: prefix,
    startsExpr: startsExpr
  }),
  modulo: new TokenType("%", {
    beforeExpr: beforeExpr,
    binop: 10,
    startsExpr: startsExpr
  }),
  star: createBinop("*", 10),
  slash: createBinop("/", 10),
  exponent: new TokenType("**", {
    beforeExpr: beforeExpr,
    binop: 11,
    rightAssociative: true
  }),
  _break: createKeyword("break"),
  _case: createKeyword("case", {
    beforeExpr: beforeExpr
  }),
  _catch: createKeyword("catch"),
  _continue: createKeyword("continue"),
  _debugger: createKeyword("debugger"),
  _default: createKeyword("default", {
    beforeExpr: beforeExpr
  }),
  _do: createKeyword("do", {
    isLoop: isLoop,
    beforeExpr: beforeExpr
  }),
  _else: createKeyword("else", {
    beforeExpr: beforeExpr
  }),
  _finally: createKeyword("finally"),
  _for: createKeyword("for", {
    isLoop: isLoop
  }),
  _function: createKeyword("function", {
    startsExpr: startsExpr
  }),
  _if: createKeyword("if"),
  _return: createKeyword("return", {
    beforeExpr: beforeExpr
  }),
  _switch: createKeyword("switch"),
  _throw: createKeyword("throw", {
    beforeExpr: beforeExpr,
    prefix: prefix,
    startsExpr: startsExpr
  }),
  _try: createKeyword("try"),
  _var: createKeyword("var"),
  _const: createKeyword("const"),
  _while: createKeyword("while", {
    isLoop: isLoop
  }),
  _with: createKeyword("with"),
  _new: createKeyword("new", {
    beforeExpr: beforeExpr,
    startsExpr: startsExpr
  }),
  _this: createKeyword("this", {
    startsExpr: startsExpr
  }),
  _super: createKeyword("super", {
    startsExpr: startsExpr
  }),
  _class: createKeyword("class", {
    startsExpr: startsExpr
  }),
  _extends: createKeyword("extends", {
    beforeExpr: beforeExpr
  }),
  _export: createKeyword("export"),
  _import: createKeyword("import", {
    startsExpr: startsExpr
  }),
  _null: createKeyword("null", {
    startsExpr: startsExpr
  }),
  _true: createKeyword("true", {
    startsExpr: startsExpr
  }),
  _false: createKeyword("false", {
    startsExpr: startsExpr
  }),
  _in: createKeyword("in", {
    beforeExpr: beforeExpr,
    binop: 7
  }),
  _instanceof: createKeyword("instanceof", {
    beforeExpr: beforeExpr,
    binop: 7
  }),
  _typeof: createKeyword("typeof", {
    beforeExpr: beforeExpr,
    prefix: prefix,
    startsExpr: startsExpr
  }),
  _void: createKeyword("void", {
    beforeExpr: beforeExpr,
    prefix: prefix,
    startsExpr: startsExpr
  }),
  _delete: createKeyword("delete", {
    beforeExpr: beforeExpr,
    prefix: prefix,
    startsExpr: startsExpr
  })
};

var SCOPE_OTHER = 0,
      SCOPE_PROGRAM = 1,
      SCOPE_FUNCTION = 2,
      SCOPE_ARROW = 4,
      SCOPE_SIMPLE_CATCH = 8,
      SCOPE_SUPER = 16,
      SCOPE_DIRECT_SUPER = 32,
      SCOPE_CLASS = 64,
      SCOPE_TS_MODULE = 128,
      SCOPE_VAR = SCOPE_PROGRAM | SCOPE_FUNCTION | SCOPE_TS_MODULE;
var BIND_KIND_VALUE = 1,
      BIND_KIND_TYPE = 2,
      BIND_SCOPE_VAR = 4,
      BIND_SCOPE_LEXICAL = 8,
      BIND_SCOPE_FUNCTION = 16,
      BIND_FLAGS_NONE = 64,
      BIND_FLAGS_CLASS = 128,
      BIND_FLAGS_TS_ENUM = 256,
      BIND_FLAGS_TS_CONST_ENUM = 512,
      BIND_FLAGS_TS_EXPORT_ONLY = 1024;
var BIND_CLASS = BIND_KIND_VALUE | BIND_KIND_TYPE | BIND_SCOPE_LEXICAL | BIND_FLAGS_CLASS,
      BIND_LEXICAL = BIND_KIND_VALUE | 0 | BIND_SCOPE_LEXICAL | 0,
      BIND_VAR = BIND_KIND_VALUE | 0 | BIND_SCOPE_VAR | 0,
      BIND_FUNCTION = BIND_KIND_VALUE | 0 | BIND_SCOPE_FUNCTION | 0,
      BIND_TS_INTERFACE = 0 | BIND_KIND_TYPE | 0 | BIND_FLAGS_CLASS,
      BIND_TS_TYPE = 0 | BIND_KIND_TYPE | 0 | 0,
      BIND_TS_ENUM = BIND_KIND_VALUE | BIND_KIND_TYPE | BIND_SCOPE_LEXICAL | BIND_FLAGS_TS_ENUM,
      BIND_TS_AMBIENT = 0 | 0 | 0 | BIND_FLAGS_TS_EXPORT_ONLY,
      BIND_NONE = 0 | 0 | 0 | BIND_FLAGS_NONE,
      BIND_OUTSIDE = BIND_KIND_VALUE | 0 | 0 | BIND_FLAGS_NONE,
      BIND_TS_CONST_ENUM = BIND_TS_ENUM | BIND_FLAGS_TS_CONST_ENUM,
      BIND_TS_NAMESPACE = 0 | 0 | 0 | BIND_FLAGS_TS_EXPORT_ONLY;
var CLASS_ELEMENT_FLAG_STATIC = 4,
      CLASS_ELEMENT_KIND_GETTER = 2,
      CLASS_ELEMENT_KIND_SETTER = 1,
      CLASS_ELEMENT_KIND_ACCESSOR = CLASS_ELEMENT_KIND_GETTER | CLASS_ELEMENT_KIND_SETTER;
var CLASS_ELEMENT_STATIC_GETTER = CLASS_ELEMENT_KIND_GETTER | CLASS_ELEMENT_FLAG_STATIC,
      CLASS_ELEMENT_STATIC_SETTER = CLASS_ELEMENT_KIND_SETTER | CLASS_ELEMENT_FLAG_STATIC,
      CLASS_ELEMENT_INSTANCE_GETTER = CLASS_ELEMENT_KIND_GETTER,
      CLASS_ELEMENT_INSTANCE_SETTER = CLASS_ELEMENT_KIND_SETTER,
      CLASS_ELEMENT_OTHER = 0;

var lineBreak = /\r\n?|[\n\u2028\u2029]/;
var lineBreakG = new RegExp(lineBreak.source, "g");
function isNewLine(code) {
  switch (code) {
    case 10:
    case 13:
    case 8232:
    case 8233:
      return true;

    default:
      return false;
  }
}
var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;
function isWhitespace(code) {
  switch (code) {
    case 0x0009:
    case 0x000b:
    case 0x000c:
    case 32:
    case 160:
    case 5760:
    case 0x2000:
    case 0x2001:
    case 0x2002:
    case 0x2003:
    case 0x2004:
    case 0x2005:
    case 0x2006:
    case 0x2007:
    case 0x2008:
    case 0x2009:
    case 0x200a:
    case 0x202f:
    case 0x205f:
    case 0x3000:
    case 0xfeff:
      return true;

    default:
      return false;
  }
}

var Position = function Position(line, col) {
  this.line = line;
  this.column = col;
};
var SourceLocation = function SourceLocation(start, end) {
  this.start = start;
  this.end = end;
};
function getLineInfo(input, offset) {
  var line = 1;
  var lineStart = 0;
  var match;
  lineBreakG.lastIndex = 0;

  while ((match = lineBreakG.exec(input)) && match.index < offset) {
    line++;
    lineStart = lineBreakG.lastIndex;
  }

  return new Position(line, offset - lineStart);
}

var BaseParser = function BaseParser() {
  this.sawUnambiguousESM = false;
  this.ambiguousScriptDifferentAst = false;
};

BaseParser.prototype.hasPlugin = function hasPlugin (name) {
  return this.plugins.has(name);
};

BaseParser.prototype.getPluginOption = function getPluginOption (plugin, name) {
  if (this.hasPlugin(plugin)) { return this.plugins.get(plugin)[name]; }
};

function last(stack) {
  return stack[stack.length - 1];
}

var CommentsParser = /*@__PURE__*/(function (BaseParser) {
  function CommentsParser () {
    BaseParser.apply(this, arguments);
  }

  if ( BaseParser ) CommentsParser.__proto__ = BaseParser;
  CommentsParser.prototype = Object.create( BaseParser && BaseParser.prototype );
  CommentsParser.prototype.constructor = CommentsParser;

  CommentsParser.prototype.addComment = function addComment (comment) {
    if (this.filename) { comment.loc.filename = this.filename; }
    this.state.trailingComments.push(comment);
    this.state.leadingComments.push(comment);
  };

  CommentsParser.prototype.adjustCommentsAfterTrailingComma = function adjustCommentsAfterTrailingComma (node, elements, takeAllComments) {
    if (this.state.leadingComments.length === 0) {
      return;
    }

    var lastElement = null;
    var i = elements.length;

    while (lastElement === null && i > 0) {
      lastElement = elements[--i];
    }

    if (lastElement === null) {
      return;
    }

    for (var j = 0; j < this.state.leadingComments.length; j++) {
      if (this.state.leadingComments[j].end < this.state.commentPreviousNode.end) {
        this.state.leadingComments.splice(j, 1);
        j--;
      }
    }

    var newTrailingComments = [];

    for (var i$1 = 0; i$1 < this.state.leadingComments.length; i$1++) {
      var leadingComment = this.state.leadingComments[i$1];

      if (leadingComment.end < node.end) {
        newTrailingComments.push(leadingComment);

        if (!takeAllComments) {
          this.state.leadingComments.splice(i$1, 1);
          i$1--;
        }
      } else {
        if (node.trailingComments === undefined) {
          node.trailingComments = [];
        }

        node.trailingComments.push(leadingComment);
      }
    }

    if (takeAllComments) { this.state.leadingComments = []; }

    if (newTrailingComments.length > 0) {
      lastElement.trailingComments = newTrailingComments;
    } else if (lastElement.trailingComments !== undefined) {
      lastElement.trailingComments = [];
    }
  };

  CommentsParser.prototype.processComment = function processComment (node) {
    if (node.type === "Program" && node.body.length > 0) { return; }
    var stack = this.state.commentStack;
    var firstChild, lastChild, trailingComments, i, j;

    if (this.state.trailingComments.length > 0) {
      if (this.state.trailingComments[0].start >= node.end) {
        trailingComments = this.state.trailingComments;
        this.state.trailingComments = [];
      } else {
        this.state.trailingComments.length = 0;
      }
    } else if (stack.length > 0) {
      var lastInStack = last(stack);

      if (lastInStack.trailingComments && lastInStack.trailingComments[0].start >= node.end) {
        trailingComments = lastInStack.trailingComments;
        delete lastInStack.trailingComments;
      }
    }

    if (stack.length > 0 && last(stack).start >= node.start) {
      firstChild = stack.pop();
    }

    while (stack.length > 0 && last(stack).start >= node.start) {
      lastChild = stack.pop();
    }

    if (!lastChild && firstChild) { lastChild = firstChild; }

    if (firstChild) {
      switch (node.type) {
        case "ObjectExpression":
          this.adjustCommentsAfterTrailingComma(node, node.properties);
          break;

        case "ObjectPattern":
          this.adjustCommentsAfterTrailingComma(node, node.properties, true);
          break;

        case "CallExpression":
          this.adjustCommentsAfterTrailingComma(node, node.arguments);
          break;

        case "ArrayExpression":
          this.adjustCommentsAfterTrailingComma(node, node.elements);
          break;

        case "ArrayPattern":
          this.adjustCommentsAfterTrailingComma(node, node.elements, true);
          break;
      }
    } else if (this.state.commentPreviousNode && (this.state.commentPreviousNode.type === "ImportSpecifier" && node.type !== "ImportSpecifier" || this.state.commentPreviousNode.type === "ExportSpecifier" && node.type !== "ExportSpecifier")) {
      this.adjustCommentsAfterTrailingComma(node, [this.state.commentPreviousNode]);
    }

    if (lastChild) {
      if (lastChild.leadingComments) {
        if (lastChild !== node && lastChild.leadingComments.length > 0 && last(lastChild.leadingComments).end <= node.start) {
          node.leadingComments = lastChild.leadingComments;
          delete lastChild.leadingComments;
        } else {
          for (i = lastChild.leadingComments.length - 2; i >= 0; --i) {
            if (lastChild.leadingComments[i].end <= node.start) {
              node.leadingComments = lastChild.leadingComments.splice(0, i + 1);
              break;
            }
          }
        }
      }
    } else if (this.state.leadingComments.length > 0) {
      if (last(this.state.leadingComments).end <= node.start) {
        if (this.state.commentPreviousNode) {
          for (j = 0; j < this.state.leadingComments.length; j++) {
            if (this.state.leadingComments[j].end < this.state.commentPreviousNode.end) {
              this.state.leadingComments.splice(j, 1);
              j--;
            }
          }
        }

        if (this.state.leadingComments.length > 0) {
          node.leadingComments = this.state.leadingComments;
          this.state.leadingComments = [];
        }
      } else {
        for (i = 0; i < this.state.leadingComments.length; i++) {
          if (this.state.leadingComments[i].end > node.start) {
            break;
          }
        }

        var leadingComments = this.state.leadingComments.slice(0, i);

        if (leadingComments.length) {
          node.leadingComments = leadingComments;
        }

        trailingComments = this.state.leadingComments.slice(i);

        if (trailingComments.length === 0) {
          trailingComments = null;
        }
      }
    }

    this.state.commentPreviousNode = node;

    if (trailingComments) {
      if (trailingComments.length && trailingComments[0].start >= node.start && last(trailingComments).end <= node.end) {
        node.innerComments = trailingComments;
      } else {
        node.trailingComments = trailingComments;
      }
    }

    stack.push(node);
  };

  return CommentsParser;
}(BaseParser));

var Errors = Object.freeze({
  ArgumentsDisallowedInInitializer: "'arguments' is not allowed in class field initializer",
  AsyncFunctionInSingleStatementContext: "Async functions can only be declared at the top level or inside a block",
  AwaitBindingIdentifier: "Can not use 'await' as identifier inside an async function",
  AwaitExpressionFormalParameter: "await is not allowed in async function parameters",
  AwaitNotInAsyncFunction: "Can not use keyword 'await' outside an async function",
  BadGetterArity: "getter must not have any formal parameters",
  BadSetterArity: "setter must have exactly one formal parameter",
  BadSetterRestParameter: "setter function argument must not be a rest parameter",
  ConstructorClassField: "Classes may not have a field named 'constructor'",
  ConstructorClassPrivateField: "Classes may not have a private field named '#constructor'",
  ConstructorIsAccessor: "Class constructor may not be an accessor",
  ConstructorIsAsync: "Constructor can't be an async function",
  ConstructorIsGenerator: "Constructor can't be a generator",
  DeclarationMissingInitializer: "%0 require an initialization value",
  DecoratorBeforeExport: "Decorators must be placed *before* the 'export' keyword. You can set the 'decoratorsBeforeExport' option to false to use the 'export @decorator class {}' syntax",
  DecoratorConstructor: "Decorators can't be used with a constructor. Did you mean '@dec class { ... }'?",
  DecoratorExportClass: "Using the export keyword between a decorator and a class is not allowed. Please use `export @dec class` instead.",
  DecoratorSemicolon: "Decorators must not be followed by a semicolon",
  DeletePrivateField: "Deleting a private field is not allowed",
  DestructureNamedImport: "ES2015 named imports do not destructure. Use another statement for destructuring after the import.",
  DuplicateConstructor: "Duplicate constructor in the same class",
  DuplicateDefaultExport: "Only one default export allowed per module.",
  DuplicateExport: "`%0` has already been exported. Exported identifiers must be unique.",
  DuplicateProto: "Redefinition of __proto__ property",
  DuplicateRegExpFlags: "Duplicate regular expression flag",
  ElementAfterRest: "Rest element must be last element",
  EscapedCharNotAnIdentifier: "Invalid Unicode escape",
  ForInOfLoopInitializer: "%0 loop variable declaration may not have an initializer",
  GeneratorInSingleStatementContext: "Generators can only be declared at the top level or inside a block",
  IllegalBreakContinue: "Unsyntactic %0",
  IllegalLanguageModeDirective: "Illegal 'use strict' directive in function with non-simple parameter list",
  IllegalReturn: "'return' outside of function",
  ImportCallArgumentTrailingComma: "Trailing comma is disallowed inside import(...) arguments",
  ImportCallArity: "import() requires exactly one argument",
  ImportCallArityLtOne: "Dynamic imports require a parameter: import('a.js')",
  ImportCallNotNewExpression: "Cannot use new with import(...)",
  ImportCallSpreadArgument: "... is not allowed in import()",
  ImportMetaOutsideModule: "import.meta may appear only with 'sourceType: \"module\"'",
  ImportOutsideModule: "'import' and 'export' may appear only with 'sourceType: \"module\"'",
  InvalidCodePoint: "Code point out of bounds",
  InvalidDigit: "Expected number in radix %0",
  InvalidEscapeSequence: "Bad character escape sequence",
  InvalidEscapeSequenceTemplate: "Invalid escape sequence in template",
  InvalidEscapedReservedWord: "Escape sequence in keyword %0",
  InvalidIdentifier: "Invalid identifier %0",
  InvalidLhs: "Invalid left-hand side in %0",
  InvalidLhsBinding: "Binding invalid left-hand side in %0",
  InvalidNumber: "Invalid number",
  InvalidOrUnexpectedToken: "Unexpected character '%0'",
  InvalidParenthesizedAssignment: "Invalid parenthesized assignment pattern",
  InvalidPrivateFieldResolution: "Private name #%0 is not defined",
  InvalidPropertyBindingPattern: "Binding member expression",
  InvalidRestAssignmentPattern: "Invalid rest operator's argument",
  LabelRedeclaration: "Label '%0' is already declared",
  LetInLexicalBinding: "'let' is not allowed to be used as a name in 'let' or 'const' declarations.",
  MalformedRegExpFlags: "Invalid regular expression flag",
  MissingClassName: "A class name is required",
  MissingEqInAssignment: "Only '=' operator can be used for specifying default value.",
  MissingUnicodeEscape: "Expecting Unicode escape sequence \\uXXXX",
  MixingCoalesceWithLogical: "Nullish coalescing operator(??) requires parens when mixing with logical operators",
  ModuleExportUndefined: "Export '%0' is not defined",
  MultipleDefaultsInSwitch: "Multiple default clauses",
  NewlineAfterThrow: "Illegal newline after throw",
  NoCatchOrFinally: "Missing catch or finally clause",
  NumberIdentifier: "Identifier directly after number",
  NumericSeparatorInEscapeSequence: "Numeric separators are not allowed inside unicode escape sequences or hex escape sequences",
  ObsoleteAwaitStar: "await* has been removed from the async functions proposal. Use Promise.all() instead.",
  OptionalChainingNoNew: "constructors in/after an Optional Chain are not allowed",
  OptionalChainingNoTemplate: "Tagged Template Literals are not allowed in optionalChain",
  ParamDupe: "Argument name clash",
  PatternHasAccessor: "Object pattern can't contain getter or setter",
  PatternHasMethod: "Object pattern can't contain methods",
  PipelineBodyNoArrow: 'Unexpected arrow "=>" after pipeline body; arrow function in pipeline body must be parenthesized',
  PipelineBodySequenceExpression: "Pipeline body may not be a comma-separated sequence expression",
  PipelineHeadSequenceExpression: "Pipeline head should not be a comma-separated sequence expression",
  PipelineTopicUnused: "Pipeline is in topic style but does not use topic reference",
  PrimaryTopicNotAllowed: "Topic reference was used in a lexical context without topic binding",
  PrimaryTopicRequiresSmartPipeline: "Primary Topic Reference found but pipelineOperator not passed 'smart' for 'proposal' option.",
  PrivateNameRedeclaration: "Duplicate private name #%0",
  RecordExpressionBarIncorrectEndSyntaxType: "Record expressions ending with '|}' are only allowed when the 'syntaxType' option of the 'recordAndTuple' plugin is set to 'bar'",
  RecordExpressionBarIncorrectStartSyntaxType: "Record expressions starting with '{|' are only allowed when the 'syntaxType' option of the 'recordAndTuple' plugin is set to 'bar'",
  RecordExpressionHashIncorrectStartSyntaxType: "Record expressions starting with '#{' are only allowed when the 'syntaxType' option of the 'recordAndTuple' plugin is set to 'hash'",
  RestTrailingComma: "Unexpected trailing comma after rest element",
  SloppyFunction: "In non-strict mode code, functions can only be declared at top level, inside a block, or as the body of an if statement",
  StaticPrototype: "Classes may not have static property named prototype",
  StrictDelete: "Deleting local variable in strict mode",
  StrictEvalArguments: "Assigning to '%0' in strict mode",
  StrictEvalArgumentsBinding: "Binding '%0' in strict mode",
  StrictFunction: "In strict mode code, functions can only be declared at top level or inside a block",
  StrictOctalLiteral: "Legacy octal literals are not allowed in strict mode",
  StrictWith: "'with' in strict mode",
  SuperNotAllowed: "super() is only valid inside a class constructor of a subclass. Maybe a typo in the method name ('constructor') or not extending another class?",
  SuperPrivateField: "Private fields can't be accessed on super",
  TrailingDecorator: "Decorators must be attached to a class element",
  TupleExpressionBarIncorrectEndSyntaxType: "Tuple expressions ending with '|]' are only allowed when the 'syntaxType' option of the 'recordAndTuple' plugin is set to 'bar'",
  TupleExpressionBarIncorrectStartSyntaxType: "Tuple expressions starting with '[|' are only allowed when the 'syntaxType' option of the 'recordAndTuple' plugin is set to 'bar'",
  TupleExpressionHashIncorrectStartSyntaxType: "Tuple expressions starting with '#[' are only allowed when the 'syntaxType' option of the 'recordAndTuple' plugin is set to 'hash'",
  UnexpectedArgumentPlaceholder: "Unexpected argument placeholder",
  UnexpectedAwaitAfterPipelineBody: 'Unexpected "await" after pipeline body; await must have parentheses in minimal proposal',
  UnexpectedDigitAfterHash: "Unexpected digit after hash token",
  UnexpectedImportExport: "'import' and 'export' may only appear at the top level",
  UnexpectedKeyword: "Unexpected keyword '%0'",
  UnexpectedLeadingDecorator: "Leading decorators must be attached to a class declaration",
  UnexpectedLexicalDeclaration: "Lexical declaration cannot appear in a single-statement context",
  UnexpectedNewTarget: "new.target can only be used in functions",
  UnexpectedNumericSeparator: "A numeric separator is only allowed between two digits",
  UnexpectedPrivateField: "Private names can only be used as the name of a class element (i.e. class C { #p = 42; #m() {} } )\n or a property of member expression (i.e. this.#p).",
  UnexpectedReservedWord: "Unexpected reserved word '%0'",
  UnexpectedSuper: "super is only allowed in object methods and classes",
  UnexpectedToken: "Unexpected token '%'",
  UnexpectedTokenUnaryExponentiation: "Illegal expression. Wrap left hand side or entire exponentiation in parentheses.",
  UnsupportedBind: "Binding should be performed on object property.",
  UnsupportedDecoratorExport: "A decorated export must export a class declaration",
  UnsupportedDefaultExport: "Only expressions, functions or classes are allowed as the `default` export.",
  UnsupportedImport: "import can only be used in import() or import.meta",
  UnsupportedMetaProperty: "The only valid meta property for %0 is %0.%1",
  UnsupportedParameterDecorator: "Decorators cannot be used to decorate parameters",
  UnsupportedPropertyDecorator: "Decorators cannot be used to decorate object literal properties",
  UnsupportedSuper: "super can only be used with function calls (i.e. super()) or in property accesses (i.e. super.prop or super[prop])",
  UnterminatedComment: "Unterminated comment",
  UnterminatedRegExp: "Unterminated regular expression",
  UnterminatedString: "Unterminated string constant",
  UnterminatedTemplate: "Unterminated template",
  VarRedeclaration: "Identifier '%0' has already been declared",
  YieldBindingIdentifier: "Can not use 'yield' as identifier inside a generator",
  YieldInParameter: "yield is not allowed in generator parameters",
  ZeroDigitNumericSeparator: "Numeric separator can not be used after leading 0"
});
var LocationParser = /*@__PURE__*/(function (CommentsParser) {
  function LocationParser () {
    CommentsParser.apply(this, arguments);
  }

  if ( CommentsParser ) LocationParser.__proto__ = CommentsParser;
  LocationParser.prototype = Object.create( CommentsParser && CommentsParser.prototype );
  LocationParser.prototype.constructor = LocationParser;

  LocationParser.prototype.getLocationForPosition = function getLocationForPosition (pos) {
    var loc;
    if (pos === this.state.start) { loc = this.state.startLoc; }else if (pos === this.state.lastTokStart) { loc = this.state.lastTokStartLoc; }else if (pos === this.state.end) { loc = this.state.endLoc; }else if (pos === this.state.lastTokEnd) { loc = this.state.lastTokEndLoc; }else { loc = getLineInfo(this.input, pos); }
    return loc;
  };

  LocationParser.prototype.raise = function raise (pos, errorTemplate) {
    var ref;

    var params = [], len = arguments.length - 2;
    while ( len-- > 0 ) params[ len ] = arguments[ len + 2 ];
    return (ref = this).raiseWithData.apply(ref, [ pos, undefined, errorTemplate ].concat( params ));
  };

  LocationParser.prototype.raiseWithData = function raiseWithData (pos, data, errorTemplate) {
    var params = [], len = arguments.length - 3;
    while ( len-- > 0 ) params[ len ] = arguments[ len + 3 ];

    var loc = this.getLocationForPosition(pos);
    var message = errorTemplate.replace(/%(\d+)/g, function (_, i) { return params[i]; }) + " (" + (loc.line) + ":" + (loc.column) + ")";
    return this._raise(Object.assign({
      loc: loc,
      pos: pos
    }, data), message);
  };

  LocationParser.prototype._raise = function _raise (errorContext, message) {
    var err = new SyntaxError(message);
    Object.assign(err, errorContext);

    if (this.options.errorRecovery) {
      if (!this.isLookahead) { this.state.errors.push(err); }
      return err;
    } else {
      throw err;
    }
  };

  return LocationParser;
}(CommentsParser));

function isSimpleProperty(node) {
  return node != null && node.type === "Property" && node.kind === "init" && node.method === false;
}

var estree = (function (superClass) { return /*@__PURE__*/(function (superClass) {
    function anonymous () {
      superClass.apply(this, arguments);
    }

    if ( superClass ) anonymous.__proto__ = superClass;
    anonymous.prototype = Object.create( superClass && superClass.prototype );
    anonymous.prototype.constructor = anonymous;

    anonymous.prototype.estreeParseRegExpLiteral = function estreeParseRegExpLiteral (ref) {
    var pattern = ref.pattern;
    var flags = ref.flags;

    var regex = null;

    try {
      regex = new RegExp(pattern, flags);
    } catch (e) {}

    var node = this.estreeParseLiteral(regex);
    node.regex = {
      pattern: pattern,
      flags: flags
    };
    return node;
  };

  anonymous.prototype.estreeParseBigIntLiteral = function estreeParseBigIntLiteral (value) {
    var bigInt = typeof BigInt !== "undefined" ? BigInt(value) : null;
    var node = this.estreeParseLiteral(bigInt);
    node.bigint = String(node.value || value);
    return node;
  };

  anonymous.prototype.estreeParseLiteral = function estreeParseLiteral (value) {
    return this.parseLiteral(value, "Literal");
  };

  anonymous.prototype.directiveToStmt = function directiveToStmt (directive) {
    var directiveLiteral = directive.value;
    var stmt = this.startNodeAt(directive.start, directive.loc.start);
    var expression = this.startNodeAt(directiveLiteral.start, directiveLiteral.loc.start);
    expression.value = directiveLiteral.value;
    expression.raw = directiveLiteral.extra.raw;
    stmt.expression = this.finishNodeAt(expression, "Literal", directiveLiteral.end, directiveLiteral.loc.end);
    stmt.directive = directiveLiteral.extra.raw.slice(1, -1);
    return this.finishNodeAt(stmt, "ExpressionStatement", directive.end, directive.loc.end);
  };

  anonymous.prototype.initFunction = function initFunction (node, isAsync) {
    superClass.prototype.initFunction.call(this, node, isAsync);
    node.expression = false;
  };

  anonymous.prototype.checkDeclaration = function checkDeclaration (node) {
    if (isSimpleProperty(node)) {
      this.checkDeclaration(node.value);
    } else {
      superClass.prototype.checkDeclaration.call(this, node);
    }
  };

  anonymous.prototype.checkGetterSetterParams = function checkGetterSetterParams (method) {
    var prop = method;
    var paramCount = prop.kind === "get" ? 0 : 1;
    var start = prop.start;

    if (prop.value.params.length !== paramCount) {
      if (method.kind === "get") {
        this.raise(start, Errors.BadGetterArity);
      } else {
        this.raise(start, Errors.BadSetterArity);
      }
    } else if (prop.kind === "set" && prop.value.params[0].type === "RestElement") {
      this.raise(start, Errors.BadSetterRestParameter);
    }
  };

  anonymous.prototype.checkLVal = function checkLVal (expr, bindingType, checkClashes, contextDescription, disallowLetBinding) {
    var this$1 = this;
    if ( bindingType === void 0 ) bindingType = BIND_NONE;

    switch (expr.type) {
      case "ObjectPattern":
        expr.properties.forEach(function (prop) {
          this$1.checkLVal(prop.type === "Property" ? prop.value : prop, bindingType, checkClashes, "object destructuring pattern", disallowLetBinding);
        });
        break;

      default:
        superClass.prototype.checkLVal.call(this, expr, bindingType, checkClashes, contextDescription, disallowLetBinding);
    }
  };

  anonymous.prototype.checkDuplicatedProto = function checkDuplicatedProto (prop, protoRef, refExpressionErrors) {
    if (prop.type === "SpreadElement" || prop.computed || prop.method || prop.shorthand) {
      return;
    }

    var key = prop.key;
    var name = key.type === "Identifier" ? key.name : String(key.value);

    if (name === "__proto__" && prop.kind === "init") {
      if (protoRef.used) {
        if (refExpressionErrors && refExpressionErrors.doubleProto === -1) {
          refExpressionErrors.doubleProto = key.start;
        } else {
          this.raise(key.start, Errors.DuplicateProto);
        }
      }

      protoRef.used = true;
    }
  };

  anonymous.prototype.isValidDirective = function isValidDirective (stmt) {
    return stmt.type === "ExpressionStatement" && stmt.expression.type === "Literal" && typeof stmt.expression.value === "string" && (!stmt.expression.extra || !stmt.expression.extra.parenthesized);
  };

  anonymous.prototype.stmtToDirective = function stmtToDirective (stmt) {
    var directive = superClass.prototype.stmtToDirective.call(this, stmt);
    var value = stmt.expression.value;
    directive.value.value = value;
    return directive;
  };

  anonymous.prototype.parseBlockBody = function parseBlockBody (node, allowDirectives, topLevel, end) {
    var this$1 = this;

    superClass.prototype.parseBlockBody.call(this, node, allowDirectives, topLevel, end);
    var directiveStatements = node.directives.map(function (d) { return this$1.directiveToStmt(d); });
    node.body = directiveStatements.concat(node.body);
    delete node.directives;
  };

  anonymous.prototype.pushClassMethod = function pushClassMethod (classBody, method, isGenerator, isAsync, isConstructor, allowsDirectSuper) {
    this.parseMethod(method, isGenerator, isAsync, isConstructor, allowsDirectSuper, "ClassMethod", true);

    if (method.typeParameters) {
      method.value.typeParameters = method.typeParameters;
      delete method.typeParameters;
    }

    classBody.body.push(method);
  };

  anonymous.prototype.parseExprAtom = function parseExprAtom (refExpressionErrors) {
    switch (this.state.type) {
      case types.num:
      case types.string:
        return this.estreeParseLiteral(this.state.value);

      case types.regexp:
        return this.estreeParseRegExpLiteral(this.state.value);

      case types.bigint:
        return this.estreeParseBigIntLiteral(this.state.value);

      case types._null:
        return this.estreeParseLiteral(null);

      case types._true:
        return this.estreeParseLiteral(true);

      case types._false:
        return this.estreeParseLiteral(false);

      default:
        return superClass.prototype.parseExprAtom.call(this, refExpressionErrors);
    }
  };

  anonymous.prototype.parseLiteral = function parseLiteral (value, type, startPos, startLoc) {
    var node = superClass.prototype.parseLiteral.call(this, value, type, startPos, startLoc);
    node.raw = node.extra.raw;
    delete node.extra;
    return node;
  };

  anonymous.prototype.parseFunctionBody = function parseFunctionBody (node, allowExpression, isMethod) {
    if ( isMethod === void 0 ) isMethod = false;

    superClass.prototype.parseFunctionBody.call(this, node, allowExpression, isMethod);
    node.expression = node.body.type !== "BlockStatement";
  };

  anonymous.prototype.parseMethod = function parseMethod (node, isGenerator, isAsync, isConstructor, allowDirectSuper, type, inClassScope) {
    if ( inClassScope === void 0 ) inClassScope = false;

    var funcNode = this.startNode();
    funcNode.kind = node.kind;
    funcNode = superClass.prototype.parseMethod.call(this, funcNode, isGenerator, isAsync, isConstructor, allowDirectSuper, type, inClassScope);
    funcNode.type = "FunctionExpression";
    delete funcNode.kind;
    node.value = funcNode;
    type = type === "ClassMethod" ? "MethodDefinition" : type;
    return this.finishNode(node, type);
  };

  anonymous.prototype.parseObjectMethod = function parseObjectMethod (prop, isGenerator, isAsync, isPattern, containsEsc) {
    var node = superClass.prototype.parseObjectMethod.call(this, prop, isGenerator, isAsync, isPattern, containsEsc);

    if (node) {
      node.type = "Property";
      if (node.kind === "method") { node.kind = "init"; }
      node.shorthand = false;
    }

    return node;
  };

  anonymous.prototype.parseObjectProperty = function parseObjectProperty (prop, startPos, startLoc, isPattern, refExpressionErrors) {
    var node = superClass.prototype.parseObjectProperty.call(this, prop, startPos, startLoc, isPattern, refExpressionErrors);

    if (node) {
      node.kind = "init";
      node.type = "Property";
    }

    return node;
  };

  anonymous.prototype.toAssignable = function toAssignable (node) {
    if (isSimpleProperty(node)) {
      this.toAssignable(node.value);
      return node;
    }

    return superClass.prototype.toAssignable.call(this, node);
  };

  anonymous.prototype.toAssignableObjectExpressionProp = function toAssignableObjectExpressionProp (prop, isLast) {
    if (prop.kind === "get" || prop.kind === "set") {
      throw this.raise(prop.key.start, Errors.PatternHasAccessor);
    } else if (prop.method) {
      throw this.raise(prop.key.start, Errors.PatternHasMethod);
    } else {
      superClass.prototype.toAssignableObjectExpressionProp.call(this, prop, isLast);
    }
  };

  anonymous.prototype.finishCallExpression = function finishCallExpression (node, optional) {
    superClass.prototype.finishCallExpression.call(this, node, optional);

    if (node.callee.type === "Import") {
      node.type = "ImportExpression";
      node.source = node.arguments[0];
      delete node.arguments;
      delete node.callee;
    }

    return node;
  };

  anonymous.prototype.toReferencedListDeep = function toReferencedListDeep (exprList, isParenthesizedExpr) {
    if (!exprList) {
      return;
    }

    superClass.prototype.toReferencedListDeep.call(this, exprList, isParenthesizedExpr);
  };

  anonymous.prototype.parseExport = function parseExport (node) {
    superClass.prototype.parseExport.call(this, node);

    switch (node.type) {
      case "ExportAllDeclaration":
        node.exported = null;
        break;

      case "ExportNamedDeclaration":
        if (node.specifiers.length === 1 && node.specifiers[0].type === "ExportNamespaceSpecifier") {
          node.type = "ExportAllDeclaration";
          node.exported = node.specifiers[0].exported;
          delete node.specifiers;
        }

        break;
    }

    return node;
  };

    return anonymous;
  }(superClass)); });

var TokContext = function TokContext(token, isExpr, preserveSpace, override) {
  this.token = token;
  this.isExpr = !!isExpr;
  this.preserveSpace = !!preserveSpace;
  this.override = override;
};
var types$1 = {
  braceStatement: new TokContext("{", false),
  braceExpression: new TokContext("{", true),
  templateQuasi: new TokContext("${", false),
  parenStatement: new TokContext("(", false),
  parenExpression: new TokContext("(", true),
  template: new TokContext("`", true, true, function (p) { return p.readTmplToken(); }),
  functionExpression: new TokContext("function", true),
  functionStatement: new TokContext("function", false)
};

types.parenR.updateContext = types.braceR.updateContext = function () {
  if (this.state.context.length === 1) {
    this.state.exprAllowed = true;
    return;
  }

  var out = this.state.context.pop();

  if (out === types$1.braceStatement && this.curContext().token === "function") {
    out = this.state.context.pop();
  }

  this.state.exprAllowed = !out.isExpr;
};

types.name.updateContext = function (prevType) {
  var allowed = false;

  if (prevType !== types.dot) {
    if (this.state.value === "of" && !this.state.exprAllowed || this.state.value === "yield" && this.prodParam.hasYield) {
      allowed = true;
    }
  }

  this.state.exprAllowed = allowed;

  if (this.state.isIterator) {
    this.state.isIterator = false;
  }
};

types.braceL.updateContext = function (prevType) {
  this.state.context.push(this.braceIsBlock(prevType) ? types$1.braceStatement : types$1.braceExpression);
  this.state.exprAllowed = true;
};

types.dollarBraceL.updateContext = function () {
  this.state.context.push(types$1.templateQuasi);
  this.state.exprAllowed = true;
};

types.parenL.updateContext = function (prevType) {
  var statementParens = prevType === types._if || prevType === types._for || prevType === types._with || prevType === types._while;
  this.state.context.push(statementParens ? types$1.parenStatement : types$1.parenExpression);
  this.state.exprAllowed = true;
};

types.incDec.updateContext = function () {};

types._function.updateContext = types._class.updateContext = function (prevType) {
  if (prevType.beforeExpr && prevType !== types.semi && prevType !== types._else && !(prevType === types._return && lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start))) && !((prevType === types.colon || prevType === types.braceL) && this.curContext() === types$1.b_stat)) {
    this.state.context.push(types$1.functionExpression);
  } else {
    this.state.context.push(types$1.functionStatement);
  }

  this.state.exprAllowed = false;
};

types.backQuote.updateContext = function () {
  if (this.curContext() === types$1.template) {
    this.state.context.pop();
  } else {
    this.state.context.push(types$1.template);
  }

  this.state.exprAllowed = false;
};

var nonASCIIidentifierStartChars = "\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u037f\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u052f\u0531-\u0556\u0559\u0560-\u0588\u05d0-\u05ea\u05ef-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u0860-\u086a\u08a0-\u08b4\u08b6-\u08c7\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u09fc\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0af9\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c39\u0c3d\u0c58-\u0c5a\u0c60\u0c61\u0c80\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d04-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d54-\u0d56\u0d5f-\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e86-\u0e8a\u0e8c-\u0ea3\u0ea5\u0ea7-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f5\u13f8-\u13fd\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f8\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1878\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191e\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1c80-\u1c88\u1c90-\u1cba\u1cbd-\u1cbf\u1ce9-\u1cec\u1cee-\u1cf3\u1cf5\u1cf6\u1cfa\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2118-\u211d\u2124\u2126\u2128\u212a-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309b-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312f\u3131-\u318e\u31a0-\u31bf\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9ffc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua69d\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua7bf\ua7c2-\ua7ca\ua7f5-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua8fd\ua8fe\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\ua9e0-\ua9e4\ua9e6-\ua9ef\ua9fa-\ua9fe\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa7e-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uab30-\uab5a\uab5c-\uab69\uab70-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc";
var nonASCIIidentifierChars = "\u200c\u200d\xb7\u0300-\u036f\u0387\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u0669\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u06f0-\u06f9\u0711\u0730-\u074a\u07a6-\u07b0\u07c0-\u07c9\u07eb-\u07f3\u07fd\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u08d3-\u08e1\u08e3-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957\u0962\u0963\u0966-\u096f\u0981-\u0983\u09bc\u09be-\u09c4\u09c7\u09c8\u09cb-\u09cd\u09d7\u09e2\u09e3\u09e6-\u09ef\u09fe\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a66-\u0a71\u0a75\u0a81-\u0a83\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2\u0ae3\u0ae6-\u0aef\u0afa-\u0aff\u0b01-\u0b03\u0b3c\u0b3e-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b55-\u0b57\u0b62\u0b63\u0b66-\u0b6f\u0b82\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0be6-\u0bef\u0c00-\u0c04\u0c3e-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0c66-\u0c6f\u0c81-\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0ce6-\u0cef\u0d00-\u0d03\u0d3b\u0d3c\u0d3e-\u0d44\u0d46-\u0d48\u0d4a-\u0d4d\u0d57\u0d62\u0d63\u0d66-\u0d6f\u0d81-\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0de6-\u0def\u0df2\u0df3\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0e50-\u0e59\u0eb1\u0eb4-\u0ebc\u0ec8-\u0ecd\u0ed0-\u0ed9\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e\u0f3f\u0f71-\u0f84\u0f86\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u102b-\u103e\u1040-\u1049\u1056-\u1059\u105e-\u1060\u1062-\u1064\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f-\u109d\u135d-\u135f\u1369-\u1371\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17b4-\u17d3\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u18a9\u1920-\u192b\u1930-\u193b\u1946-\u194f\u19d0-\u19da\u1a17-\u1a1b\u1a55-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1ab0-\u1abd\u1abf\u1ac0\u1b00-\u1b04\u1b34-\u1b44\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1b82\u1ba1-\u1bad\u1bb0-\u1bb9\u1be6-\u1bf3\u1c24-\u1c37\u1c40-\u1c49\u1c50-\u1c59\u1cd0-\u1cd2\u1cd4-\u1ce8\u1ced\u1cf4\u1cf7-\u1cf9\u1dc0-\u1df9\u1dfb-\u1dff\u203f\u2040\u2054\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2cef-\u2cf1\u2d7f\u2de0-\u2dff\u302a-\u302f\u3099\u309a\ua620-\ua629\ua66f\ua674-\ua67d\ua69e\ua69f\ua6f0\ua6f1\ua802\ua806\ua80b\ua823-\ua827\ua82c\ua880\ua881\ua8b4-\ua8c5\ua8d0-\ua8d9\ua8e0-\ua8f1\ua8ff-\ua909\ua926-\ua92d\ua947-\ua953\ua980-\ua983\ua9b3-\ua9c0\ua9d0-\ua9d9\ua9e5\ua9f0-\ua9f9\uaa29-\uaa36\uaa43\uaa4c\uaa4d\uaa50-\uaa59\uaa7b-\uaa7d\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uaaeb-\uaaef\uaaf5\uaaf6\uabe3-\uabea\uabec\uabed\uabf0-\uabf9\ufb1e\ufe00-\ufe0f\ufe20-\ufe2f\ufe33\ufe34\ufe4d-\ufe4f\uff10-\uff19\uff3f";
var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");
nonASCIIidentifierStartChars = nonASCIIidentifierChars = null;
var astralIdentifierStartCodes = [0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48, 31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39, 9, 51, 157, 310, 10, 21, 11, 7, 153, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11, 22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 71, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2, 28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56, 50, 14, 50, 14, 35, 349, 41, 7, 1, 79, 28, 11, 0, 9, 21, 107, 20, 28, 22, 13, 52, 76, 44, 33, 24, 27, 35, 30, 0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 85, 6, 2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0, 19, 0, 13, 4, 159, 52, 19, 3, 21, 2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26, 230, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7, 3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 35, 56, 264, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2, 31, 15, 0, 328, 18, 190, 0, 80, 921, 103, 110, 18, 195, 2749, 1070, 4050, 582, 8634, 568, 8, 30, 114, 29, 19, 47, 17, 3, 32, 20, 6, 18, 689, 63, 129, 74, 6, 0, 67, 12, 65, 1, 2, 0, 29, 6135, 9, 1237, 43, 8, 8952, 286, 50, 2, 18, 3, 9, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2, 1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3, 2, 4, 2, 0, 4, 6, 2, 339, 3, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 7, 2357, 44, 11, 6, 17, 0, 370, 43, 1301, 196, 60, 67, 8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2, 0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2, 6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42717, 35, 4148, 12, 221, 3, 5761, 15, 7472, 3104, 541, 1507, 4938];
var astralIdentifierCodes = [509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574, 3, 9, 9, 370, 1, 154, 10, 176, 2, 54, 14, 32, 9, 16, 3, 46, 10, 54, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13, 9, 3, 2, 11, 83, 11, 7, 0, 161, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2, 10, 0, 11, 1, 3, 6, 4, 4, 193, 17, 10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9, 84, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9, 120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 406, 7, 2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1, 2, 4, 9, 9, 330, 3, 19306, 9, 135, 4, 60, 6, 26, 9, 1014, 0, 2, 54, 8, 3, 82, 0, 12, 1, 19628, 1, 5319, 4, 4, 5, 9, 7, 3, 6, 31, 3, 149, 2, 1418, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16, 3, 6, 2, 1, 2, 4, 262, 6, 10, 9, 419, 13, 1495, 6, 110, 6, 6, 9, 4759, 9, 787719, 239];

function isInAstralSet(code, set) {
  var pos = 0x10000;

  for (var i = 0, length = set.length; i < length; i += 2) {
    pos += set[i];
    if (pos > code) { return false; }
    pos += set[i + 1];
    if (pos >= code) { return true; }
  }

  return false;
}

function isIdentifierStart(code) {
  if (code < 65) { return code === 36; }
  if (code <= 90) { return true; }
  if (code < 97) { return code === 95; }
  if (code <= 122) { return true; }

  if (code <= 0xffff) {
    return code >= 0xaa && nonASCIIidentifierStart.test(String.fromCharCode(code));
  }

  return isInAstralSet(code, astralIdentifierStartCodes);
}
function isIdentifierChar(code) {
  if (code < 48) { return code === 36; }
  if (code < 58) { return true; }
  if (code < 65) { return false; }
  if (code <= 90) { return true; }
  if (code < 97) { return code === 95; }
  if (code <= 122) { return true; }

  if (code <= 0xffff) {
    return code >= 0xaa && nonASCIIidentifier.test(String.fromCharCode(code));
  }

  return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes);
}

var reservedWords = {
  keyword: ["break", "case", "catch", "continue", "debugger", "default", "do", "else", "finally", "for", "function", "if", "return", "switch", "throw", "try", "var", "const", "while", "with", "new", "this", "super", "class", "extends", "export", "import", "null", "true", "false", "in", "instanceof", "typeof", "void", "delete"],
  strict: ["implements", "interface", "let", "package", "private", "protected", "public", "static", "yield"],
  strictBind: ["eval", "arguments"]
};
var keywords$1 = new Set(reservedWords.keyword);
var reservedWordsStrictSet = new Set(reservedWords.strict);
var reservedWordsStrictBindSet = new Set(reservedWords.strictBind);
function isReservedWord(word, inModule) {
  return inModule && word === "await" || word === "enum";
}
function isStrictReservedWord(word, inModule) {
  return isReservedWord(word, inModule) || reservedWordsStrictSet.has(word);
}
function isStrictBindOnlyReservedWord(word) {
  return reservedWordsStrictBindSet.has(word);
}
function isStrictBindReservedWord(word, inModule) {
  return isStrictReservedWord(word, inModule) || isStrictBindOnlyReservedWord(word);
}
function isKeyword(word) {
  return keywords$1.has(word);
}

var keywordRelationalOperator = /^in(stanceof)?$/;
function isIteratorStart(current, next) {
  return current === 64 && next === 64;
}

var reservedTypes = new Set(["_", "any", "bool", "boolean", "empty", "extends", "false", "interface", "mixed", "null", "number", "static", "string", "true", "typeof", "void"]);
var FlowErrors = Object.freeze({
  AmbiguousConditionalArrow: "Ambiguous expression: wrap the arrow functions in parentheses to disambiguate.",
  AmbiguousDeclareModuleKind: "Found both `declare module.exports` and `declare export` in the same module. Modules can only have 1 since they are either an ES module or they are a CommonJS module",
  AssignReservedType: "Cannot overwrite reserved type %0",
  DeclareClassElement: "The `declare` modifier can only appear on class fields.",
  DeclareClassFieldInitializer: "Initializers are not allowed in fields with the `declare` modifier.",
  DuplicateDeclareModuleExports: "Duplicate `declare module.exports` statement",
  EnumBooleanMemberNotInitialized: "Boolean enum members need to be initialized. Use either `%0 = true,` or `%0 = false,` in enum `%1`.",
  EnumDuplicateMemberName: "Enum member names need to be unique, but the name `%0` has already been used before in enum `%1`.",
  EnumInconsistentMemberValues: "Enum `%0` has inconsistent member initializers. Either use no initializers, or consistently use literals (either booleans, numbers, or strings) for all member initializers.",
  EnumInvalidExplicitType: "Enum type `%1` is not valid. Use one of `boolean`, `number`, `string`, or `symbol` in enum `%0`.",
  EnumInvalidExplicitTypeUnknownSupplied: "Supplied enum type is not valid. Use one of `boolean`, `number`, `string`, or `symbol` in enum `%0`.",
  EnumInvalidMemberInitializerPrimaryType: "Enum `%0` has type `%2`, so the initializer of `%1` needs to be a %2 literal.",
  EnumInvalidMemberInitializerSymbolType: "Symbol enum members cannot be initialized. Use `%1,` in enum `%0`.",
  EnumInvalidMemberInitializerUnknownType: "The enum member initializer for `%1` needs to be a literal (either a boolean, number, or string) in enum `%0`.",
  EnumInvalidMemberName: "Enum member names cannot start with lowercase 'a' through 'z'. Instead of using `%0`, consider using `%1`, in enum `%2`.",
  EnumNumberMemberNotInitialized: "Number enum members need to be initialized, e.g. `%1 = 1` in enum `%0`.",
  EnumStringMemberInconsistentlyInitailized: "String enum members need to consistently either all use initializers, or use no initializers, in enum `%0`.",
  ImportTypeShorthandOnlyInPureImport: "The `type` and `typeof` keywords on named imports can only be used on regular `import` statements. It cannot be used with `import type` or `import typeof` statements",
  InexactInsideExact: "Explicit inexact syntax cannot appear inside an explicit exact object type",
  InexactInsideNonObject: "Explicit inexact syntax cannot appear in class or interface definitions",
  InexactVariance: "Explicit inexact syntax cannot have variance",
  InvalidNonTypeImportInDeclareModule: "Imports within a `declare module` body must always be `import type` or `import typeof`",
  MissingTypeParamDefault: "Type parameter declaration needs a default, since a preceding type parameter declaration has a default.",
  NestedDeclareModule: "`declare module` cannot be used inside another `declare module`",
  NestedFlowComment: "Cannot have a flow comment inside another flow comment",
  OptionalBindingPattern: "A binding pattern parameter cannot be optional in an implementation signature.",
  SpreadVariance: "Spread properties cannot have variance",
  TypeBeforeInitializer: "Type annotations must come before default assignments, e.g. instead of `age = 25: number` use `age: number = 25`",
  TypeCastInPattern: "The type cast expression is expected to be wrapped with parenthesis",
  UnexpectedExplicitInexactInObject: "Explicit inexact syntax must appear at the end of an inexact object",
  UnexpectedReservedType: "Unexpected reserved type %0",
  UnexpectedReservedUnderscore: "`_` is only allowed as a type argument to call or new",
  UnexpectedSpaceBetweenModuloChecks: "Spaces between `%` and `checks` are not allowed here.",
  UnexpectedSpreadType: "Spread operator cannot appear in class or interface definitions",
  UnexpectedSubtractionOperand: 'Unexpected token, expected "number" or "bigint"',
  UnexpectedTokenAfterTypeParameter: "Expected an arrow function after this type parameter declaration",
  UnsupportedDeclareExportKind: "`declare export %0` is not supported. Use `%1` instead",
  UnsupportedStatementInDeclareModule: "Only declares and type imports are allowed inside declare module",
  UnterminatedFlowComment: "Unterminated flow-comment"
});

function isEsModuleType(bodyElement) {
  return bodyElement.type === "DeclareExportAllDeclaration" || bodyElement.type === "DeclareExportDeclaration" && (!bodyElement.declaration || bodyElement.declaration.type !== "TypeAlias" && bodyElement.declaration.type !== "InterfaceDeclaration");
}

function hasTypeImportKind(node) {
  return node.importKind === "type" || node.importKind === "typeof";
}

function isMaybeDefaultImport(state) {
  return (state.type === types.name || !!state.type.keyword) && state.value !== "from";
}

var exportSuggestions = {
  const: "declare export var",
  let: "declare export var",
  type: "export type",
  interface: "export interface"
};

function partition(list, test) {
  var list1 = [];
  var list2 = [];

  for (var i = 0; i < list.length; i++) {
    (test(list[i], i, list) ? list1 : list2).push(list[i]);
  }

  return [list1, list2];
}

var FLOW_PRAGMA_REGEX = /\*?\s*@((?:no)?flow)\b/;
var flow = (function (superClass) { return /*@__PURE__*/(function (superClass) {
    function anonymous(options, input) {
    superClass.call(this, options, input);
    this.flowPragma = undefined;
  }

    if ( superClass ) anonymous.__proto__ = superClass;
    anonymous.prototype = Object.create( superClass && superClass.prototype );
    anonymous.prototype.constructor = anonymous;

  anonymous.prototype.shouldParseTypes = function shouldParseTypes () {
    return this.getPluginOption("flow", "all") || this.flowPragma === "flow";
  };

  anonymous.prototype.shouldParseEnums = function shouldParseEnums () {
    return !!this.getPluginOption("flow", "enums");
  };

  anonymous.prototype.finishToken = function finishToken (type, val) {
    if (type !== types.string && type !== types.semi && type !== types.interpreterDirective) {
      if (this.flowPragma === undefined) {
        this.flowPragma = null;
      }
    }

    return superClass.prototype.finishToken.call(this, type, val);
  };

  anonymous.prototype.addComment = function addComment (comment) {
    if (this.flowPragma === undefined) {
      var matches = FLOW_PRAGMA_REGEX.exec(comment.value);

      if (!matches) ; else if (matches[1] === "flow") {
        this.flowPragma = "flow";
      } else if (matches[1] === "noflow") {
        this.flowPragma = "noflow";
      } else {
        throw new Error("Unexpected flow pragma");
      }
    }

    return superClass.prototype.addComment.call(this, comment);
  };

  anonymous.prototype.flowParseTypeInitialiser = function flowParseTypeInitialiser (tok) {
    var oldInType = this.state.inType;
    this.state.inType = true;
    this.expect(tok || types.colon);
    var type = this.flowParseType();
    this.state.inType = oldInType;
    return type;
  };

  anonymous.prototype.flowParsePredicate = function flowParsePredicate () {
    var node = this.startNode();
    var moduloLoc = this.state.startLoc;
    var moduloPos = this.state.start;
    this.expect(types.modulo);
    var checksLoc = this.state.startLoc;
    this.expectContextual("checks");

    if (moduloLoc.line !== checksLoc.line || moduloLoc.column !== checksLoc.column - 1) {
      this.raise(moduloPos, FlowErrors.UnexpectedSpaceBetweenModuloChecks);
    }

    if (this.eat(types.parenL)) {
      node.value = this.parseExpression();
      this.expect(types.parenR);
      return this.finishNode(node, "DeclaredPredicate");
    } else {
      return this.finishNode(node, "InferredPredicate");
    }
  };

  anonymous.prototype.flowParseTypeAndPredicateInitialiser = function flowParseTypeAndPredicateInitialiser () {
    var oldInType = this.state.inType;
    this.state.inType = true;
    this.expect(types.colon);
    var type = null;
    var predicate = null;

    if (this.match(types.modulo)) {
      this.state.inType = oldInType;
      predicate = this.flowParsePredicate();
    } else {
      type = this.flowParseType();
      this.state.inType = oldInType;

      if (this.match(types.modulo)) {
        predicate = this.flowParsePredicate();
      }
    }

    return [type, predicate];
  };

  anonymous.prototype.flowParseDeclareClass = function flowParseDeclareClass (node) {
    this.next();
    this.flowParseInterfaceish(node, true);
    return this.finishNode(node, "DeclareClass");
  };

  anonymous.prototype.flowParseDeclareFunction = function flowParseDeclareFunction (node) {
    var assign;

    this.next();
    var id = node.id = this.parseIdentifier();
    var typeNode = this.startNode();
    var typeContainer = this.startNode();

    if (this.isRelational("<")) {
      typeNode.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      typeNode.typeParameters = null;
    }

    this.expect(types.parenL);
    var tmp = this.flowParseFunctionTypeParams();
    typeNode.params = tmp.params;
    typeNode.rest = tmp.rest;
    this.expect(types.parenR);
    (assign = this.flowParseTypeAndPredicateInitialiser(), typeNode.returnType = assign[0], node.predicate = assign[1]);
    typeContainer.typeAnnotation = this.finishNode(typeNode, "FunctionTypeAnnotation");
    id.typeAnnotation = this.finishNode(typeContainer, "TypeAnnotation");
    this.resetEndLocation(id);
    this.semicolon();
    return this.finishNode(node, "DeclareFunction");
  };

  anonymous.prototype.flowParseDeclare = function flowParseDeclare (node, insideModule) {
    if (this.match(types._class)) {
      return this.flowParseDeclareClass(node);
    } else if (this.match(types._function)) {
      return this.flowParseDeclareFunction(node);
    } else if (this.match(types._var)) {
      return this.flowParseDeclareVariable(node);
    } else if (this.eatContextual("module")) {
      if (this.match(types.dot)) {
        return this.flowParseDeclareModuleExports(node);
      } else {
        if (insideModule) {
          this.raise(this.state.lastTokStart, FlowErrors.NestedDeclareModule);
        }

        return this.flowParseDeclareModule(node);
      }
    } else if (this.isContextual("type")) {
      return this.flowParseDeclareTypeAlias(node);
    } else if (this.isContextual("opaque")) {
      return this.flowParseDeclareOpaqueType(node);
    } else if (this.isContextual("interface")) {
      return this.flowParseDeclareInterface(node);
    } else if (this.match(types._export)) {
      return this.flowParseDeclareExportDeclaration(node, insideModule);
    } else {
      throw this.unexpected();
    }
  };

  anonymous.prototype.flowParseDeclareVariable = function flowParseDeclareVariable (node) {
    this.next();
    node.id = this.flowParseTypeAnnotatableIdentifier(true);
    this.scope.declareName(node.id.name, BIND_VAR, node.id.start);
    this.semicolon();
    return this.finishNode(node, "DeclareVariable");
  };

  anonymous.prototype.flowParseDeclareModule = function flowParseDeclareModule (node) {
    var this$1 = this;

    this.scope.enter(SCOPE_OTHER);

    if (this.match(types.string)) {
      node.id = this.parseExprAtom();
    } else {
      node.id = this.parseIdentifier();
    }

    var bodyNode = node.body = this.startNode();
    var body = bodyNode.body = [];
    this.expect(types.braceL);

    while (!this.match(types.braceR)) {
      var bodyNode$1 = this.startNode();

      if (this.match(types._import)) {
        this.next();

        if (!this.isContextual("type") && !this.match(types._typeof)) {
          this.raise(this.state.lastTokStart, FlowErrors.InvalidNonTypeImportInDeclareModule);
        }

        this.parseImport(bodyNode$1);
      } else {
        this.expectContextual("declare", FlowErrors.UnsupportedStatementInDeclareModule);
        bodyNode$1 = this.flowParseDeclare(bodyNode$1, true);
      }

      body.push(bodyNode$1);
    }

    this.scope.exit();
    this.expect(types.braceR);
    this.finishNode(bodyNode, "BlockStatement");
    var kind = null;
    var hasModuleExport = false;
    body.forEach(function (bodyElement) {
      if (isEsModuleType(bodyElement)) {
        if (kind === "CommonJS") {
          this$1.raise(bodyElement.start, FlowErrors.AmbiguousDeclareModuleKind);
        }

        kind = "ES";
      } else if (bodyElement.type === "DeclareModuleExports") {
        if (hasModuleExport) {
          this$1.raise(bodyElement.start, FlowErrors.DuplicateDeclareModuleExports);
        }

        if (kind === "ES") {
          this$1.raise(bodyElement.start, FlowErrors.AmbiguousDeclareModuleKind);
        }

        kind = "CommonJS";
        hasModuleExport = true;
      }
    });
    node.kind = kind || "CommonJS";
    return this.finishNode(node, "DeclareModule");
  };

  anonymous.prototype.flowParseDeclareExportDeclaration = function flowParseDeclareExportDeclaration (node, insideModule) {
    this.expect(types._export);

    if (this.eat(types._default)) {
      if (this.match(types._function) || this.match(types._class)) {
        node.declaration = this.flowParseDeclare(this.startNode());
      } else {
        node.declaration = this.flowParseType();
        this.semicolon();
      }

      node.default = true;
      return this.finishNode(node, "DeclareExportDeclaration");
    } else {
      if (this.match(types._const) || this.isLet() || (this.isContextual("type") || this.isContextual("interface")) && !insideModule) {
        var label = this.state.value;
        var suggestion = exportSuggestions[label];
        throw this.raise(this.state.start, FlowErrors.UnsupportedDeclareExportKind, label, suggestion);
      }

      if (this.match(types._var) || this.match(types._function) || this.match(types._class) || this.isContextual("opaque")) {
          node.declaration = this.flowParseDeclare(this.startNode());
          node.default = false;
          return this.finishNode(node, "DeclareExportDeclaration");
        } else if (this.match(types.star) || this.match(types.braceL) || this.isContextual("interface") || this.isContextual("type") || this.isContextual("opaque")) {
          node = this.parseExport(node);

          if (node.type === "ExportNamedDeclaration") {
            node.type = "ExportDeclaration";
            node.default = false;
            delete node.exportKind;
          }

          node.type = "Declare" + node.type;
          return node;
        }
    }

    throw this.unexpected();
  };

  anonymous.prototype.flowParseDeclareModuleExports = function flowParseDeclareModuleExports (node) {
    this.next();
    this.expectContextual("exports");
    node.typeAnnotation = this.flowParseTypeAnnotation();
    this.semicolon();
    return this.finishNode(node, "DeclareModuleExports");
  };

  anonymous.prototype.flowParseDeclareTypeAlias = function flowParseDeclareTypeAlias (node) {
    this.next();
    this.flowParseTypeAlias(node);
    node.type = "DeclareTypeAlias";
    return node;
  };

  anonymous.prototype.flowParseDeclareOpaqueType = function flowParseDeclareOpaqueType (node) {
    this.next();
    this.flowParseOpaqueType(node, true);
    node.type = "DeclareOpaqueType";
    return node;
  };

  anonymous.prototype.flowParseDeclareInterface = function flowParseDeclareInterface (node) {
    this.next();
    this.flowParseInterfaceish(node);
    return this.finishNode(node, "DeclareInterface");
  };

  anonymous.prototype.flowParseInterfaceish = function flowParseInterfaceish (node, isClass) {
    if ( isClass === void 0 ) isClass = false;

    node.id = this.flowParseRestrictedIdentifier(!isClass, true);
    this.scope.declareName(node.id.name, isClass ? BIND_FUNCTION : BIND_LEXICAL, node.id.start);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      node.typeParameters = null;
    }

    node.extends = [];
    node.implements = [];
    node.mixins = [];

    if (this.eat(types._extends)) {
      do {
        node.extends.push(this.flowParseInterfaceExtends());
      } while (!isClass && this.eat(types.comma));
    }

    if (this.isContextual("mixins")) {
      this.next();

      do {
        node.mixins.push(this.flowParseInterfaceExtends());
      } while (this.eat(types.comma));
    }

    if (this.isContextual("implements")) {
      this.next();

      do {
        node.implements.push(this.flowParseInterfaceExtends());
      } while (this.eat(types.comma));
    }

    node.body = this.flowParseObjectType({
      allowStatic: isClass,
      allowExact: false,
      allowSpread: false,
      allowProto: isClass,
      allowInexact: false
    });
  };

  anonymous.prototype.flowParseInterfaceExtends = function flowParseInterfaceExtends () {
    var node = this.startNode();
    node.id = this.flowParseQualifiedTypeIdentifier();

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterInstantiation();
    } else {
      node.typeParameters = null;
    }

    return this.finishNode(node, "InterfaceExtends");
  };

  anonymous.prototype.flowParseInterface = function flowParseInterface (node) {
    this.flowParseInterfaceish(node);
    return this.finishNode(node, "InterfaceDeclaration");
  };

  anonymous.prototype.checkNotUnderscore = function checkNotUnderscore (word) {
    if (word === "_") {
      this.raise(this.state.start, FlowErrors.UnexpectedReservedUnderscore);
    }
  };

  anonymous.prototype.checkReservedType = function checkReservedType (word, startLoc, declaration) {
    if (!reservedTypes.has(word)) { return; }
    this.raise(startLoc, declaration ? FlowErrors.AssignReservedType : FlowErrors.UnexpectedReservedType, word);
  };

  anonymous.prototype.flowParseRestrictedIdentifier = function flowParseRestrictedIdentifier (liberal, declaration) {
    this.checkReservedType(this.state.value, this.state.start, declaration);
    return this.parseIdentifier(liberal);
  };

  anonymous.prototype.flowParseTypeAlias = function flowParseTypeAlias (node) {
    node.id = this.flowParseRestrictedIdentifier(false, true);
    this.scope.declareName(node.id.name, BIND_LEXICAL, node.id.start);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      node.typeParameters = null;
    }

    node.right = this.flowParseTypeInitialiser(types.eq);
    this.semicolon();
    return this.finishNode(node, "TypeAlias");
  };

  anonymous.prototype.flowParseOpaqueType = function flowParseOpaqueType (node, declare) {
    this.expectContextual("type");
    node.id = this.flowParseRestrictedIdentifier(true, true);
    this.scope.declareName(node.id.name, BIND_LEXICAL, node.id.start);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      node.typeParameters = null;
    }

    node.supertype = null;

    if (this.match(types.colon)) {
      node.supertype = this.flowParseTypeInitialiser(types.colon);
    }

    node.impltype = null;

    if (!declare) {
      node.impltype = this.flowParseTypeInitialiser(types.eq);
    }

    this.semicolon();
    return this.finishNode(node, "OpaqueType");
  };

  anonymous.prototype.flowParseTypeParameter = function flowParseTypeParameter (requireDefault) {
    if ( requireDefault === void 0 ) requireDefault = false;

    var nodeStart = this.state.start;
    var node = this.startNode();
    var variance = this.flowParseVariance();
    var ident = this.flowParseTypeAnnotatableIdentifier();
    node.name = ident.name;
    node.variance = variance;
    node.bound = ident.typeAnnotation;

    if (this.match(types.eq)) {
      this.eat(types.eq);
      node.default = this.flowParseType();
    } else {
      if (requireDefault) {
        this.raise(nodeStart, FlowErrors.MissingTypeParamDefault);
      }
    }

    return this.finishNode(node, "TypeParameter");
  };

  anonymous.prototype.flowParseTypeParameterDeclaration = function flowParseTypeParameterDeclaration () {
    var oldInType = this.state.inType;
    var node = this.startNode();
    node.params = [];
    this.state.inType = true;

    if (this.isRelational("<") || this.match(types.jsxTagStart)) {
      this.next();
    } else {
      this.unexpected();
    }

    var defaultRequired = false;

    do {
      var typeParameter = this.flowParseTypeParameter(defaultRequired);
      node.params.push(typeParameter);

      if (typeParameter.default) {
        defaultRequired = true;
      }

      if (!this.isRelational(">")) {
        this.expect(types.comma);
      }
    } while (!this.isRelational(">"));

    this.expectRelational(">");
    this.state.inType = oldInType;
    return this.finishNode(node, "TypeParameterDeclaration");
  };

  anonymous.prototype.flowParseTypeParameterInstantiation = function flowParseTypeParameterInstantiation () {
    var node = this.startNode();
    var oldInType = this.state.inType;
    node.params = [];
    this.state.inType = true;
    this.expectRelational("<");
    var oldNoAnonFunctionType = this.state.noAnonFunctionType;
    this.state.noAnonFunctionType = false;

    while (!this.isRelational(">")) {
      node.params.push(this.flowParseType());

      if (!this.isRelational(">")) {
        this.expect(types.comma);
      }
    }

    this.state.noAnonFunctionType = oldNoAnonFunctionType;
    this.expectRelational(">");
    this.state.inType = oldInType;
    return this.finishNode(node, "TypeParameterInstantiation");
  };

  anonymous.prototype.flowParseTypeParameterInstantiationCallOrNew = function flowParseTypeParameterInstantiationCallOrNew () {
    var node = this.startNode();
    var oldInType = this.state.inType;
    node.params = [];
    this.state.inType = true;
    this.expectRelational("<");

    while (!this.isRelational(">")) {
      node.params.push(this.flowParseTypeOrImplicitInstantiation());

      if (!this.isRelational(">")) {
        this.expect(types.comma);
      }
    }

    this.expectRelational(">");
    this.state.inType = oldInType;
    return this.finishNode(node, "TypeParameterInstantiation");
  };

  anonymous.prototype.flowParseInterfaceType = function flowParseInterfaceType () {
    var node = this.startNode();
    this.expectContextual("interface");
    node.extends = [];

    if (this.eat(types._extends)) {
      do {
        node.extends.push(this.flowParseInterfaceExtends());
      } while (this.eat(types.comma));
    }

    node.body = this.flowParseObjectType({
      allowStatic: false,
      allowExact: false,
      allowSpread: false,
      allowProto: false,
      allowInexact: false
    });
    return this.finishNode(node, "InterfaceTypeAnnotation");
  };

  anonymous.prototype.flowParseObjectPropertyKey = function flowParseObjectPropertyKey () {
    return this.match(types.num) || this.match(types.string) ? this.parseExprAtom() : this.parseIdentifier(true);
  };

  anonymous.prototype.flowParseObjectTypeIndexer = function flowParseObjectTypeIndexer (node, isStatic, variance) {
    node.static = isStatic;

    if (this.lookahead().type === types.colon) {
      node.id = this.flowParseObjectPropertyKey();
      node.key = this.flowParseTypeInitialiser();
    } else {
      node.id = null;
      node.key = this.flowParseType();
    }

    this.expect(types.bracketR);
    node.value = this.flowParseTypeInitialiser();
    node.variance = variance;
    return this.finishNode(node, "ObjectTypeIndexer");
  };

  anonymous.prototype.flowParseObjectTypeInternalSlot = function flowParseObjectTypeInternalSlot (node, isStatic) {
    node.static = isStatic;
    node.id = this.flowParseObjectPropertyKey();
    this.expect(types.bracketR);
    this.expect(types.bracketR);

    if (this.isRelational("<") || this.match(types.parenL)) {
      node.method = true;
      node.optional = false;
      node.value = this.flowParseObjectTypeMethodish(this.startNodeAt(node.start, node.loc.start));
    } else {
      node.method = false;

      if (this.eat(types.question)) {
        node.optional = true;
      }

      node.value = this.flowParseTypeInitialiser();
    }

    return this.finishNode(node, "ObjectTypeInternalSlot");
  };

  anonymous.prototype.flowParseObjectTypeMethodish = function flowParseObjectTypeMethodish (node) {
    node.params = [];
    node.rest = null;
    node.typeParameters = null;

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    }

    this.expect(types.parenL);

    while (!this.match(types.parenR) && !this.match(types.ellipsis)) {
      node.params.push(this.flowParseFunctionTypeParam());

      if (!this.match(types.parenR)) {
        this.expect(types.comma);
      }
    }

    if (this.eat(types.ellipsis)) {
      node.rest = this.flowParseFunctionTypeParam();
    }

    this.expect(types.parenR);
    node.returnType = this.flowParseTypeInitialiser();
    return this.finishNode(node, "FunctionTypeAnnotation");
  };

  anonymous.prototype.flowParseObjectTypeCallProperty = function flowParseObjectTypeCallProperty (node, isStatic) {
    var valueNode = this.startNode();
    node.static = isStatic;
    node.value = this.flowParseObjectTypeMethodish(valueNode);
    return this.finishNode(node, "ObjectTypeCallProperty");
  };

  anonymous.prototype.flowParseObjectType = function flowParseObjectType (ref) {
    var allowStatic = ref.allowStatic;
    var allowExact = ref.allowExact;
    var allowSpread = ref.allowSpread;
    var allowProto = ref.allowProto;
    var allowInexact = ref.allowInexact;

    var oldInType = this.state.inType;
    this.state.inType = true;
    var nodeStart = this.startNode();
    nodeStart.callProperties = [];
    nodeStart.properties = [];
    nodeStart.indexers = [];
    nodeStart.internalSlots = [];
    var endDelim;
    var exact;
    var inexact = false;

    if (allowExact && this.match(types.braceBarL)) {
      this.expect(types.braceBarL);
      endDelim = types.braceBarR;
      exact = true;
    } else {
      this.expect(types.braceL);
      endDelim = types.braceR;
      exact = false;
    }

    nodeStart.exact = exact;

    while (!this.match(endDelim)) {
      var isStatic = false;
      var protoStart = null;
      var inexactStart = null;
      var node = this.startNode();

      if (allowProto && this.isContextual("proto")) {
        var lookahead = this.lookahead();

        if (lookahead.type !== types.colon && lookahead.type !== types.question) {
          this.next();
          protoStart = this.state.start;
          allowStatic = false;
        }
      }

      if (allowStatic && this.isContextual("static")) {
        var lookahead$1 = this.lookahead();

        if (lookahead$1.type !== types.colon && lookahead$1.type !== types.question) {
          this.next();
          isStatic = true;
        }
      }

      var variance = this.flowParseVariance();

      if (this.eat(types.bracketL)) {
        if (protoStart != null) {
          this.unexpected(protoStart);
        }

        if (this.eat(types.bracketL)) {
          if (variance) {
            this.unexpected(variance.start);
          }

          nodeStart.internalSlots.push(this.flowParseObjectTypeInternalSlot(node, isStatic));
        } else {
          nodeStart.indexers.push(this.flowParseObjectTypeIndexer(node, isStatic, variance));
        }
      } else if (this.match(types.parenL) || this.isRelational("<")) {
        if (protoStart != null) {
          this.unexpected(protoStart);
        }

        if (variance) {
          this.unexpected(variance.start);
        }

        nodeStart.callProperties.push(this.flowParseObjectTypeCallProperty(node, isStatic));
      } else {
        var kind = "init";

        if (this.isContextual("get") || this.isContextual("set")) {
          var lookahead$2 = this.lookahead();

          if (lookahead$2.type === types.name || lookahead$2.type === types.string || lookahead$2.type === types.num) {
            kind = this.state.value;
            this.next();
          }
        }

        var propOrInexact = this.flowParseObjectTypeProperty(node, isStatic, protoStart, variance, kind, allowSpread, allowInexact != null ? allowInexact : !exact);

        if (propOrInexact === null) {
          inexact = true;
          inexactStart = this.state.lastTokStart;
        } else {
          nodeStart.properties.push(propOrInexact);
        }
      }

      this.flowObjectTypeSemicolon();

      if (inexactStart && !this.match(types.braceR) && !this.match(types.braceBarR)) {
        this.raise(inexactStart, FlowErrors.UnexpectedExplicitInexactInObject);
      }
    }

    this.expect(endDelim);

    if (allowSpread) {
      nodeStart.inexact = inexact;
    }

    var out = this.finishNode(nodeStart, "ObjectTypeAnnotation");
    this.state.inType = oldInType;
    return out;
  };

  anonymous.prototype.flowParseObjectTypeProperty = function flowParseObjectTypeProperty (node, isStatic, protoStart, variance, kind, allowSpread, allowInexact) {
    if (this.eat(types.ellipsis)) {
      var isInexactToken = this.match(types.comma) || this.match(types.semi) || this.match(types.braceR) || this.match(types.braceBarR);

      if (isInexactToken) {
        if (!allowSpread) {
          this.raise(this.state.lastTokStart, FlowErrors.InexactInsideNonObject);
        } else if (!allowInexact) {
          this.raise(this.state.lastTokStart, FlowErrors.InexactInsideExact);
        }

        if (variance) {
          this.raise(variance.start, FlowErrors.InexactVariance);
        }

        return null;
      }

      if (!allowSpread) {
        this.raise(this.state.lastTokStart, FlowErrors.UnexpectedSpreadType);
      }

      if (protoStart != null) {
        this.unexpected(protoStart);
      }

      if (variance) {
        this.raise(variance.start, FlowErrors.SpreadVariance);
      }

      node.argument = this.flowParseType();
      return this.finishNode(node, "ObjectTypeSpreadProperty");
    } else {
      node.key = this.flowParseObjectPropertyKey();
      node.static = isStatic;
      node.proto = protoStart != null;
      node.kind = kind;
      var optional = false;

      if (this.isRelational("<") || this.match(types.parenL)) {
        node.method = true;

        if (protoStart != null) {
          this.unexpected(protoStart);
        }

        if (variance) {
          this.unexpected(variance.start);
        }

        node.value = this.flowParseObjectTypeMethodish(this.startNodeAt(node.start, node.loc.start));

        if (kind === "get" || kind === "set") {
          this.flowCheckGetterSetterParams(node);
        }
      } else {
        if (kind !== "init") { this.unexpected(); }
        node.method = false;

        if (this.eat(types.question)) {
          optional = true;
        }

        node.value = this.flowParseTypeInitialiser();
        node.variance = variance;
      }

      node.optional = optional;
      return this.finishNode(node, "ObjectTypeProperty");
    }
  };

  anonymous.prototype.flowCheckGetterSetterParams = function flowCheckGetterSetterParams (property) {
    var paramCount = property.kind === "get" ? 0 : 1;
    var start = property.start;
    var length = property.value.params.length + (property.value.rest ? 1 : 0);

    if (length !== paramCount) {
      if (property.kind === "get") {
        this.raise(start, Errors.BadGetterArity);
      } else {
        this.raise(start, Errors.BadSetterArity);
      }
    }

    if (property.kind === "set" && property.value.rest) {
      this.raise(start, Errors.BadSetterRestParameter);
    }
  };

  anonymous.prototype.flowObjectTypeSemicolon = function flowObjectTypeSemicolon () {
    if (!this.eat(types.semi) && !this.eat(types.comma) && !this.match(types.braceR) && !this.match(types.braceBarR)) {
      this.unexpected();
    }
  };

  anonymous.prototype.flowParseQualifiedTypeIdentifier = function flowParseQualifiedTypeIdentifier (startPos, startLoc, id) {
    startPos = startPos || this.state.start;
    startLoc = startLoc || this.state.startLoc;
    var node = id || this.flowParseRestrictedIdentifier(true);

    while (this.eat(types.dot)) {
      var node2 = this.startNodeAt(startPos, startLoc);
      node2.qualification = node;
      node2.id = this.flowParseRestrictedIdentifier(true);
      node = this.finishNode(node2, "QualifiedTypeIdentifier");
    }

    return node;
  };

  anonymous.prototype.flowParseGenericType = function flowParseGenericType (startPos, startLoc, id) {
    var node = this.startNodeAt(startPos, startLoc);
    node.typeParameters = null;
    node.id = this.flowParseQualifiedTypeIdentifier(startPos, startLoc, id);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterInstantiation();
    }

    return this.finishNode(node, "GenericTypeAnnotation");
  };

  anonymous.prototype.flowParseTypeofType = function flowParseTypeofType () {
    var node = this.startNode();
    this.expect(types._typeof);
    node.argument = this.flowParsePrimaryType();
    return this.finishNode(node, "TypeofTypeAnnotation");
  };

  anonymous.prototype.flowParseTupleType = function flowParseTupleType () {
    var node = this.startNode();
    node.types = [];
    this.expect(types.bracketL);

    while (this.state.pos < this.length && !this.match(types.bracketR)) {
      node.types.push(this.flowParseType());
      if (this.match(types.bracketR)) { break; }
      this.expect(types.comma);
    }

    this.expect(types.bracketR);
    return this.finishNode(node, "TupleTypeAnnotation");
  };

  anonymous.prototype.flowParseFunctionTypeParam = function flowParseFunctionTypeParam () {
    var name = null;
    var optional = false;
    var typeAnnotation = null;
    var node = this.startNode();
    var lh = this.lookahead();

    if (lh.type === types.colon || lh.type === types.question) {
      name = this.parseIdentifier();

      if (this.eat(types.question)) {
        optional = true;
      }

      typeAnnotation = this.flowParseTypeInitialiser();
    } else {
      typeAnnotation = this.flowParseType();
    }

    node.name = name;
    node.optional = optional;
    node.typeAnnotation = typeAnnotation;
    return this.finishNode(node, "FunctionTypeParam");
  };

  anonymous.prototype.reinterpretTypeAsFunctionTypeParam = function reinterpretTypeAsFunctionTypeParam (type) {
    var node = this.startNodeAt(type.start, type.loc.start);
    node.name = null;
    node.optional = false;
    node.typeAnnotation = type;
    return this.finishNode(node, "FunctionTypeParam");
  };

  anonymous.prototype.flowParseFunctionTypeParams = function flowParseFunctionTypeParams (params) {
    if ( params === void 0 ) params = [];

    var rest = null;

    while (!this.match(types.parenR) && !this.match(types.ellipsis)) {
      params.push(this.flowParseFunctionTypeParam());

      if (!this.match(types.parenR)) {
        this.expect(types.comma);
      }
    }

    if (this.eat(types.ellipsis)) {
      rest = this.flowParseFunctionTypeParam();
    }

    return {
      params: params,
      rest: rest
    };
  };

  anonymous.prototype.flowIdentToTypeAnnotation = function flowIdentToTypeAnnotation (startPos, startLoc, node, id) {
    switch (id.name) {
      case "any":
        return this.finishNode(node, "AnyTypeAnnotation");

      case "bool":
      case "boolean":
        return this.finishNode(node, "BooleanTypeAnnotation");

      case "mixed":
        return this.finishNode(node, "MixedTypeAnnotation");

      case "empty":
        return this.finishNode(node, "EmptyTypeAnnotation");

      case "number":
        return this.finishNode(node, "NumberTypeAnnotation");

      case "string":
        return this.finishNode(node, "StringTypeAnnotation");

      case "symbol":
        return this.finishNode(node, "SymbolTypeAnnotation");

      default:
        this.checkNotUnderscore(id.name);
        return this.flowParseGenericType(startPos, startLoc, id);
    }
  };

  anonymous.prototype.flowParsePrimaryType = function flowParsePrimaryType () {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var node = this.startNode();
    var tmp;
    var type;
    var isGroupedType = false;
    var oldNoAnonFunctionType = this.state.noAnonFunctionType;

    switch (this.state.type) {
      case types.name:
        if (this.isContextual("interface")) {
          return this.flowParseInterfaceType();
        }

        return this.flowIdentToTypeAnnotation(startPos, startLoc, node, this.parseIdentifier());

      case types.braceL:
        return this.flowParseObjectType({
          allowStatic: false,
          allowExact: false,
          allowSpread: true,
          allowProto: false,
          allowInexact: true
        });

      case types.braceBarL:
        return this.flowParseObjectType({
          allowStatic: false,
          allowExact: true,
          allowSpread: true,
          allowProto: false,
          allowInexact: false
        });

      case types.bracketL:
        this.state.noAnonFunctionType = false;
        type = this.flowParseTupleType();
        this.state.noAnonFunctionType = oldNoAnonFunctionType;
        return type;

      case types.relational:
        if (this.state.value === "<") {
          node.typeParameters = this.flowParseTypeParameterDeclaration();
          this.expect(types.parenL);
          tmp = this.flowParseFunctionTypeParams();
          node.params = tmp.params;
          node.rest = tmp.rest;
          this.expect(types.parenR);
          this.expect(types.arrow);
          node.returnType = this.flowParseType();
          return this.finishNode(node, "FunctionTypeAnnotation");
        }

        break;

      case types.parenL:
        this.next();

        if (!this.match(types.parenR) && !this.match(types.ellipsis)) {
          if (this.match(types.name)) {
            var token = this.lookahead().type;
            isGroupedType = token !== types.question && token !== types.colon;
          } else {
            isGroupedType = true;
          }
        }

        if (isGroupedType) {
          this.state.noAnonFunctionType = false;
          type = this.flowParseType();
          this.state.noAnonFunctionType = oldNoAnonFunctionType;

          if (this.state.noAnonFunctionType || !(this.match(types.comma) || this.match(types.parenR) && this.lookahead().type === types.arrow)) {
            this.expect(types.parenR);
            return type;
          } else {
            this.eat(types.comma);
          }
        }

        if (type) {
          tmp = this.flowParseFunctionTypeParams([this.reinterpretTypeAsFunctionTypeParam(type)]);
        } else {
          tmp = this.flowParseFunctionTypeParams();
        }

        node.params = tmp.params;
        node.rest = tmp.rest;
        this.expect(types.parenR);
        this.expect(types.arrow);
        node.returnType = this.flowParseType();
        node.typeParameters = null;
        return this.finishNode(node, "FunctionTypeAnnotation");

      case types.string:
        return this.parseLiteral(this.state.value, "StringLiteralTypeAnnotation");

      case types._true:
      case types._false:
        node.value = this.match(types._true);
        this.next();
        return this.finishNode(node, "BooleanLiteralTypeAnnotation");

      case types.plusMin:
        if (this.state.value === "-") {
          this.next();

          if (this.match(types.num)) {
            return this.parseLiteral(-this.state.value, "NumberLiteralTypeAnnotation", node.start, node.loc.start);
          }

          if (this.match(types.bigint)) {
            return this.parseLiteral(-this.state.value, "BigIntLiteralTypeAnnotation", node.start, node.loc.start);
          }

          throw this.raise(this.state.start, FlowErrors.UnexpectedSubtractionOperand);
        }

        throw this.unexpected();

      case types.num:
        return this.parseLiteral(this.state.value, "NumberLiteralTypeAnnotation");

      case types.bigint:
        return this.parseLiteral(this.state.value, "BigIntLiteralTypeAnnotation");

      case types._void:
        this.next();
        return this.finishNode(node, "VoidTypeAnnotation");

      case types._null:
        this.next();
        return this.finishNode(node, "NullLiteralTypeAnnotation");

      case types._this:
        this.next();
        return this.finishNode(node, "ThisTypeAnnotation");

      case types.star:
        this.next();
        return this.finishNode(node, "ExistsTypeAnnotation");

      default:
        if (this.state.type.keyword === "typeof") {
          return this.flowParseTypeofType();
        } else if (this.state.type.keyword) {
          var label = this.state.type.label;
          this.next();
          return superClass.prototype.createIdentifier.call(this, node, label);
        }

    }

    throw this.unexpected();
  };

  anonymous.prototype.flowParsePostfixType = function flowParsePostfixType () {
    var startPos = this.state.start,
          startLoc = this.state.startLoc;
    var type = this.flowParsePrimaryType();

    while (this.match(types.bracketL) && !this.canInsertSemicolon()) {
      var node = this.startNodeAt(startPos, startLoc);
      node.elementType = type;
      this.expect(types.bracketL);
      this.expect(types.bracketR);
      type = this.finishNode(node, "ArrayTypeAnnotation");
    }

    return type;
  };

  anonymous.prototype.flowParsePrefixType = function flowParsePrefixType () {
    var node = this.startNode();

    if (this.eat(types.question)) {
      node.typeAnnotation = this.flowParsePrefixType();
      return this.finishNode(node, "NullableTypeAnnotation");
    } else {
      return this.flowParsePostfixType();
    }
  };

  anonymous.prototype.flowParseAnonFunctionWithoutParens = function flowParseAnonFunctionWithoutParens () {
    var param = this.flowParsePrefixType();

    if (!this.state.noAnonFunctionType && this.eat(types.arrow)) {
      var node = this.startNodeAt(param.start, param.loc.start);
      node.params = [this.reinterpretTypeAsFunctionTypeParam(param)];
      node.rest = null;
      node.returnType = this.flowParseType();
      node.typeParameters = null;
      return this.finishNode(node, "FunctionTypeAnnotation");
    }

    return param;
  };

  anonymous.prototype.flowParseIntersectionType = function flowParseIntersectionType () {
    var node = this.startNode();
    this.eat(types.bitwiseAND);
    var type = this.flowParseAnonFunctionWithoutParens();
    node.types = [type];

    while (this.eat(types.bitwiseAND)) {
      node.types.push(this.flowParseAnonFunctionWithoutParens());
    }

    return node.types.length === 1 ? type : this.finishNode(node, "IntersectionTypeAnnotation");
  };

  anonymous.prototype.flowParseUnionType = function flowParseUnionType () {
    var node = this.startNode();
    this.eat(types.bitwiseOR);
    var type = this.flowParseIntersectionType();
    node.types = [type];

    while (this.eat(types.bitwiseOR)) {
      node.types.push(this.flowParseIntersectionType());
    }

    return node.types.length === 1 ? type : this.finishNode(node, "UnionTypeAnnotation");
  };

  anonymous.prototype.flowParseType = function flowParseType () {
    var oldInType = this.state.inType;
    this.state.inType = true;
    var type = this.flowParseUnionType();
    this.state.inType = oldInType;
    this.state.exprAllowed = this.state.exprAllowed || this.state.noAnonFunctionType;
    return type;
  };

  anonymous.prototype.flowParseTypeOrImplicitInstantiation = function flowParseTypeOrImplicitInstantiation () {
    if (this.state.type === types.name && this.state.value === "_") {
      var startPos = this.state.start;
      var startLoc = this.state.startLoc;
      var node = this.parseIdentifier();
      return this.flowParseGenericType(startPos, startLoc, node);
    } else {
      return this.flowParseType();
    }
  };

  anonymous.prototype.flowParseTypeAnnotation = function flowParseTypeAnnotation () {
    var node = this.startNode();
    node.typeAnnotation = this.flowParseTypeInitialiser();
    return this.finishNode(node, "TypeAnnotation");
  };

  anonymous.prototype.flowParseTypeAnnotatableIdentifier = function flowParseTypeAnnotatableIdentifier (allowPrimitiveOverride) {
    var ident = allowPrimitiveOverride ? this.parseIdentifier() : this.flowParseRestrictedIdentifier();

    if (this.match(types.colon)) {
      ident.typeAnnotation = this.flowParseTypeAnnotation();
      this.resetEndLocation(ident);
    }

    return ident;
  };

  anonymous.prototype.typeCastToParameter = function typeCastToParameter (node) {
    node.expression.typeAnnotation = node.typeAnnotation;
    this.resetEndLocation(node.expression, node.typeAnnotation.end, node.typeAnnotation.loc.end);
    return node.expression;
  };

  anonymous.prototype.flowParseVariance = function flowParseVariance () {
    var variance = null;

    if (this.match(types.plusMin)) {
      variance = this.startNode();

      if (this.state.value === "+") {
        variance.kind = "plus";
      } else {
        variance.kind = "minus";
      }

      this.next();
      this.finishNode(variance, "Variance");
    }

    return variance;
  };

  anonymous.prototype.parseFunctionBody = function parseFunctionBody (node, allowExpressionBody, isMethod) {
    var this$1 = this;
    if ( isMethod === void 0 ) isMethod = false;

    if (allowExpressionBody) {
      return this.forwardNoArrowParamsConversionAt(node, function () { return superClass.prototype.parseFunctionBody.call(this$1, node, true, isMethod); });
    }

    return superClass.prototype.parseFunctionBody.call(this, node, false, isMethod);
  };

  anonymous.prototype.parseFunctionBodyAndFinish = function parseFunctionBodyAndFinish (node, type, isMethod) {
    var assign;

    if ( isMethod === void 0 ) isMethod = false;
    if (this.match(types.colon)) {
      var typeNode = this.startNode();
      (assign = this.flowParseTypeAndPredicateInitialiser(), typeNode.typeAnnotation = assign[0], node.predicate = assign[1]);
      node.returnType = typeNode.typeAnnotation ? this.finishNode(typeNode, "TypeAnnotation") : null;
    }

    superClass.prototype.parseFunctionBodyAndFinish.call(this, node, type, isMethod);
  };

  anonymous.prototype.parseStatement = function parseStatement (context, topLevel) {
    if (this.state.strict && this.match(types.name) && this.state.value === "interface") {
      var node = this.startNode();
      this.next();
      return this.flowParseInterface(node);
    } else if (this.shouldParseEnums() && this.isContextual("enum")) {
      var node$1 = this.startNode();
      this.next();
      return this.flowParseEnumDeclaration(node$1);
    } else {
      var stmt = superClass.prototype.parseStatement.call(this, context, topLevel);

      if (this.flowPragma === undefined && !this.isValidDirective(stmt)) {
        this.flowPragma = null;
      }

      return stmt;
    }
  };

  anonymous.prototype.parseExpressionStatement = function parseExpressionStatement (node, expr) {
    if (expr.type === "Identifier") {
      if (expr.name === "declare") {
        if (this.match(types._class) || this.match(types.name) || this.match(types._function) || this.match(types._var) || this.match(types._export)) {
          return this.flowParseDeclare(node);
        }
      } else if (this.match(types.name)) {
        if (expr.name === "interface") {
          return this.flowParseInterface(node);
        } else if (expr.name === "type") {
          return this.flowParseTypeAlias(node);
        } else if (expr.name === "opaque") {
          return this.flowParseOpaqueType(node, false);
        }
      }
    }

    return superClass.prototype.parseExpressionStatement.call(this, node, expr);
  };

  anonymous.prototype.shouldParseExportDeclaration = function shouldParseExportDeclaration () {
    return this.isContextual("type") || this.isContextual("interface") || this.isContextual("opaque") || this.shouldParseEnums() && this.isContextual("enum") || superClass.prototype.shouldParseExportDeclaration.call(this);
  };

  anonymous.prototype.isExportDefaultSpecifier = function isExportDefaultSpecifier () {
    if (this.match(types.name) && (this.state.value === "type" || this.state.value === "interface" || this.state.value === "opaque" || this.shouldParseEnums() && this.state.value === "enum")) {
      return false;
    }

    return superClass.prototype.isExportDefaultSpecifier.call(this);
  };

  anonymous.prototype.parseExportDefaultExpression = function parseExportDefaultExpression () {
    if (this.shouldParseEnums() && this.isContextual("enum")) {
      var node = this.startNode();
      this.next();
      return this.flowParseEnumDeclaration(node);
    }

    return superClass.prototype.parseExportDefaultExpression.call(this);
  };

  anonymous.prototype.parseConditional = function parseConditional (expr, noIn, startPos, startLoc, refNeedsArrowPos) {
    var this$1 = this;
    var assign, assign$1, assign$2;

    if (!this.match(types.question)) { return expr; }

    if (refNeedsArrowPos) {
      var result = this.tryParse(function () { return superClass.prototype.parseConditional.call(this$1, expr, noIn, startPos, startLoc); });

      if (!result.node) {
        refNeedsArrowPos.start = result.error.pos || this.state.start;
        return expr;
      }

      if (result.error) { this.state = result.failState; }
      return result.node;
    }

    this.expect(types.question);
    var state = this.state.clone();
    var originalNoArrowAt = this.state.noArrowAt;
    var node = this.startNodeAt(startPos, startLoc);
    var ref = this.tryParseConditionalConsequent();
    var consequent = ref.consequent;
    var failed = ref.failed;
    var ref$1 = this.getArrowLikeExpressions(consequent);
    var valid = ref$1[0];
    var invalid = ref$1[1];

    if (failed || invalid.length > 0) {
      var noArrowAt = [].concat( originalNoArrowAt );

      if (invalid.length > 0) {
        this.state = state;
        this.state.noArrowAt = noArrowAt;

        for (var i = 0; i < invalid.length; i++) {
          noArrowAt.push(invalid[i].start);
        }

        ((assign = this.tryParseConditionalConsequent(), consequent = assign.consequent, failed = assign.failed));
        (assign$1 = this.getArrowLikeExpressions(consequent), valid = assign$1[0], invalid = assign$1[1]);
      }

      if (failed && valid.length > 1) {
        this.raise(state.start, FlowErrors.AmbiguousConditionalArrow);
      }

      if (failed && valid.length === 1) {
        this.state = state;
        this.state.noArrowAt = noArrowAt.concat(valid[0].start);
        ((assign$2 = this.tryParseConditionalConsequent(), consequent = assign$2.consequent, failed = assign$2.failed));
      }
    }

    this.getArrowLikeExpressions(consequent, true);
    this.state.noArrowAt = originalNoArrowAt;
    this.expect(types.colon);
    node.test = expr;
    node.consequent = consequent;
    node.alternate = this.forwardNoArrowParamsConversionAt(node, function () { return this$1.parseMaybeAssign(noIn, undefined, undefined, undefined); });
    return this.finishNode(node, "ConditionalExpression");
  };

  anonymous.prototype.tryParseConditionalConsequent = function tryParseConditionalConsequent () {
    this.state.noArrowParamsConversionAt.push(this.state.start);
    var consequent = this.parseMaybeAssign();
    var failed = !this.match(types.colon);
    this.state.noArrowParamsConversionAt.pop();
    return {
      consequent: consequent,
      failed: failed
    };
  };

  anonymous.prototype.getArrowLikeExpressions = function getArrowLikeExpressions (node, disallowInvalid) {
    var this$1 = this;

    var stack = [node];
    var arrows = [];

    while (stack.length !== 0) {
      var node$1 = stack.pop();

      if (node$1.type === "ArrowFunctionExpression") {
        if (node$1.typeParameters || !node$1.returnType) {
          this.finishArrowValidation(node$1);
        } else {
          arrows.push(node$1);
        }

        stack.push(node$1.body);
      } else if (node$1.type === "ConditionalExpression") {
        stack.push(node$1.consequent);
        stack.push(node$1.alternate);
      }
    }

    if (disallowInvalid) {
      arrows.forEach(function (node) { return this$1.finishArrowValidation(node); });
      return [arrows, []];
    }

    return partition(arrows, function (node) { return node.params.every(function (param) { return this$1.isAssignable(param, true); }); });
  };

  anonymous.prototype.finishArrowValidation = function finishArrowValidation (node) {
    var _node$extra;

    this.toAssignableList(node.params, (_node$extra = node.extra) == null ? void 0 : _node$extra.trailingComma);
    this.scope.enter(SCOPE_FUNCTION | SCOPE_ARROW);
    superClass.prototype.checkParams.call(this, node, false, true);
    this.scope.exit();
  };

  anonymous.prototype.forwardNoArrowParamsConversionAt = function forwardNoArrowParamsConversionAt (node, parse) {
    var result;

    if (this.state.noArrowParamsConversionAt.indexOf(node.start) !== -1) {
      this.state.noArrowParamsConversionAt.push(this.state.start);
      result = parse();
      this.state.noArrowParamsConversionAt.pop();
    } else {
      result = parse();
    }

    return result;
  };

  anonymous.prototype.parseParenItem = function parseParenItem (node, startPos, startLoc) {
    node = superClass.prototype.parseParenItem.call(this, node, startPos, startLoc);

    if (this.eat(types.question)) {
      node.optional = true;
      this.resetEndLocation(node);
    }

    if (this.match(types.colon)) {
      var typeCastNode = this.startNodeAt(startPos, startLoc);
      typeCastNode.expression = node;
      typeCastNode.typeAnnotation = this.flowParseTypeAnnotation();
      return this.finishNode(typeCastNode, "TypeCastExpression");
    }

    return node;
  };

  anonymous.prototype.assertModuleNodeAllowed = function assertModuleNodeAllowed (node) {
    if (node.type === "ImportDeclaration" && (node.importKind === "type" || node.importKind === "typeof") || node.type === "ExportNamedDeclaration" && node.exportKind === "type" || node.type === "ExportAllDeclaration" && node.exportKind === "type") {
      return;
    }

    superClass.prototype.assertModuleNodeAllowed.call(this, node);
  };

  anonymous.prototype.parseExport = function parseExport (node) {
    var decl = superClass.prototype.parseExport.call(this, node);

    if (decl.type === "ExportNamedDeclaration" || decl.type === "ExportAllDeclaration") {
      decl.exportKind = decl.exportKind || "value";
    }

    return decl;
  };

  anonymous.prototype.parseExportDeclaration = function parseExportDeclaration (node) {
    if (this.isContextual("type")) {
      node.exportKind = "type";
      var declarationNode = this.startNode();
      this.next();

      if (this.match(types.braceL)) {
        node.specifiers = this.parseExportSpecifiers();
        this.parseExportFrom(node);
        return null;
      } else {
        return this.flowParseTypeAlias(declarationNode);
      }
    } else if (this.isContextual("opaque")) {
      node.exportKind = "type";
      var declarationNode$1 = this.startNode();
      this.next();
      return this.flowParseOpaqueType(declarationNode$1, false);
    } else if (this.isContextual("interface")) {
      node.exportKind = "type";
      var declarationNode$2 = this.startNode();
      this.next();
      return this.flowParseInterface(declarationNode$2);
    } else if (this.shouldParseEnums() && this.isContextual("enum")) {
      node.exportKind = "value";
      var declarationNode$3 = this.startNode();
      this.next();
      return this.flowParseEnumDeclaration(declarationNode$3);
    } else {
      return superClass.prototype.parseExportDeclaration.call(this, node);
    }
  };

  anonymous.prototype.eatExportStar = function eatExportStar (node) {
    if (superClass.prototype.eatExportStar.apply(this, arguments)) { return true; }

    if (this.isContextual("type") && this.lookahead().type === types.star) {
      node.exportKind = "type";
      this.next();
      this.next();
      return true;
    }

    return false;
  };

  anonymous.prototype.maybeParseExportNamespaceSpecifier = function maybeParseExportNamespaceSpecifier (node) {
    var pos = this.state.start;
    var hasNamespace = superClass.prototype.maybeParseExportNamespaceSpecifier.call(this, node);

    if (hasNamespace && node.exportKind === "type") {
      this.unexpected(pos);
    }

    return hasNamespace;
  };

  anonymous.prototype.parseClassId = function parseClassId (node, isStatement, optionalId) {
    superClass.prototype.parseClassId.call(this, node, isStatement, optionalId);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    }
  };

  anonymous.prototype.parseClassMember = function parseClassMember (classBody, member, state, constructorAllowsSuper) {
    var pos = this.state.start;

    if (this.isContextual("declare")) {
      if (this.parseClassMemberFromModifier(classBody, member)) {
        return;
      }

      member.declare = true;
    }

    superClass.prototype.parseClassMember.call(this, classBody, member, state, constructorAllowsSuper);

    if (member.declare) {
      if (member.type !== "ClassProperty" && member.type !== "ClassPrivateProperty") {
        this.raise(pos, FlowErrors.DeclareClassElement);
      } else if (member.value) {
        this.raise(member.value.start, FlowErrors.DeclareClassFieldInitializer);
      }
    }
  };

  anonymous.prototype.getTokenFromCode = function getTokenFromCode (code) {
    var next = this.input.charCodeAt(this.state.pos + 1);

    if (code === 123 && next === 124) {
      return this.finishOp(types.braceBarL, 2);
    } else if (this.state.inType && (code === 62 || code === 60)) {
      return this.finishOp(types.relational, 1);
    } else if (isIteratorStart(code, next)) {
      this.state.isIterator = true;
      return superClass.prototype.readWord.call(this);
    } else {
      return superClass.prototype.getTokenFromCode.call(this, code);
    }
  };

  anonymous.prototype.isAssignable = function isAssignable (node, isBinding) {
    var this$1 = this;

    switch (node.type) {
      case "Identifier":
      case "ObjectPattern":
      case "ArrayPattern":
      case "AssignmentPattern":
        return true;

      case "ObjectExpression":
        {
          var last = node.properties.length - 1;
          return node.properties.every(function (prop, i) {
            return prop.type !== "ObjectMethod" && (i === last || prop.type === "SpreadElement") && this$1.isAssignable(prop);
          });
        }

      case "ObjectProperty":
        return this.isAssignable(node.value);

      case "SpreadElement":
        return this.isAssignable(node.argument);

      case "ArrayExpression":
        return node.elements.every(function (element) { return this$1.isAssignable(element); });

      case "AssignmentExpression":
        return node.operator === "=";

      case "ParenthesizedExpression":
      case "TypeCastExpression":
        return this.isAssignable(node.expression);

      case "MemberExpression":
      case "OptionalMemberExpression":
        return !isBinding;

      default:
        return false;
    }
  };

  anonymous.prototype.toAssignable = function toAssignable (node) {
    if (node.type === "TypeCastExpression") {
      return superClass.prototype.toAssignable.call(this, this.typeCastToParameter(node));
    } else {
      return superClass.prototype.toAssignable.call(this, node);
    }
  };

  anonymous.prototype.toAssignableList = function toAssignableList (exprList, trailingCommaPos) {
    for (var i = 0; i < exprList.length; i++) {
      var expr = exprList[i];

      if (expr && expr.type === "TypeCastExpression") {
        exprList[i] = this.typeCastToParameter(expr);
      }
    }

    return superClass.prototype.toAssignableList.call(this, exprList, trailingCommaPos);
  };

  anonymous.prototype.toReferencedList = function toReferencedList (exprList, isParenthesizedExpr) {
    for (var i = 0; i < exprList.length; i++) {
      var expr = exprList[i];

      if (expr && expr.type === "TypeCastExpression" && (!expr.extra || !expr.extra.parenthesized) && (exprList.length > 1 || !isParenthesizedExpr)) {
        this.raise(expr.typeAnnotation.start, FlowErrors.TypeCastInPattern);
      }
    }

    return exprList;
  };

  anonymous.prototype.checkLVal = function checkLVal (expr, bindingType, checkClashes, contextDescription) {
    if ( bindingType === void 0 ) bindingType = BIND_NONE;

    if (expr.type !== "TypeCastExpression") {
      return superClass.prototype.checkLVal.call(this, expr, bindingType, checkClashes, contextDescription);
    }
  };

  anonymous.prototype.parseClassProperty = function parseClassProperty (node) {
    if (this.match(types.colon)) {
      node.typeAnnotation = this.flowParseTypeAnnotation();
    }

    return superClass.prototype.parseClassProperty.call(this, node);
  };

  anonymous.prototype.parseClassPrivateProperty = function parseClassPrivateProperty (node) {
    if (this.match(types.colon)) {
      node.typeAnnotation = this.flowParseTypeAnnotation();
    }

    return superClass.prototype.parseClassPrivateProperty.call(this, node);
  };

  anonymous.prototype.isClassMethod = function isClassMethod () {
    return this.isRelational("<") || superClass.prototype.isClassMethod.call(this);
  };

  anonymous.prototype.isClassProperty = function isClassProperty () {
    return this.match(types.colon) || superClass.prototype.isClassProperty.call(this);
  };

  anonymous.prototype.isNonstaticConstructor = function isNonstaticConstructor (method) {
    return !this.match(types.colon) && superClass.prototype.isNonstaticConstructor.call(this, method);
  };

  anonymous.prototype.pushClassMethod = function pushClassMethod (classBody, method, isGenerator, isAsync, isConstructor, allowsDirectSuper) {
    if (method.variance) {
      this.unexpected(method.variance.start);
    }

    delete method.variance;

    if (this.isRelational("<")) {
      method.typeParameters = this.flowParseTypeParameterDeclaration();
    }

    superClass.prototype.pushClassMethod.call(this, classBody, method, isGenerator, isAsync, isConstructor, allowsDirectSuper);
  };

  anonymous.prototype.pushClassPrivateMethod = function pushClassPrivateMethod (classBody, method, isGenerator, isAsync) {
    if (method.variance) {
      this.unexpected(method.variance.start);
    }

    delete method.variance;

    if (this.isRelational("<")) {
      method.typeParameters = this.flowParseTypeParameterDeclaration();
    }

    superClass.prototype.pushClassPrivateMethod.call(this, classBody, method, isGenerator, isAsync);
  };

  anonymous.prototype.parseClassSuper = function parseClassSuper (node) {
    superClass.prototype.parseClassSuper.call(this, node);

    if (node.superClass && this.isRelational("<")) {
      node.superTypeParameters = this.flowParseTypeParameterInstantiation();
    }

    if (this.isContextual("implements")) {
      this.next();
      var implemented = node.implements = [];

      do {
        var node$1 = this.startNode();
        node$1.id = this.flowParseRestrictedIdentifier(true);

        if (this.isRelational("<")) {
          node$1.typeParameters = this.flowParseTypeParameterInstantiation();
        } else {
          node$1.typeParameters = null;
        }

        implemented.push(this.finishNode(node$1, "ClassImplements"));
      } while (this.eat(types.comma));
    }
  };

  anonymous.prototype.parsePropertyName = function parsePropertyName (node, isPrivateNameAllowed) {
    var variance = this.flowParseVariance();
    var key = superClass.prototype.parsePropertyName.call(this, node, isPrivateNameAllowed);
    node.variance = variance;
    return key;
  };

  anonymous.prototype.parseObjPropValue = function parseObjPropValue (prop, startPos, startLoc, isGenerator, isAsync, isPattern, refExpressionErrors, containsEsc) {
    if (prop.variance) {
      this.unexpected(prop.variance.start);
    }

    delete prop.variance;
    var typeParameters;

    if (this.isRelational("<")) {
      typeParameters = this.flowParseTypeParameterDeclaration();
      if (!this.match(types.parenL)) { this.unexpected(); }
    }

    superClass.prototype.parseObjPropValue.call(this, prop, startPos, startLoc, isGenerator, isAsync, isPattern, refExpressionErrors, containsEsc);

    if (typeParameters) {
      (prop.value || prop).typeParameters = typeParameters;
    }
  };

  anonymous.prototype.parseAssignableListItemTypes = function parseAssignableListItemTypes (param) {
    if (this.eat(types.question)) {
      if (param.type !== "Identifier") {
        this.raise(param.start, FlowErrors.OptionalBindingPattern);
      }

      param.optional = true;
    }

    if (this.match(types.colon)) {
      param.typeAnnotation = this.flowParseTypeAnnotation();
    }

    this.resetEndLocation(param);
    return param;
  };

  anonymous.prototype.parseMaybeDefault = function parseMaybeDefault (startPos, startLoc, left) {
    var node = superClass.prototype.parseMaybeDefault.call(this, startPos, startLoc, left);

    if (node.type === "AssignmentPattern" && node.typeAnnotation && node.right.start < node.typeAnnotation.start) {
      this.raise(node.typeAnnotation.start, FlowErrors.TypeBeforeInitializer);
    }

    return node;
  };

  anonymous.prototype.shouldParseDefaultImport = function shouldParseDefaultImport (node) {
    if (!hasTypeImportKind(node)) {
      return superClass.prototype.shouldParseDefaultImport.call(this, node);
    }

    return isMaybeDefaultImport(this.state);
  };

  anonymous.prototype.parseImportSpecifierLocal = function parseImportSpecifierLocal (node, specifier, type, contextDescription) {
    specifier.local = hasTypeImportKind(node) ? this.flowParseRestrictedIdentifier(true, true) : this.parseIdentifier();
    this.checkLVal(specifier.local, BIND_LEXICAL, undefined, contextDescription);
    node.specifiers.push(this.finishNode(specifier, type));
  };

  anonymous.prototype.maybeParseDefaultImportSpecifier = function maybeParseDefaultImportSpecifier (node) {
    node.importKind = "value";
    var kind = null;

    if (this.match(types._typeof)) {
      kind = "typeof";
    } else if (this.isContextual("type")) {
      kind = "type";
    }

    if (kind) {
      var lh = this.lookahead();

      if (kind === "type" && lh.type === types.star) {
        this.unexpected(lh.start);
      }

      if (isMaybeDefaultImport(lh) || lh.type === types.braceL || lh.type === types.star) {
        this.next();
        node.importKind = kind;
      }
    }

    return superClass.prototype.maybeParseDefaultImportSpecifier.call(this, node);
  };

  anonymous.prototype.parseImportSpecifier = function parseImportSpecifier (node) {
    var specifier = this.startNode();
    var firstIdentLoc = this.state.start;
    var firstIdent = this.parseIdentifier(true);
    var specifierTypeKind = null;

    if (firstIdent.name === "type") {
      specifierTypeKind = "type";
    } else if (firstIdent.name === "typeof") {
      specifierTypeKind = "typeof";
    }

    var isBinding = false;

    if (this.isContextual("as") && !this.isLookaheadContextual("as")) {
      var as_ident = this.parseIdentifier(true);

      if (specifierTypeKind !== null && !this.match(types.name) && !this.state.type.keyword) {
        specifier.imported = as_ident;
        specifier.importKind = specifierTypeKind;
        specifier.local = as_ident.__clone();
      } else {
        specifier.imported = firstIdent;
        specifier.importKind = null;
        specifier.local = this.parseIdentifier();
      }
    } else if (specifierTypeKind !== null && (this.match(types.name) || this.state.type.keyword)) {
      specifier.imported = this.parseIdentifier(true);
      specifier.importKind = specifierTypeKind;

      if (this.eatContextual("as")) {
        specifier.local = this.parseIdentifier();
      } else {
        isBinding = true;
        specifier.local = specifier.imported.__clone();
      }
    } else {
      isBinding = true;
      specifier.imported = firstIdent;
      specifier.importKind = null;
      specifier.local = specifier.imported.__clone();
    }

    var nodeIsTypeImport = hasTypeImportKind(node);
    var specifierIsTypeImport = hasTypeImportKind(specifier);

    if (nodeIsTypeImport && specifierIsTypeImport) {
      this.raise(firstIdentLoc, FlowErrors.ImportTypeShorthandOnlyInPureImport);
    }

    if (nodeIsTypeImport || specifierIsTypeImport) {
      this.checkReservedType(specifier.local.name, specifier.local.start, true);
    }

    if (isBinding && !nodeIsTypeImport && !specifierIsTypeImport) {
      this.checkReservedWord(specifier.local.name, specifier.start, true, true);
    }

    this.checkLVal(specifier.local, BIND_LEXICAL, undefined, "import specifier");
    node.specifiers.push(this.finishNode(specifier, "ImportSpecifier"));
  };

  anonymous.prototype.parseFunctionParams = function parseFunctionParams (node, allowModifiers) {
    var kind = node.kind;

    if (kind !== "get" && kind !== "set" && this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    }

    superClass.prototype.parseFunctionParams.call(this, node, allowModifiers);
  };

  anonymous.prototype.parseVarId = function parseVarId (decl, kind) {
    superClass.prototype.parseVarId.call(this, decl, kind);

    if (this.match(types.colon)) {
      decl.id.typeAnnotation = this.flowParseTypeAnnotation();
      this.resetEndLocation(decl.id);
    }
  };

  anonymous.prototype.parseAsyncArrowFromCallExpression = function parseAsyncArrowFromCallExpression (node, call) {
    if (this.match(types.colon)) {
      var oldNoAnonFunctionType = this.state.noAnonFunctionType;
      this.state.noAnonFunctionType = true;
      node.returnType = this.flowParseTypeAnnotation();
      this.state.noAnonFunctionType = oldNoAnonFunctionType;
    }

    return superClass.prototype.parseAsyncArrowFromCallExpression.call(this, node, call);
  };

  anonymous.prototype.shouldParseAsyncArrow = function shouldParseAsyncArrow () {
    return this.match(types.colon) || superClass.prototype.shouldParseAsyncArrow.call(this);
  };

  anonymous.prototype.parseMaybeAssign = function parseMaybeAssign (noIn, refExpressionErrors, afterLeftParse, refNeedsArrowPos) {
    var this$1 = this;

    var state = null;
    var jsx;

    if (this.hasPlugin("jsx") && (this.match(types.jsxTagStart) || this.isRelational("<"))) {
      state = this.state.clone();
      jsx = this.tryParse(function () { return superClass.prototype.parseMaybeAssign.call(this$1, noIn, refExpressionErrors, afterLeftParse, refNeedsArrowPos); }, state);
      if (!jsx.error) { return jsx.node; }
      var ref = this.state;
      var context = ref.context;

      if (context[context.length - 1] === types$1.j_oTag) {
        context.length -= 2;
      } else if (context[context.length - 1] === types$1.j_expr) {
        context.length -= 1;
      }
    }

    if (jsx && jsx.error || this.isRelational("<")) {
      state = state || this.state.clone();
      var typeParameters;
      var arrow = this.tryParse(function () {
        typeParameters = this$1.flowParseTypeParameterDeclaration();
        var arrowExpression = this$1.forwardNoArrowParamsConversionAt(typeParameters, function () { return superClass.prototype.parseMaybeAssign.call(this$1, noIn, refExpressionErrors, afterLeftParse, refNeedsArrowPos); });
        arrowExpression.typeParameters = typeParameters;
        this$1.resetStartLocationFromNode(arrowExpression, typeParameters);
        return arrowExpression;
      }, state);
      var arrowExpression = arrow.node && arrow.node.type === "ArrowFunctionExpression" ? arrow.node : null;
      if (!arrow.error && arrowExpression) { return arrowExpression; }

      if (jsx && jsx.node) {
        this.state = jsx.failState;
        return jsx.node;
      }

      if (arrowExpression) {
        this.state = arrow.failState;
        return arrowExpression;
      }

      if (jsx && jsx.thrown) { throw jsx.error; }
      if (arrow.thrown) { throw arrow.error; }
      throw this.raise(typeParameters.start, FlowErrors.UnexpectedTokenAfterTypeParameter);
    }

    return superClass.prototype.parseMaybeAssign.call(this, noIn, refExpressionErrors, afterLeftParse, refNeedsArrowPos);
  };

  anonymous.prototype.parseArrow = function parseArrow (node) {
    var this$1 = this;

    if (this.match(types.colon)) {
      var result = this.tryParse(function () {
        var assign;

        var oldNoAnonFunctionType = this$1.state.noAnonFunctionType;
        this$1.state.noAnonFunctionType = true;
        var typeNode = this$1.startNode();
        (assign = this$1.flowParseTypeAndPredicateInitialiser(), typeNode.typeAnnotation = assign[0], node.predicate = assign[1]);
        this$1.state.noAnonFunctionType = oldNoAnonFunctionType;
        if (this$1.canInsertSemicolon()) { this$1.unexpected(); }
        if (!this$1.match(types.arrow)) { this$1.unexpected(); }
        return typeNode;
      });
      if (result.thrown) { return null; }
      if (result.error) { this.state = result.failState; }
      node.returnType = result.node.typeAnnotation ? this.finishNode(result.node, "TypeAnnotation") : null;
    }

    return superClass.prototype.parseArrow.call(this, node);
  };

  anonymous.prototype.shouldParseArrow = function shouldParseArrow () {
    return this.match(types.colon) || superClass.prototype.shouldParseArrow.call(this);
  };

  anonymous.prototype.setArrowFunctionParameters = function setArrowFunctionParameters (node, params) {
    if (this.state.noArrowParamsConversionAt.indexOf(node.start) !== -1) {
      node.params = params;
    } else {
      superClass.prototype.setArrowFunctionParameters.call(this, node, params);
    }
  };

  anonymous.prototype.checkParams = function checkParams (node, allowDuplicates, isArrowFunction) {
    if (isArrowFunction && this.state.noArrowParamsConversionAt.indexOf(node.start) !== -1) {
      return;
    }

    return superClass.prototype.checkParams.apply(this, arguments);
  };

  anonymous.prototype.parseParenAndDistinguishExpression = function parseParenAndDistinguishExpression (canBeArrow) {
    return superClass.prototype.parseParenAndDistinguishExpression.call(this, canBeArrow && this.state.noArrowAt.indexOf(this.state.start) === -1);
  };

  anonymous.prototype.parseSubscripts = function parseSubscripts (base, startPos, startLoc, noCalls) {
    var this$1 = this;

    if (base.type === "Identifier" && base.name === "async" && this.state.noArrowAt.indexOf(startPos) !== -1) {
      this.next();
      var node = this.startNodeAt(startPos, startLoc);
      node.callee = base;
      node.arguments = this.parseCallExpressionArguments(types.parenR, false);
      base = this.finishNode(node, "CallExpression");
    } else if (base.type === "Identifier" && base.name === "async" && this.isRelational("<")) {
      var state = this.state.clone();
      var arrow = this.tryParse(function (abort) { return this$1.parseAsyncArrowWithTypeParameters(startPos, startLoc) || abort(); }, state);
      if (!arrow.error && !arrow.aborted) { return arrow.node; }
      var result = this.tryParse(function () { return superClass.prototype.parseSubscripts.call(this$1, base, startPos, startLoc, noCalls); }, state);
      if (result.node && !result.error) { return result.node; }

      if (arrow.node) {
        this.state = arrow.failState;
        return arrow.node;
      }

      if (result.node) {
        this.state = result.failState;
        return result.node;
      }

      throw arrow.error || result.error;
    }

    return superClass.prototype.parseSubscripts.call(this, base, startPos, startLoc, noCalls);
  };

  anonymous.prototype.parseSubscript = function parseSubscript (base, startPos, startLoc, noCalls, subscriptState) {
    var this$1 = this;

    if (this.match(types.questionDot) && this.isLookaheadRelational("<")) {
      subscriptState.optionalChainMember = true;

      if (noCalls) {
        subscriptState.stop = true;
        return base;
      }

      this.next();
      var node = this.startNodeAt(startPos, startLoc);
      node.callee = base;
      node.typeArguments = this.flowParseTypeParameterInstantiation();
      this.expect(types.parenL);
      node.arguments = this.parseCallExpressionArguments(types.parenR, false);
      node.optional = true;
      return this.finishCallExpression(node, true);
    } else if (!noCalls && this.shouldParseTypes() && this.isRelational("<")) {
      var node$1 = this.startNodeAt(startPos, startLoc);
      node$1.callee = base;
      var result = this.tryParse(function () {
        node$1.typeArguments = this$1.flowParseTypeParameterInstantiationCallOrNew();
        this$1.expect(types.parenL);
        node$1.arguments = this$1.parseCallExpressionArguments(types.parenR, false);
        if (subscriptState.optionalChainMember) { node$1.optional = false; }
        return this$1.finishCallExpression(node$1, subscriptState.optionalChainMember);
      });

      if (result.node) {
        if (result.error) { this.state = result.failState; }
        return result.node;
      }
    }

    return superClass.prototype.parseSubscript.call(this, base, startPos, startLoc, noCalls, subscriptState);
  };

  anonymous.prototype.parseNewArguments = function parseNewArguments (node) {
    var this$1 = this;

    var targs = null;

    if (this.shouldParseTypes() && this.isRelational("<")) {
      targs = this.tryParse(function () { return this$1.flowParseTypeParameterInstantiationCallOrNew(); }).node;
    }

    node.typeArguments = targs;
    superClass.prototype.parseNewArguments.call(this, node);
  };

  anonymous.prototype.parseAsyncArrowWithTypeParameters = function parseAsyncArrowWithTypeParameters (startPos, startLoc) {
    var node = this.startNodeAt(startPos, startLoc);
    this.parseFunctionParams(node);
    if (!this.parseArrow(node)) { return; }
    return this.parseArrowExpression(node, undefined, true);
  };

  anonymous.prototype.readToken_mult_modulo = function readToken_mult_modulo (code) {
    var next = this.input.charCodeAt(this.state.pos + 1);

    if (code === 42 && next === 47 && this.state.hasFlowComment) {
      this.state.hasFlowComment = false;
      this.state.pos += 2;
      this.nextToken();
      return;
    }

    superClass.prototype.readToken_mult_modulo.call(this, code);
  };

  anonymous.prototype.readToken_pipe_amp = function readToken_pipe_amp (code) {
    var next = this.input.charCodeAt(this.state.pos + 1);

    if (code === 124 && next === 125) {
      this.finishOp(types.braceBarR, 2);
      return;
    }

    superClass.prototype.readToken_pipe_amp.call(this, code);
  };

  anonymous.prototype.parseTopLevel = function parseTopLevel (file, program) {
    var fileNode = superClass.prototype.parseTopLevel.call(this, file, program);

    if (this.state.hasFlowComment) {
      this.raise(this.state.pos, FlowErrors.UnterminatedFlowComment);
    }

    return fileNode;
  };

  anonymous.prototype.skipBlockComment = function skipBlockComment () {
    if (this.hasPlugin("flowComments") && this.skipFlowComment()) {
      if (this.state.hasFlowComment) {
        this.unexpected(null, FlowErrors.NestedFlowComment);
      }

      this.hasFlowCommentCompletion();
      this.state.pos += this.skipFlowComment();
      this.state.hasFlowComment = true;
      return;
    }

    if (this.state.hasFlowComment) {
      var end = this.input.indexOf("*-/", this.state.pos += 2);

      if (end === -1) {
        throw this.raise(this.state.pos - 2, Errors.UnterminatedComment);
      }

      this.state.pos = end + 3;
      return;
    }

    superClass.prototype.skipBlockComment.call(this);
  };

  anonymous.prototype.skipFlowComment = function skipFlowComment () {
    var ref = this.state;
    var pos = ref.pos;
    var shiftToFirstNonWhiteSpace = 2;

    while ([32, 9].includes(this.input.charCodeAt(pos + shiftToFirstNonWhiteSpace))) {
      shiftToFirstNonWhiteSpace++;
    }

    var ch2 = this.input.charCodeAt(shiftToFirstNonWhiteSpace + pos);
    var ch3 = this.input.charCodeAt(shiftToFirstNonWhiteSpace + pos + 1);

    if (ch2 === 58 && ch3 === 58) {
      return shiftToFirstNonWhiteSpace + 2;
    }

    if (this.input.slice(shiftToFirstNonWhiteSpace + pos, shiftToFirstNonWhiteSpace + pos + 12) === "flow-include") {
      return shiftToFirstNonWhiteSpace + 12;
    }

    if (ch2 === 58 && ch3 !== 58) {
      return shiftToFirstNonWhiteSpace;
    }

    return false;
  };

  anonymous.prototype.hasFlowCommentCompletion = function hasFlowCommentCompletion () {
    var end = this.input.indexOf("*/", this.state.pos);

    if (end === -1) {
      throw this.raise(this.state.pos, Errors.UnterminatedComment);
    }
  };

  anonymous.prototype.flowEnumErrorBooleanMemberNotInitialized = function flowEnumErrorBooleanMemberNotInitialized (pos, ref) {
    var enumName = ref.enumName;
    var memberName = ref.memberName;

    this.raise(pos, FlowErrors.EnumBooleanMemberNotInitialized, memberName, enumName);
  };

  anonymous.prototype.flowEnumErrorInvalidMemberName = function flowEnumErrorInvalidMemberName (pos, ref) {
    var enumName = ref.enumName;
    var memberName = ref.memberName;

    var suggestion = memberName[0].toUpperCase() + memberName.slice(1);
    this.raise(pos, FlowErrors.EnumInvalidMemberName, memberName, suggestion, enumName);
  };

  anonymous.prototype.flowEnumErrorDuplicateMemberName = function flowEnumErrorDuplicateMemberName (pos, ref) {
    var enumName = ref.enumName;
    var memberName = ref.memberName;

    this.raise(pos, FlowErrors.EnumDuplicateMemberName, memberName, enumName);
  };

  anonymous.prototype.flowEnumErrorInconsistentMemberValues = function flowEnumErrorInconsistentMemberValues (pos, ref) {
    var enumName = ref.enumName;

    this.raise(pos, FlowErrors.EnumInconsistentMemberValues, enumName);
  };

  anonymous.prototype.flowEnumErrorInvalidExplicitType = function flowEnumErrorInvalidExplicitType (pos, ref) {
    var enumName = ref.enumName;
    var suppliedType = ref.suppliedType;

    return this.raise(pos, suppliedType === null ? FlowErrors.EnumInvalidExplicitTypeUnknownSupplied : FlowErrors.EnumInvalidExplicitType, enumName, suppliedType);
  };

  anonymous.prototype.flowEnumErrorInvalidMemberInitializer = function flowEnumErrorInvalidMemberInitializer (pos, ref) {
    var enumName = ref.enumName;
    var explicitType = ref.explicitType;
    var memberName = ref.memberName;

    var message = null;

    switch (explicitType) {
      case "boolean":
      case "number":
      case "string":
        message = FlowErrors.EnumInvalidMemberInitializerPrimaryType;
        break;

      case "symbol":
        message = FlowErrors.EnumInvalidMemberInitializerSymbolType;
        break;

      default:
        message = FlowErrors.EnumInvalidMemberInitializerUnknownType;
    }

    return this.raise(pos, message, enumName, memberName, explicitType);
  };

  anonymous.prototype.flowEnumErrorNumberMemberNotInitialized = function flowEnumErrorNumberMemberNotInitialized (pos, ref) {
    var enumName = ref.enumName;
    var memberName = ref.memberName;

    this.raise(pos, FlowErrors.EnumNumberMemberNotInitialized, enumName, memberName);
  };

  anonymous.prototype.flowEnumErrorStringMemberInconsistentlyInitailized = function flowEnumErrorStringMemberInconsistentlyInitailized (pos, ref) {
    var enumName = ref.enumName;

    this.raise(pos, FlowErrors.EnumStringMemberInconsistentlyInitailized, enumName);
  };

  anonymous.prototype.flowEnumMemberInit = function flowEnumMemberInit () {
    var this$1 = this;

    var startPos = this.state.start;

    var endOfInit = function () { return this$1.match(types.comma) || this$1.match(types.braceR); };

    switch (this.state.type) {
      case types.num:
        {
          var literal = this.parseLiteral(this.state.value, "NumericLiteral");

          if (endOfInit()) {
            return {
              type: "number",
              pos: literal.start,
              value: literal
            };
          }

          return {
            type: "invalid",
            pos: startPos
          };
        }

      case types.string:
        {
          var literal$1 = this.parseLiteral(this.state.value, "StringLiteral");

          if (endOfInit()) {
            return {
              type: "string",
              pos: literal$1.start,
              value: literal$1
            };
          }

          return {
            type: "invalid",
            pos: startPos
          };
        }

      case types._true:
      case types._false:
        {
          var literal$2 = this.parseBooleanLiteral();

          if (endOfInit()) {
            return {
              type: "boolean",
              pos: literal$2.start,
              value: literal$2
            };
          }

          return {
            type: "invalid",
            pos: startPos
          };
        }

      default:
        return {
          type: "invalid",
          pos: startPos
        };
    }
  };

  anonymous.prototype.flowEnumMemberRaw = function flowEnumMemberRaw () {
    var pos = this.state.start;
    var id = this.parseIdentifier(true);
    var init = this.eat(types.eq) ? this.flowEnumMemberInit() : {
      type: "none",
      pos: pos
    };
    return {
      id: id,
      init: init
    };
  };

  anonymous.prototype.flowEnumCheckExplicitTypeMismatch = function flowEnumCheckExplicitTypeMismatch (pos, context, expectedType) {
    var explicitType = context.explicitType;

    if (explicitType === null) {
      return;
    }

    if (explicitType !== expectedType) {
      this.flowEnumErrorInvalidMemberInitializer(pos, context);
    }
  };

  anonymous.prototype.flowEnumMembers = function flowEnumMembers (ref) {
    var enumName = ref.enumName;
    var explicitType = ref.explicitType;

    var seenNames = new Set();
    var members = {
      booleanMembers: [],
      numberMembers: [],
      stringMembers: [],
      defaultedMembers: []
    };

    while (!this.match(types.braceR)) {
      var memberNode = this.startNode();
      var ref$1 = this.flowEnumMemberRaw();
      var id = ref$1.id;
      var init = ref$1.init;
      var memberName = id.name;

      if (memberName === "") {
        continue;
      }

      if (/^[a-z]/.test(memberName)) {
        this.flowEnumErrorInvalidMemberName(id.start, {
          enumName: enumName,
          memberName: memberName
        });
      }

      if (seenNames.has(memberName)) {
        this.flowEnumErrorDuplicateMemberName(id.start, {
          enumName: enumName,
          memberName: memberName
        });
      }

      seenNames.add(memberName);
      var context = {
        enumName: enumName,
        explicitType: explicitType,
        memberName: memberName
      };
      memberNode.id = id;

      switch (init.type) {
        case "boolean":
          {
            this.flowEnumCheckExplicitTypeMismatch(init.pos, context, "boolean");
            memberNode.init = init.value;
            members.booleanMembers.push(this.finishNode(memberNode, "EnumBooleanMember"));
            break;
          }

        case "number":
          {
            this.flowEnumCheckExplicitTypeMismatch(init.pos, context, "number");
            memberNode.init = init.value;
            members.numberMembers.push(this.finishNode(memberNode, "EnumNumberMember"));
            break;
          }

        case "string":
          {
            this.flowEnumCheckExplicitTypeMismatch(init.pos, context, "string");
            memberNode.init = init.value;
            members.stringMembers.push(this.finishNode(memberNode, "EnumStringMember"));
            break;
          }

        case "invalid":
          {
            throw this.flowEnumErrorInvalidMemberInitializer(init.pos, context);
          }

        case "none":
          {
            switch (explicitType) {
              case "boolean":
                this.flowEnumErrorBooleanMemberNotInitialized(init.pos, context);
                break;

              case "number":
                this.flowEnumErrorNumberMemberNotInitialized(init.pos, context);
                break;

              default:
                members.defaultedMembers.push(this.finishNode(memberNode, "EnumDefaultedMember"));
            }
          }
      }

      if (!this.match(types.braceR)) {
        this.expect(types.comma);
      }
    }

    return members;
  };

  anonymous.prototype.flowEnumStringMembers = function flowEnumStringMembers (initializedMembers, defaultedMembers, ref) {
    var enumName = ref.enumName;

    if (initializedMembers.length === 0) {
      return defaultedMembers;
    } else if (defaultedMembers.length === 0) {
      return initializedMembers;
    } else if (defaultedMembers.length > initializedMembers.length) {
      for (var _i = 0; _i < initializedMembers.length; _i++) {
        var member = initializedMembers[_i];
        this.flowEnumErrorStringMemberInconsistentlyInitailized(member.start, {
          enumName: enumName
        });
      }

      return defaultedMembers;
    } else {
      for (var _i2 = 0; _i2 < defaultedMembers.length; _i2++) {
        var member$1 = defaultedMembers[_i2];
        this.flowEnumErrorStringMemberInconsistentlyInitailized(member$1.start, {
          enumName: enumName
        });
      }

      return initializedMembers;
    }
  };

  anonymous.prototype.flowEnumParseExplicitType = function flowEnumParseExplicitType (ref) {
    var enumName = ref.enumName;

    if (this.eatContextual("of")) {
      if (!this.match(types.name)) {
        throw this.flowEnumErrorInvalidExplicitType(this.state.start, {
          enumName: enumName,
          suppliedType: null
        });
      }

      var ref$1 = this.state;
      var value = ref$1.value;
      this.next();

      if (value !== "boolean" && value !== "number" && value !== "string" && value !== "symbol") {
        this.flowEnumErrorInvalidExplicitType(this.state.start, {
          enumName: enumName,
          suppliedType: value
        });
      }

      return value;
    }

    return null;
  };

  anonymous.prototype.flowEnumBody = function flowEnumBody (node, ref) {
    var this$1 = this;
    var enumName = ref.enumName;
    var nameLoc = ref.nameLoc;

    var explicitType = this.flowEnumParseExplicitType({
      enumName: enumName
    });
    this.expect(types.braceL);
    var members = this.flowEnumMembers({
      enumName: enumName,
      explicitType: explicitType
    });

    switch (explicitType) {
      case "boolean":
        node.explicitType = true;
        node.members = members.booleanMembers;
        this.expect(types.braceR);
        return this.finishNode(node, "EnumBooleanBody");

      case "number":
        node.explicitType = true;
        node.members = members.numberMembers;
        this.expect(types.braceR);
        return this.finishNode(node, "EnumNumberBody");

      case "string":
        node.explicitType = true;
        node.members = this.flowEnumStringMembers(members.stringMembers, members.defaultedMembers, {
          enumName: enumName
        });
        this.expect(types.braceR);
        return this.finishNode(node, "EnumStringBody");

      case "symbol":
        node.members = members.defaultedMembers;
        this.expect(types.braceR);
        return this.finishNode(node, "EnumSymbolBody");

      default:
        {
          var empty = function () {
            node.members = [];
            this$1.expect(types.braceR);
            return this$1.finishNode(node, "EnumStringBody");
          };

          node.explicitType = false;
          var boolsLen = members.booleanMembers.length;
          var numsLen = members.numberMembers.length;
          var strsLen = members.stringMembers.length;
          var defaultedLen = members.defaultedMembers.length;

          if (!boolsLen && !numsLen && !strsLen && !defaultedLen) {
            return empty();
          } else if (!boolsLen && !numsLen) {
            node.members = this.flowEnumStringMembers(members.stringMembers, members.defaultedMembers, {
              enumName: enumName
            });
            this.expect(types.braceR);
            return this.finishNode(node, "EnumStringBody");
          } else if (!numsLen && !strsLen && boolsLen >= defaultedLen) {
            for (var _i3 = 0, _members$defaultedMem = members.defaultedMembers; _i3 < _members$defaultedMem.length; _i3++) {
              var member = _members$defaultedMem[_i3];
              this.flowEnumErrorBooleanMemberNotInitialized(member.start, {
                enumName: enumName,
                memberName: member.id.name
              });
            }

            node.members = members.booleanMembers;
            this.expect(types.braceR);
            return this.finishNode(node, "EnumBooleanBody");
          } else if (!boolsLen && !strsLen && numsLen >= defaultedLen) {
            for (var _i4 = 0, _members$defaultedMem2 = members.defaultedMembers; _i4 < _members$defaultedMem2.length; _i4++) {
              var member$1 = _members$defaultedMem2[_i4];
              this.flowEnumErrorNumberMemberNotInitialized(member$1.start, {
                enumName: enumName,
                memberName: member$1.id.name
              });
            }

            node.members = members.numberMembers;
            this.expect(types.braceR);
            return this.finishNode(node, "EnumNumberBody");
          } else {
            this.flowEnumErrorInconsistentMemberValues(nameLoc, {
              enumName: enumName
            });
            return empty();
          }
        }
    }
  };

  anonymous.prototype.flowParseEnumDeclaration = function flowParseEnumDeclaration (node) {
    var id = this.parseIdentifier();
    node.id = id;
    node.body = this.flowEnumBody(this.startNode(), {
      enumName: id.name,
      nameLoc: id.start
    });
    return this.finishNode(node, "EnumDeclaration");
  };

    return anonymous;
  }(superClass)); });

var entities = {
  quot: "\u0022",
  amp: "&",
  apos: "\u0027",
  lt: "<",
  gt: ">",
  nbsp: "\u00A0",
  iexcl: "\u00A1",
  cent: "\u00A2",
  pound: "\u00A3",
  curren: "\u00A4",
  yen: "\u00A5",
  brvbar: "\u00A6",
  sect: "\u00A7",
  uml: "\u00A8",
  copy: "\u00A9",
  ordf: "\u00AA",
  laquo: "\u00AB",
  not: "\u00AC",
  shy: "\u00AD",
  reg: "\u00AE",
  macr: "\u00AF",
  deg: "\u00B0",
  plusmn: "\u00B1",
  sup2: "\u00B2",
  sup3: "\u00B3",
  acute: "\u00B4",
  micro: "\u00B5",
  para: "\u00B6",
  middot: "\u00B7",
  cedil: "\u00B8",
  sup1: "\u00B9",
  ordm: "\u00BA",
  raquo: "\u00BB",
  frac14: "\u00BC",
  frac12: "\u00BD",
  frac34: "\u00BE",
  iquest: "\u00BF",
  Agrave: "\u00C0",
  Aacute: "\u00C1",
  Acirc: "\u00C2",
  Atilde: "\u00C3",
  Auml: "\u00C4",
  Aring: "\u00C5",
  AElig: "\u00C6",
  Ccedil: "\u00C7",
  Egrave: "\u00C8",
  Eacute: "\u00C9",
  Ecirc: "\u00CA",
  Euml: "\u00CB",
  Igrave: "\u00CC",
  Iacute: "\u00CD",
  Icirc: "\u00CE",
  Iuml: "\u00CF",
  ETH: "\u00D0",
  Ntilde: "\u00D1",
  Ograve: "\u00D2",
  Oacute: "\u00D3",
  Ocirc: "\u00D4",
  Otilde: "\u00D5",
  Ouml: "\u00D6",
  times: "\u00D7",
  Oslash: "\u00D8",
  Ugrave: "\u00D9",
  Uacute: "\u00DA",
  Ucirc: "\u00DB",
  Uuml: "\u00DC",
  Yacute: "\u00DD",
  THORN: "\u00DE",
  szlig: "\u00DF",
  agrave: "\u00E0",
  aacute: "\u00E1",
  acirc: "\u00E2",
  atilde: "\u00E3",
  auml: "\u00E4",
  aring: "\u00E5",
  aelig: "\u00E6",
  ccedil: "\u00E7",
  egrave: "\u00E8",
  eacute: "\u00E9",
  ecirc: "\u00EA",
  euml: "\u00EB",
  igrave: "\u00EC",
  iacute: "\u00ED",
  icirc: "\u00EE",
  iuml: "\u00EF",
  eth: "\u00F0",
  ntilde: "\u00F1",
  ograve: "\u00F2",
  oacute: "\u00F3",
  ocirc: "\u00F4",
  otilde: "\u00F5",
  ouml: "\u00F6",
  divide: "\u00F7",
  oslash: "\u00F8",
  ugrave: "\u00F9",
  uacute: "\u00FA",
  ucirc: "\u00FB",
  uuml: "\u00FC",
  yacute: "\u00FD",
  thorn: "\u00FE",
  yuml: "\u00FF",
  OElig: "\u0152",
  oelig: "\u0153",
  Scaron: "\u0160",
  scaron: "\u0161",
  Yuml: "\u0178",
  fnof: "\u0192",
  circ: "\u02C6",
  tilde: "\u02DC",
  Alpha: "\u0391",
  Beta: "\u0392",
  Gamma: "\u0393",
  Delta: "\u0394",
  Epsilon: "\u0395",
  Zeta: "\u0396",
  Eta: "\u0397",
  Theta: "\u0398",
  Iota: "\u0399",
  Kappa: "\u039A",
  Lambda: "\u039B",
  Mu: "\u039C",
  Nu: "\u039D",
  Xi: "\u039E",
  Omicron: "\u039F",
  Pi: "\u03A0",
  Rho: "\u03A1",
  Sigma: "\u03A3",
  Tau: "\u03A4",
  Upsilon: "\u03A5",
  Phi: "\u03A6",
  Chi: "\u03A7",
  Psi: "\u03A8",
  Omega: "\u03A9",
  alpha: "\u03B1",
  beta: "\u03B2",
  gamma: "\u03B3",
  delta: "\u03B4",
  epsilon: "\u03B5",
  zeta: "\u03B6",
  eta: "\u03B7",
  theta: "\u03B8",
  iota: "\u03B9",
  kappa: "\u03BA",
  lambda: "\u03BB",
  mu: "\u03BC",
  nu: "\u03BD",
  xi: "\u03BE",
  omicron: "\u03BF",
  pi: "\u03C0",
  rho: "\u03C1",
  sigmaf: "\u03C2",
  sigma: "\u03C3",
  tau: "\u03C4",
  upsilon: "\u03C5",
  phi: "\u03C6",
  chi: "\u03C7",
  psi: "\u03C8",
  omega: "\u03C9",
  thetasym: "\u03D1",
  upsih: "\u03D2",
  piv: "\u03D6",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  zwnj: "\u200C",
  zwj: "\u200D",
  lrm: "\u200E",
  rlm: "\u200F",
  ndash: "\u2013",
  mdash: "\u2014",
  lsquo: "\u2018",
  rsquo: "\u2019",
  sbquo: "\u201A",
  ldquo: "\u201C",
  rdquo: "\u201D",
  bdquo: "\u201E",
  dagger: "\u2020",
  Dagger: "\u2021",
  bull: "\u2022",
  hellip: "\u2026",
  permil: "\u2030",
  prime: "\u2032",
  Prime: "\u2033",
  lsaquo: "\u2039",
  rsaquo: "\u203A",
  oline: "\u203E",
  frasl: "\u2044",
  euro: "\u20AC",
  image: "\u2111",
  weierp: "\u2118",
  real: "\u211C",
  trade: "\u2122",
  alefsym: "\u2135",
  larr: "\u2190",
  uarr: "\u2191",
  rarr: "\u2192",
  darr: "\u2193",
  harr: "\u2194",
  crarr: "\u21B5",
  lArr: "\u21D0",
  uArr: "\u21D1",
  rArr: "\u21D2",
  dArr: "\u21D3",
  hArr: "\u21D4",
  forall: "\u2200",
  part: "\u2202",
  exist: "\u2203",
  empty: "\u2205",
  nabla: "\u2207",
  isin: "\u2208",
  notin: "\u2209",
  ni: "\u220B",
  prod: "\u220F",
  sum: "\u2211",
  minus: "\u2212",
  lowast: "\u2217",
  radic: "\u221A",
  prop: "\u221D",
  infin: "\u221E",
  ang: "\u2220",
  and: "\u2227",
  or: "\u2228",
  cap: "\u2229",
  cup: "\u222A",
  int: "\u222B",
  there4: "\u2234",
  sim: "\u223C",
  cong: "\u2245",
  asymp: "\u2248",
  ne: "\u2260",
  equiv: "\u2261",
  le: "\u2264",
  ge: "\u2265",
  sub: "\u2282",
  sup: "\u2283",
  nsub: "\u2284",
  sube: "\u2286",
  supe: "\u2287",
  oplus: "\u2295",
  otimes: "\u2297",
  perp: "\u22A5",
  sdot: "\u22C5",
  lceil: "\u2308",
  rceil: "\u2309",
  lfloor: "\u230A",
  rfloor: "\u230B",
  lang: "\u2329",
  rang: "\u232A",
  loz: "\u25CA",
  spades: "\u2660",
  clubs: "\u2663",
  hearts: "\u2665",
  diams: "\u2666"
};

var HEX_NUMBER = /^[\da-fA-F]+$/;
var DECIMAL_NUMBER = /^\d+$/;
var JsxErrors = Object.freeze({
  AttributeIsEmpty: "JSX attributes must only be assigned a non-empty expression",
  MissingClosingTagFragment: "Expected corresponding JSX closing tag for <>",
  MissingClosingTagElement: "Expected corresponding JSX closing tag for <%0>",
  UnsupportedJsxValue: "JSX value should be either an expression or a quoted JSX text",
  UnterminatedJsxContent: "Unterminated JSX contents",
  UnwrappedAdjacentJSXElements: "Adjacent JSX elements must be wrapped in an enclosing tag. Did you want a JSX fragment <>...</>?"
});
types$1.j_oTag = new TokContext("<tag", false);
types$1.j_cTag = new TokContext("</tag", false);
types$1.j_expr = new TokContext("<tag>...</tag>", true, true);
types.jsxName = new TokenType("jsxName");
types.jsxText = new TokenType("jsxText", {
  beforeExpr: true
});
types.jsxTagStart = new TokenType("jsxTagStart", {
  startsExpr: true
});
types.jsxTagEnd = new TokenType("jsxTagEnd");

types.jsxTagStart.updateContext = function () {
  this.state.context.push(types$1.j_expr);
  this.state.context.push(types$1.j_oTag);
  this.state.exprAllowed = false;
};

types.jsxTagEnd.updateContext = function (prevType) {
  var out = this.state.context.pop();

  if (out === types$1.j_oTag && prevType === types.slash || out === types$1.j_cTag) {
    this.state.context.pop();
    this.state.exprAllowed = this.curContext() === types$1.j_expr;
  } else {
    this.state.exprAllowed = true;
  }
};

function isFragment(object) {
  return object ? object.type === "JSXOpeningFragment" || object.type === "JSXClosingFragment" : false;
}

function getQualifiedJSXName(object) {
  if (object.type === "JSXIdentifier") {
    return object.name;
  }

  if (object.type === "JSXNamespacedName") {
    return object.namespace.name + ":" + object.name.name;
  }

  if (object.type === "JSXMemberExpression") {
    return getQualifiedJSXName(object.object) + "." + getQualifiedJSXName(object.property);
  }

  throw new Error("Node had unexpected type: " + object.type);
}

var jsx = (function (superClass) { return /*@__PURE__*/(function (superClass) {
    function anonymous () {
      superClass.apply(this, arguments);
    }

    if ( superClass ) anonymous.__proto__ = superClass;
    anonymous.prototype = Object.create( superClass && superClass.prototype );
    anonymous.prototype.constructor = anonymous;

    anonymous.prototype.jsxReadToken = function jsxReadToken () {
    var this$1 = this;

    var out = "";
    var chunkStart = this.state.pos;

    for (;;) {
      if (this.state.pos >= this.length) {
        throw this.raise(this.state.start, JsxErrors.UnterminatedJsxContent);
      }

      var ch = this.input.charCodeAt(this.state.pos);

      switch (ch) {
        case 60:
        case 123:
          if (this.state.pos === this.state.start) {
            if (ch === 60 && this.state.exprAllowed) {
              ++this.state.pos;
              return this.finishToken(types.jsxTagStart);
            }

            return superClass.prototype.getTokenFromCode.call(this$1, ch);
          }

          out += this.input.slice(chunkStart, this.state.pos);
          return this.finishToken(types.jsxText, out);

        case 38:
          out += this.input.slice(chunkStart, this.state.pos);
          out += this.jsxReadEntity();
          chunkStart = this.state.pos;
          break;

        default:
          if (isNewLine(ch)) {
            out += this.input.slice(chunkStart, this.state.pos);
            out += this.jsxReadNewLine(true);
            chunkStart = this.state.pos;
          } else {
            ++this.state.pos;
          }

      }
    }
  };

  anonymous.prototype.jsxReadNewLine = function jsxReadNewLine (normalizeCRLF) {
    var ch = this.input.charCodeAt(this.state.pos);
    var out;
    ++this.state.pos;

    if (ch === 13 && this.input.charCodeAt(this.state.pos) === 10) {
      ++this.state.pos;
      out = normalizeCRLF ? "\n" : "\r\n";
    } else {
      out = String.fromCharCode(ch);
    }

    ++this.state.curLine;
    this.state.lineStart = this.state.pos;
    return out;
  };

  anonymous.prototype.jsxReadString = function jsxReadString (quote) {
    var out = "";
    var chunkStart = ++this.state.pos;

    for (;;) {
      if (this.state.pos >= this.length) {
        throw this.raise(this.state.start, Errors.UnterminatedString);
      }

      var ch = this.input.charCodeAt(this.state.pos);
      if (ch === quote) { break; }

      if (ch === 38) {
        out += this.input.slice(chunkStart, this.state.pos);
        out += this.jsxReadEntity();
        chunkStart = this.state.pos;
      } else if (isNewLine(ch)) {
        out += this.input.slice(chunkStart, this.state.pos);
        out += this.jsxReadNewLine(false);
        chunkStart = this.state.pos;
      } else {
        ++this.state.pos;
      }
    }

    out += this.input.slice(chunkStart, this.state.pos++);
    return this.finishToken(types.string, out);
  };

  anonymous.prototype.jsxReadEntity = function jsxReadEntity () {
    var str = "";
    var count = 0;
    var entity;
    var ch = this.input[this.state.pos];
    var startPos = ++this.state.pos;

    while (this.state.pos < this.length && count++ < 10) {
      ch = this.input[this.state.pos++];

      if (ch === ";") {
        if (str[0] === "#") {
          if (str[1] === "x") {
            str = str.substr(2);

            if (HEX_NUMBER.test(str)) {
              entity = String.fromCodePoint(parseInt(str, 16));
            }
          } else {
            str = str.substr(1);

            if (DECIMAL_NUMBER.test(str)) {
              entity = String.fromCodePoint(parseInt(str, 10));
            }
          }
        } else {
          entity = entities[str];
        }

        break;
      }

      str += ch;
    }

    if (!entity) {
      this.state.pos = startPos;
      return "&";
    }

    return entity;
  };

  anonymous.prototype.jsxReadWord = function jsxReadWord () {
    var ch;
    var start = this.state.pos;

    do {
      ch = this.input.charCodeAt(++this.state.pos);
    } while (isIdentifierChar(ch) || ch === 45);

    return this.finishToken(types.jsxName, this.input.slice(start, this.state.pos));
  };

  anonymous.prototype.jsxParseIdentifier = function jsxParseIdentifier () {
    var node = this.startNode();

    if (this.match(types.jsxName)) {
      node.name = this.state.value;
    } else if (this.state.type.keyword) {
      node.name = this.state.type.keyword;
    } else {
      this.unexpected();
    }

    this.next();
    return this.finishNode(node, "JSXIdentifier");
  };

  anonymous.prototype.jsxParseNamespacedName = function jsxParseNamespacedName () {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var name = this.jsxParseIdentifier();
    if (!this.eat(types.colon)) { return name; }
    var node = this.startNodeAt(startPos, startLoc);
    node.namespace = name;
    node.name = this.jsxParseIdentifier();
    return this.finishNode(node, "JSXNamespacedName");
  };

  anonymous.prototype.jsxParseElementName = function jsxParseElementName () {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var node = this.jsxParseNamespacedName();

    if (node.type === "JSXNamespacedName") {
      return node;
    }

    while (this.eat(types.dot)) {
      var newNode = this.startNodeAt(startPos, startLoc);
      newNode.object = node;
      newNode.property = this.jsxParseIdentifier();
      node = this.finishNode(newNode, "JSXMemberExpression");
    }

    return node;
  };

  anonymous.prototype.jsxParseAttributeValue = function jsxParseAttributeValue () {
    var node;

    switch (this.state.type) {
      case types.braceL:
        node = this.startNode();
        this.next();
        node = this.jsxParseExpressionContainer(node);

        if (node.expression.type === "JSXEmptyExpression") {
          this.raise(node.start, JsxErrors.AttributeIsEmpty);
        }

        return node;

      case types.jsxTagStart:
      case types.string:
        return this.parseExprAtom();

      default:
        throw this.raise(this.state.start, JsxErrors.UnsupportedJsxValue);
    }
  };

  anonymous.prototype.jsxParseEmptyExpression = function jsxParseEmptyExpression () {
    var node = this.startNodeAt(this.state.lastTokEnd, this.state.lastTokEndLoc);
    return this.finishNodeAt(node, "JSXEmptyExpression", this.state.start, this.state.startLoc);
  };

  anonymous.prototype.jsxParseSpreadChild = function jsxParseSpreadChild (node) {
    this.next();
    node.expression = this.parseExpression();
    this.expect(types.braceR);
    return this.finishNode(node, "JSXSpreadChild");
  };

  anonymous.prototype.jsxParseExpressionContainer = function jsxParseExpressionContainer (node) {
    if (this.match(types.braceR)) {
      node.expression = this.jsxParseEmptyExpression();
    } else {
      node.expression = this.parseExpression();
    }

    this.expect(types.braceR);
    return this.finishNode(node, "JSXExpressionContainer");
  };

  anonymous.prototype.jsxParseAttribute = function jsxParseAttribute () {
    var node = this.startNode();

    if (this.eat(types.braceL)) {
      this.expect(types.ellipsis);
      node.argument = this.parseMaybeAssign();
      this.expect(types.braceR);
      return this.finishNode(node, "JSXSpreadAttribute");
    }

    node.name = this.jsxParseNamespacedName();
    node.value = this.eat(types.eq) ? this.jsxParseAttributeValue() : null;
    return this.finishNode(node, "JSXAttribute");
  };

  anonymous.prototype.jsxParseOpeningElementAt = function jsxParseOpeningElementAt (startPos, startLoc) {
    var node = this.startNodeAt(startPos, startLoc);

    if (this.match(types.jsxTagEnd)) {
      this.expect(types.jsxTagEnd);
      return this.finishNode(node, "JSXOpeningFragment");
    }

    node.name = this.jsxParseElementName();
    return this.jsxParseOpeningElementAfterName(node);
  };

  anonymous.prototype.jsxParseOpeningElementAfterName = function jsxParseOpeningElementAfterName (node) {
    var attributes = [];

    while (!this.match(types.slash) && !this.match(types.jsxTagEnd)) {
      attributes.push(this.jsxParseAttribute());
    }

    node.attributes = attributes;
    node.selfClosing = this.eat(types.slash);
    this.expect(types.jsxTagEnd);
    return this.finishNode(node, "JSXOpeningElement");
  };

  anonymous.prototype.jsxParseClosingElementAt = function jsxParseClosingElementAt (startPos, startLoc) {
    var node = this.startNodeAt(startPos, startLoc);

    if (this.match(types.jsxTagEnd)) {
      this.expect(types.jsxTagEnd);
      return this.finishNode(node, "JSXClosingFragment");
    }

    node.name = this.jsxParseElementName();
    this.expect(types.jsxTagEnd);
    return this.finishNode(node, "JSXClosingElement");
  };

  anonymous.prototype.jsxParseElementAt = function jsxParseElementAt (startPos, startLoc) {
    var node = this.startNodeAt(startPos, startLoc);
    var children = [];
    var openingElement = this.jsxParseOpeningElementAt(startPos, startLoc);
    var closingElement = null;

    if (!openingElement.selfClosing) {
      contents: for (;;) {
        switch (this.state.type) {
          case types.jsxTagStart:
            startPos = this.state.start;
            startLoc = this.state.startLoc;
            this.next();

            if (this.eat(types.slash)) {
              closingElement = this.jsxParseClosingElementAt(startPos, startLoc);
              break contents;
            }

            children.push(this.jsxParseElementAt(startPos, startLoc));
            break;

          case types.jsxText:
            children.push(this.parseExprAtom());
            break;

          case types.braceL:
            {
              var node$1 = this.startNode();
              this.next();

              if (this.match(types.ellipsis)) {
                children.push(this.jsxParseSpreadChild(node$1));
              } else {
                children.push(this.jsxParseExpressionContainer(node$1));
              }

              break;
            }

          default:
            throw this.unexpected();
        }
      }

      if (isFragment(openingElement) && !isFragment(closingElement)) {
        this.raise(closingElement.start, JsxErrors.MissingClosingTagFragment);
      } else if (!isFragment(openingElement) && isFragment(closingElement)) {
        this.raise(closingElement.start, JsxErrors.MissingClosingTagElement, getQualifiedJSXName(openingElement.name));
      } else if (!isFragment(openingElement) && !isFragment(closingElement)) {
        if (getQualifiedJSXName(closingElement.name) !== getQualifiedJSXName(openingElement.name)) {
          this.raise(closingElement.start, JsxErrors.MissingClosingTagElement, getQualifiedJSXName(openingElement.name));
        }
      }
    }

    if (isFragment(openingElement)) {
      node.openingFragment = openingElement;
      node.closingFragment = closingElement;
    } else {
      node.openingElement = openingElement;
      node.closingElement = closingElement;
    }

    node.children = children;

    if (this.isRelational("<")) {
      throw this.raise(this.state.start, JsxErrors.UnwrappedAdjacentJSXElements);
    }

    return isFragment(openingElement) ? this.finishNode(node, "JSXFragment") : this.finishNode(node, "JSXElement");
  };

  anonymous.prototype.jsxParseElement = function jsxParseElement () {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    this.next();
    return this.jsxParseElementAt(startPos, startLoc);
  };

  anonymous.prototype.parseExprAtom = function parseExprAtom (refExpressionErrors) {
    if (this.match(types.jsxText)) {
      return this.parseLiteral(this.state.value, "JSXText");
    } else if (this.match(types.jsxTagStart)) {
      return this.jsxParseElement();
    } else if (this.isRelational("<") && this.input.charCodeAt(this.state.pos) !== 33) {
      this.finishToken(types.jsxTagStart);
      return this.jsxParseElement();
    } else {
      return superClass.prototype.parseExprAtom.call(this, refExpressionErrors);
    }
  };

  anonymous.prototype.getTokenFromCode = function getTokenFromCode (code) {
    if (this.state.inPropertyName) { return superClass.prototype.getTokenFromCode.call(this, code); }
    var context = this.curContext();

    if (context === types$1.j_expr) {
      return this.jsxReadToken();
    }

    if (context === types$1.j_oTag || context === types$1.j_cTag) {
      if (isIdentifierStart(code)) {
        return this.jsxReadWord();
      }

      if (code === 62) {
        ++this.state.pos;
        return this.finishToken(types.jsxTagEnd);
      }

      if ((code === 34 || code === 39) && context === types$1.j_oTag) {
        return this.jsxReadString(code);
      }
    }

    if (code === 60 && this.state.exprAllowed && this.input.charCodeAt(this.state.pos + 1) !== 33) {
      ++this.state.pos;
      return this.finishToken(types.jsxTagStart);
    }

    return superClass.prototype.getTokenFromCode.call(this, code);
  };

  anonymous.prototype.updateContext = function updateContext (prevType) {
    if (this.match(types.braceL)) {
      var curContext = this.curContext();

      if (curContext === types$1.j_oTag) {
        this.state.context.push(types$1.braceExpression);
      } else if (curContext === types$1.j_expr) {
        this.state.context.push(types$1.templateQuasi);
      } else {
        superClass.prototype.updateContext.call(this, prevType);
      }

      this.state.exprAllowed = true;
    } else if (this.match(types.slash) && prevType === types.jsxTagStart) {
      this.state.context.length -= 2;
      this.state.context.push(types$1.j_cTag);
      this.state.exprAllowed = false;
    } else {
      return superClass.prototype.updateContext.call(this, prevType);
    }
  };

    return anonymous;
  }(superClass)); });

var Scope = function Scope(flags) {
  this.var = [];
  this.lexical = [];
  this.functions = [];
  this.flags = flags;
};
var ScopeHandler = function ScopeHandler(raise, inModule) {
  this.scopeStack = [];
  this.undefinedExports = new Map();
  this.undefinedPrivateNames = new Map();
  this.raise = raise;
  this.inModule = inModule;
};

var prototypeAccessors = { inFunction: { configurable: true },allowSuper: { configurable: true },allowDirectSuper: { configurable: true },inClass: { configurable: true },inNonArrowFunction: { configurable: true },treatFunctionsAsVar: { configurable: true } };

prototypeAccessors.inFunction.get = function () {
  return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0;
};

prototypeAccessors.allowSuper.get = function () {
  return (this.currentThisScope().flags & SCOPE_SUPER) > 0;
};

prototypeAccessors.allowDirectSuper.get = function () {
  return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0;
};

prototypeAccessors.inClass.get = function () {
  return (this.currentThisScope().flags & SCOPE_CLASS) > 0;
};

prototypeAccessors.inNonArrowFunction.get = function () {
  return (this.currentThisScope().flags & SCOPE_FUNCTION) > 0;
};

prototypeAccessors.treatFunctionsAsVar.get = function () {
  return this.treatFunctionsAsVarInScope(this.currentScope());
};

ScopeHandler.prototype.createScope = function createScope (flags) {
  return new Scope(flags);
};

ScopeHandler.prototype.enter = function enter (flags) {
  this.scopeStack.push(this.createScope(flags));
};

ScopeHandler.prototype.exit = function exit () {
  this.scopeStack.pop();
};

ScopeHandler.prototype.treatFunctionsAsVarInScope = function treatFunctionsAsVarInScope (scope) {
  return !!(scope.flags & SCOPE_FUNCTION || !this.inModule && scope.flags & SCOPE_PROGRAM);
};

ScopeHandler.prototype.declareName = function declareName (name, bindingType, pos) {
  var scope = this.currentScope();

  if (bindingType & BIND_SCOPE_LEXICAL || bindingType & BIND_SCOPE_FUNCTION) {
    this.checkRedeclarationInScope(scope, name, bindingType, pos);

    if (bindingType & BIND_SCOPE_FUNCTION) {
      scope.functions.push(name);
    } else {
      scope.lexical.push(name);
    }

    if (bindingType & BIND_SCOPE_LEXICAL) {
      this.maybeExportDefined(scope, name);
    }
  } else if (bindingType & BIND_SCOPE_VAR) {
    for (var i = this.scopeStack.length - 1; i >= 0; --i) {
      scope = this.scopeStack[i];
      this.checkRedeclarationInScope(scope, name, bindingType, pos);
      scope.var.push(name);
      this.maybeExportDefined(scope, name);
      if (scope.flags & SCOPE_VAR) { break; }
    }
  }

  if (this.inModule && scope.flags & SCOPE_PROGRAM) {
    this.undefinedExports.delete(name);
  }
};

ScopeHandler.prototype.maybeExportDefined = function maybeExportDefined (scope, name) {
  if (this.inModule && scope.flags & SCOPE_PROGRAM) {
    this.undefinedExports.delete(name);
  }
};

ScopeHandler.prototype.checkRedeclarationInScope = function checkRedeclarationInScope (scope, name, bindingType, pos) {
  if (this.isRedeclaredInScope(scope, name, bindingType)) {
    this.raise(pos, Errors.VarRedeclaration, name);
  }
};

ScopeHandler.prototype.isRedeclaredInScope = function isRedeclaredInScope (scope, name, bindingType) {
  if (!(bindingType & BIND_KIND_VALUE)) { return false; }

  if (bindingType & BIND_SCOPE_LEXICAL) {
    return scope.lexical.indexOf(name) > -1 || scope.functions.indexOf(name) > -1 || scope.var.indexOf(name) > -1;
  }

  if (bindingType & BIND_SCOPE_FUNCTION) {
    return scope.lexical.indexOf(name) > -1 || !this.treatFunctionsAsVarInScope(scope) && scope.var.indexOf(name) > -1;
  }

  return scope.lexical.indexOf(name) > -1 && !(scope.flags & SCOPE_SIMPLE_CATCH && scope.lexical[0] === name) || !this.treatFunctionsAsVarInScope(scope) && scope.functions.indexOf(name) > -1;
};

ScopeHandler.prototype.checkLocalExport = function checkLocalExport (id) {
  if (this.scopeStack[0].lexical.indexOf(id.name) === -1 && this.scopeStack[0].var.indexOf(id.name) === -1 && this.scopeStack[0].functions.indexOf(id.name) === -1) {
    this.undefinedExports.set(id.name, id.start);
  }
};

ScopeHandler.prototype.currentScope = function currentScope () {
  return this.scopeStack[this.scopeStack.length - 1];
};

ScopeHandler.prototype.currentVarScope = function currentVarScope () {
  for (var i = this.scopeStack.length - 1;; i--) {
    var scope = this.scopeStack[i];

    if (scope.flags & SCOPE_VAR) {
      return scope;
    }
  }
};

ScopeHandler.prototype.currentThisScope = function currentThisScope () {
  for (var i = this.scopeStack.length - 1;; i--) {
    var scope = this.scopeStack[i];

    if ((scope.flags & SCOPE_VAR || scope.flags & SCOPE_CLASS) && !(scope.flags & SCOPE_ARROW)) {
      return scope;
    }
  }
};

Object.defineProperties( ScopeHandler.prototype, prototypeAccessors );

var TypeScriptScope = /*@__PURE__*/(function (Scope) {
  function TypeScriptScope() {
    var args = [], len = arguments.length;
    while ( len-- ) args[ len ] = arguments[ len ];

    Scope.apply(this, args);
    this.types = [];
    this.enums = [];
    this.constEnums = [];
    this.classes = [];
    this.exportOnlyBindings = [];
  }

  if ( Scope ) TypeScriptScope.__proto__ = Scope;
  TypeScriptScope.prototype = Object.create( Scope && Scope.prototype );
  TypeScriptScope.prototype.constructor = TypeScriptScope;

  return TypeScriptScope;
}(Scope));

var TypeScriptScopeHandler = /*@__PURE__*/(function (ScopeHandler) {
  function TypeScriptScopeHandler () {
    ScopeHandler.apply(this, arguments);
  }

  if ( ScopeHandler ) TypeScriptScopeHandler.__proto__ = ScopeHandler;
  TypeScriptScopeHandler.prototype = Object.create( ScopeHandler && ScopeHandler.prototype );
  TypeScriptScopeHandler.prototype.constructor = TypeScriptScopeHandler;

  TypeScriptScopeHandler.prototype.createScope = function createScope (flags) {
    return new TypeScriptScope(flags);
  };

  TypeScriptScopeHandler.prototype.declareName = function declareName (name, bindingType, pos) {
    var scope = this.currentScope();

    if (bindingType & BIND_FLAGS_TS_EXPORT_ONLY) {
      this.maybeExportDefined(scope, name);
      scope.exportOnlyBindings.push(name);
      return;
    }

    ScopeHandler.prototype.declareName.apply(this, arguments);

    if (bindingType & BIND_KIND_TYPE) {
      if (!(bindingType & BIND_KIND_VALUE)) {
        this.checkRedeclarationInScope(scope, name, bindingType, pos);
        this.maybeExportDefined(scope, name);
      }

      scope.types.push(name);
    }

    if (bindingType & BIND_FLAGS_TS_ENUM) { scope.enums.push(name); }
    if (bindingType & BIND_FLAGS_TS_CONST_ENUM) { scope.constEnums.push(name); }
    if (bindingType & BIND_FLAGS_CLASS) { scope.classes.push(name); }
  };

  TypeScriptScopeHandler.prototype.isRedeclaredInScope = function isRedeclaredInScope (scope, name, bindingType) {
    if (scope.enums.indexOf(name) > -1) {
      if (bindingType & BIND_FLAGS_TS_ENUM) {
        var isConst = !!(bindingType & BIND_FLAGS_TS_CONST_ENUM);
        var wasConst = scope.constEnums.indexOf(name) > -1;
        return isConst !== wasConst;
      }

      return true;
    }

    if (bindingType & BIND_FLAGS_CLASS && scope.classes.indexOf(name) > -1) {
      if (scope.lexical.indexOf(name) > -1) {
        return !!(bindingType & BIND_KIND_VALUE);
      } else {
        return false;
      }
    }

    if (bindingType & BIND_KIND_TYPE && scope.types.indexOf(name) > -1) {
      return true;
    }

    return ScopeHandler.prototype.isRedeclaredInScope.apply(this, arguments);
  };

  TypeScriptScopeHandler.prototype.checkLocalExport = function checkLocalExport (id) {
    if (this.scopeStack[0].types.indexOf(id.name) === -1 && this.scopeStack[0].exportOnlyBindings.indexOf(id.name) === -1) {
      ScopeHandler.prototype.checkLocalExport.call(this, id);
    }
  };

  return TypeScriptScopeHandler;
}(ScopeHandler));

var PARAM = 0,
      PARAM_YIELD = 1,
      PARAM_AWAIT = 2,
      PARAM_RETURN = 4;
var ProductionParameterHandler = function ProductionParameterHandler() {
  this.stacks = [];
};

var prototypeAccessors$1 = { hasAwait: { configurable: true },hasYield: { configurable: true },hasReturn: { configurable: true } };

ProductionParameterHandler.prototype.enter = function enter (flags) {
  this.stacks.push(flags);
};

ProductionParameterHandler.prototype.exit = function exit () {
  this.stacks.pop();
};

ProductionParameterHandler.prototype.currentFlags = function currentFlags () {
  return this.stacks[this.stacks.length - 1];
};

prototypeAccessors$1.hasAwait.get = function () {
  return (this.currentFlags() & PARAM_AWAIT) > 0;
};

prototypeAccessors$1.hasYield.get = function () {
  return (this.currentFlags() & PARAM_YIELD) > 0;
};

prototypeAccessors$1.hasReturn.get = function () {
  return (this.currentFlags() & PARAM_RETURN) > 0;
};

Object.defineProperties( ProductionParameterHandler.prototype, prototypeAccessors$1 );
function functionFlags(isAsync, isGenerator) {
  return (isAsync ? PARAM_AWAIT : 0) | (isGenerator ? PARAM_YIELD : 0);
}

function nonNull(x) {
  if (x == null) {
    throw new Error(("Unexpected " + x + " value."));
  }

  return x;
}

function assert(x) {
  if (!x) {
    throw new Error("Assert fail");
  }
}

var TSErrors = Object.freeze({
  ClassMethodHasDeclare: "Class methods cannot have the 'declare' modifier",
  ClassMethodHasReadonly: "Class methods cannot have the 'readonly' modifier",
  DeclareClassFieldHasInitializer: "'declare' class fields cannot have an initializer",
  DuplicateModifier: "Duplicate modifier: '%0'",
  EmptyHeritageClauseType: "'%0' list cannot be empty.",
  IndexSignatureHasAbstract: "Index signatures cannot have the 'abstract' modifier",
  IndexSignatureHasAccessibility: "Index signatures cannot have an accessibility modifier ('%0')",
  IndexSignatureHasStatic: "Index signatures cannot have the 'static' modifier",
  OptionalTypeBeforeRequired: "A required element cannot follow an optional element.",
  PatternIsOptional: "A binding pattern parameter cannot be optional in an implementation signature.",
  PrivateElementHasAbstract: "Private elements cannot have the 'abstract' modifier.",
  PrivateElementHasAccessibility: "Private elements cannot have an accessibility modifier ('%0')",
  TemplateTypeHasSubstitution: "Template literal types cannot have any substitution",
  TypeAnnotationAfterAssign: "Type annotations must come before default assignments, e.g. instead of `age = 25: number` use `age: number = 25`",
  UnexpectedReadonly: "'readonly' type modifier is only permitted on array and tuple literal types.",
  UnexpectedTypeAnnotation: "Did not expect a type annotation here.",
  UnexpectedTypeCastInParameter: "Unexpected type cast in parameter position.",
  UnsupportedImportTypeArgument: "Argument in a type import must be a string literal",
  UnsupportedParameterPropertyKind: "A parameter property may not be declared using a binding pattern.",
  UnsupportedSignatureParameterKind: "Name in a signature must be an Identifier, ObjectPattern or ArrayPattern, instead got %0"
});

function keywordTypeFromName(value) {
  switch (value) {
    case "any":
      return "TSAnyKeyword";

    case "boolean":
      return "TSBooleanKeyword";

    case "bigint":
      return "TSBigIntKeyword";

    case "never":
      return "TSNeverKeyword";

    case "number":
      return "TSNumberKeyword";

    case "object":
      return "TSObjectKeyword";

    case "string":
      return "TSStringKeyword";

    case "symbol":
      return "TSSymbolKeyword";

    case "undefined":
      return "TSUndefinedKeyword";

    case "unknown":
      return "TSUnknownKeyword";

    default:
      return undefined;
  }
}

var typescript = (function (superClass) { return /*@__PURE__*/(function (superClass) {
    function anonymous () {
      superClass.apply(this, arguments);
    }

    if ( superClass ) anonymous.__proto__ = superClass;
    anonymous.prototype = Object.create( superClass && superClass.prototype );
    anonymous.prototype.constructor = anonymous;

    anonymous.prototype.getScopeHandler = function getScopeHandler () {
    return TypeScriptScopeHandler;
  };

  anonymous.prototype.tsIsIdentifier = function tsIsIdentifier () {
    return this.match(types.name);
  };

  anonymous.prototype.tsNextTokenCanFollowModifier = function tsNextTokenCanFollowModifier () {
    this.next();
    return !this.hasPrecedingLineBreak() && !this.match(types.parenL) && !this.match(types.parenR) && !this.match(types.colon) && !this.match(types.eq) && !this.match(types.question) && !this.match(types.bang);
  };

  anonymous.prototype.tsParseModifier = function tsParseModifier (allowedModifiers) {
    if (!this.match(types.name)) {
      return undefined;
    }

    var modifier = this.state.value;

    if (allowedModifiers.indexOf(modifier) !== -1 && this.tsTryParse(this.tsNextTokenCanFollowModifier.bind(this))) {
      return modifier;
    }

    return undefined;
  };

  anonymous.prototype.tsParseModifiers = function tsParseModifiers (modified, allowedModifiers) {
    for (;;) {
      var startPos = this.state.start;
      var modifier = this.tsParseModifier(allowedModifiers);
      if (!modifier) { break; }

      if (Object.hasOwnProperty.call(modified, modifier)) {
        this.raise(startPos, TSErrors.DuplicateModifier, modifier);
      }

      modified[modifier] = true;
    }
  };

  anonymous.prototype.tsIsListTerminator = function tsIsListTerminator (kind) {
    switch (kind) {
      case "EnumMembers":
      case "TypeMembers":
        return this.match(types.braceR);

      case "HeritageClauseElement":
        return this.match(types.braceL);

      case "TupleElementTypes":
        return this.match(types.bracketR);

      case "TypeParametersOrArguments":
        return this.isRelational(">");
    }

    throw new Error("Unreachable");
  };

  anonymous.prototype.tsParseList = function tsParseList (kind, parseElement) {
    var result = [];

    while (!this.tsIsListTerminator(kind)) {
      result.push(parseElement());
    }

    return result;
  };

  anonymous.prototype.tsParseDelimitedList = function tsParseDelimitedList (kind, parseElement) {
    return nonNull(this.tsParseDelimitedListWorker(kind, parseElement, true));
  };

  anonymous.prototype.tsParseDelimitedListWorker = function tsParseDelimitedListWorker (kind, parseElement, expectSuccess) {
    var result = [];

    for (;;) {
      if (this.tsIsListTerminator(kind)) {
        break;
      }

      var element = parseElement();

      if (element == null) {
        return undefined;
      }

      result.push(element);

      if (this.eat(types.comma)) {
        continue;
      }

      if (this.tsIsListTerminator(kind)) {
        break;
      }

      if (expectSuccess) {
        this.expect(types.comma);
      }

      return undefined;
    }

    return result;
  };

  anonymous.prototype.tsParseBracketedList = function tsParseBracketedList (kind, parseElement, bracket, skipFirstToken) {
    if (!skipFirstToken) {
      if (bracket) {
        this.expect(types.bracketL);
      } else {
        this.expectRelational("<");
      }
    }

    var result = this.tsParseDelimitedList(kind, parseElement);

    if (bracket) {
      this.expect(types.bracketR);
    } else {
      this.expectRelational(">");
    }

    return result;
  };

  anonymous.prototype.tsParseImportType = function tsParseImportType () {
    var node = this.startNode();
    this.expect(types._import);
    this.expect(types.parenL);

    if (!this.match(types.string)) {
      this.raise(this.state.start, TSErrors.UnsupportedImportTypeArgument);
    }

    node.argument = this.parseExprAtom();
    this.expect(types.parenR);

    if (this.eat(types.dot)) {
      node.qualifier = this.tsParseEntityName(true);
    }

    if (this.isRelational("<")) {
      node.typeParameters = this.tsParseTypeArguments();
    }

    return this.finishNode(node, "TSImportType");
  };

  anonymous.prototype.tsParseEntityName = function tsParseEntityName (allowReservedWords) {
    var entity = this.parseIdentifier();

    while (this.eat(types.dot)) {
      var node = this.startNodeAtNode(entity);
      node.left = entity;
      node.right = this.parseIdentifier(allowReservedWords);
      entity = this.finishNode(node, "TSQualifiedName");
    }

    return entity;
  };

  anonymous.prototype.tsParseTypeReference = function tsParseTypeReference () {
    var node = this.startNode();
    node.typeName = this.tsParseEntityName(false);

    if (!this.hasPrecedingLineBreak() && this.isRelational("<")) {
      node.typeParameters = this.tsParseTypeArguments();
    }

    return this.finishNode(node, "TSTypeReference");
  };

  anonymous.prototype.tsParseThisTypePredicate = function tsParseThisTypePredicate (lhs) {
    this.next();
    var node = this.startNodeAtNode(lhs);
    node.parameterName = lhs;
    node.typeAnnotation = this.tsParseTypeAnnotation(false);
    return this.finishNode(node, "TSTypePredicate");
  };

  anonymous.prototype.tsParseThisTypeNode = function tsParseThisTypeNode () {
    var node = this.startNode();
    this.next();
    return this.finishNode(node, "TSThisType");
  };

  anonymous.prototype.tsParseTypeQuery = function tsParseTypeQuery () {
    var node = this.startNode();
    this.expect(types._typeof);

    if (this.match(types._import)) {
      node.exprName = this.tsParseImportType();
    } else {
      node.exprName = this.tsParseEntityName(true);
    }

    return this.finishNode(node, "TSTypeQuery");
  };

  anonymous.prototype.tsParseTypeParameter = function tsParseTypeParameter () {
    var node = this.startNode();
    node.name = this.parseIdentifierName(node.start);
    node.constraint = this.tsEatThenParseType(types._extends);
    node.default = this.tsEatThenParseType(types.eq);
    return this.finishNode(node, "TSTypeParameter");
  };

  anonymous.prototype.tsTryParseTypeParameters = function tsTryParseTypeParameters () {
    if (this.isRelational("<")) {
      return this.tsParseTypeParameters();
    }
  };

  anonymous.prototype.tsParseTypeParameters = function tsParseTypeParameters () {
    var node = this.startNode();

    if (this.isRelational("<") || this.match(types.jsxTagStart)) {
      this.next();
    } else {
      this.unexpected();
    }

    node.params = this.tsParseBracketedList("TypeParametersOrArguments", this.tsParseTypeParameter.bind(this), false, true);
    return this.finishNode(node, "TSTypeParameterDeclaration");
  };

  anonymous.prototype.tsTryNextParseConstantContext = function tsTryNextParseConstantContext () {
    if (this.lookahead().type === types._const) {
      this.next();
      return this.tsParseTypeReference();
    }

    return null;
  };

  anonymous.prototype.tsFillSignature = function tsFillSignature (returnToken, signature) {
    var returnTokenRequired = returnToken === types.arrow;
    signature.typeParameters = this.tsTryParseTypeParameters();
    this.expect(types.parenL);
    signature.parameters = this.tsParseBindingListForSignature();

    if (returnTokenRequired) {
      signature.typeAnnotation = this.tsParseTypeOrTypePredicateAnnotation(returnToken);
    } else if (this.match(returnToken)) {
      signature.typeAnnotation = this.tsParseTypeOrTypePredicateAnnotation(returnToken);
    }
  };

  anonymous.prototype.tsParseBindingListForSignature = function tsParseBindingListForSignature () {
    var this$1 = this;

    return this.parseBindingList(types.parenR, 41).map(function (pattern) {
      if (pattern.type !== "Identifier" && pattern.type !== "RestElement" && pattern.type !== "ObjectPattern" && pattern.type !== "ArrayPattern") {
        this$1.raise(pattern.start, TSErrors.UnsupportedSignatureParameterKind, pattern.type);
      }

      return pattern;
    });
  };

  anonymous.prototype.tsParseTypeMemberSemicolon = function tsParseTypeMemberSemicolon () {
    if (!this.eat(types.comma)) {
      this.semicolon();
    }
  };

  anonymous.prototype.tsParseSignatureMember = function tsParseSignatureMember (kind, node) {
    this.tsFillSignature(types.colon, node);
    this.tsParseTypeMemberSemicolon();
    return this.finishNode(node, kind);
  };

  anonymous.prototype.tsIsUnambiguouslyIndexSignature = function tsIsUnambiguouslyIndexSignature () {
    this.next();
    return this.eat(types.name) && this.match(types.colon);
  };

  anonymous.prototype.tsTryParseIndexSignature = function tsTryParseIndexSignature (node) {
    if (!(this.match(types.bracketL) && this.tsLookAhead(this.tsIsUnambiguouslyIndexSignature.bind(this)))) {
      return undefined;
    }

    this.expect(types.bracketL);
    var id = this.parseIdentifier();
    id.typeAnnotation = this.tsParseTypeAnnotation();
    this.resetEndLocation(id);
    this.expect(types.bracketR);
    node.parameters = [id];
    var type = this.tsTryParseTypeAnnotation();
    if (type) { node.typeAnnotation = type; }
    this.tsParseTypeMemberSemicolon();
    return this.finishNode(node, "TSIndexSignature");
  };

  anonymous.prototype.tsParsePropertyOrMethodSignature = function tsParsePropertyOrMethodSignature (node, readonly) {
    if (this.eat(types.question)) { node.optional = true; }
    var nodeAny = node;

    if (!readonly && (this.match(types.parenL) || this.isRelational("<"))) {
      var method = nodeAny;
      this.tsFillSignature(types.colon, method);
      this.tsParseTypeMemberSemicolon();
      return this.finishNode(method, "TSMethodSignature");
    } else {
      var property = nodeAny;
      if (readonly) { property.readonly = true; }
      var type = this.tsTryParseTypeAnnotation();
      if (type) { property.typeAnnotation = type; }
      this.tsParseTypeMemberSemicolon();
      return this.finishNode(property, "TSPropertySignature");
    }
  };

  anonymous.prototype.tsParseTypeMember = function tsParseTypeMember () {
    var node = this.startNode();

    if (this.match(types.parenL) || this.isRelational("<")) {
      return this.tsParseSignatureMember("TSCallSignatureDeclaration", node);
    }

    if (this.match(types._new)) {
      var id = this.startNode();
      this.next();

      if (this.match(types.parenL) || this.isRelational("<")) {
        return this.tsParseSignatureMember("TSConstructSignatureDeclaration", node);
      } else {
        node.key = this.createIdentifier(id, "new");
        return this.tsParsePropertyOrMethodSignature(node, false);
      }
    }

    var readonly = !!this.tsParseModifier(["readonly"]);
    var idx = this.tsTryParseIndexSignature(node);

    if (idx) {
      if (readonly) { node.readonly = true; }
      return idx;
    }

    this.parsePropertyName(node, false);
    return this.tsParsePropertyOrMethodSignature(node, readonly);
  };

  anonymous.prototype.tsParseTypeLiteral = function tsParseTypeLiteral () {
    var node = this.startNode();
    node.members = this.tsParseObjectTypeMembers();
    return this.finishNode(node, "TSTypeLiteral");
  };

  anonymous.prototype.tsParseObjectTypeMembers = function tsParseObjectTypeMembers () {
    this.expect(types.braceL);
    var members = this.tsParseList("TypeMembers", this.tsParseTypeMember.bind(this));
    this.expect(types.braceR);
    return members;
  };

  anonymous.prototype.tsIsStartOfMappedType = function tsIsStartOfMappedType () {
    this.next();

    if (this.eat(types.plusMin)) {
      return this.isContextual("readonly");
    }

    if (this.isContextual("readonly")) {
      this.next();
    }

    if (!this.match(types.bracketL)) {
      return false;
    }

    this.next();

    if (!this.tsIsIdentifier()) {
      return false;
    }

    this.next();
    return this.match(types._in);
  };

  anonymous.prototype.tsParseMappedTypeParameter = function tsParseMappedTypeParameter () {
    var node = this.startNode();
    node.name = this.parseIdentifierName(node.start);
    node.constraint = this.tsExpectThenParseType(types._in);
    return this.finishNode(node, "TSTypeParameter");
  };

  anonymous.prototype.tsParseMappedType = function tsParseMappedType () {
    var node = this.startNode();
    this.expect(types.braceL);

    if (this.match(types.plusMin)) {
      node.readonly = this.state.value;
      this.next();
      this.expectContextual("readonly");
    } else if (this.eatContextual("readonly")) {
      node.readonly = true;
    }

    this.expect(types.bracketL);
    node.typeParameter = this.tsParseMappedTypeParameter();
    this.expect(types.bracketR);

    if (this.match(types.plusMin)) {
      node.optional = this.state.value;
      this.next();
      this.expect(types.question);
    } else if (this.eat(types.question)) {
      node.optional = true;
    }

    node.typeAnnotation = this.tsTryParseType();
    this.semicolon();
    this.expect(types.braceR);
    return this.finishNode(node, "TSMappedType");
  };

  anonymous.prototype.tsParseTupleType = function tsParseTupleType () {
    var this$1 = this;

    var node = this.startNode();
    node.elementTypes = this.tsParseBracketedList("TupleElementTypes", this.tsParseTupleElementType.bind(this), true, false);
    var seenOptionalElement = false;
    node.elementTypes.forEach(function (elementNode) {
      if (elementNode.type === "TSOptionalType") {
        seenOptionalElement = true;
      } else if (seenOptionalElement && elementNode.type !== "TSRestType") {
        this$1.raise(elementNode.start, TSErrors.OptionalTypeBeforeRequired);
      }
    });
    return this.finishNode(node, "TSTupleType");
  };

  anonymous.prototype.tsParseTupleElementType = function tsParseTupleElementType () {
    if (this.match(types.ellipsis)) {
      var restNode = this.startNode();
      this.next();
      restNode.typeAnnotation = this.tsParseType();

      if (this.match(types.comma) && this.lookaheadCharCode() !== 93) {
        this.raiseRestNotLast(this.state.start);
      }

      return this.finishNode(restNode, "TSRestType");
    }

    var type = this.tsParseType();

    if (this.eat(types.question)) {
      var optionalTypeNode = this.startNodeAtNode(type);
      optionalTypeNode.typeAnnotation = type;
      return this.finishNode(optionalTypeNode, "TSOptionalType");
    }

    return type;
  };

  anonymous.prototype.tsParseParenthesizedType = function tsParseParenthesizedType () {
    var node = this.startNode();
    this.expect(types.parenL);
    node.typeAnnotation = this.tsParseType();
    this.expect(types.parenR);
    return this.finishNode(node, "TSParenthesizedType");
  };

  anonymous.prototype.tsParseFunctionOrConstructorType = function tsParseFunctionOrConstructorType (type) {
    var node = this.startNode();

    if (type === "TSConstructorType") {
      this.expect(types._new);
    }

    this.tsFillSignature(types.arrow, node);
    return this.finishNode(node, type);
  };

  anonymous.prototype.tsParseLiteralTypeNode = function tsParseLiteralTypeNode () {
    var this$1 = this;

    var node = this.startNode();

    node.literal = (function () {
      switch (this$1.state.type) {
        case types.num:
        case types.string:
        case types._true:
        case types._false:
          return this$1.parseExprAtom();

        default:
          throw this$1.unexpected();
      }
    })();

    return this.finishNode(node, "TSLiteralType");
  };

  anonymous.prototype.tsParseTemplateLiteralType = function tsParseTemplateLiteralType () {
    var node = this.startNode();
    var templateNode = this.parseTemplate(false);

    if (templateNode.expressions.length > 0) {
      this.raise(templateNode.expressions[0].start, TSErrors.TemplateTypeHasSubstitution);
    }

    node.literal = templateNode;
    return this.finishNode(node, "TSLiteralType");
  };

  anonymous.prototype.tsParseThisTypeOrThisTypePredicate = function tsParseThisTypeOrThisTypePredicate () {
    var thisKeyword = this.tsParseThisTypeNode();

    if (this.isContextual("is") && !this.hasPrecedingLineBreak()) {
      return this.tsParseThisTypePredicate(thisKeyword);
    } else {
      return thisKeyword;
    }
  };

  anonymous.prototype.tsParseNonArrayType = function tsParseNonArrayType () {
    switch (this.state.type) {
      case types.name:
      case types._void:
      case types._null:
        {
          var type = this.match(types._void) ? "TSVoidKeyword" : this.match(types._null) ? "TSNullKeyword" : keywordTypeFromName(this.state.value);

          if (type !== undefined && this.lookaheadCharCode() !== 46) {
            var node = this.startNode();
            this.next();
            return this.finishNode(node, type);
          }

          return this.tsParseTypeReference();
        }

      case types.string:
      case types.num:
      case types._true:
      case types._false:
        return this.tsParseLiteralTypeNode();

      case types.plusMin:
        if (this.state.value === "-") {
          var node$1 = this.startNode();

          if (this.lookahead().type !== types.num) {
            throw this.unexpected();
          }

          node$1.literal = this.parseMaybeUnary();
          return this.finishNode(node$1, "TSLiteralType");
        }

        break;

      case types._this:
        return this.tsParseThisTypeOrThisTypePredicate();

      case types._typeof:
        return this.tsParseTypeQuery();

      case types._import:
        return this.tsParseImportType();

      case types.braceL:
        return this.tsLookAhead(this.tsIsStartOfMappedType.bind(this)) ? this.tsParseMappedType() : this.tsParseTypeLiteral();

      case types.bracketL:
        return this.tsParseTupleType();

      case types.parenL:
        return this.tsParseParenthesizedType();

      case types.backQuote:
        return this.tsParseTemplateLiteralType();
    }

    throw this.unexpected();
  };

  anonymous.prototype.tsParseArrayTypeOrHigher = function tsParseArrayTypeOrHigher () {
    var type = this.tsParseNonArrayType();

    while (!this.hasPrecedingLineBreak() && this.eat(types.bracketL)) {
      if (this.match(types.bracketR)) {
        var node = this.startNodeAtNode(type);
        node.elementType = type;
        this.expect(types.bracketR);
        type = this.finishNode(node, "TSArrayType");
      } else {
        var node$1 = this.startNodeAtNode(type);
        node$1.objectType = type;
        node$1.indexType = this.tsParseType();
        this.expect(types.bracketR);
        type = this.finishNode(node$1, "TSIndexedAccessType");
      }
    }

    return type;
  };

  anonymous.prototype.tsParseTypeOperator = function tsParseTypeOperator (operator) {
    var node = this.startNode();
    this.expectContextual(operator);
    node.operator = operator;
    node.typeAnnotation = this.tsParseTypeOperatorOrHigher();

    if (operator === "readonly") {
      this.tsCheckTypeAnnotationForReadOnly(node);
    }

    return this.finishNode(node, "TSTypeOperator");
  };

  anonymous.prototype.tsCheckTypeAnnotationForReadOnly = function tsCheckTypeAnnotationForReadOnly (node) {
    switch (node.typeAnnotation.type) {
      case "TSTupleType":
      case "TSArrayType":
        return;

      default:
        this.raise(node.start, TSErrors.UnexpectedReadonly);
    }
  };

  anonymous.prototype.tsParseInferType = function tsParseInferType () {
    var node = this.startNode();
    this.expectContextual("infer");
    var typeParameter = this.startNode();
    typeParameter.name = this.parseIdentifierName(typeParameter.start);
    node.typeParameter = this.finishNode(typeParameter, "TSTypeParameter");
    return this.finishNode(node, "TSInferType");
  };

  anonymous.prototype.tsParseTypeOperatorOrHigher = function tsParseTypeOperatorOrHigher () {
    var this$1 = this;

    var operator = ["keyof", "unique", "readonly"].find(function (kw) { return this$1.isContextual(kw); });
    return operator ? this.tsParseTypeOperator(operator) : this.isContextual("infer") ? this.tsParseInferType() : this.tsParseArrayTypeOrHigher();
  };

  anonymous.prototype.tsParseUnionOrIntersectionType = function tsParseUnionOrIntersectionType (kind, parseConstituentType, operator) {
    this.eat(operator);
    var type = parseConstituentType();

    if (this.match(operator)) {
      var types = [type];

      while (this.eat(operator)) {
        types.push(parseConstituentType());
      }

      var node = this.startNodeAtNode(type);
      node.types = types;
      type = this.finishNode(node, kind);
    }

    return type;
  };

  anonymous.prototype.tsParseIntersectionTypeOrHigher = function tsParseIntersectionTypeOrHigher () {
    return this.tsParseUnionOrIntersectionType("TSIntersectionType", this.tsParseTypeOperatorOrHigher.bind(this), types.bitwiseAND);
  };

  anonymous.prototype.tsParseUnionTypeOrHigher = function tsParseUnionTypeOrHigher () {
    return this.tsParseUnionOrIntersectionType("TSUnionType", this.tsParseIntersectionTypeOrHigher.bind(this), types.bitwiseOR);
  };

  anonymous.prototype.tsIsStartOfFunctionType = function tsIsStartOfFunctionType () {
    if (this.isRelational("<")) {
      return true;
    }

    return this.match(types.parenL) && this.tsLookAhead(this.tsIsUnambiguouslyStartOfFunctionType.bind(this));
  };

  anonymous.prototype.tsSkipParameterStart = function tsSkipParameterStart () {
    if (this.match(types.name) || this.match(types._this)) {
      this.next();
      return true;
    }

    if (this.match(types.braceL)) {
      var braceStackCounter = 1;
      this.next();

      while (braceStackCounter > 0) {
        if (this.match(types.braceL)) {
          ++braceStackCounter;
        } else if (this.match(types.braceR)) {
          --braceStackCounter;
        }

        this.next();
      }

      return true;
    }

    if (this.match(types.bracketL)) {
      var braceStackCounter$1 = 1;
      this.next();

      while (braceStackCounter$1 > 0) {
        if (this.match(types.bracketL)) {
          ++braceStackCounter$1;
        } else if (this.match(types.bracketR)) {
          --braceStackCounter$1;
        }

        this.next();
      }

      return true;
    }

    return false;
  };

  anonymous.prototype.tsIsUnambiguouslyStartOfFunctionType = function tsIsUnambiguouslyStartOfFunctionType () {
    this.next();

    if (this.match(types.parenR) || this.match(types.ellipsis)) {
      return true;
    }

    if (this.tsSkipParameterStart()) {
      if (this.match(types.colon) || this.match(types.comma) || this.match(types.question) || this.match(types.eq)) {
        return true;
      }

      if (this.match(types.parenR)) {
        this.next();

        if (this.match(types.arrow)) {
          return true;
        }
      }
    }

    return false;
  };

  anonymous.prototype.tsParseTypeOrTypePredicateAnnotation = function tsParseTypeOrTypePredicateAnnotation (returnToken) {
    var this$1 = this;

    return this.tsInType(function () {
      var t = this$1.startNode();
      this$1.expect(returnToken);
      var asserts = this$1.tsTryParse(this$1.tsParseTypePredicateAsserts.bind(this$1));

      if (asserts && this$1.match(types._this)) {
        var thisTypePredicate = this$1.tsParseThisTypeOrThisTypePredicate();

        if (thisTypePredicate.type === "TSThisType") {
          var node$1 = this$1.startNodeAtNode(t);
          node$1.parameterName = thisTypePredicate;
          node$1.asserts = true;
          thisTypePredicate = this$1.finishNode(node$1, "TSTypePredicate");
        } else {
          thisTypePredicate.asserts = true;
        }

        t.typeAnnotation = thisTypePredicate;
        return this$1.finishNode(t, "TSTypeAnnotation");
      }

      var typePredicateVariable = this$1.tsIsIdentifier() && this$1.tsTryParse(this$1.tsParseTypePredicatePrefix.bind(this$1));

      if (!typePredicateVariable) {
        if (!asserts) {
          return this$1.tsParseTypeAnnotation(false, t);
        }

        var node$2 = this$1.startNodeAtNode(t);
        node$2.parameterName = this$1.parseIdentifier();
        node$2.asserts = asserts;
        t.typeAnnotation = this$1.finishNode(node$2, "TSTypePredicate");
        return this$1.finishNode(t, "TSTypeAnnotation");
      }

      var type = this$1.tsParseTypeAnnotation(false);
      var node = this$1.startNodeAtNode(t);
      node.parameterName = typePredicateVariable;
      node.typeAnnotation = type;
      node.asserts = asserts;
      t.typeAnnotation = this$1.finishNode(node, "TSTypePredicate");
      return this$1.finishNode(t, "TSTypeAnnotation");
    });
  };

  anonymous.prototype.tsTryParseTypeOrTypePredicateAnnotation = function tsTryParseTypeOrTypePredicateAnnotation () {
    return this.match(types.colon) ? this.tsParseTypeOrTypePredicateAnnotation(types.colon) : undefined;
  };

  anonymous.prototype.tsTryParseTypeAnnotation = function tsTryParseTypeAnnotation () {
    return this.match(types.colon) ? this.tsParseTypeAnnotation() : undefined;
  };

  anonymous.prototype.tsTryParseType = function tsTryParseType () {
    return this.tsEatThenParseType(types.colon);
  };

  anonymous.prototype.tsParseTypePredicatePrefix = function tsParseTypePredicatePrefix () {
    var id = this.parseIdentifier();

    if (this.isContextual("is") && !this.hasPrecedingLineBreak()) {
      this.next();
      return id;
    }
  };

  anonymous.prototype.tsParseTypePredicateAsserts = function tsParseTypePredicateAsserts () {
    if (!this.match(types.name) || this.state.value !== "asserts" || this.hasPrecedingLineBreak()) {
      return false;
    }

    var containsEsc = this.state.containsEsc;
    this.next();

    if (!this.match(types.name) && !this.match(types._this)) {
      return false;
    }

    if (containsEsc) {
      this.raise(this.state.lastTokStart, Errors.InvalidEscapedReservedWord, "asserts");
    }

    return true;
  };

  anonymous.prototype.tsParseTypeAnnotation = function tsParseTypeAnnotation (eatColon, t) {
    var this$1 = this;
    if ( eatColon === void 0 ) eatColon = true;
    if ( t === void 0 ) t = this$1.startNode();

    this.tsInType(function () {
      if (eatColon) { this$1.expect(types.colon); }
      t.typeAnnotation = this$1.tsParseType();
    });
    return this.finishNode(t, "TSTypeAnnotation");
  };

  anonymous.prototype.tsParseType = function tsParseType () {
    assert(this.state.inType);
    var type = this.tsParseNonConditionalType();

    if (this.hasPrecedingLineBreak() || !this.eat(types._extends)) {
      return type;
    }

    var node = this.startNodeAtNode(type);
    node.checkType = type;
    node.extendsType = this.tsParseNonConditionalType();
    this.expect(types.question);
    node.trueType = this.tsParseType();
    this.expect(types.colon);
    node.falseType = this.tsParseType();
    return this.finishNode(node, "TSConditionalType");
  };

  anonymous.prototype.tsParseNonConditionalType = function tsParseNonConditionalType () {
    if (this.tsIsStartOfFunctionType()) {
      return this.tsParseFunctionOrConstructorType("TSFunctionType");
    }

    if (this.match(types._new)) {
      return this.tsParseFunctionOrConstructorType("TSConstructorType");
    }

    return this.tsParseUnionTypeOrHigher();
  };

  anonymous.prototype.tsParseTypeAssertion = function tsParseTypeAssertion () {
    var node = this.startNode();

    var _const = this.tsTryNextParseConstantContext();

    node.typeAnnotation = _const || this.tsNextThenParseType();
    this.expectRelational(">");
    node.expression = this.parseMaybeUnary();
    return this.finishNode(node, "TSTypeAssertion");
  };

  anonymous.prototype.tsParseHeritageClause = function tsParseHeritageClause (descriptor) {
    var originalStart = this.state.start;
    var delimitedList = this.tsParseDelimitedList("HeritageClauseElement", this.tsParseExpressionWithTypeArguments.bind(this));

    if (!delimitedList.length) {
      this.raise(originalStart, TSErrors.EmptyHeritageClauseType, descriptor);
    }

    return delimitedList;
  };

  anonymous.prototype.tsParseExpressionWithTypeArguments = function tsParseExpressionWithTypeArguments () {
    var node = this.startNode();
    node.expression = this.tsParseEntityName(false);

    if (this.isRelational("<")) {
      node.typeParameters = this.tsParseTypeArguments();
    }

    return this.finishNode(node, "TSExpressionWithTypeArguments");
  };

  anonymous.prototype.tsParseInterfaceDeclaration = function tsParseInterfaceDeclaration (node) {
    node.id = this.parseIdentifier();
    this.checkLVal(node.id, BIND_TS_INTERFACE, undefined, "typescript interface declaration");
    node.typeParameters = this.tsTryParseTypeParameters();

    if (this.eat(types._extends)) {
      node.extends = this.tsParseHeritageClause("extends");
    }

    var body = this.startNode();
    body.body = this.tsInType(this.tsParseObjectTypeMembers.bind(this));
    node.body = this.finishNode(body, "TSInterfaceBody");
    return this.finishNode(node, "TSInterfaceDeclaration");
  };

  anonymous.prototype.tsParseTypeAliasDeclaration = function tsParseTypeAliasDeclaration (node) {
    node.id = this.parseIdentifier();
    this.checkLVal(node.id, BIND_TS_TYPE, undefined, "typescript type alias");
    node.typeParameters = this.tsTryParseTypeParameters();
    node.typeAnnotation = this.tsExpectThenParseType(types.eq);
    this.semicolon();
    return this.finishNode(node, "TSTypeAliasDeclaration");
  };

  anonymous.prototype.tsInNoContext = function tsInNoContext (cb) {
    var oldContext = this.state.context;
    this.state.context = [oldContext[0]];

    try {
      return cb();
    } finally {
      this.state.context = oldContext;
    }
  };

  anonymous.prototype.tsInType = function tsInType (cb) {
    var oldInType = this.state.inType;
    this.state.inType = true;

    try {
      return cb();
    } finally {
      this.state.inType = oldInType;
    }
  };

  anonymous.prototype.tsEatThenParseType = function tsEatThenParseType (token) {
    return !this.match(token) ? undefined : this.tsNextThenParseType();
  };

  anonymous.prototype.tsExpectThenParseType = function tsExpectThenParseType (token) {
    var this$1 = this;

    return this.tsDoThenParseType(function () { return this$1.expect(token); });
  };

  anonymous.prototype.tsNextThenParseType = function tsNextThenParseType () {
    var this$1 = this;

    return this.tsDoThenParseType(function () { return this$1.next(); });
  };

  anonymous.prototype.tsDoThenParseType = function tsDoThenParseType (cb) {
    var this$1 = this;

    return this.tsInType(function () {
      cb();
      return this$1.tsParseType();
    });
  };

  anonymous.prototype.tsParseEnumMember = function tsParseEnumMember () {
    var node = this.startNode();
    node.id = this.match(types.string) ? this.parseExprAtom() : this.parseIdentifier(true);

    if (this.eat(types.eq)) {
      node.initializer = this.parseMaybeAssign();
    }

    return this.finishNode(node, "TSEnumMember");
  };

  anonymous.prototype.tsParseEnumDeclaration = function tsParseEnumDeclaration (node, isConst) {
    if (isConst) { node.const = true; }
    node.id = this.parseIdentifier();
    this.checkLVal(node.id, isConst ? BIND_TS_CONST_ENUM : BIND_TS_ENUM, undefined, "typescript enum declaration");
    this.expect(types.braceL);
    node.members = this.tsParseDelimitedList("EnumMembers", this.tsParseEnumMember.bind(this));
    this.expect(types.braceR);
    return this.finishNode(node, "TSEnumDeclaration");
  };

  anonymous.prototype.tsParseModuleBlock = function tsParseModuleBlock () {
    var node = this.startNode();
    this.scope.enter(SCOPE_OTHER);
    this.expect(types.braceL);
    this.parseBlockOrModuleBlockBody(node.body = [], undefined, true, types.braceR);
    this.scope.exit();
    return this.finishNode(node, "TSModuleBlock");
  };

  anonymous.prototype.tsParseModuleOrNamespaceDeclaration = function tsParseModuleOrNamespaceDeclaration (node, nested) {
    if ( nested === void 0 ) nested = false;

    node.id = this.parseIdentifier();

    if (!nested) {
      this.checkLVal(node.id, BIND_TS_NAMESPACE, null, "module or namespace declaration");
    }

    if (this.eat(types.dot)) {
      var inner = this.startNode();
      this.tsParseModuleOrNamespaceDeclaration(inner, true);
      node.body = inner;
    } else {
      this.scope.enter(SCOPE_TS_MODULE);
      this.prodParam.enter(PARAM);
      node.body = this.tsParseModuleBlock();
      this.prodParam.exit();
      this.scope.exit();
    }

    return this.finishNode(node, "TSModuleDeclaration");
  };

  anonymous.prototype.tsParseAmbientExternalModuleDeclaration = function tsParseAmbientExternalModuleDeclaration (node) {
    if (this.isContextual("global")) {
      node.global = true;
      node.id = this.parseIdentifier();
    } else if (this.match(types.string)) {
      node.id = this.parseExprAtom();
    } else {
      this.unexpected();
    }

    if (this.match(types.braceL)) {
      this.scope.enter(SCOPE_TS_MODULE);
      this.prodParam.enter(PARAM);
      node.body = this.tsParseModuleBlock();
      this.prodParam.exit();
      this.scope.exit();
    } else {
      this.semicolon();
    }

    return this.finishNode(node, "TSModuleDeclaration");
  };

  anonymous.prototype.tsParseImportEqualsDeclaration = function tsParseImportEqualsDeclaration (node, isExport) {
    node.isExport = isExport || false;
    node.id = this.parseIdentifier();
    this.checkLVal(node.id, BIND_LEXICAL, undefined, "import equals declaration");
    this.expect(types.eq);
    node.moduleReference = this.tsParseModuleReference();
    this.semicolon();
    return this.finishNode(node, "TSImportEqualsDeclaration");
  };

  anonymous.prototype.tsIsExternalModuleReference = function tsIsExternalModuleReference () {
    return this.isContextual("require") && this.lookaheadCharCode() === 40;
  };

  anonymous.prototype.tsParseModuleReference = function tsParseModuleReference () {
    return this.tsIsExternalModuleReference() ? this.tsParseExternalModuleReference() : this.tsParseEntityName(false);
  };

  anonymous.prototype.tsParseExternalModuleReference = function tsParseExternalModuleReference () {
    var node = this.startNode();
    this.expectContextual("require");
    this.expect(types.parenL);

    if (!this.match(types.string)) {
      throw this.unexpected();
    }

    node.expression = this.parseExprAtom();
    this.expect(types.parenR);
    return this.finishNode(node, "TSExternalModuleReference");
  };

  anonymous.prototype.tsLookAhead = function tsLookAhead (f) {
    var state = this.state.clone();
    var res = f();
    this.state = state;
    return res;
  };

  anonymous.prototype.tsTryParseAndCatch = function tsTryParseAndCatch (f) {
    var result = this.tryParse(function (abort) { return f() || abort(); });
    if (result.aborted || !result.node) { return undefined; }
    if (result.error) { this.state = result.failState; }
    return result.node;
  };

  anonymous.prototype.tsTryParse = function tsTryParse (f) {
    var state = this.state.clone();
    var result = f();

    if (result !== undefined && result !== false) {
      return result;
    } else {
      this.state = state;
      return undefined;
    }
  };

  anonymous.prototype.tsTryParseDeclare = function tsTryParseDeclare (nany) {
    if (this.isLineTerminator()) {
      return;
    }

    var starttype = this.state.type;
    var kind;

    if (this.isContextual("let")) {
      starttype = types._var;
      kind = "let";
    }

    switch (starttype) {
      case types._function:
        return this.parseFunctionStatement(nany, false, true);

      case types._class:
        nany.declare = true;
        return this.parseClass(nany, true, false);

      case types._const:
        if (this.match(types._const) && this.isLookaheadContextual("enum")) {
          this.expect(types._const);
          this.expectContextual("enum");
          return this.tsParseEnumDeclaration(nany, true);
        }

      case types._var:
        kind = kind || this.state.value;
        return this.parseVarStatement(nany, kind);

      case types.name:
        {
          var value = this.state.value;

          if (value === "global") {
            return this.tsParseAmbientExternalModuleDeclaration(nany);
          } else {
            return this.tsParseDeclaration(nany, value, true);
          }
        }
    }
  };

  anonymous.prototype.tsTryParseExportDeclaration = function tsTryParseExportDeclaration () {
    return this.tsParseDeclaration(this.startNode(), this.state.value, true);
  };

  anonymous.prototype.tsParseExpressionStatement = function tsParseExpressionStatement (node, expr) {
    switch (expr.name) {
      case "declare":
        {
          var declaration = this.tsTryParseDeclare(node);

          if (declaration) {
            declaration.declare = true;
            return declaration;
          }

          break;
        }

      case "global":
        if (this.match(types.braceL)) {
          this.scope.enter(SCOPE_TS_MODULE);
          this.prodParam.enter(PARAM);
          var mod = node;
          mod.global = true;
          mod.id = expr;
          mod.body = this.tsParseModuleBlock();
          this.scope.exit();
          this.prodParam.exit();
          return this.finishNode(mod, "TSModuleDeclaration");
        }

        break;

      default:
        return this.tsParseDeclaration(node, expr.name, false);
    }
  };

  anonymous.prototype.tsParseDeclaration = function tsParseDeclaration (node, value, next) {
    switch (value) {
      case "abstract":
        if (this.tsCheckLineTerminatorAndMatch(types._class, next)) {
          var cls = node;
          cls.abstract = true;

          if (next) {
            this.next();

            if (!this.match(types._class)) {
              this.unexpected(null, types._class);
            }
          }

          return this.parseClass(cls, true, false);
        }

        break;

      case "enum":
        if (next || this.match(types.name)) {
          if (next) { this.next(); }
          return this.tsParseEnumDeclaration(node, false);
        }

        break;

      case "interface":
        if (this.tsCheckLineTerminatorAndMatch(types.name, next)) {
          if (next) { this.next(); }
          return this.tsParseInterfaceDeclaration(node);
        }

        break;

      case "module":
        if (next) { this.next(); }

        if (this.match(types.string)) {
          return this.tsParseAmbientExternalModuleDeclaration(node);
        } else if (this.tsCheckLineTerminatorAndMatch(types.name, next)) {
          return this.tsParseModuleOrNamespaceDeclaration(node);
        }

        break;

      case "namespace":
        if (this.tsCheckLineTerminatorAndMatch(types.name, next)) {
          if (next) { this.next(); }
          return this.tsParseModuleOrNamespaceDeclaration(node);
        }

        break;

      case "type":
        if (this.tsCheckLineTerminatorAndMatch(types.name, next)) {
          if (next) { this.next(); }
          return this.tsParseTypeAliasDeclaration(node);
        }

        break;
    }
  };

  anonymous.prototype.tsCheckLineTerminatorAndMatch = function tsCheckLineTerminatorAndMatch (tokenType, next) {
    return (next || this.match(tokenType)) && !this.isLineTerminator();
  };

  anonymous.prototype.tsTryParseGenericAsyncArrowFunction = function tsTryParseGenericAsyncArrowFunction (startPos, startLoc) {
    var this$1 = this;

    if (!this.isRelational("<")) {
      return undefined;
    }

    var oldMaybeInArrowParameters = this.state.maybeInArrowParameters;
    var oldYieldPos = this.state.yieldPos;
    var oldAwaitPos = this.state.awaitPos;
    this.state.maybeInArrowParameters = true;
    this.state.yieldPos = -1;
    this.state.awaitPos = -1;
    var res = this.tsTryParseAndCatch(function () {
      var node = this$1.startNodeAt(startPos, startLoc);
      node.typeParameters = this$1.tsParseTypeParameters();
      superClass.prototype.parseFunctionParams.call(this$1, node);
      node.returnType = this$1.tsTryParseTypeOrTypePredicateAnnotation();
      this$1.expect(types.arrow);
      return node;
    });
    this.state.maybeInArrowParameters = oldMaybeInArrowParameters;
    this.state.yieldPos = oldYieldPos;
    this.state.awaitPos = oldAwaitPos;

    if (!res) {
      return undefined;
    }

    return this.parseArrowExpression(res, null, true);
  };

  anonymous.prototype.tsParseTypeArguments = function tsParseTypeArguments () {
    var this$1 = this;

    var node = this.startNode();
    node.params = this.tsInType(function () { return this$1.tsInNoContext(function () {
      this$1.expectRelational("<");
      return this$1.tsParseDelimitedList("TypeParametersOrArguments", this$1.tsParseType.bind(this$1));
    }); });
    this.state.exprAllowed = false;
    this.expectRelational(">");
    return this.finishNode(node, "TSTypeParameterInstantiation");
  };

  anonymous.prototype.tsIsDeclarationStart = function tsIsDeclarationStart () {
    if (this.match(types.name)) {
      switch (this.state.value) {
        case "abstract":
        case "declare":
        case "enum":
        case "interface":
        case "module":
        case "namespace":
        case "type":
          return true;
      }
    }

    return false;
  };

  anonymous.prototype.isExportDefaultSpecifier = function isExportDefaultSpecifier () {
    if (this.tsIsDeclarationStart()) { return false; }
    return superClass.prototype.isExportDefaultSpecifier.call(this);
  };

  anonymous.prototype.parseAssignableListItem = function parseAssignableListItem (allowModifiers, decorators) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var accessibility;
    var readonly = false;

    if (allowModifiers) {
      accessibility = this.parseAccessModifier();
      readonly = !!this.tsParseModifier(["readonly"]);
    }

    var left = this.parseMaybeDefault();
    this.parseAssignableListItemTypes(left);
    var elt = this.parseMaybeDefault(left.start, left.loc.start, left);

    if (accessibility || readonly) {
      var pp = this.startNodeAt(startPos, startLoc);

      if (decorators.length) {
        pp.decorators = decorators;
      }

      if (accessibility) { pp.accessibility = accessibility; }
      if (readonly) { pp.readonly = readonly; }

      if (elt.type !== "Identifier" && elt.type !== "AssignmentPattern") {
        this.raise(pp.start, TSErrors.UnsupportedParameterPropertyKind);
      }

      pp.parameter = elt;
      return this.finishNode(pp, "TSParameterProperty");
    }

    if (decorators.length) {
      left.decorators = decorators;
    }

    return elt;
  };

  anonymous.prototype.parseFunctionBodyAndFinish = function parseFunctionBodyAndFinish (node, type, isMethod) {
    if ( isMethod === void 0 ) isMethod = false;

    if (this.match(types.colon)) {
      node.returnType = this.tsParseTypeOrTypePredicateAnnotation(types.colon);
    }

    var bodilessType = type === "FunctionDeclaration" ? "TSDeclareFunction" : type === "ClassMethod" ? "TSDeclareMethod" : undefined;

    if (bodilessType && !this.match(types.braceL) && this.isLineTerminator()) {
      this.finishNode(node, bodilessType);
      return;
    }

    superClass.prototype.parseFunctionBodyAndFinish.call(this, node, type, isMethod);
  };

  anonymous.prototype.registerFunctionStatementId = function registerFunctionStatementId (node) {
    if (!node.body && node.id) {
      this.checkLVal(node.id, BIND_TS_AMBIENT, null, "function name");
    } else {
      superClass.prototype.registerFunctionStatementId.apply(this, arguments);
    }
  };

  anonymous.prototype.parseSubscript = function parseSubscript (base, startPos, startLoc, noCalls, state) {
    var this$1 = this;

    if (!this.hasPrecedingLineBreak() && this.match(types.bang)) {
      this.state.exprAllowed = false;
      this.next();
      var nonNullExpression = this.startNodeAt(startPos, startLoc);
      nonNullExpression.expression = base;
      return this.finishNode(nonNullExpression, "TSNonNullExpression");
    }

    if (this.isRelational("<")) {
      var result = this.tsTryParseAndCatch(function () {
        if (!noCalls && this$1.atPossibleAsyncArrow(base)) {
          var asyncArrowFn = this$1.tsTryParseGenericAsyncArrowFunction(startPos, startLoc);

          if (asyncArrowFn) {
            return asyncArrowFn;
          }
        }

        var node = this$1.startNodeAt(startPos, startLoc);
        node.callee = base;
        var typeArguments = this$1.tsParseTypeArguments();

        if (typeArguments) {
          if (!noCalls && this$1.eat(types.parenL)) {
            node.arguments = this$1.parseCallExpressionArguments(types.parenR, false);
            node.typeParameters = typeArguments;
            return this$1.finishCallExpression(node, state.optionalChainMember);
          } else if (this$1.match(types.backQuote)) {
            return this$1.parseTaggedTemplateExpression(startPos, startLoc, base, state, typeArguments);
          }
        }

        this$1.unexpected();
      });
      if (result) { return result; }
    }

    return superClass.prototype.parseSubscript.call(this, base, startPos, startLoc, noCalls, state);
  };

  anonymous.prototype.parseNewArguments = function parseNewArguments (node) {
    var this$1 = this;

    if (this.isRelational("<")) {
      var typeParameters = this.tsTryParseAndCatch(function () {
        var args = this$1.tsParseTypeArguments();
        if (!this$1.match(types.parenL)) { this$1.unexpected(); }
        return args;
      });

      if (typeParameters) {
        node.typeParameters = typeParameters;
      }
    }

    superClass.prototype.parseNewArguments.call(this, node);
  };

  anonymous.prototype.parseExprOp = function parseExprOp (left, leftStartPos, leftStartLoc, minPrec, noIn) {
    if (nonNull(types._in.binop) > minPrec && !this.hasPrecedingLineBreak() && this.isContextual("as")) {
      var node = this.startNodeAt(leftStartPos, leftStartLoc);
      node.expression = left;

      var _const = this.tsTryNextParseConstantContext();

      if (_const) {
        node.typeAnnotation = _const;
      } else {
        node.typeAnnotation = this.tsNextThenParseType();
      }

      this.finishNode(node, "TSAsExpression");
      return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, noIn);
    }

    return superClass.prototype.parseExprOp.call(this, left, leftStartPos, leftStartLoc, minPrec, noIn);
  };

  anonymous.prototype.checkReservedWord = function checkReservedWord (word, startLoc, checkKeywords, isBinding) {};

  anonymous.prototype.checkDuplicateExports = function checkDuplicateExports () {};

  anonymous.prototype.parseImport = function parseImport (node) {
    if (this.match(types.name) || this.match(types.star) || this.match(types.braceL)) {
      var ahead = this.lookahead();

      if (this.match(types.name) && ahead.type === types.eq) {
        return this.tsParseImportEqualsDeclaration(node);
      }

      if (this.isContextual("type") && ahead.type !== types.comma && !(ahead.type === types.name && ahead.value === "from")) {
        node.importKind = "type";
        this.next();
      } else {
        node.importKind = "value";
      }
    }

    var importNode = superClass.prototype.parseImport.call(this, node);

    if (importNode.importKind === "type" && importNode.specifiers.length > 1 && importNode.specifiers[0].type === "ImportDefaultSpecifier") {
      this.raise(importNode.start, "A type-only import can specify a default import or named bindings, but not both.");
    }

    return importNode;
  };

  anonymous.prototype.parseExport = function parseExport (node) {
    if (this.match(types._import)) {
      this.expect(types._import);
      return this.tsParseImportEqualsDeclaration(node, true);
    } else if (this.eat(types.eq)) {
      var assign = node;
      assign.expression = this.parseExpression();
      this.semicolon();
      return this.finishNode(assign, "TSExportAssignment");
    } else if (this.eatContextual("as")) {
      var decl = node;
      this.expectContextual("namespace");
      decl.id = this.parseIdentifier();
      this.semicolon();
      return this.finishNode(decl, "TSNamespaceExportDeclaration");
    } else {
      if (this.isContextual("type") && this.lookahead().type === types.braceL) {
        this.next();
        node.exportKind = "type";
      } else {
        node.exportKind = "value";
      }

      return superClass.prototype.parseExport.call(this, node);
    }
  };

  anonymous.prototype.isAbstractClass = function isAbstractClass () {
    return this.isContextual("abstract") && this.lookahead().type === types._class;
  };

  anonymous.prototype.parseExportDefaultExpression = function parseExportDefaultExpression () {
    if (this.isAbstractClass()) {
      var cls = this.startNode();
      this.next();
      this.parseClass(cls, true, true);
      cls.abstract = true;
      return cls;
    }

    if (this.state.value === "interface") {
      var result = this.tsParseDeclaration(this.startNode(), this.state.value, true);
      if (result) { return result; }
    }

    return superClass.prototype.parseExportDefaultExpression.call(this);
  };

  anonymous.prototype.parseStatementContent = function parseStatementContent (context, topLevel) {
    if (this.state.type === types._const) {
      var ahead = this.lookahead();

      if (ahead.type === types.name && ahead.value === "enum") {
        var node = this.startNode();
        this.expect(types._const);
        this.expectContextual("enum");
        return this.tsParseEnumDeclaration(node, true);
      }
    }

    return superClass.prototype.parseStatementContent.call(this, context, topLevel);
  };

  anonymous.prototype.parseAccessModifier = function parseAccessModifier () {
    return this.tsParseModifier(["public", "protected", "private"]);
  };

  anonymous.prototype.parseClassMember = function parseClassMember (classBody, member, state, constructorAllowsSuper) {
    this.tsParseModifiers(member, ["declare"]);
    var accessibility = this.parseAccessModifier();
    if (accessibility) { member.accessibility = accessibility; }
    this.tsParseModifiers(member, ["declare"]);
    superClass.prototype.parseClassMember.call(this, classBody, member, state, constructorAllowsSuper);
  };

  anonymous.prototype.parseClassMemberWithIsStatic = function parseClassMemberWithIsStatic (classBody, member, state, isStatic, constructorAllowsSuper) {
    this.tsParseModifiers(member, ["abstract", "readonly", "declare"]);
    var idx = this.tsTryParseIndexSignature(member);

    if (idx) {
      classBody.body.push(idx);

      if (member.abstract) {
        this.raise(member.start, TSErrors.IndexSignatureHasAbstract);
      }

      if (isStatic) {
        this.raise(member.start, TSErrors.IndexSignatureHasStatic);
      }

      if (member.accessibility) {
        this.raise(member.start, TSErrors.IndexSignatureHasAccessibility, member.accessibility);
      }

      return;
    }

    superClass.prototype.parseClassMemberWithIsStatic.call(this, classBody, member, state, isStatic, constructorAllowsSuper);
  };

  anonymous.prototype.parsePostMemberNameModifiers = function parsePostMemberNameModifiers (methodOrProp) {
    var optional = this.eat(types.question);
    if (optional) { methodOrProp.optional = true; }

    if (methodOrProp.readonly && this.match(types.parenL)) {
      this.raise(methodOrProp.start, TSErrors.ClassMethodHasReadonly);
    }

    if (methodOrProp.declare && this.match(types.parenL)) {
      this.raise(methodOrProp.start, TSErrors.ClassMethodHasDeclare);
    }
  };

  anonymous.prototype.parseExpressionStatement = function parseExpressionStatement (node, expr) {
    var decl = expr.type === "Identifier" ? this.tsParseExpressionStatement(node, expr) : undefined;
    return decl || superClass.prototype.parseExpressionStatement.call(this, node, expr);
  };

  anonymous.prototype.shouldParseExportDeclaration = function shouldParseExportDeclaration () {
    if (this.tsIsDeclarationStart()) { return true; }
    return superClass.prototype.shouldParseExportDeclaration.call(this);
  };

  anonymous.prototype.parseConditional = function parseConditional (expr, noIn, startPos, startLoc, refNeedsArrowPos) {
    var this$1 = this;

    if (!refNeedsArrowPos || !this.match(types.question)) {
      return superClass.prototype.parseConditional.call(this, expr, noIn, startPos, startLoc, refNeedsArrowPos);
    }

    var result = this.tryParse(function () { return superClass.prototype.parseConditional.call(this$1, expr, noIn, startPos, startLoc); });

    if (!result.node) {
      refNeedsArrowPos.start = result.error.pos || this.state.start;
      return expr;
    }

    if (result.error) { this.state = result.failState; }
    return result.node;
  };

  anonymous.prototype.parseParenItem = function parseParenItem (node, startPos, startLoc) {
    node = superClass.prototype.parseParenItem.call(this, node, startPos, startLoc);

    if (this.eat(types.question)) {
      node.optional = true;
      this.resetEndLocation(node);
    }

    if (this.match(types.colon)) {
      var typeCastNode = this.startNodeAt(startPos, startLoc);
      typeCastNode.expression = node;
      typeCastNode.typeAnnotation = this.tsParseTypeAnnotation();
      return this.finishNode(typeCastNode, "TSTypeCastExpression");
    }

    return node;
  };

  anonymous.prototype.parseExportDeclaration = function parseExportDeclaration (node) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var isDeclare = this.eatContextual("declare");
    var declaration;

    if (this.match(types.name)) {
      declaration = this.tsTryParseExportDeclaration();
    }

    if (!declaration) {
      declaration = superClass.prototype.parseExportDeclaration.call(this, node);
    }

    if (declaration && (declaration.type === "TSInterfaceDeclaration" || declaration.type === "TSTypeAliasDeclaration" || isDeclare)) {
      node.exportKind = "type";
    }

    if (declaration && isDeclare) {
      this.resetStartLocation(declaration, startPos, startLoc);
      declaration.declare = true;
    }

    return declaration;
  };

  anonymous.prototype.parseClassId = function parseClassId (node, isStatement, optionalId) {
    if ((!isStatement || optionalId) && this.isContextual("implements")) {
      return;
    }

    superClass.prototype.parseClassId.call(this, node, isStatement, optionalId, node.declare ? BIND_TS_AMBIENT : BIND_CLASS);
    var typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) { node.typeParameters = typeParameters; }
  };

  anonymous.prototype.parseClassPropertyAnnotation = function parseClassPropertyAnnotation (node) {
    if (!node.optional && this.eat(types.bang)) {
      node.definite = true;
    }

    var type = this.tsTryParseTypeAnnotation();
    if (type) { node.typeAnnotation = type; }
  };

  anonymous.prototype.parseClassProperty = function parseClassProperty (node) {
    this.parseClassPropertyAnnotation(node);

    if (node.declare && this.match(types.equal)) {
      this.raise(this.state.start, TSErrors.DeclareClassFieldHasInitializer);
    }

    return superClass.prototype.parseClassProperty.call(this, node);
  };

  anonymous.prototype.parseClassPrivateProperty = function parseClassPrivateProperty (node) {
    if (node.abstract) {
      this.raise(node.start, TSErrors.PrivateElementHasAbstract);
    }

    if (node.accessibility) {
      this.raise(node.start, TSErrors.PrivateElementHasAccessibility, node.accessibility);
    }

    this.parseClassPropertyAnnotation(node);
    return superClass.prototype.parseClassPrivateProperty.call(this, node);
  };

  anonymous.prototype.pushClassMethod = function pushClassMethod (classBody, method, isGenerator, isAsync, isConstructor, allowsDirectSuper) {
    var typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) { method.typeParameters = typeParameters; }
    superClass.prototype.pushClassMethod.call(this, classBody, method, isGenerator, isAsync, isConstructor, allowsDirectSuper);
  };

  anonymous.prototype.pushClassPrivateMethod = function pushClassPrivateMethod (classBody, method, isGenerator, isAsync) {
    var typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) { method.typeParameters = typeParameters; }
    superClass.prototype.pushClassPrivateMethod.call(this, classBody, method, isGenerator, isAsync);
  };

  anonymous.prototype.parseClassSuper = function parseClassSuper (node) {
    superClass.prototype.parseClassSuper.call(this, node);

    if (node.superClass && this.isRelational("<")) {
      node.superTypeParameters = this.tsParseTypeArguments();
    }

    if (this.eatContextual("implements")) {
      node.implements = this.tsParseHeritageClause("implements");
    }
  };

  anonymous.prototype.parseObjPropValue = function parseObjPropValue (prop) {
    var args = [], len = arguments.length - 1;
    while ( len-- > 0 ) args[ len ] = arguments[ len + 1 ];

    var typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) { prop.typeParameters = typeParameters; }
    superClass.prototype.parseObjPropValue.apply(this, [ prop ].concat( args ));
  };

  anonymous.prototype.parseFunctionParams = function parseFunctionParams (node, allowModifiers) {
    var typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) { node.typeParameters = typeParameters; }
    superClass.prototype.parseFunctionParams.call(this, node, allowModifiers);
  };

  anonymous.prototype.parseVarId = function parseVarId (decl, kind) {
    superClass.prototype.parseVarId.call(this, decl, kind);

    if (decl.id.type === "Identifier" && this.eat(types.bang)) {
      decl.definite = true;
    }

    var type = this.tsTryParseTypeAnnotation();

    if (type) {
      decl.id.typeAnnotation = type;
      this.resetEndLocation(decl.id);
    }
  };

  anonymous.prototype.parseAsyncArrowFromCallExpression = function parseAsyncArrowFromCallExpression (node, call) {
    if (this.match(types.colon)) {
      node.returnType = this.tsParseTypeAnnotation();
    }

    return superClass.prototype.parseAsyncArrowFromCallExpression.call(this, node, call);
  };

  anonymous.prototype.parseMaybeAssign = function parseMaybeAssign () {
    var this$1 = this;
    var args = [], len = arguments.length;
    while ( len-- ) args[ len ] = arguments[ len ];

    var state;
    var jsx;
    var typeCast;

    if (this.match(types.jsxTagStart)) {
      state = this.state.clone();
      jsx = this.tryParse(function () { return superClass.prototype.parseMaybeAssign.apply(this$1, args); }, state);
      if (!jsx.error) { return jsx.node; }
      var ref = this.state;
      var context = ref.context;

      if (context[context.length - 1] === types$1.j_oTag) {
        context.length -= 2;
      } else if (context[context.length - 1] === types$1.j_expr) {
        context.length -= 1;
      }
    }

    if (!(jsx && jsx.error) && !this.isRelational("<")) {
      return superClass.prototype.parseMaybeAssign.apply(this, args);
    }

    var typeParameters;
    state = state || this.state.clone();
    var arrow = this.tryParse(function (abort) {
      typeParameters = this$1.tsParseTypeParameters();
      var expr = superClass.prototype.parseMaybeAssign.apply(this$1, args);

      if (expr.type !== "ArrowFunctionExpression" || expr.extra && expr.extra.parenthesized) {
        abort();
      }

      if (typeParameters && typeParameters.params.length !== 0) {
        this$1.resetStartLocationFromNode(expr, typeParameters);
      }

      expr.typeParameters = typeParameters;
      return expr;
    }, state);
    if (!arrow.error && !arrow.aborted) { return arrow.node; }

    if (!jsx) {
      assert(!this.hasPlugin("jsx"));
      typeCast = this.tryParse(function () { return superClass.prototype.parseMaybeAssign.apply(this$1, args); }, state);
      if (!typeCast.error) { return typeCast.node; }
    }

    if (jsx && jsx.node) {
      this.state = jsx.failState;
      return jsx.node;
    }

    if (arrow.node) {
      this.state = arrow.failState;
      return arrow.node;
    }

    if (typeCast && typeCast.node) {
      this.state = typeCast.failState;
      return typeCast.node;
    }

    if (jsx && jsx.thrown) { throw jsx.error; }
    if (arrow.thrown) { throw arrow.error; }
    if (typeCast && typeCast.thrown) { throw typeCast.error; }
    throw jsx && jsx.error || arrow.error || typeCast && typeCast.error;
  };

  anonymous.prototype.parseMaybeUnary = function parseMaybeUnary (refExpressionErrors) {
    if (!this.hasPlugin("jsx") && this.isRelational("<")) {
      return this.tsParseTypeAssertion();
    } else {
      return superClass.prototype.parseMaybeUnary.call(this, refExpressionErrors);
    }
  };

  anonymous.prototype.parseArrow = function parseArrow (node) {
    var this$1 = this;

    if (this.match(types.colon)) {
      var result = this.tryParse(function (abort) {
        var returnType = this$1.tsParseTypeOrTypePredicateAnnotation(types.colon);
        if (this$1.canInsertSemicolon() || !this$1.match(types.arrow)) { abort(); }
        return returnType;
      });
      if (result.aborted) { return; }

      if (!result.thrown) {
        if (result.error) { this.state = result.failState; }
        node.returnType = result.node;
      }
    }

    return superClass.prototype.parseArrow.call(this, node);
  };

  anonymous.prototype.parseAssignableListItemTypes = function parseAssignableListItemTypes (param) {
    if (this.eat(types.question)) {
      if (param.type !== "Identifier") {
        this.raise(param.start, TSErrors.PatternIsOptional);
      }

      param.optional = true;
    }

    var type = this.tsTryParseTypeAnnotation();
    if (type) { param.typeAnnotation = type; }
    this.resetEndLocation(param);
    return param;
  };

  anonymous.prototype.toAssignable = function toAssignable (node) {
    switch (node.type) {
      case "TSTypeCastExpression":
        return superClass.prototype.toAssignable.call(this, this.typeCastToParameter(node));

      case "TSParameterProperty":
        return superClass.prototype.toAssignable.call(this, node);

      case "TSAsExpression":
      case "TSNonNullExpression":
      case "TSTypeAssertion":
        node.expression = this.toAssignable(node.expression);
        return node;

      default:
        return superClass.prototype.toAssignable.call(this, node);
    }
  };

  anonymous.prototype.checkLVal = function checkLVal (expr, bindingType, checkClashes, contextDescription) {
    if ( bindingType === void 0 ) bindingType = BIND_NONE;

    switch (expr.type) {
      case "TSTypeCastExpression":
        return;

      case "TSParameterProperty":
        this.checkLVal(expr.parameter, bindingType, checkClashes, "parameter property");
        return;

      case "TSAsExpression":
      case "TSNonNullExpression":
      case "TSTypeAssertion":
        this.checkLVal(expr.expression, bindingType, checkClashes, contextDescription);
        return;

      default:
        superClass.prototype.checkLVal.call(this, expr, bindingType, checkClashes, contextDescription);
        return;
    }
  };

  anonymous.prototype.parseBindingAtom = function parseBindingAtom () {
    switch (this.state.type) {
      case types._this:
        return this.parseIdentifier(true);

      default:
        return superClass.prototype.parseBindingAtom.call(this);
    }
  };

  anonymous.prototype.parseMaybeDecoratorArguments = function parseMaybeDecoratorArguments (expr) {
    if (this.isRelational("<")) {
      var typeArguments = this.tsParseTypeArguments();

      if (this.match(types.parenL)) {
        var call = superClass.prototype.parseMaybeDecoratorArguments.call(this, expr);
        call.typeParameters = typeArguments;
        return call;
      }

      this.unexpected(this.state.start, types.parenL);
    }

    return superClass.prototype.parseMaybeDecoratorArguments.call(this, expr);
  };

  anonymous.prototype.isClassMethod = function isClassMethod () {
    return this.isRelational("<") || superClass.prototype.isClassMethod.call(this);
  };

  anonymous.prototype.isClassProperty = function isClassProperty () {
    return this.match(types.bang) || this.match(types.colon) || superClass.prototype.isClassProperty.call(this);
  };

  anonymous.prototype.parseMaybeDefault = function parseMaybeDefault () {
    var args = [], len = arguments.length;
    while ( len-- ) args[ len ] = arguments[ len ];

    var node = superClass.prototype.parseMaybeDefault.apply(this, args);

    if (node.type === "AssignmentPattern" && node.typeAnnotation && node.right.start < node.typeAnnotation.start) {
      this.raise(node.typeAnnotation.start, TSErrors.TypeAnnotationAfterAssign);
    }

    return node;
  };

  anonymous.prototype.getTokenFromCode = function getTokenFromCode (code) {
    if (this.state.inType && (code === 62 || code === 60)) {
      return this.finishOp(types.relational, 1);
    } else {
      return superClass.prototype.getTokenFromCode.call(this, code);
    }
  };

  anonymous.prototype.toAssignableList = function toAssignableList (exprList) {
    for (var i = 0; i < exprList.length; i++) {
      var expr = exprList[i];
      if (!expr) { continue; }

      switch (expr.type) {
        case "TSTypeCastExpression":
          exprList[i] = this.typeCastToParameter(expr);
          break;

        case "TSAsExpression":
        case "TSTypeAssertion":
          if (!this.state.maybeInArrowParameters) {
            exprList[i] = this.typeCastToParameter(expr);
          } else {
            this.raise(expr.start, TSErrors.UnexpectedTypeCastInParameter);
          }

          break;
      }
    }

    return superClass.prototype.toAssignableList.apply(this, arguments);
  };

  anonymous.prototype.typeCastToParameter = function typeCastToParameter (node) {
    node.expression.typeAnnotation = node.typeAnnotation;
    this.resetEndLocation(node.expression, node.typeAnnotation.end, node.typeAnnotation.loc.end);
    return node.expression;
  };

  anonymous.prototype.toReferencedList = function toReferencedList (exprList, isInParens) {
    for (var i = 0; i < exprList.length; i++) {
      var expr = exprList[i];

      if (expr && expr.type === "TSTypeCastExpression") {
        this.raise(expr.start, TSErrors.UnexpectedTypeAnnotation);
      }
    }

    return exprList;
  };

  anonymous.prototype.shouldParseArrow = function shouldParseArrow () {
    return this.match(types.colon) || superClass.prototype.shouldParseArrow.call(this);
  };

  anonymous.prototype.shouldParseAsyncArrow = function shouldParseAsyncArrow () {
    return this.match(types.colon) || superClass.prototype.shouldParseAsyncArrow.call(this);
  };

  anonymous.prototype.canHaveLeadingDecorator = function canHaveLeadingDecorator () {
    return superClass.prototype.canHaveLeadingDecorator.call(this) || this.isAbstractClass();
  };

  anonymous.prototype.jsxParseOpeningElementAfterName = function jsxParseOpeningElementAfterName (node) {
    var this$1 = this;

    if (this.isRelational("<")) {
      var typeArguments = this.tsTryParseAndCatch(function () { return this$1.tsParseTypeArguments(); });
      if (typeArguments) { node.typeParameters = typeArguments; }
    }

    return superClass.prototype.jsxParseOpeningElementAfterName.call(this, node);
  };

  anonymous.prototype.getGetterSetterExpectedParamCount = function getGetterSetterExpectedParamCount (method) {
    var baseCount = superClass.prototype.getGetterSetterExpectedParamCount.call(this, method);
    var firstParam = method.params[0];
    var hasContextParam = firstParam && firstParam.type === "Identifier" && firstParam.name === "this";
    return hasContextParam ? baseCount + 1 : baseCount;
  };

    return anonymous;
  }(superClass)); });

types.placeholder = new TokenType("%%", {
  startsExpr: true
});
var placeholders = (function (superClass) { return /*@__PURE__*/(function (superClass) {
    function anonymous () {
      superClass.apply(this, arguments);
    }

    if ( superClass ) anonymous.__proto__ = superClass;
    anonymous.prototype = Object.create( superClass && superClass.prototype );
    anonymous.prototype.constructor = anonymous;

    anonymous.prototype.parsePlaceholder = function parsePlaceholder (expectedNode) {
    if (this.match(types.placeholder)) {
      var node = this.startNode();
      this.next();
      this.assertNoSpace("Unexpected space in placeholder.");
      node.name = superClass.prototype.parseIdentifier.call(this, true);
      this.assertNoSpace("Unexpected space in placeholder.");
      this.expect(types.placeholder);
      return this.finishPlaceholder(node, expectedNode);
    }
  };

  anonymous.prototype.finishPlaceholder = function finishPlaceholder (node, expectedNode) {
    var isFinished = !!(node.expectedNode && node.type === "Placeholder");
    node.expectedNode = expectedNode;
    return isFinished ? node : this.finishNode(node, "Placeholder");
  };

  anonymous.prototype.getTokenFromCode = function getTokenFromCode (code) {
    if (code === 37 && this.input.charCodeAt(this.state.pos + 1) === 37) {
      return this.finishOp(types.placeholder, 2);
    }

    return superClass.prototype.getTokenFromCode.apply(this, arguments);
  };

  anonymous.prototype.parseExprAtom = function parseExprAtom () {
    return this.parsePlaceholder("Expression") || superClass.prototype.parseExprAtom.apply(this, arguments);
  };

  anonymous.prototype.parseIdentifier = function parseIdentifier () {
    return this.parsePlaceholder("Identifier") || superClass.prototype.parseIdentifier.apply(this, arguments);
  };

  anonymous.prototype.checkReservedWord = function checkReservedWord (word) {
    if (word !== undefined) { superClass.prototype.checkReservedWord.apply(this, arguments); }
  };

  anonymous.prototype.parseBindingAtom = function parseBindingAtom () {
    return this.parsePlaceholder("Pattern") || superClass.prototype.parseBindingAtom.apply(this, arguments);
  };

  anonymous.prototype.checkLVal = function checkLVal (expr) {
    if (expr.type !== "Placeholder") { superClass.prototype.checkLVal.apply(this, arguments); }
  };

  anonymous.prototype.toAssignable = function toAssignable (node) {
    if (node && node.type === "Placeholder" && node.expectedNode === "Expression") {
      node.expectedNode = "Pattern";
      return node;
    }

    return superClass.prototype.toAssignable.apply(this, arguments);
  };

  anonymous.prototype.verifyBreakContinue = function verifyBreakContinue (node) {
    if (node.label && node.label.type === "Placeholder") { return; }
    superClass.prototype.verifyBreakContinue.apply(this, arguments);
  };

  anonymous.prototype.parseExpressionStatement = function parseExpressionStatement (node, expr) {
    if (expr.type !== "Placeholder" || expr.extra && expr.extra.parenthesized) {
      return superClass.prototype.parseExpressionStatement.apply(this, arguments);
    }

    if (this.match(types.colon)) {
      var stmt = node;
      stmt.label = this.finishPlaceholder(expr, "Identifier");
      this.next();
      stmt.body = this.parseStatement("label");
      return this.finishNode(stmt, "LabeledStatement");
    }

    this.semicolon();
    node.name = expr.name;
    return this.finishPlaceholder(node, "Statement");
  };

  anonymous.prototype.parseBlock = function parseBlock () {
    return this.parsePlaceholder("BlockStatement") || superClass.prototype.parseBlock.apply(this, arguments);
  };

  anonymous.prototype.parseFunctionId = function parseFunctionId () {
    return this.parsePlaceholder("Identifier") || superClass.prototype.parseFunctionId.apply(this, arguments);
  };

  anonymous.prototype.parseClass = function parseClass (node, isStatement, optionalId) {
    var type = isStatement ? "ClassDeclaration" : "ClassExpression";
    this.next();
    this.takeDecorators(node);
    var placeholder = this.parsePlaceholder("Identifier");

    if (placeholder) {
      if (this.match(types._extends) || this.match(types.placeholder) || this.match(types.braceL)) {
        node.id = placeholder;
      } else if (optionalId || !isStatement) {
        node.id = null;
        node.body = this.finishPlaceholder(placeholder, "ClassBody");
        return this.finishNode(node, type);
      } else {
        this.unexpected(null, "A class name is required");
      }
    } else {
      this.parseClassId(node, isStatement, optionalId);
    }

    this.parseClassSuper(node);
    node.body = this.parsePlaceholder("ClassBody") || this.parseClassBody(!!node.superClass);
    return this.finishNode(node, type);
  };

  anonymous.prototype.parseExport = function parseExport (node) {
    var placeholder = this.parsePlaceholder("Identifier");
    if (!placeholder) { return superClass.prototype.parseExport.apply(this, arguments); }

    if (!this.isContextual("from") && !this.match(types.comma)) {
      node.specifiers = [];
      node.source = null;
      node.declaration = this.finishPlaceholder(placeholder, "Declaration");
      return this.finishNode(node, "ExportNamedDeclaration");
    }

    this.expectPlugin("exportDefaultFrom");
    var specifier = this.startNode();
    specifier.exported = placeholder;
    node.specifiers = [this.finishNode(specifier, "ExportDefaultSpecifier")];
    return superClass.prototype.parseExport.call(this, node);
  };

  anonymous.prototype.maybeParseExportDefaultSpecifier = function maybeParseExportDefaultSpecifier (node) {
    if (node.specifiers && node.specifiers.length > 0) {
      return true;
    }

    return superClass.prototype.maybeParseExportDefaultSpecifier.apply(this, arguments);
  };

  anonymous.prototype.checkExport = function checkExport (node) {
    var specifiers = node.specifiers;

    if (specifiers && specifiers.length) {
      node.specifiers = specifiers.filter(function (node) { return node.exported.type === "Placeholder"; });
    }

    superClass.prototype.checkExport.call(this, node);
    node.specifiers = specifiers;
  };

  anonymous.prototype.parseImport = function parseImport (node) {
    var placeholder = this.parsePlaceholder("Identifier");
    if (!placeholder) { return superClass.prototype.parseImport.apply(this, arguments); }
    node.specifiers = [];

    if (!this.isContextual("from") && !this.match(types.comma)) {
      node.source = this.finishPlaceholder(placeholder, "StringLiteral");
      this.semicolon();
      return this.finishNode(node, "ImportDeclaration");
    }

    var specifier = this.startNodeAtNode(placeholder);
    specifier.local = placeholder;
    this.finishNode(specifier, "ImportDefaultSpecifier");
    node.specifiers.push(specifier);

    if (this.eat(types.comma)) {
      var hasStarImport = this.maybeParseStarImportSpecifier(node);
      if (!hasStarImport) { this.parseNamedImportSpecifiers(node); }
    }

    this.expectContextual("from");
    node.source = this.parseImportSource();
    this.semicolon();
    return this.finishNode(node, "ImportDeclaration");
  };

  anonymous.prototype.parseImportSource = function parseImportSource () {
    return this.parsePlaceholder("StringLiteral") || superClass.prototype.parseImportSource.apply(this, arguments);
  };

    return anonymous;
  }(superClass)); });

var v8intrinsic = (function (superClass) { return /*@__PURE__*/(function (superClass) {
    function anonymous () {
      superClass.apply(this, arguments);
    }

    if ( superClass ) anonymous.__proto__ = superClass;
    anonymous.prototype = Object.create( superClass && superClass.prototype );
    anonymous.prototype.constructor = anonymous;

    anonymous.prototype.parseV8Intrinsic = function parseV8Intrinsic () {
    if (this.match(types.modulo)) {
      var v8IntrinsicStart = this.state.start;
      var node = this.startNode();
      this.eat(types.modulo);

      if (this.match(types.name)) {
        var name = this.parseIdentifierName(this.state.start);
        var identifier = this.createIdentifier(node, name);
        identifier.type = "V8IntrinsicIdentifier";

        if (this.match(types.parenL)) {
          return identifier;
        }
      }

      this.unexpected(v8IntrinsicStart);
    }
  };

  anonymous.prototype.parseExprAtom = function parseExprAtom () {
    return this.parseV8Intrinsic() || superClass.prototype.parseExprAtom.apply(this, arguments);
  };

    return anonymous;
  }(superClass)); });

function hasPlugin(plugins, name) {
  return plugins.some(function (plugin) {
    if (Array.isArray(plugin)) {
      return plugin[0] === name;
    } else {
      return plugin === name;
    }
  });
}
function getPluginOption(plugins, name, option) {
  var plugin = plugins.find(function (plugin) {
    if (Array.isArray(plugin)) {
      return plugin[0] === name;
    } else {
      return plugin === name;
    }
  });

  if (plugin && Array.isArray(plugin)) {
    return plugin[1][option];
  }

  return null;
}
var PIPELINE_PROPOSALS = ["minimal", "smart", "fsharp"];
var RECORD_AND_TUPLE_SYNTAX_TYPES = ["hash", "bar"];
function validatePlugins(plugins) {
  if (hasPlugin(plugins, "decorators")) {
    if (hasPlugin(plugins, "decorators-legacy")) {
      throw new Error("Cannot use the decorators and decorators-legacy plugin together");
    }

    var decoratorsBeforeExport = getPluginOption(plugins, "decorators", "decoratorsBeforeExport");

    if (decoratorsBeforeExport == null) {
      throw new Error("The 'decorators' plugin requires a 'decoratorsBeforeExport' option," + " whose value must be a boolean. If you are migrating from" + " Babylon/Babel 6 or want to use the old decorators proposal, you" + " should use the 'decorators-legacy' plugin instead of 'decorators'.");
    } else if (typeof decoratorsBeforeExport !== "boolean") {
      throw new Error("'decoratorsBeforeExport' must be a boolean.");
    }
  }

  if (hasPlugin(plugins, "flow") && hasPlugin(plugins, "typescript")) {
    throw new Error("Cannot combine flow and typescript plugins.");
  }

  if (hasPlugin(plugins, "placeholders") && hasPlugin(plugins, "v8intrinsic")) {
    throw new Error("Cannot combine placeholders and v8intrinsic plugins.");
  }

  if (hasPlugin(plugins, "pipelineOperator") && !PIPELINE_PROPOSALS.includes(getPluginOption(plugins, "pipelineOperator", "proposal"))) {
    throw new Error("'pipelineOperator' requires 'proposal' option whose value should be one of: " + PIPELINE_PROPOSALS.map(function (p) { return ("'" + p + "'"); }).join(", "));
  }

  if (hasPlugin(plugins, "recordAndTuple") && !RECORD_AND_TUPLE_SYNTAX_TYPES.includes(getPluginOption(plugins, "recordAndTuple", "syntaxType"))) {
    throw new Error("'recordAndTuple' requires 'syntaxType' option whose value should be one of: " + RECORD_AND_TUPLE_SYNTAX_TYPES.map(function (p) { return ("'" + p + "'"); }).join(", "));
  }
}
var mixinPlugins = {
  estree: estree,
  jsx: jsx,
  flow: flow,
  typescript: typescript,
  v8intrinsic: v8intrinsic,
  placeholders: placeholders
};
var mixinPluginNames = Object.keys(mixinPlugins);

var defaultOptions = {
  sourceType: "script",
  sourceFilename: undefined,
  startLine: 1,
  allowAwaitOutsideFunction: false,
  allowReturnOutsideFunction: false,
  allowImportExportEverywhere: false,
  allowSuperOutsideMethod: false,
  allowUndeclaredExports: false,
  plugins: [],
  strictMode: null,
  ranges: false,
  tokens: false,
  createParenthesizedExpressions: false,
  errorRecovery: false
};
function getOptions(opts) {
  var options = {};

  for (var _i = 0, _Object$keys = Object.keys(defaultOptions); _i < _Object$keys.length; _i++) {
    var key = _Object$keys[_i];
    options[key] = opts && opts[key] != null ? opts[key] : defaultOptions[key];
  }

  return options;
}

var State = function State() {
  this.errors = [];
  this.potentialArrowAt = -1;
  this.noArrowAt = [];
  this.noArrowParamsConversionAt = [];
  this.inParameters = false;
  this.maybeInArrowParameters = false;
  this.maybeInAsyncArrowHead = false;
  this.inPipeline = false;
  this.inType = false;
  this.noAnonFunctionType = false;
  this.inPropertyName = false;
  this.hasFlowComment = false;
  this.isIterator = false;
  this.topicContext = {
    maxNumOfResolvableTopics: 0,
    maxTopicIndex: null
  };
  this.soloAwait = false;
  this.inFSharpPipelineDirectBody = false;
  this.labels = [];
  this.decoratorStack = [[]];
  this.yieldPos = -1;
  this.awaitPos = -1;
  this.comments = [];
  this.trailingComments = [];
  this.leadingComments = [];
  this.commentStack = [];
  this.commentPreviousNode = null;
  this.pos = 0;
  this.lineStart = 0;
  this.type = types.eof;
  this.value = null;
  this.start = 0;
  this.end = 0;
  this.lastTokEndLoc = null;
  this.lastTokStartLoc = null;
  this.lastTokStart = 0;
  this.lastTokEnd = 0;
  this.context = [types$1.braceStatement];
  this.exprAllowed = true;
  this.containsEsc = false;
  this.octalPositions = [];
  this.exportedIdentifiers = [];
  this.tokensLength = 0;
};

State.prototype.init = function init (options) {
  this.strict = options.strictMode === false ? false : options.sourceType === "module";
  this.curLine = options.startLine;
  this.startLoc = this.endLoc = this.curPosition();
};

State.prototype.curPosition = function curPosition () {
  return new Position(this.curLine, this.pos - this.lineStart);
};

State.prototype.clone = function clone (skipArrays) {
  var state = new State();
  var keys = Object.keys(this);

  for (var i = 0, length = keys.length; i < length; i++) {
    var key = keys[i];
    var val = this[key];

    if (!skipArrays && Array.isArray(val)) {
      val = val.slice();
    }

    state[key] = val;
  }

  return state;
};

var _isDigit = function isDigit(code) {
  return code >= 48 && code <= 57;
};
var VALID_REGEX_FLAGS = new Set(["g", "m", "s", "i", "y", "u"]);
var forbiddenNumericSeparatorSiblings = {
  decBinOct: [46, 66, 69, 79, 95, 98, 101, 111],
  hex: [46, 88, 95, 120]
};
var allowedNumericSeparatorSiblings = {};
allowedNumericSeparatorSiblings.bin = [48, 49];
allowedNumericSeparatorSiblings.oct = ( allowedNumericSeparatorSiblings.bin ).concat( [50], [51], [52], [53], [54], [55]);
allowedNumericSeparatorSiblings.dec = ( allowedNumericSeparatorSiblings.oct ).concat( [56], [57]);
allowedNumericSeparatorSiblings.hex = ( allowedNumericSeparatorSiblings.dec ).concat( [65], [66], [67], [68], [69], [70], [97], [98], [99], [100], [101], [102]);
var Token = function Token(state) {
  this.type = state.type;
  this.value = state.value;
  this.start = state.start;
  this.end = state.end;
  this.loc = new SourceLocation(state.startLoc, state.endLoc);
};
var Tokenizer = /*@__PURE__*/(function (LocationParser) {
  function Tokenizer(options, input) {
    LocationParser.call(this);
    this.tokens = [];
    this.state = new State();
    this.state.init(options);
    this.input = input;
    this.length = input.length;
    this.isLookahead = false;
  }

  if ( LocationParser ) Tokenizer.__proto__ = LocationParser;
  Tokenizer.prototype = Object.create( LocationParser && LocationParser.prototype );
  Tokenizer.prototype.constructor = Tokenizer;

  Tokenizer.prototype.pushToken = function pushToken (token) {
    this.tokens.length = this.state.tokensLength;
    this.tokens.push(token);
    ++this.state.tokensLength;
  };

  Tokenizer.prototype.next = function next () {
    if (!this.isLookahead) {
      this.checkKeywordEscapes();

      if (this.options.tokens) {
        this.pushToken(new Token(this.state));
      }
    }

    this.state.lastTokEnd = this.state.end;
    this.state.lastTokStart = this.state.start;
    this.state.lastTokEndLoc = this.state.endLoc;
    this.state.lastTokStartLoc = this.state.startLoc;
    this.nextToken();
  };

  Tokenizer.prototype.eat = function eat (type) {
    if (this.match(type)) {
      this.next();
      return true;
    } else {
      return false;
    }
  };

  Tokenizer.prototype.match = function match (type) {
    return this.state.type === type;
  };

  Tokenizer.prototype.lookahead = function lookahead () {
    var old = this.state;
    this.state = old.clone(true);
    this.isLookahead = true;
    this.next();
    this.isLookahead = false;
    var curr = this.state;
    this.state = old;
    return curr;
  };

  Tokenizer.prototype.nextTokenStart = function nextTokenStart () {
    var thisTokEnd = this.state.pos;
    skipWhiteSpace.lastIndex = thisTokEnd;
    var skip = skipWhiteSpace.exec(this.input);
    return thisTokEnd + skip[0].length;
  };

  Tokenizer.prototype.lookaheadCharCode = function lookaheadCharCode () {
    return this.input.charCodeAt(this.nextTokenStart());
  };

  Tokenizer.prototype.setStrict = function setStrict (strict) {
    this.state.strict = strict;
    if (!this.match(types.num) && !this.match(types.string)) { return; }
    this.state.pos = this.state.start;

    while (this.state.pos < this.state.lineStart) {
      this.state.lineStart = this.input.lastIndexOf("\n", this.state.lineStart - 2) + 1;
      --this.state.curLine;
    }

    this.nextToken();
  };

  Tokenizer.prototype.curContext = function curContext () {
    return this.state.context[this.state.context.length - 1];
  };

  Tokenizer.prototype.nextToken = function nextToken () {
    var curContext = this.curContext();
    if (!curContext || !curContext.preserveSpace) { this.skipSpace(); }
    this.state.octalPositions = [];
    this.state.start = this.state.pos;
    this.state.startLoc = this.state.curPosition();

    if (this.state.pos >= this.length) {
      this.finishToken(types.eof);
      return;
    }

    var override = curContext == null ? void 0 : curContext.override;

    if (override) {
      override(this);
    } else {
      this.getTokenFromCode(this.input.codePointAt(this.state.pos));
    }
  };

  Tokenizer.prototype.pushComment = function pushComment (block, text, start, end, startLoc, endLoc) {
    var comment = {
      type: block ? "CommentBlock" : "CommentLine",
      value: text,
      start: start,
      end: end,
      loc: new SourceLocation(startLoc, endLoc)
    };
    if (this.options.tokens) { this.pushToken(comment); }
    this.state.comments.push(comment);
    this.addComment(comment);
  };

  Tokenizer.prototype.skipBlockComment = function skipBlockComment () {
    var startLoc = this.state.curPosition();
    var start = this.state.pos;
    var end = this.input.indexOf("*/", this.state.pos + 2);
    if (end === -1) { throw this.raise(start, Errors.UnterminatedComment); }
    this.state.pos = end + 2;
    lineBreakG.lastIndex = start;
    var match;

    while ((match = lineBreakG.exec(this.input)) && match.index < this.state.pos) {
      ++this.state.curLine;
      this.state.lineStart = match.index + match[0].length;
    }

    if (this.isLookahead) { return; }
    this.pushComment(true, this.input.slice(start + 2, end), start, this.state.pos, startLoc, this.state.curPosition());
  };

  Tokenizer.prototype.skipLineComment = function skipLineComment (startSkip) {
    var start = this.state.pos;
    var startLoc = this.state.curPosition();
    var ch = this.input.charCodeAt(this.state.pos += startSkip);

    if (this.state.pos < this.length) {
      while (!isNewLine(ch) && ++this.state.pos < this.length) {
        ch = this.input.charCodeAt(this.state.pos);
      }
    }

    if (this.isLookahead) { return; }
    this.pushComment(false, this.input.slice(start + startSkip, this.state.pos), start, this.state.pos, startLoc, this.state.curPosition());
  };

  Tokenizer.prototype.skipSpace = function skipSpace () {
    loop: while (this.state.pos < this.length) {
      var ch = this.input.charCodeAt(this.state.pos);

      switch (ch) {
        case 32:
        case 160:
        case 9:
          ++this.state.pos;
          break;

        case 13:
          if (this.input.charCodeAt(this.state.pos + 1) === 10) {
            ++this.state.pos;
          }

        case 10:
        case 8232:
        case 8233:
          ++this.state.pos;
          ++this.state.curLine;
          this.state.lineStart = this.state.pos;
          break;

        case 47:
          switch (this.input.charCodeAt(this.state.pos + 1)) {
            case 42:
              this.skipBlockComment();
              break;

            case 47:
              this.skipLineComment(2);
              break;

            default:
              break loop;
          }

          break;

        default:
          if (isWhitespace(ch)) {
            ++this.state.pos;
          } else {
            break loop;
          }

      }
    }
  };

  Tokenizer.prototype.finishToken = function finishToken (type, val) {
    this.state.end = this.state.pos;
    this.state.endLoc = this.state.curPosition();
    var prevType = this.state.type;
    this.state.type = type;
    this.state.value = val;
    if (!this.isLookahead) { this.updateContext(prevType); }
  };

  Tokenizer.prototype.readToken_numberSign = function readToken_numberSign () {
    if (this.state.pos === 0 && this.readToken_interpreter()) {
      return;
    }

    var nextPos = this.state.pos + 1;
    var next = this.input.charCodeAt(nextPos);

    if (next >= 48 && next <= 57) {
      throw this.raise(this.state.pos, Errors.UnexpectedDigitAfterHash);
    }

    if (this.hasPlugin("recordAndTuple") && (next === 123 || next === 91)) {
      if (this.getPluginOption("recordAndTuple", "syntaxType") !== "hash") {
        throw this.raise(this.state.pos, next === 123 ? Errors.RecordExpressionHashIncorrectStartSyntaxType : Errors.TupleExpressionHashIncorrectStartSyntaxType);
      }

      if (next === 123) {
        this.finishToken(types.braceHashL);
      } else {
        this.finishToken(types.bracketHashL);
      }

      this.state.pos += 2;
    } else if (this.hasPlugin("classPrivateProperties") || this.hasPlugin("classPrivateMethods") || this.getPluginOption("pipelineOperator", "proposal") === "smart") {
      this.finishOp(types.hash, 1);
    } else {
      throw this.raise(this.state.pos, Errors.InvalidOrUnexpectedToken, "#");
    }
  };

  Tokenizer.prototype.readToken_dot = function readToken_dot () {
    var next = this.input.charCodeAt(this.state.pos + 1);

    if (next >= 48 && next <= 57) {
      this.readNumber(true);
      return;
    }

    if (next === 46 && this.input.charCodeAt(this.state.pos + 2) === 46) {
      this.state.pos += 3;
      this.finishToken(types.ellipsis);
    } else {
      ++this.state.pos;
      this.finishToken(types.dot);
    }
  };

  Tokenizer.prototype.readToken_slash = function readToken_slash () {
    if (this.state.exprAllowed && !this.state.inType) {
      ++this.state.pos;
      this.readRegexp();
      return;
    }

    var next = this.input.charCodeAt(this.state.pos + 1);

    if (next === 61) {
      this.finishOp(types.assign, 2);
    } else {
      this.finishOp(types.slash, 1);
    }
  };

  Tokenizer.prototype.readToken_interpreter = function readToken_interpreter () {
    if (this.state.pos !== 0 || this.length < 2) { return false; }
    var ch = this.input.charCodeAt(this.state.pos + 1);
    if (ch !== 33) { return false; }
    var start = this.state.pos;
    this.state.pos += 1;

    while (!isNewLine(ch) && ++this.state.pos < this.length) {
      ch = this.input.charCodeAt(this.state.pos);
    }

    var value = this.input.slice(start + 2, this.state.pos);
    this.finishToken(types.interpreterDirective, value);
    return true;
  };

  Tokenizer.prototype.readToken_mult_modulo = function readToken_mult_modulo (code) {
    var type = code === 42 ? types.star : types.modulo;
    var width = 1;
    var next = this.input.charCodeAt(this.state.pos + 1);
    var exprAllowed = this.state.exprAllowed;

    if (code === 42 && next === 42) {
      width++;
      next = this.input.charCodeAt(this.state.pos + 2);
      type = types.exponent;
    }

    if (next === 61 && !exprAllowed) {
      width++;
      type = types.assign;
    }

    this.finishOp(type, width);
  };

  Tokenizer.prototype.readToken_pipe_amp = function readToken_pipe_amp (code) {
    var next = this.input.charCodeAt(this.state.pos + 1);

    if (next === code) {
      if (this.input.charCodeAt(this.state.pos + 2) === 61) {
        this.finishOp(types.assign, 3);
      } else {
        this.finishOp(code === 124 ? types.logicalOR : types.logicalAND, 2);
      }

      return;
    }

    if (code === 124) {
      if (next === 62) {
        this.finishOp(types.pipeline, 2);
        return;
      }

      if (this.hasPlugin("recordAndTuple") && next === 125) {
        if (this.getPluginOption("recordAndTuple", "syntaxType") !== "bar") {
          throw this.raise(this.state.pos, Errors.RecordExpressionBarIncorrectEndSyntaxType);
        }

        this.finishOp(types.braceBarR, 2);
        return;
      }

      if (this.hasPlugin("recordAndTuple") && next === 93) {
        if (this.getPluginOption("recordAndTuple", "syntaxType") !== "bar") {
          throw this.raise(this.state.pos, Errors.TupleExpressionBarIncorrectEndSyntaxType);
        }

        this.finishOp(types.bracketBarR, 2);
        return;
      }
    }

    if (next === 61) {
      this.finishOp(types.assign, 2);
      return;
    }

    this.finishOp(code === 124 ? types.bitwiseOR : types.bitwiseAND, 1);
  };

  Tokenizer.prototype.readToken_caret = function readToken_caret () {
    var next = this.input.charCodeAt(this.state.pos + 1);

    if (next === 61) {
      this.finishOp(types.assign, 2);
    } else {
      this.finishOp(types.bitwiseXOR, 1);
    }
  };

  Tokenizer.prototype.readToken_plus_min = function readToken_plus_min (code) {
    var next = this.input.charCodeAt(this.state.pos + 1);

    if (next === code) {
      if (next === 45 && !this.inModule && this.input.charCodeAt(this.state.pos + 2) === 62 && (this.state.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.pos)))) {
        this.skipLineComment(3);
        this.skipSpace();
        this.nextToken();
        return;
      }

      this.finishOp(types.incDec, 2);
      return;
    }

    if (next === 61) {
      this.finishOp(types.assign, 2);
    } else {
      this.finishOp(types.plusMin, 1);
    }
  };

  Tokenizer.prototype.readToken_lt_gt = function readToken_lt_gt (code) {
    var next = this.input.charCodeAt(this.state.pos + 1);
    var size = 1;

    if (next === code) {
      size = code === 62 && this.input.charCodeAt(this.state.pos + 2) === 62 ? 3 : 2;

      if (this.input.charCodeAt(this.state.pos + size) === 61) {
        this.finishOp(types.assign, size + 1);
        return;
      }

      this.finishOp(types.bitShift, size);
      return;
    }

    if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.state.pos + 2) === 45 && this.input.charCodeAt(this.state.pos + 3) === 45) {
      this.skipLineComment(4);
      this.skipSpace();
      this.nextToken();
      return;
    }

    if (next === 61) {
      size = 2;
    }

    this.finishOp(types.relational, size);
  };

  Tokenizer.prototype.readToken_eq_excl = function readToken_eq_excl (code) {
    var next = this.input.charCodeAt(this.state.pos + 1);

    if (next === 61) {
      this.finishOp(types.equality, this.input.charCodeAt(this.state.pos + 2) === 61 ? 3 : 2);
      return;
    }

    if (code === 61 && next === 62) {
      this.state.pos += 2;
      this.finishToken(types.arrow);
      return;
    }

    this.finishOp(code === 61 ? types.eq : types.bang, 1);
  };

  Tokenizer.prototype.readToken_question = function readToken_question () {
    var next = this.input.charCodeAt(this.state.pos + 1);
    var next2 = this.input.charCodeAt(this.state.pos + 2);

    if (next === 63 && !this.state.inType) {
      if (next2 === 61) {
        this.finishOp(types.assign, 3);
      } else {
        this.finishOp(types.nullishCoalescing, 2);
      }
    } else if (next === 46 && !(next2 >= 48 && next2 <= 57)) {
      this.state.pos += 2;
      this.finishToken(types.questionDot);
    } else {
      ++this.state.pos;
      this.finishToken(types.question);
    }
  };

  Tokenizer.prototype.getTokenFromCode = function getTokenFromCode (code) {
    switch (code) {
      case 46:
        this.readToken_dot();
        return;

      case 40:
        ++this.state.pos;
        this.finishToken(types.parenL);
        return;

      case 41:
        ++this.state.pos;
        this.finishToken(types.parenR);
        return;

      case 59:
        ++this.state.pos;
        this.finishToken(types.semi);
        return;

      case 44:
        ++this.state.pos;
        this.finishToken(types.comma);
        return;

      case 91:
        if (this.hasPlugin("recordAndTuple") && this.input.charCodeAt(this.state.pos + 1) === 124) {
          if (this.getPluginOption("recordAndTuple", "syntaxType") !== "bar") {
            throw this.raise(this.state.pos, Errors.TupleExpressionBarIncorrectStartSyntaxType);
          }

          this.finishToken(types.bracketBarL);
          this.state.pos += 2;
        } else {
          ++this.state.pos;
          this.finishToken(types.bracketL);
        }

        return;

      case 93:
        ++this.state.pos;
        this.finishToken(types.bracketR);
        return;

      case 123:
        if (this.hasPlugin("recordAndTuple") && this.input.charCodeAt(this.state.pos + 1) === 124) {
          if (this.getPluginOption("recordAndTuple", "syntaxType") !== "bar") {
            throw this.raise(this.state.pos, Errors.RecordExpressionBarIncorrectStartSyntaxType);
          }

          this.finishToken(types.braceBarL);
          this.state.pos += 2;
        } else {
          ++this.state.pos;
          this.finishToken(types.braceL);
        }

        return;

      case 125:
        ++this.state.pos;
        this.finishToken(types.braceR);
        return;

      case 58:
        if (this.hasPlugin("functionBind") && this.input.charCodeAt(this.state.pos + 1) === 58) {
          this.finishOp(types.doubleColon, 2);
        } else {
          ++this.state.pos;
          this.finishToken(types.colon);
        }

        return;

      case 63:
        this.readToken_question();
        return;

      case 96:
        ++this.state.pos;
        this.finishToken(types.backQuote);
        return;

      case 48:
        {
          var next = this.input.charCodeAt(this.state.pos + 1);

          if (next === 120 || next === 88) {
            this.readRadixNumber(16);
            return;
          }

          if (next === 111 || next === 79) {
            this.readRadixNumber(8);
            return;
          }

          if (next === 98 || next === 66) {
            this.readRadixNumber(2);
            return;
          }
        }

      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        this.readNumber(false);
        return;

      case 34:
      case 39:
        this.readString(code);
        return;

      case 47:
        this.readToken_slash();
        return;

      case 37:
      case 42:
        this.readToken_mult_modulo(code);
        return;

      case 124:
      case 38:
        this.readToken_pipe_amp(code);
        return;

      case 94:
        this.readToken_caret();
        return;

      case 43:
      case 45:
        this.readToken_plus_min(code);
        return;

      case 60:
      case 62:
        this.readToken_lt_gt(code);
        return;

      case 61:
      case 33:
        this.readToken_eq_excl(code);
        return;

      case 126:
        this.finishOp(types.tilde, 1);
        return;

      case 64:
        ++this.state.pos;
        this.finishToken(types.at);
        return;

      case 35:
        this.readToken_numberSign();
        return;

      case 92:
        this.readWord();
        return;

      default:
        if (isIdentifierStart(code)) {
          this.readWord();
          return;
        }

    }

    throw this.raise(this.state.pos, Errors.InvalidOrUnexpectedToken, String.fromCodePoint(code));
  };

  Tokenizer.prototype.finishOp = function finishOp (type, size) {
    var str = this.input.slice(this.state.pos, this.state.pos + size);
    this.state.pos += size;
    this.finishToken(type, str);
  };

  Tokenizer.prototype.readRegexp = function readRegexp () {
    var start = this.state.pos;
    var escaped, inClass;

    for (;;) {
      if (this.state.pos >= this.length) {
        throw this.raise(start, Errors.UnterminatedRegExp);
      }

      var ch = this.input.charAt(this.state.pos);

      if (lineBreak.test(ch)) {
        throw this.raise(start, Errors.UnterminatedRegExp);
      }

      if (escaped) {
        escaped = false;
      } else {
        if (ch === "[") {
          inClass = true;
        } else if (ch === "]" && inClass) {
          inClass = false;
        } else if (ch === "/" && !inClass) {
          break;
        }

        escaped = ch === "\\";
      }

      ++this.state.pos;
    }

    var content = this.input.slice(start, this.state.pos);
    ++this.state.pos;
    var mods = "";

    while (this.state.pos < this.length) {
      var char = this.input[this.state.pos];
      var charCode = this.input.codePointAt(this.state.pos);

      if (VALID_REGEX_FLAGS.has(char)) {
        if (mods.indexOf(char) > -1) {
          this.raise(this.state.pos + 1, Errors.DuplicateRegExpFlags);
        }
      } else if (isIdentifierChar(charCode) || charCode === 92) {
        this.raise(this.state.pos + 1, Errors.MalformedRegExpFlags);
      } else {
        break;
      }

      ++this.state.pos;
      mods += char;
    }

    this.finishToken(types.regexp, {
      pattern: content,
      flags: mods
    });
  };

  Tokenizer.prototype.readInt = function readInt (radix, len, forceLen, allowNumSeparator) {
    if ( allowNumSeparator === void 0 ) allowNumSeparator = true;

    var start = this.state.pos;
    var forbiddenSiblings = radix === 16 ? forbiddenNumericSeparatorSiblings.hex : forbiddenNumericSeparatorSiblings.decBinOct;
    var allowedSiblings = radix === 16 ? allowedNumericSeparatorSiblings.hex : radix === 10 ? allowedNumericSeparatorSiblings.dec : radix === 8 ? allowedNumericSeparatorSiblings.oct : allowedNumericSeparatorSiblings.bin;
    var invalid = false;
    var total = 0;

    for (var i = 0, e = len == null ? Infinity : len; i < e; ++i) {
      var code = this.input.charCodeAt(this.state.pos);
      var val = (void 0);

      if (this.hasPlugin("numericSeparator")) {
        if (code === 95) {
          var prev = this.input.charCodeAt(this.state.pos - 1);
          var next = this.input.charCodeAt(this.state.pos + 1);

          if (allowedSiblings.indexOf(next) === -1) {
            this.raise(this.state.pos, Errors.UnexpectedNumericSeparator);
          } else if (forbiddenSiblings.indexOf(prev) > -1 || forbiddenSiblings.indexOf(next) > -1 || Number.isNaN(next)) {
            this.raise(this.state.pos, Errors.UnexpectedNumericSeparator);
          }

          if (!allowNumSeparator) {
            this.raise(this.state.pos, Errors.NumericSeparatorInEscapeSequence);
          }

          ++this.state.pos;
          continue;
        }
      }

      if (code >= 97) {
        val = code - 97 + 10;
      } else if (code >= 65) {
        val = code - 65 + 10;
      } else if (_isDigit(code)) {
        val = code - 48;
      } else {
        val = Infinity;
      }

      if (val >= radix) {
        if (this.options.errorRecovery && val <= 9) {
          val = 0;
          this.raise(this.state.start + i + 2, Errors.InvalidDigit, radix);
        } else if (forceLen) {
          val = 0;
          invalid = true;
        } else {
          break;
        }
      }

      ++this.state.pos;
      total = total * radix + val;
    }

    if (this.state.pos === start || len != null && this.state.pos - start !== len || invalid) {
      return null;
    }

    return total;
  };

  Tokenizer.prototype.readRadixNumber = function readRadixNumber (radix) {
    var start = this.state.pos;
    var isBigInt = false;
    this.state.pos += 2;
    var val = this.readInt(radix);

    if (val == null) {
      this.raise(this.state.start + 2, Errors.InvalidDigit, radix);
    }

    if (this.input.charCodeAt(this.state.pos) === 110) {
      ++this.state.pos;
      isBigInt = true;
    }

    if (isIdentifierStart(this.input.codePointAt(this.state.pos))) {
      throw this.raise(this.state.pos, Errors.NumberIdentifier);
    }

    if (isBigInt) {
      var str = this.input.slice(start, this.state.pos).replace(/[_n]/g, "");
      this.finishToken(types.bigint, str);
      return;
    }

    this.finishToken(types.num, val);
  };

  Tokenizer.prototype.readNumber = function readNumber (startsWithDot) {
    var start = this.state.pos;
    var isFloat = false;
    var isBigInt = false;
    var isNonOctalDecimalInt = false;

    if (!startsWithDot && this.readInt(10) === null) {
      this.raise(start, Errors.InvalidNumber);
    }

    var octal = this.state.pos - start >= 2 && this.input.charCodeAt(start) === 48;

    if (octal) {
      if (this.state.strict) {
        this.raise(start, Errors.StrictOctalLiteral);
      }

      if (/[89]/.test(this.input.slice(start, this.state.pos))) {
        octal = false;
        isNonOctalDecimalInt = true;
      }
    }

    var next = this.input.charCodeAt(this.state.pos);

    if (next === 46 && !octal) {
      ++this.state.pos;
      this.readInt(10);
      isFloat = true;
      next = this.input.charCodeAt(this.state.pos);
    }

    if ((next === 69 || next === 101) && !octal) {
      next = this.input.charCodeAt(++this.state.pos);

      if (next === 43 || next === 45) {
        ++this.state.pos;
      }

      if (this.readInt(10) === null) { this.raise(start, "Invalid number"); }
      isFloat = true;
      next = this.input.charCodeAt(this.state.pos);
    }

    if (this.hasPlugin("numericSeparator") && (octal || isNonOctalDecimalInt)) {
      var underscorePos = this.input.slice(start, this.state.pos).indexOf("_");

      if (underscorePos > 0) {
        this.raise(underscorePos + start, Errors.ZeroDigitNumericSeparator);
      }
    }

    if (next === 110) {
      if (isFloat || octal || isNonOctalDecimalInt) {
        this.raise(start, "Invalid BigIntLiteral");
      }

      ++this.state.pos;
      isBigInt = true;
    }

    if (isIdentifierStart(this.input.codePointAt(this.state.pos))) {
      throw this.raise(this.state.pos, Errors.NumberIdentifier);
    }

    var str = this.input.slice(start, this.state.pos).replace(/[_n]/g, "");

    if (isBigInt) {
      this.finishToken(types.bigint, str);
      return;
    }

    var val = octal ? parseInt(str, 8) : parseFloat(str);
    this.finishToken(types.num, val);
  };

  Tokenizer.prototype.readCodePoint = function readCodePoint (throwOnInvalid) {
    var ch = this.input.charCodeAt(this.state.pos);
    var code;

    if (ch === 123) {
      var codePos = ++this.state.pos;
      code = this.readHexChar(this.input.indexOf("}", this.state.pos) - this.state.pos, true, throwOnInvalid);
      ++this.state.pos;

      if (code !== null && code > 0x10ffff) {
        if (throwOnInvalid) {
          this.raise(codePos, Errors.InvalidCodePoint);
        } else {
          return null;
        }
      }
    } else {
      code = this.readHexChar(4, false, throwOnInvalid);
    }

    return code;
  };

  Tokenizer.prototype.readString = function readString (quote) {
    var out = "",
        chunkStart = ++this.state.pos;

    for (;;) {
      if (this.state.pos >= this.length) {
        throw this.raise(this.state.start, Errors.UnterminatedString);
      }

      var ch = this.input.charCodeAt(this.state.pos);
      if (ch === quote) { break; }

      if (ch === 92) {
        out += this.input.slice(chunkStart, this.state.pos);
        out += this.readEscapedChar(false);
        chunkStart = this.state.pos;
      } else if (ch === 8232 || ch === 8233) {
        ++this.state.pos;
        ++this.state.curLine;
        this.state.lineStart = this.state.pos;
      } else if (isNewLine(ch)) {
        throw this.raise(this.state.start, Errors.UnterminatedString);
      } else {
        ++this.state.pos;
      }
    }

    out += this.input.slice(chunkStart, this.state.pos++);
    this.finishToken(types.string, out);
  };

  Tokenizer.prototype.readTmplToken = function readTmplToken () {
    var out = "",
        chunkStart = this.state.pos,
        containsInvalid = false;

    for (;;) {
      if (this.state.pos >= this.length) {
        throw this.raise(this.state.start, Errors.UnterminatedTemplate);
      }

      var ch = this.input.charCodeAt(this.state.pos);

      if (ch === 96 || ch === 36 && this.input.charCodeAt(this.state.pos + 1) === 123) {
        if (this.state.pos === this.state.start && this.match(types.template)) {
          if (ch === 36) {
            this.state.pos += 2;
            this.finishToken(types.dollarBraceL);
            return;
          } else {
            ++this.state.pos;
            this.finishToken(types.backQuote);
            return;
          }
        }

        out += this.input.slice(chunkStart, this.state.pos);
        this.finishToken(types.template, containsInvalid ? null : out);
        return;
      }

      if (ch === 92) {
        out += this.input.slice(chunkStart, this.state.pos);
        var escaped = this.readEscapedChar(true);

        if (escaped === null) {
          containsInvalid = true;
        } else {
          out += escaped;
        }

        chunkStart = this.state.pos;
      } else if (isNewLine(ch)) {
        out += this.input.slice(chunkStart, this.state.pos);
        ++this.state.pos;

        switch (ch) {
          case 13:
            if (this.input.charCodeAt(this.state.pos) === 10) {
              ++this.state.pos;
            }

          case 10:
            out += "\n";
            break;

          default:
            out += String.fromCharCode(ch);
            break;
        }

        ++this.state.curLine;
        this.state.lineStart = this.state.pos;
        chunkStart = this.state.pos;
      } else {
        ++this.state.pos;
      }
    }
  };

  Tokenizer.prototype.readEscapedChar = function readEscapedChar (inTemplate) {
    var throwOnInvalid = !inTemplate;
    var ch = this.input.charCodeAt(++this.state.pos);
    ++this.state.pos;

    switch (ch) {
      case 110:
        return "\n";

      case 114:
        return "\r";

      case 120:
        {
          var code = this.readHexChar(2, false, throwOnInvalid);
          return code === null ? null : String.fromCharCode(code);
        }

      case 117:
        {
          var code$1 = this.readCodePoint(throwOnInvalid);
          return code$1 === null ? null : String.fromCodePoint(code$1);
        }

      case 116:
        return "\t";

      case 98:
        return "\b";

      case 118:
        return "\u000b";

      case 102:
        return "\f";

      case 13:
        if (this.input.charCodeAt(this.state.pos) === 10) {
          ++this.state.pos;
        }

      case 10:
        this.state.lineStart = this.state.pos;
        ++this.state.curLine;

      case 8232:
      case 8233:
        return "";

      case 56:
      case 57:
        if (inTemplate) {
          return null;
        }

      default:
        if (ch >= 48 && ch <= 55) {
          var codePos = this.state.pos - 1;
          var octalStr = this.input.substr(this.state.pos - 1, 3).match(/^[0-7]+/)[0];
          var octal = parseInt(octalStr, 8);

          if (octal > 255) {
            octalStr = octalStr.slice(0, -1);
            octal = parseInt(octalStr, 8);
          }

          this.state.pos += octalStr.length - 1;
          var next = this.input.charCodeAt(this.state.pos);

          if (octalStr !== "0" || next === 56 || next === 57) {
            if (inTemplate) {
              return null;
            } else if (this.state.strict) {
              this.raise(codePos, Errors.StrictOctalLiteral);
            } else {
              this.state.octalPositions.push(codePos);
            }
          }

          return String.fromCharCode(octal);
        }

        return String.fromCharCode(ch);
    }
  };

  Tokenizer.prototype.readHexChar = function readHexChar (len, forceLen, throwOnInvalid) {
    var codePos = this.state.pos;
    var n = this.readInt(16, len, forceLen, false);

    if (n === null) {
      if (throwOnInvalid) {
        this.raise(codePos, Errors.InvalidEscapeSequence);
      } else {
        this.state.pos = codePos - 1;
      }
    }

    return n;
  };

  Tokenizer.prototype.readWord1 = function readWord1 () {
    var word = "";
    this.state.containsEsc = false;
    var start = this.state.pos;
    var chunkStart = this.state.pos;

    while (this.state.pos < this.length) {
      var ch = this.input.codePointAt(this.state.pos);

      if (isIdentifierChar(ch)) {
        this.state.pos += ch <= 0xffff ? 1 : 2;
      } else if (this.state.isIterator && ch === 64) {
        ++this.state.pos;
      } else if (ch === 92) {
        this.state.containsEsc = true;
        word += this.input.slice(chunkStart, this.state.pos);
        var escStart = this.state.pos;
        var identifierCheck = this.state.pos === start ? isIdentifierStart : isIdentifierChar;

        if (this.input.charCodeAt(++this.state.pos) !== 117) {
          this.raise(this.state.pos, Errors.MissingUnicodeEscape);
          continue;
        }

        ++this.state.pos;
        var esc = this.readCodePoint(true);

        if (esc !== null) {
          if (!identifierCheck(esc)) {
            this.raise(escStart, Errors.EscapedCharNotAnIdentifier);
          }

          word += String.fromCodePoint(esc);
        }

        chunkStart = this.state.pos;
      } else {
        break;
      }
    }

    return word + this.input.slice(chunkStart, this.state.pos);
  };

  Tokenizer.prototype.isIterator = function isIterator (word) {
    return word === "@@iterator" || word === "@@asyncIterator";
  };

  Tokenizer.prototype.readWord = function readWord () {
    var word = this.readWord1();
    var type = keywords.get(word) || types.name;

    if (this.state.isIterator && (!this.isIterator(word) || !this.state.inType)) {
      this.raise(this.state.pos, Errors.InvalidIdentifier, word);
    }

    this.finishToken(type, word);
  };

  Tokenizer.prototype.checkKeywordEscapes = function checkKeywordEscapes () {
    var kw = this.state.type.keyword;

    if (kw && this.state.containsEsc) {
      this.raise(this.state.start, Errors.InvalidEscapedReservedWord, kw);
    }
  };

  Tokenizer.prototype.braceIsBlock = function braceIsBlock (prevType) {
    var parent = this.curContext();

    if (parent === types$1.functionExpression || parent === types$1.functionStatement) {
      return true;
    }

    if (prevType === types.colon && (parent === types$1.braceStatement || parent === types$1.braceExpression)) {
      return !parent.isExpr;
    }

    if (prevType === types._return || prevType === types.name && this.state.exprAllowed) {
      return lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start));
    }

    if (prevType === types._else || prevType === types.semi || prevType === types.eof || prevType === types.parenR || prevType === types.arrow) {
      return true;
    }

    if (prevType === types.braceL) {
      return parent === types$1.braceStatement;
    }

    if (prevType === types._var || prevType === types._const || prevType === types.name) {
      return false;
    }

    if (prevType === types.relational) {
      return true;
    }

    return !this.state.exprAllowed;
  };

  Tokenizer.prototype.updateContext = function updateContext (prevType) {
    var type = this.state.type;
    var update;

    if (type.keyword && (prevType === types.dot || prevType === types.questionDot)) {
      this.state.exprAllowed = false;
    } else if (update = type.updateContext) {
      update.call(this, prevType);
    } else {
      this.state.exprAllowed = type.beforeExpr;
    }
  };

  return Tokenizer;
}(LocationParser));

var UtilParser = /*@__PURE__*/(function (Tokenizer) {
  function UtilParser () {
    Tokenizer.apply(this, arguments);
  }

  if ( Tokenizer ) UtilParser.__proto__ = Tokenizer;
  UtilParser.prototype = Object.create( Tokenizer && Tokenizer.prototype );
  UtilParser.prototype.constructor = UtilParser;

  UtilParser.prototype.addExtra = function addExtra (node, key, val) {
    if (!node) { return; }
    var extra = node.extra = node.extra || {};
    extra[key] = val;
  };

  UtilParser.prototype.isRelational = function isRelational (op) {
    return this.match(types.relational) && this.state.value === op;
  };

  UtilParser.prototype.isLookaheadRelational = function isLookaheadRelational (op) {
    var next = this.nextTokenStart();

    if (this.input.charAt(next) === op) {
      if (next + 1 === this.input.length) {
        return true;
      }

      var afterNext = this.input.charCodeAt(next + 1);
      return afterNext !== op.charCodeAt(0) && afterNext !== 61;
    }

    return false;
  };

  UtilParser.prototype.expectRelational = function expectRelational (op) {
    if (this.isRelational(op)) {
      this.next();
    } else {
      this.unexpected(null, types.relational);
    }
  };

  UtilParser.prototype.isContextual = function isContextual (name) {
    return this.match(types.name) && this.state.value === name && !this.state.containsEsc;
  };

  UtilParser.prototype.isUnparsedContextual = function isUnparsedContextual (nameStart, name) {
    var nameEnd = nameStart + name.length;
    return this.input.slice(nameStart, nameEnd) === name && (nameEnd === this.input.length || !isIdentifierChar(this.input.charCodeAt(nameEnd)));
  };

  UtilParser.prototype.isLookaheadContextual = function isLookaheadContextual (name) {
    var next = this.nextTokenStart();
    return this.isUnparsedContextual(next, name);
  };

  UtilParser.prototype.eatContextual = function eatContextual (name) {
    return this.isContextual(name) && this.eat(types.name);
  };

  UtilParser.prototype.expectContextual = function expectContextual (name, message) {
    if (!this.eatContextual(name)) { this.unexpected(null, message); }
  };

  UtilParser.prototype.canInsertSemicolon = function canInsertSemicolon () {
    return this.match(types.eof) || this.match(types.braceR) || this.hasPrecedingLineBreak();
  };

  UtilParser.prototype.hasPrecedingLineBreak = function hasPrecedingLineBreak () {
    return lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start));
  };

  UtilParser.prototype.isLineTerminator = function isLineTerminator () {
    return this.eat(types.semi) || this.canInsertSemicolon();
  };

  UtilParser.prototype.semicolon = function semicolon () {
    if (!this.isLineTerminator()) { this.unexpected(null, types.semi); }
  };

  UtilParser.prototype.expect = function expect (type, pos) {
    this.eat(type) || this.unexpected(pos, type);
  };

  UtilParser.prototype.assertNoSpace = function assertNoSpace (message) {
    if ( message === void 0 ) message = "Unexpected space.";

    if (this.state.start > this.state.lastTokEnd) {
      this.raise(this.state.lastTokEnd, message);
    }
  };

  UtilParser.prototype.unexpected = function unexpected (pos, messageOrType) {
    if ( messageOrType === void 0 ) messageOrType = "Unexpected token";

    if (typeof messageOrType !== "string") {
      messageOrType = "Unexpected token, expected \"" + (messageOrType.label) + "\"";
    }

    throw this.raise(pos != null ? pos : this.state.start, messageOrType);
  };

  UtilParser.prototype.expectPlugin = function expectPlugin (name, pos) {
    if (!this.hasPlugin(name)) {
      throw this.raiseWithData(pos != null ? pos : this.state.start, {
        missingPlugin: [name]
      }, ("This experimental syntax requires enabling the parser plugin: '" + name + "'"));
    }

    return true;
  };

  UtilParser.prototype.expectOnePlugin = function expectOnePlugin (names, pos) {
    var this$1 = this;

    if (!names.some(function (n) { return this$1.hasPlugin(n); })) {
      throw this.raiseWithData(pos != null ? pos : this.state.start, {
        missingPlugin: names
      }, ("This experimental syntax requires enabling one of the following parser plugin(s): '" + (names.join(", ")) + "'"));
    }
  };

  UtilParser.prototype.checkYieldAwaitInDefaultParams = function checkYieldAwaitInDefaultParams () {
    if (this.state.yieldPos !== -1 && (this.state.awaitPos === -1 || this.state.yieldPos < this.state.awaitPos)) {
      this.raise(this.state.yieldPos, "Yield cannot be used as name inside a generator function");
    }

    if (this.state.awaitPos !== -1) {
      this.raise(this.state.awaitPos, "Await cannot be used as name inside an async function");
    }
  };

  UtilParser.prototype.tryParse = function tryParse (fn, oldState) {
    if ( oldState === void 0 ) oldState = this.state.clone();

    var abortSignal = {
      node: null
    };

    try {
      var node = fn(function (node) {
        if ( node === void 0 ) node = null;

        abortSignal.node = node;
        throw abortSignal;
      });

      if (this.state.errors.length > oldState.errors.length) {
        var failState = this.state;
        this.state = oldState;
        return {
          node: node,
          error: failState.errors[oldState.errors.length],
          thrown: false,
          aborted: false,
          failState: failState
        };
      }

      return {
        node: node,
        error: null,
        thrown: false,
        aborted: false,
        failState: null
      };
    } catch (error) {
      var failState$1 = this.state;
      this.state = oldState;

      if (error instanceof SyntaxError) {
        return {
          node: null,
          error: error,
          thrown: true,
          aborted: false,
          failState: failState$1
        };
      }

      if (error === abortSignal) {
        return {
          node: abortSignal.node,
          error: null,
          thrown: false,
          aborted: true,
          failState: failState$1
        };
      }

      throw error;
    }
  };

  UtilParser.prototype.checkExpressionErrors = function checkExpressionErrors (refExpressionErrors, andThrow) {
    if (!refExpressionErrors) { return false; }
    var shorthandAssign = refExpressionErrors.shorthandAssign;
    var doubleProto = refExpressionErrors.doubleProto;
    if (!andThrow) { return shorthandAssign >= 0 || doubleProto >= 0; }

    if (shorthandAssign >= 0) {
      this.unexpected(shorthandAssign);
    }

    if (doubleProto >= 0) {
      this.raise(doubleProto, Errors.DuplicateProto);
    }
  };

  return UtilParser;
}(Tokenizer));
var ExpressionErrors = function ExpressionErrors() {
  this.shorthandAssign = -1;
  this.doubleProto = -1;
};

var Node = function Node(parser, pos, loc) {
  this.type = "";
  this.start = pos;
  this.end = 0;
  this.loc = new SourceLocation(loc);
  if (parser && parser.options.ranges) { this.range = [pos, 0]; }
  if (parser && parser.filename) { this.loc.filename = parser.filename; }
};

Node.prototype.__clone = function __clone () {
  var newNode = new Node();
  var keys = Object.keys(this);

  for (var i = 0, length = keys.length; i < length; i++) {
    var key = keys[i];

    if (key !== "leadingComments" && key !== "trailingComments" && key !== "innerComments") {
      newNode[key] = this[key];
    }
  }

  return newNode;
};

var NodeUtils = /*@__PURE__*/(function (UtilParser) {
  function NodeUtils () {
    UtilParser.apply(this, arguments);
  }

  if ( UtilParser ) NodeUtils.__proto__ = UtilParser;
  NodeUtils.prototype = Object.create( UtilParser && UtilParser.prototype );
  NodeUtils.prototype.constructor = NodeUtils;

  NodeUtils.prototype.startNode = function startNode () {
    return new Node(this, this.state.start, this.state.startLoc);
  };

  NodeUtils.prototype.startNodeAt = function startNodeAt (pos, loc) {
    return new Node(this, pos, loc);
  };

  NodeUtils.prototype.startNodeAtNode = function startNodeAtNode (type) {
    return this.startNodeAt(type.start, type.loc.start);
  };

  NodeUtils.prototype.finishNode = function finishNode (node, type) {
    return this.finishNodeAt(node, type, this.state.lastTokEnd, this.state.lastTokEndLoc);
  };

  NodeUtils.prototype.finishNodeAt = function finishNodeAt (node, type, pos, loc) {

    node.type = type;
    node.end = pos;
    node.loc.end = loc;
    if (this.options.ranges) { node.range[1] = pos; }
    this.processComment(node);
    return node;
  };

  NodeUtils.prototype.resetStartLocation = function resetStartLocation (node, start, startLoc) {
    node.start = start;
    node.loc.start = startLoc;
    if (this.options.ranges) { node.range[0] = start; }
  };

  NodeUtils.prototype.resetEndLocation = function resetEndLocation (node, end, endLoc) {
    if ( end === void 0 ) end = this.state.lastTokEnd;
    if ( endLoc === void 0 ) endLoc = this.state.lastTokEndLoc;

    node.end = end;
    node.loc.end = endLoc;
    if (this.options.ranges) { node.range[1] = end; }
  };

  NodeUtils.prototype.resetStartLocationFromNode = function resetStartLocationFromNode (node, locationNode) {
    this.resetStartLocation(node, locationNode.start, locationNode.loc.start);
  };

  return NodeUtils;
}(UtilParser));

var unwrapParenthesizedExpression = function (node) {
  return node.type === "ParenthesizedExpression" ? unwrapParenthesizedExpression(node.expression) : node;
};

var LValParser = /*@__PURE__*/(function (NodeUtils) {
  function LValParser () {
    NodeUtils.apply(this, arguments);
  }

  if ( NodeUtils ) LValParser.__proto__ = NodeUtils;
  LValParser.prototype = Object.create( NodeUtils && NodeUtils.prototype );
  LValParser.prototype.constructor = LValParser;

  LValParser.prototype.toAssignable = function toAssignable (node) {
    var _node$extra, _node$extra3;

    var parenthesized = undefined;

    if (node.type === "ParenthesizedExpression" || ((_node$extra = node.extra) == null ? void 0 : _node$extra.parenthesized)) {
      parenthesized = unwrapParenthesizedExpression(node);

      if (parenthesized.type !== "Identifier" && parenthesized.type !== "MemberExpression") {
        this.raise(node.start, Errors.InvalidParenthesizedAssignment);
      }
    }

    switch (node.type) {
      case "Identifier":
      case "ObjectPattern":
      case "ArrayPattern":
      case "AssignmentPattern":
        break;

      case "ObjectExpression":
        node.type = "ObjectPattern";

        for (var i = 0, length = node.properties.length, last = length - 1; i < length; i++) {
          var _node$extra2;

          var prop = node.properties[i];
          var isLast = i === last;
          this.toAssignableObjectExpressionProp(prop, isLast);

          if (isLast && prop.type === "RestElement" && ((_node$extra2 = node.extra) == null ? void 0 : _node$extra2.trailingComma)) {
            this.raiseRestNotLast(node.extra.trailingComma);
          }
        }

        break;

      case "ObjectProperty":
        this.toAssignable(node.value);
        break;

      case "SpreadElement":
        {
          this.checkToRestConversion(node);
          node.type = "RestElement";
          var arg = node.argument;
          this.toAssignable(arg);
          break;
        }

      case "ArrayExpression":
        node.type = "ArrayPattern";
        this.toAssignableList(node.elements, (_node$extra3 = node.extra) == null ? void 0 : _node$extra3.trailingComma);
        break;

      case "AssignmentExpression":
        if (node.operator !== "=") {
          this.raise(node.left.end, Errors.MissingEqInAssignment);
        }

        node.type = "AssignmentPattern";
        delete node.operator;
        this.toAssignable(node.left);
        break;

      case "ParenthesizedExpression":
        this.toAssignable(parenthesized);
        break;
    }

    return node;
  };

  LValParser.prototype.toAssignableObjectExpressionProp = function toAssignableObjectExpressionProp (prop, isLast) {
    if (prop.type === "ObjectMethod") {
      var error = prop.kind === "get" || prop.kind === "set" ? Errors.PatternHasAccessor : Errors.PatternHasMethod;
      this.raise(prop.key.start, error);
    } else if (prop.type === "SpreadElement" && !isLast) {
      this.raiseRestNotLast(prop.start);
    } else {
      this.toAssignable(prop);
    }
  };

  LValParser.prototype.toAssignableList = function toAssignableList (exprList, trailingCommaPos) {
    var end = exprList.length;

    if (end) {
      var last = exprList[end - 1];

      if (last && last.type === "RestElement") {
        --end;
      } else if (last && last.type === "SpreadElement") {
        last.type = "RestElement";
        var arg = last.argument;
        this.toAssignable(arg);

        if (arg.type !== "Identifier" && arg.type !== "MemberExpression" && arg.type !== "ArrayPattern" && arg.type !== "ObjectPattern") {
          this.unexpected(arg.start);
        }

        if (trailingCommaPos) {
          this.raiseTrailingCommaAfterRest(trailingCommaPos);
        }

        --end;
      }
    }

    for (var i = 0; i < end; i++) {
      var elt = exprList[i];

      if (elt) {
        this.toAssignable(elt);

        if (elt.type === "RestElement") {
          this.raiseRestNotLast(elt.start);
        }
      }
    }

    return exprList;
  };

  LValParser.prototype.toReferencedList = function toReferencedList (exprList, isParenthesizedExpr) {
    return exprList;
  };

  LValParser.prototype.toReferencedListDeep = function toReferencedListDeep (exprList, isParenthesizedExpr) {
    this.toReferencedList(exprList, isParenthesizedExpr);

    for (var _i = 0; _i < exprList.length; _i++) {
      var expr = exprList[_i];

      if (expr && expr.type === "ArrayExpression") {
        this.toReferencedListDeep(expr.elements);
      }
    }
  };

  LValParser.prototype.parseSpread = function parseSpread (refExpressionErrors, refNeedsArrowPos) {
    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeAssign(false, refExpressionErrors, undefined, refNeedsArrowPos);
    return this.finishNode(node, "SpreadElement");
  };

  LValParser.prototype.parseRestBinding = function parseRestBinding () {
    var node = this.startNode();
    this.next();
    node.argument = this.parseBindingAtom();
    return this.finishNode(node, "RestElement");
  };

  LValParser.prototype.parseBindingAtom = function parseBindingAtom () {
    switch (this.state.type) {
      case types.bracketL:
        {
          var node = this.startNode();
          this.next();
          node.elements = this.parseBindingList(types.bracketR, 93, true);
          return this.finishNode(node, "ArrayPattern");
        }

      case types.braceL:
        return this.parseObj(types.braceR, true);
    }

    return this.parseIdentifier();
  };

  LValParser.prototype.parseBindingList = function parseBindingList (close, closeCharCode, allowEmpty, allowModifiers) {
    var elts = [];
    var first = true;

    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect(types.comma);
      }

      if (allowEmpty && this.match(types.comma)) {
        elts.push(null);
      } else if (this.eat(close)) {
        break;
      } else if (this.match(types.ellipsis)) {
        elts.push(this.parseAssignableListItemTypes(this.parseRestBinding()));
        this.checkCommaAfterRest(closeCharCode);
        this.expect(close);
        break;
      } else {
        var decorators = [];

        if (this.match(types.at) && this.hasPlugin("decorators")) {
          this.raise(this.state.start, Errors.UnsupportedParameterDecorator);
        }

        while (this.match(types.at)) {
          decorators.push(this.parseDecorator());
        }

        elts.push(this.parseAssignableListItem(allowModifiers, decorators));
      }
    }

    return elts;
  };

  LValParser.prototype.parseAssignableListItem = function parseAssignableListItem (allowModifiers, decorators) {
    var left = this.parseMaybeDefault();
    this.parseAssignableListItemTypes(left);
    var elt = this.parseMaybeDefault(left.start, left.loc.start, left);

    if (decorators.length) {
      left.decorators = decorators;
    }

    return elt;
  };

  LValParser.prototype.parseAssignableListItemTypes = function parseAssignableListItemTypes (param) {
    return param;
  };

  LValParser.prototype.parseMaybeDefault = function parseMaybeDefault (startPos, startLoc, left) {
    startLoc = startLoc || this.state.startLoc;
    startPos = startPos || this.state.start;
    left = left || this.parseBindingAtom();
    if (!this.eat(types.eq)) { return left; }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.right = this.parseMaybeAssign();
    return this.finishNode(node, "AssignmentPattern");
  };

  LValParser.prototype.checkLVal = function checkLVal (expr, bindingType, checkClashes, contextDescription, disallowLetBinding, strictModeChanged) {
    if ( bindingType === void 0 ) bindingType = BIND_NONE;
    if ( strictModeChanged === void 0 ) strictModeChanged = false;

    switch (expr.type) {
      case "Identifier":
        if (this.state.strict && (strictModeChanged ? isStrictBindReservedWord(expr.name, this.inModule) : isStrictBindOnlyReservedWord(expr.name))) {
          this.raise(expr.start, bindingType === BIND_NONE ? Errors.StrictEvalArguments : Errors.StrictEvalArgumentsBinding, expr.name);
        }

        if (checkClashes) {
          var key = "_" + (expr.name);

          if (checkClashes[key]) {
            this.raise(expr.start, Errors.ParamDupe);
          } else {
            checkClashes[key] = true;
          }
        }

        if (disallowLetBinding && expr.name === "let") {
          this.raise(expr.start, Errors.LetInLexicalBinding);
        }

        if (!(bindingType & BIND_NONE)) {
          this.scope.declareName(expr.name, bindingType, expr.start);
        }

        break;

      case "MemberExpression":
        if (bindingType !== BIND_NONE) {
          this.raise(expr.start, Errors.InvalidPropertyBindingPattern);
        }

        break;

      case "ObjectPattern":
        for (var _i2 = 0, _expr$properties = expr.properties; _i2 < _expr$properties.length; _i2++) {
          var prop = _expr$properties[_i2];
          if (prop.type === "ObjectProperty") { prop = prop.value; }else if (prop.type === "ObjectMethod") { continue; }
          this.checkLVal(prop, bindingType, checkClashes, "object destructuring pattern", disallowLetBinding);
        }

        break;

      case "ArrayPattern":
        for (var _i3 = 0, _expr$elements = expr.elements; _i3 < _expr$elements.length; _i3++) {
          var elem = _expr$elements[_i3];

          if (elem) {
            this.checkLVal(elem, bindingType, checkClashes, "array destructuring pattern", disallowLetBinding);
          }
        }

        break;

      case "AssignmentPattern":
        this.checkLVal(expr.left, bindingType, checkClashes, "assignment pattern");
        break;

      case "RestElement":
        this.checkLVal(expr.argument, bindingType, checkClashes, "rest element");
        break;

      case "ParenthesizedExpression":
        this.checkLVal(expr.expression, bindingType, checkClashes, "parenthesized expression");
        break;

      default:
        {
          this.raise(expr.start, bindingType === BIND_NONE ? Errors.InvalidLhs : Errors.InvalidLhsBinding, contextDescription);
        }
    }
  };

  LValParser.prototype.checkToRestConversion = function checkToRestConversion (node) {
    if (node.argument.type !== "Identifier" && node.argument.type !== "MemberExpression") {
      this.raise(node.argument.start, Errors.InvalidRestAssignmentPattern);
    }
  };

  LValParser.prototype.checkCommaAfterRest = function checkCommaAfterRest (close) {
    if (this.match(types.comma)) {
      if (this.lookaheadCharCode() === close) {
        this.raiseTrailingCommaAfterRest(this.state.start);
      } else {
        this.raiseRestNotLast(this.state.start);
      }
    }
  };

  LValParser.prototype.raiseRestNotLast = function raiseRestNotLast (pos) {
    throw this.raise(pos, Errors.ElementAfterRest);
  };

  LValParser.prototype.raiseTrailingCommaAfterRest = function raiseTrailingCommaAfterRest (pos) {
    this.raise(pos, Errors.RestTrailingComma);
  };

  return LValParser;
}(NodeUtils));

var ExpressionParser = /*@__PURE__*/(function (LValParser) {
  function ExpressionParser () {
    LValParser.apply(this, arguments);
  }

  if ( LValParser ) ExpressionParser.__proto__ = LValParser;
  ExpressionParser.prototype = Object.create( LValParser && LValParser.prototype );
  ExpressionParser.prototype.constructor = ExpressionParser;

  ExpressionParser.prototype.checkDuplicatedProto = function checkDuplicatedProto (prop, protoRef, refExpressionErrors) {
    if (prop.type === "SpreadElement" || prop.computed || prop.kind || prop.shorthand) {
      return;
    }

    var key = prop.key;
    var name = key.type === "Identifier" ? key.name : String(key.value);

    if (name === "__proto__") {
      if (protoRef.used) {
        if (refExpressionErrors) {
          if (refExpressionErrors.doubleProto === -1) {
            refExpressionErrors.doubleProto = key.start;
          }
        } else {
          this.raise(key.start, Errors.DuplicateProto);
        }
      }

      protoRef.used = true;
    }
  };

  ExpressionParser.prototype.getExpression = function getExpression () {
    var paramFlags = PARAM;

    if (this.hasPlugin("topLevelAwait") && this.inModule) {
      paramFlags |= PARAM_AWAIT;
    }

    this.scope.enter(SCOPE_PROGRAM);
    this.prodParam.enter(paramFlags);
    this.nextToken();
    var expr = this.parseExpression();

    if (!this.match(types.eof)) {
      this.unexpected();
    }

    expr.comments = this.state.comments;
    expr.errors = this.state.errors;
    return expr;
  };

  ExpressionParser.prototype.parseExpression = function parseExpression (noIn, refExpressionErrors) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var expr = this.parseMaybeAssign(noIn, refExpressionErrors);

    if (this.match(types.comma)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.expressions = [expr];

      while (this.eat(types.comma)) {
        node.expressions.push(this.parseMaybeAssign(noIn, refExpressionErrors));
      }

      this.toReferencedList(node.expressions);
      return this.finishNode(node, "SequenceExpression");
    }

    return expr;
  };

  ExpressionParser.prototype.parseMaybeAssign = function parseMaybeAssign (noIn, refExpressionErrors, afterLeftParse, refNeedsArrowPos) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;

    if (this.isContextual("yield")) {
      if (this.prodParam.hasYield) {
        var left$1 = this.parseYield(noIn);

        if (afterLeftParse) {
          left$1 = afterLeftParse.call(this, left$1, startPos, startLoc);
        }

        return left$1;
      } else {
        this.state.exprAllowed = false;
      }
    }

    var ownExpressionErrors;

    if (refExpressionErrors) {
      ownExpressionErrors = false;
    } else {
      refExpressionErrors = new ExpressionErrors();
      ownExpressionErrors = true;
    }

    if (this.match(types.parenL) || this.match(types.name)) {
      this.state.potentialArrowAt = this.state.start;
    }

    var left = this.parseMaybeConditional(noIn, refExpressionErrors, refNeedsArrowPos);

    if (afterLeftParse) {
      left = afterLeftParse.call(this, left, startPos, startLoc);
    }

    if (this.state.type.isAssign) {
      var node = this.startNodeAt(startPos, startLoc);
      var operator = this.state.value;
      node.operator = operator;

      if (operator === "??=") {
        this.expectPlugin("logicalAssignment");
      }

      if (operator === "||=" || operator === "&&=") {
        this.expectPlugin("logicalAssignment");
      }

      if (this.match(types.eq)) {
        node.left = this.toAssignable(left);
        refExpressionErrors.doubleProto = -1;
      } else {
        node.left = left;
      }

      if (refExpressionErrors.shorthandAssign >= node.left.start) {
        refExpressionErrors.shorthandAssign = -1;
      }

      this.checkLVal(left, undefined, undefined, "assignment expression");
      this.next();
      node.right = this.parseMaybeAssign(noIn);
      return this.finishNode(node, "AssignmentExpression");
    } else if (ownExpressionErrors) {
      this.checkExpressionErrors(refExpressionErrors, true);
    }

    return left;
  };

  ExpressionParser.prototype.parseMaybeConditional = function parseMaybeConditional (noIn, refExpressionErrors, refNeedsArrowPos) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var potentialArrowAt = this.state.potentialArrowAt;
    var expr = this.parseExprOps(noIn, refExpressionErrors);

    if (expr.type === "ArrowFunctionExpression" && expr.start === potentialArrowAt) {
      return expr;
    }

    if (this.checkExpressionErrors(refExpressionErrors, false)) { return expr; }
    return this.parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos);
  };

  ExpressionParser.prototype.parseConditional = function parseConditional (expr, noIn, startPos, startLoc, refNeedsArrowPos) {
    if (this.eat(types.question)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.test = expr;
      node.consequent = this.parseMaybeAssign();
      this.expect(types.colon);
      node.alternate = this.parseMaybeAssign(noIn);
      return this.finishNode(node, "ConditionalExpression");
    }

    return expr;
  };

  ExpressionParser.prototype.parseExprOps = function parseExprOps (noIn, refExpressionErrors) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var potentialArrowAt = this.state.potentialArrowAt;
    var expr = this.parseMaybeUnary(refExpressionErrors);

    if (expr.type === "ArrowFunctionExpression" && expr.start === potentialArrowAt) {
      return expr;
    }

    if (this.checkExpressionErrors(refExpressionErrors, false)) {
      return expr;
    }

    return this.parseExprOp(expr, startPos, startLoc, -1, noIn);
  };

  ExpressionParser.prototype.parseExprOp = function parseExprOp (left, leftStartPos, leftStartLoc, minPrec, noIn) {
    var prec = this.state.type.binop;

    if (prec != null && (!noIn || !this.match(types._in))) {
      if (prec > minPrec) {
        var operator = this.state.value;

        if (operator === "|>" && this.state.inFSharpPipelineDirectBody) {
          return left;
        }

        var node = this.startNodeAt(leftStartPos, leftStartLoc);
        node.left = left;
        node.operator = operator;

        if (operator === "**" && left.type === "UnaryExpression" && (this.options.createParenthesizedExpressions || !(left.extra && left.extra.parenthesized))) {
          this.raise(left.argument.start, Errors.UnexpectedTokenUnaryExponentiation);
        }

        var op = this.state.type;
        var logical = op === types.logicalOR || op === types.logicalAND;
        var coalesce = op === types.nullishCoalescing;

        if (op === types.pipeline) {
          this.expectPlugin("pipelineOperator");
          this.state.inPipeline = true;
          this.checkPipelineAtInfixOperator(left, leftStartPos);
        } else if (coalesce) {
          prec = types.logicalAND.binop;
        }

        this.next();

        if (op === types.pipeline && this.getPluginOption("pipelineOperator", "proposal") === "minimal") {
          if (this.match(types.name) && this.state.value === "await" && this.prodParam.hasAwait) {
            throw this.raise(this.state.start, Errors.UnexpectedAwaitAfterPipelineBody);
          }
        }

        node.right = this.parseExprOpRightExpr(op, prec, noIn);
        this.finishNode(node, logical || coalesce ? "LogicalExpression" : "BinaryExpression");
        var nextOp = this.state.type;

        if (coalesce && (nextOp === types.logicalOR || nextOp === types.logicalAND) || logical && nextOp === types.nullishCoalescing) {
          throw this.raise(this.state.start, Errors.MixingCoalesceWithLogical);
        }

        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, noIn);
      }
    }

    return left;
  };

  ExpressionParser.prototype.parseExprOpRightExpr = function parseExprOpRightExpr (op, prec, noIn) {
    var this$1 = this;

    var startPos = this.state.start;
    var startLoc = this.state.startLoc;

    switch (op) {
      case types.pipeline:
        switch (this.getPluginOption("pipelineOperator", "proposal")) {
          case "smart":
            return this.withTopicPermittingContext(function () {
              return this$1.parseSmartPipelineBody(this$1.parseExprOpBaseRightExpr(op, prec, noIn), startPos, startLoc);
            });

          case "fsharp":
            return this.withSoloAwaitPermittingContext(function () {
              return this$1.parseFSharpPipelineBody(prec, noIn);
            });
        }

      default:
        return this.parseExprOpBaseRightExpr(op, prec, noIn);
    }
  };

  ExpressionParser.prototype.parseExprOpBaseRightExpr = function parseExprOpBaseRightExpr (op, prec, noIn) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    return this.parseExprOp(this.parseMaybeUnary(), startPos, startLoc, op.rightAssociative ? prec - 1 : prec, noIn);
  };

  ExpressionParser.prototype.parseMaybeUnary = function parseMaybeUnary (refExpressionErrors) {
    if (this.isContextual("await") && this.isAwaitAllowed()) {
      return this.parseAwait();
    } else if (this.state.type.prefix) {
      var node = this.startNode();
      var update = this.match(types.incDec);
      node.operator = this.state.value;
      node.prefix = true;

      if (node.operator === "throw") {
        this.expectPlugin("throwExpressions");
      }

      this.next();
      node.argument = this.parseMaybeUnary();
      this.checkExpressionErrors(refExpressionErrors, true);

      if (update) {
        this.checkLVal(node.argument, undefined, undefined, "prefix operation");
      } else if (this.state.strict && node.operator === "delete") {
        var arg = node.argument;

        if (arg.type === "Identifier") {
          this.raise(node.start, Errors.StrictDelete);
        } else if (arg.type === "MemberExpression" && arg.property.type === "PrivateName") {
          this.raise(node.start, Errors.DeletePrivateField);
        }
      }

      return this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    }

    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var expr = this.parseExprSubscripts(refExpressionErrors);
    if (this.checkExpressionErrors(refExpressionErrors, false)) { return expr; }

    while (this.state.type.postfix && !this.canInsertSemicolon()) {
      var node$1 = this.startNodeAt(startPos, startLoc);
      node$1.operator = this.state.value;
      node$1.prefix = false;
      node$1.argument = expr;
      this.checkLVal(expr, undefined, undefined, "postfix operation");
      this.next();
      expr = this.finishNode(node$1, "UpdateExpression");
    }

    return expr;
  };

  ExpressionParser.prototype.parseExprSubscripts = function parseExprSubscripts (refExpressionErrors) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var potentialArrowAt = this.state.potentialArrowAt;
    var expr = this.parseExprAtom(refExpressionErrors);

    if (expr.type === "ArrowFunctionExpression" && expr.start === potentialArrowAt) {
      return expr;
    }

    return this.parseSubscripts(expr, startPos, startLoc);
  };

  ExpressionParser.prototype.parseSubscripts = function parseSubscripts (base, startPos, startLoc, noCalls) {
    var state = {
      optionalChainMember: false,
      maybeAsyncArrow: this.atPossibleAsyncArrow(base),
      stop: false
    };

    do {
      var oldMaybeInAsyncArrowHead = this.state.maybeInAsyncArrowHead;

      if (state.maybeAsyncArrow) {
        this.state.maybeInAsyncArrowHead = true;
      }

      base = this.parseSubscript(base, startPos, startLoc, noCalls, state);
      state.maybeAsyncArrow = false;
      this.state.maybeInAsyncArrowHead = oldMaybeInAsyncArrowHead;
    } while (!state.stop);

    return base;
  };

  ExpressionParser.prototype.parseSubscript = function parseSubscript (base, startPos, startLoc, noCalls, state) {
    if (!noCalls && this.eat(types.doubleColon)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      node.callee = this.parseNoCallExpr();
      state.stop = true;
      return this.parseSubscripts(this.finishNode(node, "BindExpression"), startPos, startLoc, noCalls);
    }

    var optional = false;

    if (this.match(types.questionDot)) {
      state.optionalChainMember = optional = true;

      if (noCalls && this.lookaheadCharCode() === 40) {
        state.stop = true;
        return base;
      }

      this.next();
    }

    var computed = this.eat(types.bracketL);

    if (optional && !this.match(types.parenL) && !this.match(types.backQuote) || computed || this.eat(types.dot)) {
      var node$1 = this.startNodeAt(startPos, startLoc);
      node$1.object = base;
      node$1.property = computed ? this.parseExpression() : optional ? this.parseIdentifier(true) : this.parseMaybePrivateName(true);
      node$1.computed = computed;

      if (node$1.property.type === "PrivateName") {
        if (node$1.object.type === "Super") {
          this.raise(startPos, Errors.SuperPrivateField);
        }

        this.classScope.usePrivateName(node$1.property.id.name, node$1.property.start);
      }

      if (computed) {
        this.expect(types.bracketR);
      }

      if (state.optionalChainMember) {
        node$1.optional = optional;
        return this.finishNode(node$1, "OptionalMemberExpression");
      } else {
        return this.finishNode(node$1, "MemberExpression");
      }
    } else if (!noCalls && this.match(types.parenL)) {
      var oldMaybeInArrowParameters = this.state.maybeInArrowParameters;
      var oldYieldPos = this.state.yieldPos;
      var oldAwaitPos = this.state.awaitPos;
      this.state.maybeInArrowParameters = true;
      this.state.yieldPos = -1;
      this.state.awaitPos = -1;
      this.next();
      var node$2 = this.startNodeAt(startPos, startLoc);
      node$2.callee = base;

      if (optional) {
        node$2.optional = true;
        node$2.arguments = this.parseCallExpressionArguments(types.parenR, false);
      } else {
        node$2.arguments = this.parseCallExpressionArguments(types.parenR, state.maybeAsyncArrow, base.type === "Import", base.type !== "Super", node$2);
      }

      this.finishCallExpression(node$2, state.optionalChainMember);

      if (state.maybeAsyncArrow && this.shouldParseAsyncArrow() && !optional) {
        state.stop = true;
        node$2 = this.parseAsyncArrowFromCallExpression(this.startNodeAt(startPos, startLoc), node$2);
        this.checkYieldAwaitInDefaultParams();
        this.state.yieldPos = oldYieldPos;
        this.state.awaitPos = oldAwaitPos;
      } else {
        this.toReferencedListDeep(node$2.arguments);
        if (oldYieldPos !== -1) { this.state.yieldPos = oldYieldPos; }

        if (!this.isAwaitAllowed() && !oldMaybeInArrowParameters || oldAwaitPos !== -1) {
          this.state.awaitPos = oldAwaitPos;
        }
      }

      this.state.maybeInArrowParameters = oldMaybeInArrowParameters;
      return node$2;
    } else if (this.match(types.backQuote)) {
      return this.parseTaggedTemplateExpression(startPos, startLoc, base, state);
    } else {
      state.stop = true;
      return base;
    }
  };

  ExpressionParser.prototype.parseTaggedTemplateExpression = function parseTaggedTemplateExpression (startPos, startLoc, base, state, typeArguments) {
    var node = this.startNodeAt(startPos, startLoc);
    node.tag = base;
    node.quasi = this.parseTemplate(true);
    if (typeArguments) { node.typeParameters = typeArguments; }

    if (state.optionalChainMember) {
      this.raise(startPos, Errors.OptionalChainingNoTemplate);
    }

    return this.finishNode(node, "TaggedTemplateExpression");
  };

  ExpressionParser.prototype.atPossibleAsyncArrow = function atPossibleAsyncArrow (base) {
    return base.type === "Identifier" && base.name === "async" && this.state.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 && base.start === this.state.potentialArrowAt;
  };

  ExpressionParser.prototype.finishCallExpression = function finishCallExpression (node, optional) {
    if (node.callee.type === "Import") {
      if (node.arguments.length !== 1) {
        this.raise(node.start, Errors.ImportCallArity);
      } else {
        var importArg = node.arguments[0];

        if (importArg && importArg.type === "SpreadElement") {
          this.raise(importArg.start, Errors.ImportCallSpreadArgument);
        }
      }
    }

    return this.finishNode(node, optional ? "OptionalCallExpression" : "CallExpression");
  };

  ExpressionParser.prototype.parseCallExpressionArguments = function parseCallExpressionArguments (close, possibleAsyncArrow, dynamicImport, allowPlaceholder, nodeForExtra) {
    var elts = [];
    var innerParenStart;
    var first = true;
    var oldInFSharpPipelineDirectBody = this.state.inFSharpPipelineDirectBody;
    this.state.inFSharpPipelineDirectBody = false;

    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect(types.comma);

        if (this.match(close)) {
          if (dynamicImport) {
            this.raise(this.state.lastTokStart, Errors.ImportCallArgumentTrailingComma);
          }

          if (nodeForExtra) {
            this.addExtra(nodeForExtra, "trailingComma", this.state.lastTokStart);
          }

          this.next();
          break;
        }
      }

      if (this.match(types.parenL) && !innerParenStart) {
        innerParenStart = this.state.start;
      }

      elts.push(this.parseExprListItem(false, possibleAsyncArrow ? new ExpressionErrors() : undefined, possibleAsyncArrow ? {
        start: 0
      } : undefined, allowPlaceholder));
    }

    if (possibleAsyncArrow && innerParenStart && this.shouldParseAsyncArrow()) {
      this.unexpected();
    }

    this.state.inFSharpPipelineDirectBody = oldInFSharpPipelineDirectBody;
    return elts;
  };

  ExpressionParser.prototype.shouldParseAsyncArrow = function shouldParseAsyncArrow () {
    return this.match(types.arrow) && !this.canInsertSemicolon();
  };

  ExpressionParser.prototype.parseAsyncArrowFromCallExpression = function parseAsyncArrowFromCallExpression (node, call) {
    var _call$extra;

    this.expect(types.arrow);
    this.parseArrowExpression(node, call.arguments, true, (_call$extra = call.extra) == null ? void 0 : _call$extra.trailingComma);
    return node;
  };

  ExpressionParser.prototype.parseNoCallExpr = function parseNoCallExpr () {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    return this.parseSubscripts(this.parseExprAtom(), startPos, startLoc, true);
  };

  ExpressionParser.prototype.parseExprAtom = function parseExprAtom (refExpressionErrors) {
    if (this.state.type === types.slash) { this.readRegexp(); }
    var canBeArrow = this.state.potentialArrowAt === this.state.start;
    var node;

    switch (this.state.type) {
      case types._super:
        node = this.startNode();
        this.next();

        if (this.match(types.parenL) && !this.scope.allowDirectSuper && !this.options.allowSuperOutsideMethod) {
          this.raise(node.start, Errors.SuperNotAllowed);
        } else if (!this.scope.allowSuper && !this.options.allowSuperOutsideMethod) {
          this.raise(node.start, Errors.UnexpectedSuper);
        }

        if (!this.match(types.parenL) && !this.match(types.bracketL) && !this.match(types.dot)) {
          this.raise(node.start, Errors.UnsupportedSuper);
        }

        return this.finishNode(node, "Super");

      case types._import:
        node = this.startNode();
        this.next();

        if (this.match(types.dot)) {
          return this.parseImportMetaProperty(node);
        }

        if (!this.match(types.parenL)) {
          this.raise(this.state.lastTokStart, Errors.UnsupportedImport);
        }

        return this.finishNode(node, "Import");

      case types._this:
        node = this.startNode();
        this.next();
        return this.finishNode(node, "ThisExpression");

      case types.name:
        {
          node = this.startNode();
          var containsEsc = this.state.containsEsc;
          var id = this.parseIdentifier();

          if (!containsEsc && id.name === "async" && this.match(types._function) && !this.canInsertSemicolon()) {
            var last = this.state.context.length - 1;

            if (this.state.context[last] !== types$1.functionStatement) {
              throw new Error("Internal error");
            }

            this.state.context[last] = types$1.functionExpression;
            this.next();
            return this.parseFunction(node, undefined, true);
          } else if (canBeArrow && !containsEsc && id.name === "async" && this.match(types.name) && !this.canInsertSemicolon()) {
            var oldMaybeInArrowParameters = this.state.maybeInArrowParameters;
            var oldMaybeInAsyncArrowHead = this.state.maybeInAsyncArrowHead;
            var oldYieldPos = this.state.yieldPos;
            var oldAwaitPos = this.state.awaitPos;
            this.state.maybeInArrowParameters = true;
            this.state.maybeInAsyncArrowHead = true;
            this.state.yieldPos = -1;
            this.state.awaitPos = -1;
            var params = [this.parseIdentifier()];
            this.expect(types.arrow);
            this.checkYieldAwaitInDefaultParams();
            this.state.maybeInArrowParameters = oldMaybeInArrowParameters;
            this.state.maybeInAsyncArrowHead = oldMaybeInAsyncArrowHead;
            this.state.yieldPos = oldYieldPos;
            this.state.awaitPos = oldAwaitPos;
            this.parseArrowExpression(node, params, true);
            return node;
          }

          if (canBeArrow && this.match(types.arrow) && !this.canInsertSemicolon()) {
            this.next();
            this.parseArrowExpression(node, [id], false);
            return node;
          }

          return id;
        }

      case types._do:
        {
          this.expectPlugin("doExpressions");
          var node$1 = this.startNode();
          this.next();
          var oldLabels = this.state.labels;
          this.state.labels = [];
          node$1.body = this.parseBlock();
          this.state.labels = oldLabels;
          return this.finishNode(node$1, "DoExpression");
        }

      case types.regexp:
        {
          var value = this.state.value;
          node = this.parseLiteral(value.value, "RegExpLiteral");
          node.pattern = value.pattern;
          node.flags = value.flags;
          return node;
        }

      case types.num:
        return this.parseLiteral(this.state.value, "NumericLiteral");

      case types.bigint:
        return this.parseLiteral(this.state.value, "BigIntLiteral");

      case types.string:
        return this.parseLiteral(this.state.value, "StringLiteral");

      case types._null:
        node = this.startNode();
        this.next();
        return this.finishNode(node, "NullLiteral");

      case types._true:
      case types._false:
        return this.parseBooleanLiteral();

      case types.parenL:
        return this.parseParenAndDistinguishExpression(canBeArrow);

      case types.bracketBarL:
      case types.bracketHashL:
        {
          this.expectPlugin("recordAndTuple");
          var oldInFSharpPipelineDirectBody = this.state.inFSharpPipelineDirectBody;
          var close = this.state.type === types.bracketBarL ? types.bracketBarR : types.bracketR;
          this.state.inFSharpPipelineDirectBody = false;
          node = this.startNode();
          this.next();
          node.elements = this.parseExprList(close, true, refExpressionErrors, node);
          this.state.inFSharpPipelineDirectBody = oldInFSharpPipelineDirectBody;
          return this.finishNode(node, "TupleExpression");
        }

      case types.bracketL:
        {
          var oldInFSharpPipelineDirectBody$1 = this.state.inFSharpPipelineDirectBody;
          this.state.inFSharpPipelineDirectBody = false;
          node = this.startNode();
          this.next();
          node.elements = this.parseExprList(types.bracketR, true, refExpressionErrors, node);

          if (!this.state.maybeInArrowParameters) {
            this.toReferencedList(node.elements);
          }

          this.state.inFSharpPipelineDirectBody = oldInFSharpPipelineDirectBody$1;
          return this.finishNode(node, "ArrayExpression");
        }

      case types.braceBarL:
      case types.braceHashL:
        {
          this.expectPlugin("recordAndTuple");
          var oldInFSharpPipelineDirectBody$2 = this.state.inFSharpPipelineDirectBody;
          var close$1 = this.state.type === types.braceBarL ? types.braceBarR : types.braceR;
          this.state.inFSharpPipelineDirectBody = false;
          var ret = this.parseObj(close$1, false, true, refExpressionErrors);
          this.state.inFSharpPipelineDirectBody = oldInFSharpPipelineDirectBody$2;
          return ret;
        }

      case types.braceL:
        {
          var oldInFSharpPipelineDirectBody$3 = this.state.inFSharpPipelineDirectBody;
          this.state.inFSharpPipelineDirectBody = false;
          var ret$1 = this.parseObj(types.braceR, false, false, refExpressionErrors);
          this.state.inFSharpPipelineDirectBody = oldInFSharpPipelineDirectBody$3;
          return ret$1;
        }

      case types._function:
        return this.parseFunctionExpression();

      case types.at:
        this.parseDecorators();

      case types._class:
        node = this.startNode();
        this.takeDecorators(node);
        return this.parseClass(node, false);

      case types._new:
        return this.parseNew();

      case types.backQuote:
        return this.parseTemplate(false);

      case types.doubleColon:
        {
          node = this.startNode();
          this.next();
          node.object = null;
          var callee = node.callee = this.parseNoCallExpr();

          if (callee.type === "MemberExpression") {
            return this.finishNode(node, "BindExpression");
          } else {
            throw this.raise(callee.start, Errors.UnsupportedBind);
          }
        }

      case types.hash:
        {
          if (this.state.inPipeline) {
            node = this.startNode();

            if (this.getPluginOption("pipelineOperator", "proposal") !== "smart") {
              this.raise(node.start, Errors.PrimaryTopicRequiresSmartPipeline);
            }

            this.next();

            if (!this.primaryTopicReferenceIsAllowedInCurrentTopicContext()) {
              this.raise(node.start, Errors.PrimaryTopicNotAllowed);
            }

            this.registerTopicReference();
            return this.finishNode(node, "PipelinePrimaryTopicReference");
          }
        }

      default:
        throw this.unexpected();
    }
  };

  ExpressionParser.prototype.parseBooleanLiteral = function parseBooleanLiteral () {
    var node = this.startNode();
    node.value = this.match(types._true);
    this.next();
    return this.finishNode(node, "BooleanLiteral");
  };

  ExpressionParser.prototype.parseMaybePrivateName = function parseMaybePrivateName (isPrivateNameAllowed) {
    var isPrivate = this.match(types.hash);

    if (isPrivate) {
      this.expectOnePlugin(["classPrivateProperties", "classPrivateMethods"]);

      if (!isPrivateNameAllowed) {
        this.raise(this.state.pos, Errors.UnexpectedPrivateField);
      }

      var node = this.startNode();
      this.next();
      this.assertNoSpace("Unexpected space between # and identifier");
      node.id = this.parseIdentifier(true);
      return this.finishNode(node, "PrivateName");
    } else {
      return this.parseIdentifier(true);
    }
  };

  ExpressionParser.prototype.parseFunctionExpression = function parseFunctionExpression () {
    var node = this.startNode();
    var meta = this.startNode();
    this.next();
    meta = this.createIdentifier(meta, "function");

    if (this.prodParam.hasYield && this.eat(types.dot)) {
      return this.parseMetaProperty(node, meta, "sent");
    }

    return this.parseFunction(node);
  };

  ExpressionParser.prototype.parseMetaProperty = function parseMetaProperty (node, meta, propertyName) {
    node.meta = meta;

    if (meta.name === "function" && propertyName === "sent") {
      if (this.isContextual(propertyName)) {
        this.expectPlugin("functionSent");
      } else if (!this.hasPlugin("functionSent")) {
        this.unexpected();
      }
    }

    var containsEsc = this.state.containsEsc;
    node.property = this.parseIdentifier(true);

    if (node.property.name !== propertyName || containsEsc) {
      this.raise(node.property.start, Errors.UnsupportedMetaProperty, meta.name, propertyName);
    }

    return this.finishNode(node, "MetaProperty");
  };

  ExpressionParser.prototype.parseImportMetaProperty = function parseImportMetaProperty (node) {
    var id = this.createIdentifier(this.startNodeAtNode(node), "import");
    this.expect(types.dot);

    if (this.isContextual("meta")) {
      this.expectPlugin("importMeta");

      if (!this.inModule) {
        this.raiseWithData(id.start, {
          code: "BABEL_PARSER_SOURCETYPE_MODULE_REQUIRED"
        }, Errors.ImportMetaOutsideModule);
      }

      this.sawUnambiguousESM = true;
    } else if (!this.hasPlugin("importMeta")) {
      this.raise(id.start, Errors.ImportCallArityLtOne);
    }

    return this.parseMetaProperty(node, id, "meta");
  };

  ExpressionParser.prototype.parseLiteral = function parseLiteral (value, type, startPos, startLoc) {
    startPos = startPos || this.state.start;
    startLoc = startLoc || this.state.startLoc;
    var node = this.startNodeAt(startPos, startLoc);
    this.addExtra(node, "rawValue", value);
    this.addExtra(node, "raw", this.input.slice(startPos, this.state.end));
    node.value = value;
    this.next();
    return this.finishNode(node, type);
  };

  ExpressionParser.prototype.parseParenAndDistinguishExpression = function parseParenAndDistinguishExpression (canBeArrow) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    var val;
    this.expect(types.parenL);
    var oldMaybeInArrowParameters = this.state.maybeInArrowParameters;
    var oldYieldPos = this.state.yieldPos;
    var oldAwaitPos = this.state.awaitPos;
    var oldInFSharpPipelineDirectBody = this.state.inFSharpPipelineDirectBody;
    this.state.maybeInArrowParameters = true;
    this.state.yieldPos = -1;
    this.state.awaitPos = -1;
    this.state.inFSharpPipelineDirectBody = false;
    var innerStartPos = this.state.start;
    var innerStartLoc = this.state.startLoc;
    var exprList = [];
    var refExpressionErrors = new ExpressionErrors();
    var refNeedsArrowPos = {
      start: 0
    };
    var first = true;
    var spreadStart;
    var optionalCommaStart;

    while (!this.match(types.parenR)) {
      if (first) {
        first = false;
      } else {
        this.expect(types.comma, refNeedsArrowPos.start || null);

        if (this.match(types.parenR)) {
          optionalCommaStart = this.state.start;
          break;
        }
      }

      if (this.match(types.ellipsis)) {
        var spreadNodeStartPos = this.state.start;
        var spreadNodeStartLoc = this.state.startLoc;
        spreadStart = this.state.start;
        exprList.push(this.parseParenItem(this.parseRestBinding(), spreadNodeStartPos, spreadNodeStartLoc));
        this.checkCommaAfterRest(41);
        break;
      } else {
        exprList.push(this.parseMaybeAssign(false, refExpressionErrors, this.parseParenItem, refNeedsArrowPos));
      }
    }

    var innerEndPos = this.state.start;
    var innerEndLoc = this.state.startLoc;
    this.expect(types.parenR);
    this.state.maybeInArrowParameters = oldMaybeInArrowParameters;
    this.state.inFSharpPipelineDirectBody = oldInFSharpPipelineDirectBody;
    var arrowNode = this.startNodeAt(startPos, startLoc);

    if (canBeArrow && this.shouldParseArrow() && (arrowNode = this.parseArrow(arrowNode))) {
      if (!this.isAwaitAllowed() && !this.state.maybeInAsyncArrowHead) {
        this.state.awaitPos = oldAwaitPos;
      }

      this.checkYieldAwaitInDefaultParams();
      this.state.yieldPos = oldYieldPos;
      this.state.awaitPos = oldAwaitPos;

      for (var _i = 0; _i < exprList.length; _i++) {
        var param = exprList[_i];

        if (param.extra && param.extra.parenthesized) {
          this.unexpected(param.extra.parenStart);
        }
      }

      this.parseArrowExpression(arrowNode, exprList, false);
      return arrowNode;
    }

    if (oldYieldPos !== -1) { this.state.yieldPos = oldYieldPos; }
    if (oldAwaitPos !== -1) { this.state.awaitPos = oldAwaitPos; }

    if (!exprList.length) {
      this.unexpected(this.state.lastTokStart);
    }

    if (optionalCommaStart) { this.unexpected(optionalCommaStart); }
    if (spreadStart) { this.unexpected(spreadStart); }
    this.checkExpressionErrors(refExpressionErrors, true);
    if (refNeedsArrowPos.start) { this.unexpected(refNeedsArrowPos.start); }
    this.toReferencedListDeep(exprList, true);

    if (exprList.length > 1) {
      val = this.startNodeAt(innerStartPos, innerStartLoc);
      val.expressions = exprList;
      this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
    } else {
      val = exprList[0];
    }

    if (!this.options.createParenthesizedExpressions) {
      this.addExtra(val, "parenthesized", true);
      this.addExtra(val, "parenStart", startPos);
      return val;
    }

    var parenExpression = this.startNodeAt(startPos, startLoc);
    parenExpression.expression = val;
    this.finishNode(parenExpression, "ParenthesizedExpression");
    return parenExpression;
  };

  ExpressionParser.prototype.shouldParseArrow = function shouldParseArrow () {
    return !this.canInsertSemicolon();
  };

  ExpressionParser.prototype.parseArrow = function parseArrow (node) {
    if (this.eat(types.arrow)) {
      return node;
    }
  };

  ExpressionParser.prototype.parseParenItem = function parseParenItem (node, startPos, startLoc) {
    return node;
  };

  ExpressionParser.prototype.parseNew = function parseNew () {
    var node = this.startNode();
    var meta = this.startNode();
    this.next();
    meta = this.createIdentifier(meta, "new");

    if (this.eat(types.dot)) {
      var metaProp = this.parseMetaProperty(node, meta, "target");

      if (!this.scope.inNonArrowFunction && !this.scope.inClass) {
        var error = Errors.UnexpectedNewTarget;

        if (this.hasPlugin("classProperties")) {
          error += " or class properties";
        }

        this.raise(metaProp.start, error);
      }

      return metaProp;
    }

    node.callee = this.parseNoCallExpr();

    if (node.callee.type === "Import") {
      this.raise(node.callee.start, Errors.ImportCallNotNewExpression);
    } else if (node.callee.type === "OptionalMemberExpression" || node.callee.type === "OptionalCallExpression") {
      this.raise(this.state.lastTokEnd, Errors.OptionalChainingNoNew);
    } else if (this.eat(types.questionDot)) {
      this.raise(this.state.start, Errors.OptionalChainingNoNew);
    }

    this.parseNewArguments(node);
    return this.finishNode(node, "NewExpression");
  };

  ExpressionParser.prototype.parseNewArguments = function parseNewArguments (node) {
    if (this.eat(types.parenL)) {
      var args = this.parseExprList(types.parenR);
      this.toReferencedList(args);
      node.arguments = args;
    } else {
      node.arguments = [];
    }
  };

  ExpressionParser.prototype.parseTemplateElement = function parseTemplateElement (isTagged) {
    var elem = this.startNode();

    if (this.state.value === null) {
      if (!isTagged) {
        this.raise(this.state.start + 1, Errors.InvalidEscapeSequenceTemplate);
      }
    }

    elem.value = {
      raw: this.input.slice(this.state.start, this.state.end).replace(/\r\n?/g, "\n"),
      cooked: this.state.value
    };
    this.next();
    elem.tail = this.match(types.backQuote);
    return this.finishNode(elem, "TemplateElement");
  };

  ExpressionParser.prototype.parseTemplate = function parseTemplate (isTagged) {
    var node = this.startNode();
    this.next();
    node.expressions = [];
    var curElt = this.parseTemplateElement(isTagged);
    node.quasis = [curElt];

    while (!curElt.tail) {
      this.expect(types.dollarBraceL);
      node.expressions.push(this.parseExpression());
      this.expect(types.braceR);
      node.quasis.push(curElt = this.parseTemplateElement(isTagged));
    }

    this.next();
    return this.finishNode(node, "TemplateLiteral");
  };

  ExpressionParser.prototype.parseObj = function parseObj (close, isPattern, isRecord, refExpressionErrors) {
    var propHash = Object.create(null);
    var first = true;
    var node = this.startNode();
    node.properties = [];
    this.next();

    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect(types.comma);

        if (this.match(close)) {
          this.addExtra(node, "trailingComma", this.state.lastTokStart);
          this.next();
          break;
        }
      }

      var prop = this.parseObjectMember(isPattern, refExpressionErrors);

      if (!isPattern) {
        this.checkDuplicatedProto(prop, propHash, refExpressionErrors);
      }

      if (prop.shorthand) {
        this.addExtra(prop, "shorthand", true);
      }

      node.properties.push(prop);
    }

    var type = "ObjectExpression";

    if (isPattern) {
      type = "ObjectPattern";
    } else if (isRecord) {
      type = "RecordExpression";
    }

    return this.finishNode(node, type);
  };

  ExpressionParser.prototype.isAsyncProp = function isAsyncProp (prop) {
    return !prop.computed && prop.key.type === "Identifier" && prop.key.name === "async" && (this.match(types.name) || this.match(types.num) || this.match(types.string) || this.match(types.bracketL) || this.state.type.keyword || this.match(types.star)) && !this.hasPrecedingLineBreak();
  };

  ExpressionParser.prototype.parseObjectMember = function parseObjectMember (isPattern, refExpressionErrors) {
    var decorators = [];

    if (this.match(types.at)) {
      if (this.hasPlugin("decorators")) {
        this.raise(this.state.start, Errors.UnsupportedPropertyDecorator);
      }

      while (this.match(types.at)) {
        decorators.push(this.parseDecorator());
      }
    }

    var prop = this.startNode();
    var isGenerator = false;
    var isAsync = false;
    var startPos;
    var startLoc;

    if (this.match(types.ellipsis)) {
      if (decorators.length) { this.unexpected(); }

      if (isPattern) {
        this.next();
        prop.argument = this.parseIdentifier();
        this.checkCommaAfterRest(125);
        return this.finishNode(prop, "RestElement");
      }

      return this.parseSpread();
    }

    if (decorators.length) {
      prop.decorators = decorators;
      decorators = [];
    }

    prop.method = false;

    if (isPattern || refExpressionErrors) {
      startPos = this.state.start;
      startLoc = this.state.startLoc;
    }

    if (!isPattern) {
      isGenerator = this.eat(types.star);
    }

    var containsEsc = this.state.containsEsc;
    this.parsePropertyName(prop, false);

    if (!isPattern && !containsEsc && !isGenerator && this.isAsyncProp(prop)) {
      isAsync = true;
      isGenerator = this.eat(types.star);
      this.parsePropertyName(prop, false);
    } else {
      isAsync = false;
    }

    this.parseObjPropValue(prop, startPos, startLoc, isGenerator, isAsync, isPattern, refExpressionErrors, containsEsc);
    return prop;
  };

  ExpressionParser.prototype.isGetterOrSetterMethod = function isGetterOrSetterMethod (prop, isPattern) {
    return !isPattern && !prop.computed && prop.key.type === "Identifier" && (prop.key.name === "get" || prop.key.name === "set") && (this.match(types.string) || this.match(types.num) || this.match(types.bracketL) || this.match(types.name) || !!this.state.type.keyword);
  };

  ExpressionParser.prototype.getGetterSetterExpectedParamCount = function getGetterSetterExpectedParamCount (method) {
    return method.kind === "get" ? 0 : 1;
  };

  ExpressionParser.prototype.checkGetterSetterParams = function checkGetterSetterParams (method) {
    var paramCount = this.getGetterSetterExpectedParamCount(method);
    var start = method.start;

    if (method.params.length !== paramCount) {
      if (method.kind === "get") {
        this.raise(start, Errors.BadGetterArity);
      } else {
        this.raise(start, Errors.BadSetterArity);
      }
    }

    if (method.kind === "set" && method.params[method.params.length - 1].type === "RestElement") {
      this.raise(start, Errors.BadSetterRestParameter);
    }
  };

  ExpressionParser.prototype.parseObjectMethod = function parseObjectMethod (prop, isGenerator, isAsync, isPattern, containsEsc) {
    if (isAsync || isGenerator || this.match(types.parenL)) {
      if (isPattern) { this.unexpected(); }
      prop.kind = "method";
      prop.method = true;
      return this.parseMethod(prop, isGenerator, isAsync, false, false, "ObjectMethod");
    }

    if (!containsEsc && this.isGetterOrSetterMethod(prop, isPattern)) {
      if (isGenerator || isAsync) { this.unexpected(); }
      prop.kind = prop.key.name;
      this.parsePropertyName(prop, false);
      this.parseMethod(prop, false, false, false, false, "ObjectMethod");
      this.checkGetterSetterParams(prop);
      return prop;
    }
  };

  ExpressionParser.prototype.parseObjectProperty = function parseObjectProperty (prop, startPos, startLoc, isPattern, refExpressionErrors) {
    prop.shorthand = false;

    if (this.eat(types.colon)) {
      prop.value = isPattern ? this.parseMaybeDefault(this.state.start, this.state.startLoc) : this.parseMaybeAssign(false, refExpressionErrors);
      return this.finishNode(prop, "ObjectProperty");
    }

    if (!prop.computed && prop.key.type === "Identifier") {
      this.checkReservedWord(prop.key.name, prop.key.start, true, true);

      if (isPattern) {
        prop.value = this.parseMaybeDefault(startPos, startLoc, prop.key.__clone());
      } else if (this.match(types.eq) && refExpressionErrors) {
        if (refExpressionErrors.shorthandAssign === -1) {
          refExpressionErrors.shorthandAssign = this.state.start;
        }

        prop.value = this.parseMaybeDefault(startPos, startLoc, prop.key.__clone());
      } else {
        prop.value = prop.key.__clone();
      }

      prop.shorthand = true;
      return this.finishNode(prop, "ObjectProperty");
    }
  };

  ExpressionParser.prototype.parseObjPropValue = function parseObjPropValue (prop, startPos, startLoc, isGenerator, isAsync, isPattern, refExpressionErrors, containsEsc) {
    var node = this.parseObjectMethod(prop, isGenerator, isAsync, isPattern, containsEsc) || this.parseObjectProperty(prop, startPos, startLoc, isPattern, refExpressionErrors);
    if (!node) { this.unexpected(); }
    return node;
  };

  ExpressionParser.prototype.parsePropertyName = function parsePropertyName (prop, isPrivateNameAllowed) {
    if (this.eat(types.bracketL)) {
      prop.computed = true;
      prop.key = this.parseMaybeAssign();
      this.expect(types.bracketR);
    } else {
      var oldInPropertyName = this.state.inPropertyName;
      this.state.inPropertyName = true;
      prop.key = this.match(types.num) || this.match(types.string) || this.match(types.bigint) ? this.parseExprAtom() : this.parseMaybePrivateName(isPrivateNameAllowed);

      if (prop.key.type !== "PrivateName") {
        prop.computed = false;
      }

      this.state.inPropertyName = oldInPropertyName;
    }

    return prop.key;
  };

  ExpressionParser.prototype.initFunction = function initFunction (node, isAsync) {
    node.id = null;
    node.generator = false;
    node.async = !!isAsync;
  };

  ExpressionParser.prototype.parseMethod = function parseMethod (node, isGenerator, isAsync, isConstructor, allowDirectSuper, type, inClassScope) {
    if ( inClassScope === void 0 ) inClassScope = false;

    var oldYieldPos = this.state.yieldPos;
    var oldAwaitPos = this.state.awaitPos;
    this.state.yieldPos = -1;
    this.state.awaitPos = -1;
    this.initFunction(node, isAsync);
    node.generator = !!isGenerator;
    var allowModifiers = isConstructor;
    this.scope.enter(SCOPE_FUNCTION | SCOPE_SUPER | (inClassScope ? SCOPE_CLASS : 0) | (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0));
    this.prodParam.enter(functionFlags(isAsync, node.generator));
    this.parseFunctionParams(node, allowModifiers);
    this.parseFunctionBodyAndFinish(node, type, true);
    this.prodParam.exit();
    this.scope.exit();
    this.state.yieldPos = oldYieldPos;
    this.state.awaitPos = oldAwaitPos;
    return node;
  };

  ExpressionParser.prototype.parseArrowExpression = function parseArrowExpression (node, params, isAsync, trailingCommaPos) {
    this.scope.enter(SCOPE_FUNCTION | SCOPE_ARROW);
    this.prodParam.enter(functionFlags(isAsync, false));
    this.initFunction(node, isAsync);
    var oldMaybeInArrowParameters = this.state.maybeInArrowParameters;
    var oldYieldPos = this.state.yieldPos;
    var oldAwaitPos = this.state.awaitPos;

    if (params) {
      this.state.maybeInArrowParameters = true;
      this.setArrowFunctionParameters(node, params, trailingCommaPos);
    }

    this.state.maybeInArrowParameters = false;
    this.state.yieldPos = -1;
    this.state.awaitPos = -1;
    this.parseFunctionBody(node, true);
    this.prodParam.exit();
    this.scope.exit();
    this.state.maybeInArrowParameters = oldMaybeInArrowParameters;
    this.state.yieldPos = oldYieldPos;
    this.state.awaitPos = oldAwaitPos;
    return this.finishNode(node, "ArrowFunctionExpression");
  };

  ExpressionParser.prototype.setArrowFunctionParameters = function setArrowFunctionParameters (node, params, trailingCommaPos) {
    node.params = this.toAssignableList(params, trailingCommaPos);
  };

  ExpressionParser.prototype.parseFunctionBodyAndFinish = function parseFunctionBodyAndFinish (node, type, isMethod) {
    if ( isMethod === void 0 ) isMethod = false;

    this.parseFunctionBody(node, false, isMethod);
    this.finishNode(node, type);
  };

  ExpressionParser.prototype.parseFunctionBody = function parseFunctionBody (node, allowExpression, isMethod) {
    var this$1 = this;
    if ( isMethod === void 0 ) isMethod = false;

    var isExpression = allowExpression && !this.match(types.braceL);
    var oldInParameters = this.state.inParameters;
    this.state.inParameters = false;

    if (isExpression) {
      node.body = this.parseMaybeAssign();
      this.checkParams(node, false, allowExpression, false);
    } else {
      var oldStrict = this.state.strict;
      var oldLabels = this.state.labels;
      this.state.labels = [];
      this.prodParam.enter(this.prodParam.currentFlags() | PARAM_RETURN);
      node.body = this.parseBlock(true, false, function (hasStrictModeDirective) {
        var nonSimple = !this$1.isSimpleParamList(node.params);

        if (hasStrictModeDirective && nonSimple) {
          var errorPos = (node.kind === "method" || node.kind === "constructor") && !!node.key ? node.key.end : node.start;
          this$1.raise(errorPos, Errors.IllegalLanguageModeDirective);
        }

        var strictModeChanged = !oldStrict && this$1.state.strict;
        this$1.checkParams(node, !this$1.state.strict && !allowExpression && !isMethod && !nonSimple, allowExpression, strictModeChanged);

        if (this$1.state.strict && node.id) {
          this$1.checkLVal(node.id, BIND_OUTSIDE, undefined, "function name", undefined, strictModeChanged);
        }
      });
      this.prodParam.exit();
      this.state.labels = oldLabels;
    }

    this.state.inParameters = oldInParameters;
  };

  ExpressionParser.prototype.isSimpleParamList = function isSimpleParamList (params) {
    for (var i = 0, len = params.length; i < len; i++) {
      if (params[i].type !== "Identifier") { return false; }
    }

    return true;
  };

  ExpressionParser.prototype.checkParams = function checkParams (node, allowDuplicates, isArrowFunction, strictModeChanged) {
    if ( strictModeChanged === void 0 ) strictModeChanged = true;

    var nameHash = Object.create(null);

    for (var i = 0; i < node.params.length; i++) {
      this.checkLVal(node.params[i], BIND_VAR, allowDuplicates ? null : nameHash, "function parameter list", undefined, strictModeChanged);
    }
  };

  ExpressionParser.prototype.parseExprList = function parseExprList (close, allowEmpty, refExpressionErrors, nodeForExtra) {
    var elts = [];
    var first = true;

    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect(types.comma);

        if (this.match(close)) {
          if (nodeForExtra) {
            this.addExtra(nodeForExtra, "trailingComma", this.state.lastTokStart);
          }

          this.next();
          break;
        }
      }

      elts.push(this.parseExprListItem(allowEmpty, refExpressionErrors));
    }

    return elts;
  };

  ExpressionParser.prototype.parseExprListItem = function parseExprListItem (allowEmpty, refExpressionErrors, refNeedsArrowPos, allowPlaceholder) {
    var elt;

    if (allowEmpty && this.match(types.comma)) {
      elt = null;
    } else if (this.match(types.ellipsis)) {
      var spreadNodeStartPos = this.state.start;
      var spreadNodeStartLoc = this.state.startLoc;
      elt = this.parseParenItem(this.parseSpread(refExpressionErrors, refNeedsArrowPos), spreadNodeStartPos, spreadNodeStartLoc);
    } else if (this.match(types.question)) {
      this.expectPlugin("partialApplication");

      if (!allowPlaceholder) {
        this.raise(this.state.start, Errors.UnexpectedArgumentPlaceholder);
      }

      var node = this.startNode();
      this.next();
      elt = this.finishNode(node, "ArgumentPlaceholder");
    } else {
      elt = this.parseMaybeAssign(false, refExpressionErrors, this.parseParenItem, refNeedsArrowPos);
    }

    return elt;
  };

  ExpressionParser.prototype.parseIdentifier = function parseIdentifier (liberal) {
    var node = this.startNode();
    var name = this.parseIdentifierName(node.start, liberal);
    return this.createIdentifier(node, name);
  };

  ExpressionParser.prototype.createIdentifier = function createIdentifier (node, name) {
    node.name = name;
    node.loc.identifierName = name;
    return this.finishNode(node, "Identifier");
  };

  ExpressionParser.prototype.parseIdentifierName = function parseIdentifierName (pos, liberal) {
    var name;

    if (this.match(types.name)) {
      name = this.state.value;
    } else if (this.state.type.keyword) {
      name = this.state.type.keyword;

      if ((name === "class" || name === "function") && (this.state.lastTokEnd !== this.state.lastTokStart + 1 || this.input.charCodeAt(this.state.lastTokStart) !== 46)) {
        this.state.context.pop();
      }
    } else {
      throw this.unexpected();
    }

    if (liberal) {
      this.state.type = types.name;
    } else {
      this.checkReservedWord(name, this.state.start, !!this.state.type.keyword, false);
    }

    this.next();
    return name;
  };

  ExpressionParser.prototype.checkReservedWord = function checkReservedWord (word, startLoc, checkKeywords, isBinding) {
    if (this.prodParam.hasYield && word === "yield") {
      this.raise(startLoc, Errors.YieldBindingIdentifier);
      return;
    }

    if (word === "await") {
      if (this.prodParam.hasAwait) {
        this.raise(startLoc, Errors.AwaitBindingIdentifier);
        return;
      }

      if (this.state.awaitPos === -1 && (this.state.maybeInAsyncArrowHead || this.isAwaitAllowed())) {
        this.state.awaitPos = this.state.start;
      }
    }

    if (this.scope.inClass && !this.scope.inNonArrowFunction && word === "arguments") {
      this.raise(startLoc, Errors.ArgumentsDisallowedInInitializer);
      return;
    }

    if (checkKeywords && isKeyword(word)) {
      this.raise(startLoc, Errors.UnexpectedKeyword, word);
      return;
    }

    var reservedTest = !this.state.strict ? isReservedWord : isBinding ? isStrictBindReservedWord : isStrictReservedWord;

    if (reservedTest(word, this.inModule)) {
      if (!this.prodParam.hasAwait && word === "await") {
        this.raise(startLoc, Errors.AwaitNotInAsyncFunction);
      } else {
        this.raise(startLoc, Errors.UnexpectedReservedWord, word);
      }
    }
  };

  ExpressionParser.prototype.isAwaitAllowed = function isAwaitAllowed () {
    if (this.scope.inFunction) { return this.prodParam.hasAwait; }
    if (this.options.allowAwaitOutsideFunction) { return true; }

    if (this.hasPlugin("topLevelAwait")) {
      return this.inModule && this.prodParam.hasAwait;
    }

    return false;
  };

  ExpressionParser.prototype.parseAwait = function parseAwait () {
    var node = this.startNode();
    this.next();

    if (this.state.inParameters) {
      this.raise(node.start, Errors.AwaitExpressionFormalParameter);
    } else if (this.state.awaitPos === -1) {
      this.state.awaitPos = node.start;
    }

    if (this.eat(types.star)) {
      this.raise(node.start, Errors.ObsoleteAwaitStar);
    }

    if (!this.scope.inFunction && !this.options.allowAwaitOutsideFunction) {
      if (this.hasPrecedingLineBreak() || this.match(types.plusMin) || this.match(types.parenL) || this.match(types.bracketL) || this.match(types.backQuote) || this.match(types.regexp) || this.match(types.slash) || this.hasPlugin("v8intrinsic") && this.match(types.modulo)) {
        this.ambiguousScriptDifferentAst = true;
      } else {
        this.sawUnambiguousESM = true;
      }
    }

    if (!this.state.soloAwait) {
      node.argument = this.parseMaybeUnary();
    }

    return this.finishNode(node, "AwaitExpression");
  };

  ExpressionParser.prototype.parseYield = function parseYield (noIn) {
    var node = this.startNode();

    if (this.state.inParameters) {
      this.raise(node.start, Errors.YieldInParameter);
    } else if (this.state.yieldPos === -1) {
      this.state.yieldPos = node.start;
    }

    this.next();

    if (this.match(types.semi) || !this.match(types.star) && !this.state.type.startsExpr || this.hasPrecedingLineBreak()) {
      node.delegate = false;
      node.argument = null;
    } else {
      node.delegate = this.eat(types.star);
      node.argument = this.parseMaybeAssign(noIn);
    }

    return this.finishNode(node, "YieldExpression");
  };

  ExpressionParser.prototype.checkPipelineAtInfixOperator = function checkPipelineAtInfixOperator (left, leftStartPos) {
    if (this.getPluginOption("pipelineOperator", "proposal") === "smart") {
      if (left.type === "SequenceExpression") {
        this.raise(leftStartPos, Errors.PipelineHeadSequenceExpression);
      }
    }
  };

  ExpressionParser.prototype.parseSmartPipelineBody = function parseSmartPipelineBody (childExpression, startPos, startLoc) {
    var pipelineStyle = this.checkSmartPipelineBodyStyle(childExpression);
    this.checkSmartPipelineBodyEarlyErrors(childExpression, pipelineStyle, startPos);
    return this.parseSmartPipelineBodyInStyle(childExpression, pipelineStyle, startPos, startLoc);
  };

  ExpressionParser.prototype.checkSmartPipelineBodyEarlyErrors = function checkSmartPipelineBodyEarlyErrors (childExpression, pipelineStyle, startPos) {
    if (this.match(types.arrow)) {
      throw this.raise(this.state.start, Errors.PipelineBodyNoArrow);
    } else if (pipelineStyle === "PipelineTopicExpression" && childExpression.type === "SequenceExpression") {
      this.raise(startPos, Errors.PipelineBodySequenceExpression);
    }
  };

  ExpressionParser.prototype.parseSmartPipelineBodyInStyle = function parseSmartPipelineBodyInStyle (childExpression, pipelineStyle, startPos, startLoc) {
    var bodyNode = this.startNodeAt(startPos, startLoc);

    switch (pipelineStyle) {
      case "PipelineBareFunction":
        bodyNode.callee = childExpression;
        break;

      case "PipelineBareConstructor":
        bodyNode.callee = childExpression.callee;
        break;

      case "PipelineBareAwaitedFunction":
        bodyNode.callee = childExpression.argument;
        break;

      case "PipelineTopicExpression":
        if (!this.topicReferenceWasUsedInCurrentTopicContext()) {
          this.raise(startPos, Errors.PipelineTopicUnused);
        }

        bodyNode.expression = childExpression;
        break;

      default:
        throw new Error(("Internal @babel/parser error: Unknown pipeline style (" + pipelineStyle + ")"));
    }

    return this.finishNode(bodyNode, pipelineStyle);
  };

  ExpressionParser.prototype.checkSmartPipelineBodyStyle = function checkSmartPipelineBodyStyle (expression) {
    switch (expression.type) {
      default:
        return this.isSimpleReference(expression) ? "PipelineBareFunction" : "PipelineTopicExpression";
    }
  };

  ExpressionParser.prototype.isSimpleReference = function isSimpleReference (expression) {
    switch (expression.type) {
      case "MemberExpression":
        return !expression.computed && this.isSimpleReference(expression.object);

      case "Identifier":
        return true;

      default:
        return false;
    }
  };

  ExpressionParser.prototype.withTopicPermittingContext = function withTopicPermittingContext (callback) {
    var outerContextTopicState = this.state.topicContext;
    this.state.topicContext = {
      maxNumOfResolvableTopics: 1,
      maxTopicIndex: null
    };

    try {
      return callback();
    } finally {
      this.state.topicContext = outerContextTopicState;
    }
  };

  ExpressionParser.prototype.withTopicForbiddingContext = function withTopicForbiddingContext (callback) {
    var outerContextTopicState = this.state.topicContext;
    this.state.topicContext = {
      maxNumOfResolvableTopics: 0,
      maxTopicIndex: null
    };

    try {
      return callback();
    } finally {
      this.state.topicContext = outerContextTopicState;
    }
  };

  ExpressionParser.prototype.withSoloAwaitPermittingContext = function withSoloAwaitPermittingContext (callback) {
    var outerContextSoloAwaitState = this.state.soloAwait;
    this.state.soloAwait = true;

    try {
      return callback();
    } finally {
      this.state.soloAwait = outerContextSoloAwaitState;
    }
  };

  ExpressionParser.prototype.registerTopicReference = function registerTopicReference () {
    this.state.topicContext.maxTopicIndex = 0;
  };

  ExpressionParser.prototype.primaryTopicReferenceIsAllowedInCurrentTopicContext = function primaryTopicReferenceIsAllowedInCurrentTopicContext () {
    return this.state.topicContext.maxNumOfResolvableTopics >= 1;
  };

  ExpressionParser.prototype.topicReferenceWasUsedInCurrentTopicContext = function topicReferenceWasUsedInCurrentTopicContext () {
    return this.state.topicContext.maxTopicIndex != null && this.state.topicContext.maxTopicIndex >= 0;
  };

  ExpressionParser.prototype.parseFSharpPipelineBody = function parseFSharpPipelineBody (prec, noIn) {
    var startPos = this.state.start;
    var startLoc = this.state.startLoc;
    this.state.potentialArrowAt = this.state.start;
    var oldInFSharpPipelineDirectBody = this.state.inFSharpPipelineDirectBody;
    this.state.inFSharpPipelineDirectBody = true;
    var ret = this.parseExprOp(this.parseMaybeUnary(), startPos, startLoc, prec, noIn);
    this.state.inFSharpPipelineDirectBody = oldInFSharpPipelineDirectBody;
    return ret;
  };

  return ExpressionParser;
}(LValParser));

var loopLabel = {
  kind: "loop"
},
      switchLabel = {
  kind: "switch"
};
var FUNC_NO_FLAGS = 0,
      FUNC_STATEMENT = 1,
      FUNC_HANGING_STATEMENT = 2,
      FUNC_NULLABLE_ID = 4;
var StatementParser = /*@__PURE__*/(function (ExpressionParser) {
  function StatementParser () {
    ExpressionParser.apply(this, arguments);
  }

  if ( ExpressionParser ) StatementParser.__proto__ = ExpressionParser;
  StatementParser.prototype = Object.create( ExpressionParser && ExpressionParser.prototype );
  StatementParser.prototype.constructor = StatementParser;

  StatementParser.prototype.parseTopLevel = function parseTopLevel (file, program) {
    program.sourceType = this.options.sourceType;
    program.interpreter = this.parseInterpreterDirective();
    this.parseBlockBody(program, true, true, types.eof);

    if (this.inModule && !this.options.allowUndeclaredExports && this.scope.undefinedExports.size > 0) {
      for (var _i = 0, _Array$from = Array.from(this.scope.undefinedExports); _i < _Array$from.length; _i++) {
        var ref = _Array$from[_i];
        var name = ref[0];
        var pos = this.scope.undefinedExports.get(name);
        this.raise(pos, Errors.ModuleExportUndefined, name);
      }
    }

    file.program = this.finishNode(program, "Program");
    file.comments = this.state.comments;
    if (this.options.tokens) { file.tokens = this.tokens; }
    return this.finishNode(file, "File");
  };

  StatementParser.prototype.stmtToDirective = function stmtToDirective (stmt) {
    var expr = stmt.expression;
    var directiveLiteral = this.startNodeAt(expr.start, expr.loc.start);
    var directive = this.startNodeAt(stmt.start, stmt.loc.start);
    var raw = this.input.slice(expr.start, expr.end);
    var val = directiveLiteral.value = raw.slice(1, -1);
    this.addExtra(directiveLiteral, "raw", raw);
    this.addExtra(directiveLiteral, "rawValue", val);
    directive.value = this.finishNodeAt(directiveLiteral, "DirectiveLiteral", expr.end, expr.loc.end);
    return this.finishNodeAt(directive, "Directive", stmt.end, stmt.loc.end);
  };

  StatementParser.prototype.parseInterpreterDirective = function parseInterpreterDirective () {
    if (!this.match(types.interpreterDirective)) {
      return null;
    }

    var node = this.startNode();
    node.value = this.state.value;
    this.next();
    return this.finishNode(node, "InterpreterDirective");
  };

  StatementParser.prototype.isLet = function isLet (context) {
    if (!this.isContextual("let")) {
      return false;
    }

    var next = this.nextTokenStart();
    var nextCh = this.input.charCodeAt(next);
    if (nextCh === 91) { return true; }
    if (context) { return false; }
    if (nextCh === 123) { return true; }

    if (isIdentifierStart(nextCh)) {
      var pos = next + 1;

      while (isIdentifierChar(this.input.charCodeAt(pos))) {
        ++pos;
      }

      var ident = this.input.slice(next, pos);
      if (!keywordRelationalOperator.test(ident)) { return true; }
    }

    return false;
  };

  StatementParser.prototype.parseStatement = function parseStatement (context, topLevel) {
    if (this.match(types.at)) {
      this.parseDecorators(true);
    }

    return this.parseStatementContent(context, topLevel);
  };

  StatementParser.prototype.parseStatementContent = function parseStatementContent (context, topLevel) {
    var starttype = this.state.type;
    var node = this.startNode();
    var kind;

    if (this.isLet(context)) {
      starttype = types._var;
      kind = "let";
    }

    switch (starttype) {
      case types._break:
      case types._continue:
        return this.parseBreakContinueStatement(node, starttype.keyword);

      case types._debugger:
        return this.parseDebuggerStatement(node);

      case types._do:
        return this.parseDoStatement(node);

      case types._for:
        return this.parseForStatement(node);

      case types._function:
        if (this.lookaheadCharCode() === 46) { break; }

        if (context) {
          if (this.state.strict) {
            this.raise(this.state.start, Errors.StrictFunction);
          } else if (context !== "if" && context !== "label") {
            this.raise(this.state.start, Errors.SloppyFunction);
          }
        }

        return this.parseFunctionStatement(node, false, !context);

      case types._class:
        if (context) { this.unexpected(); }
        return this.parseClass(node, true);

      case types._if:
        return this.parseIfStatement(node);

      case types._return:
        return this.parseReturnStatement(node);

      case types._switch:
        return this.parseSwitchStatement(node);

      case types._throw:
        return this.parseThrowStatement(node);

      case types._try:
        return this.parseTryStatement(node);

      case types._const:
      case types._var:
        kind = kind || this.state.value;

        if (context && kind !== "var") {
          this.raise(this.state.start, Errors.UnexpectedLexicalDeclaration);
        }

        return this.parseVarStatement(node, kind);

      case types._while:
        return this.parseWhileStatement(node);

      case types._with:
        return this.parseWithStatement(node);

      case types.braceL:
        return this.parseBlock();

      case types.semi:
        return this.parseEmptyStatement(node);

      case types._export:
      case types._import:
        {
          var nextTokenCharCode = this.lookaheadCharCode();

          if (nextTokenCharCode === 40 || nextTokenCharCode === 46) {
            break;
          }

          if (!this.options.allowImportExportEverywhere && !topLevel) {
            this.raise(this.state.start, Errors.UnexpectedImportExport);
          }

          this.next();
          var result;

          if (starttype === types._import) {
            result = this.parseImport(node);

            if (result.type === "ImportDeclaration" && (!result.importKind || result.importKind === "value")) {
              this.sawUnambiguousESM = true;
            }
          } else {
            result = this.parseExport(node);

            if (result.type === "ExportNamedDeclaration" && (!result.exportKind || result.exportKind === "value") || result.type === "ExportAllDeclaration" && (!result.exportKind || result.exportKind === "value") || result.type === "ExportDefaultDeclaration") {
              this.sawUnambiguousESM = true;
            }
          }

          this.assertModuleNodeAllowed(node);
          return result;
        }

      default:
        {
          if (this.isAsyncFunction()) {
            if (context) {
              this.raise(this.state.start, Errors.AsyncFunctionInSingleStatementContext);
            }

            this.next();
            return this.parseFunctionStatement(node, true, !context);
          }
        }
    }

    var maybeName = this.state.value;
    var expr = this.parseExpression();

    if (starttype === types.name && expr.type === "Identifier" && this.eat(types.colon)) {
      return this.parseLabeledStatement(node, maybeName, expr, context);
    } else {
      return this.parseExpressionStatement(node, expr);
    }
  };

  StatementParser.prototype.assertModuleNodeAllowed = function assertModuleNodeAllowed (node) {
    if (!this.options.allowImportExportEverywhere && !this.inModule) {
      this.raiseWithData(node.start, {
        code: "BABEL_PARSER_SOURCETYPE_MODULE_REQUIRED"
      }, Errors.ImportOutsideModule);
    }
  };

  StatementParser.prototype.takeDecorators = function takeDecorators (node) {
    var decorators = this.state.decoratorStack[this.state.decoratorStack.length - 1];

    if (decorators.length) {
      node.decorators = decorators;
      this.resetStartLocationFromNode(node, decorators[0]);
      this.state.decoratorStack[this.state.decoratorStack.length - 1] = [];
    }
  };

  StatementParser.prototype.canHaveLeadingDecorator = function canHaveLeadingDecorator () {
    return this.match(types._class);
  };

  StatementParser.prototype.parseDecorators = function parseDecorators (allowExport) {
    var currentContextDecorators = this.state.decoratorStack[this.state.decoratorStack.length - 1];

    while (this.match(types.at)) {
      var decorator = this.parseDecorator();
      currentContextDecorators.push(decorator);
    }

    if (this.match(types._export)) {
      if (!allowExport) {
        this.unexpected();
      }

      if (this.hasPlugin("decorators") && !this.getPluginOption("decorators", "decoratorsBeforeExport")) {
        this.raise(this.state.start, Errors.DecoratorExportClass);
      }
    } else if (!this.canHaveLeadingDecorator()) {
      throw this.raise(this.state.start, Errors.UnexpectedLeadingDecorator);
    }
  };

  StatementParser.prototype.parseDecorator = function parseDecorator () {
    this.expectOnePlugin(["decorators-legacy", "decorators"]);
    var node = this.startNode();
    this.next();

    if (this.hasPlugin("decorators")) {
      this.state.decoratorStack.push([]);
      var startPos = this.state.start;
      var startLoc = this.state.startLoc;
      var expr;

      if (this.eat(types.parenL)) {
        expr = this.parseExpression();
        this.expect(types.parenR);
      } else {
        expr = this.parseIdentifier(false);

        while (this.eat(types.dot)) {
          var node$1 = this.startNodeAt(startPos, startLoc);
          node$1.object = expr;
          node$1.property = this.parseIdentifier(true);
          node$1.computed = false;
          expr = this.finishNode(node$1, "MemberExpression");
        }
      }

      node.expression = this.parseMaybeDecoratorArguments(expr);
      this.state.decoratorStack.pop();
    } else {
      node.expression = this.parseExprSubscripts();
    }

    return this.finishNode(node, "Decorator");
  };

  StatementParser.prototype.parseMaybeDecoratorArguments = function parseMaybeDecoratorArguments (expr) {
    if (this.eat(types.parenL)) {
      var node = this.startNodeAtNode(expr);
      node.callee = expr;
      node.arguments = this.parseCallExpressionArguments(types.parenR, false);
      this.toReferencedList(node.arguments);
      return this.finishNode(node, "CallExpression");
    }

    return expr;
  };

  StatementParser.prototype.parseBreakContinueStatement = function parseBreakContinueStatement (node, keyword) {
    var isBreak = keyword === "break";
    this.next();

    if (this.isLineTerminator()) {
      node.label = null;
    } else {
      node.label = this.parseIdentifier();
      this.semicolon();
    }

    this.verifyBreakContinue(node, keyword);
    return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");
  };

  StatementParser.prototype.verifyBreakContinue = function verifyBreakContinue (node, keyword) {
    var isBreak = keyword === "break";
    var i;

    for (i = 0; i < this.state.labels.length; ++i) {
      var lab = this.state.labels[i];

      if (node.label == null || lab.name === node.label.name) {
        if (lab.kind != null && (isBreak || lab.kind === "loop")) { break; }
        if (node.label && isBreak) { break; }
      }
    }

    if (i === this.state.labels.length) {
      this.raise(node.start, Errors.IllegalBreakContinue, keyword);
    }
  };

  StatementParser.prototype.parseDebuggerStatement = function parseDebuggerStatement (node) {
    this.next();
    this.semicolon();
    return this.finishNode(node, "DebuggerStatement");
  };

  StatementParser.prototype.parseHeaderExpression = function parseHeaderExpression () {
    this.expect(types.parenL);
    var val = this.parseExpression();
    this.expect(types.parenR);
    return val;
  };

  StatementParser.prototype.parseDoStatement = function parseDoStatement (node) {
    var this$1 = this;

    this.next();
    this.state.labels.push(loopLabel);
    node.body = this.withTopicForbiddingContext(function () { return this$1.parseStatement("do"); });
    this.state.labels.pop();
    this.expect(types._while);
    node.test = this.parseHeaderExpression();
    this.eat(types.semi);
    return this.finishNode(node, "DoWhileStatement");
  };

  StatementParser.prototype.parseForStatement = function parseForStatement (node) {
    this.next();
    this.state.labels.push(loopLabel);
    var awaitAt = -1;

    if (this.isAwaitAllowed() && this.eatContextual("await")) {
      awaitAt = this.state.lastTokStart;
    }

    this.scope.enter(SCOPE_OTHER);
    this.expect(types.parenL);

    if (this.match(types.semi)) {
      if (awaitAt > -1) {
        this.unexpected(awaitAt);
      }

      return this.parseFor(node, null);
    }

    var isLet = this.isLet();

    if (this.match(types._var) || this.match(types._const) || isLet) {
      var init$1 = this.startNode();
      var kind = isLet ? "let" : this.state.value;
      this.next();
      this.parseVar(init$1, true, kind);
      this.finishNode(init$1, "VariableDeclaration");

      if ((this.match(types._in) || this.isContextual("of")) && init$1.declarations.length === 1) {
        return this.parseForIn(node, init$1, awaitAt);
      }

      if (awaitAt > -1) {
        this.unexpected(awaitAt);
      }

      return this.parseFor(node, init$1);
    }

    var refExpressionErrors = new ExpressionErrors();
    var init = this.parseExpression(true, refExpressionErrors);

    if (this.match(types._in) || this.isContextual("of")) {
      this.toAssignable(init);
      var description = this.isContextual("of") ? "for-of statement" : "for-in statement";
      this.checkLVal(init, undefined, undefined, description);
      return this.parseForIn(node, init, awaitAt);
    } else {
      this.checkExpressionErrors(refExpressionErrors, true);
    }

    if (awaitAt > -1) {
      this.unexpected(awaitAt);
    }

    return this.parseFor(node, init);
  };

  StatementParser.prototype.parseFunctionStatement = function parseFunctionStatement (node, isAsync, declarationPosition) {
    this.next();
    return this.parseFunction(node, FUNC_STATEMENT | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT), isAsync);
  };

  StatementParser.prototype.parseIfStatement = function parseIfStatement (node) {
    this.next();
    node.test = this.parseHeaderExpression();
    node.consequent = this.parseStatement("if");
    node.alternate = this.eat(types._else) ? this.parseStatement("if") : null;
    return this.finishNode(node, "IfStatement");
  };

  StatementParser.prototype.parseReturnStatement = function parseReturnStatement (node) {
    if (!this.prodParam.hasReturn && !this.options.allowReturnOutsideFunction) {
      this.raise(this.state.start, Errors.IllegalReturn);
    }

    this.next();

    if (this.isLineTerminator()) {
      node.argument = null;
    } else {
      node.argument = this.parseExpression();
      this.semicolon();
    }

    return this.finishNode(node, "ReturnStatement");
  };

  StatementParser.prototype.parseSwitchStatement = function parseSwitchStatement (node) {
    this.next();
    node.discriminant = this.parseHeaderExpression();
    var cases = node.cases = [];
    this.expect(types.braceL);
    this.state.labels.push(switchLabel);
    this.scope.enter(SCOPE_OTHER);
    var cur;

    for (var sawDefault = (void 0); !this.match(types.braceR);) {
      if (this.match(types._case) || this.match(types._default)) {
        var isCase = this.match(types._case);
        if (cur) { this.finishNode(cur, "SwitchCase"); }
        cases.push(cur = this.startNode());
        cur.consequent = [];
        this.next();

        if (isCase) {
          cur.test = this.parseExpression();
        } else {
          if (sawDefault) {
            this.raise(this.state.lastTokStart, Errors.MultipleDefaultsInSwitch);
          }

          sawDefault = true;
          cur.test = null;
        }

        this.expect(types.colon);
      } else {
        if (cur) {
          cur.consequent.push(this.parseStatement(null));
        } else {
          this.unexpected();
        }
      }
    }

    this.scope.exit();
    if (cur) { this.finishNode(cur, "SwitchCase"); }
    this.next();
    this.state.labels.pop();
    return this.finishNode(node, "SwitchStatement");
  };

  StatementParser.prototype.parseThrowStatement = function parseThrowStatement (node) {
    this.next();

    if (lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start))) {
      this.raise(this.state.lastTokEnd, Errors.NewlineAfterThrow);
    }

    node.argument = this.parseExpression();
    this.semicolon();
    return this.finishNode(node, "ThrowStatement");
  };

  StatementParser.prototype.parseTryStatement = function parseTryStatement (node) {
    var this$1 = this;

    this.next();
    node.block = this.parseBlock();
    node.handler = null;

    if (this.match(types._catch)) {
      var clause = this.startNode();
      this.next();

      if (this.match(types.parenL)) {
        this.expect(types.parenL);
        clause.param = this.parseBindingAtom();
        var simple = clause.param.type === "Identifier";
        this.scope.enter(simple ? SCOPE_SIMPLE_CATCH : 0);
        this.checkLVal(clause.param, BIND_LEXICAL, null, "catch clause");
        this.expect(types.parenR);
      } else {
        clause.param = null;
        this.scope.enter(SCOPE_OTHER);
      }

      clause.body = this.withTopicForbiddingContext(function () { return this$1.parseBlock(false, false); });
      this.scope.exit();
      node.handler = this.finishNode(clause, "CatchClause");
    }

    node.finalizer = this.eat(types._finally) ? this.parseBlock() : null;

    if (!node.handler && !node.finalizer) {
      this.raise(node.start, Errors.NoCatchOrFinally);
    }

    return this.finishNode(node, "TryStatement");
  };

  StatementParser.prototype.parseVarStatement = function parseVarStatement (node, kind) {
    this.next();
    this.parseVar(node, false, kind);
    this.semicolon();
    return this.finishNode(node, "VariableDeclaration");
  };

  StatementParser.prototype.parseWhileStatement = function parseWhileStatement (node) {
    var this$1 = this;

    this.next();
    node.test = this.parseHeaderExpression();
    this.state.labels.push(loopLabel);
    node.body = this.withTopicForbiddingContext(function () { return this$1.parseStatement("while"); });
    this.state.labels.pop();
    return this.finishNode(node, "WhileStatement");
  };

  StatementParser.prototype.parseWithStatement = function parseWithStatement (node) {
    var this$1 = this;

    if (this.state.strict) {
      this.raise(this.state.start, Errors.StrictWith);
    }

    this.next();
    node.object = this.parseHeaderExpression();
    node.body = this.withTopicForbiddingContext(function () { return this$1.parseStatement("with"); });
    return this.finishNode(node, "WithStatement");
  };

  StatementParser.prototype.parseEmptyStatement = function parseEmptyStatement (node) {
    this.next();
    return this.finishNode(node, "EmptyStatement");
  };

  StatementParser.prototype.parseLabeledStatement = function parseLabeledStatement (node, maybeName, expr, context) {
    for (var _i2 = 0, _this$state$labels = this.state.labels; _i2 < _this$state$labels.length; _i2++) {
      var label = _this$state$labels[_i2];

      if (label.name === maybeName) {
        this.raise(expr.start, Errors.LabelRedeclaration, maybeName);
      }
    }

    var kind = this.state.type.isLoop ? "loop" : this.match(types._switch) ? "switch" : null;

    for (var i = this.state.labels.length - 1; i >= 0; i--) {
      var label$1 = this.state.labels[i];

      if (label$1.statementStart === node.start) {
        label$1.statementStart = this.state.start;
        label$1.kind = kind;
      } else {
        break;
      }
    }

    this.state.labels.push({
      name: maybeName,
      kind: kind,
      statementStart: this.state.start
    });
    node.body = this.parseStatement(context ? context.indexOf("label") === -1 ? context + "label" : context : "label");
    this.state.labels.pop();
    node.label = expr;
    return this.finishNode(node, "LabeledStatement");
  };

  StatementParser.prototype.parseExpressionStatement = function parseExpressionStatement (node, expr) {
    node.expression = expr;
    this.semicolon();
    return this.finishNode(node, "ExpressionStatement");
  };

  StatementParser.prototype.parseBlock = function parseBlock (allowDirectives, createNewLexicalScope, afterBlockParse) {
    if ( allowDirectives === void 0 ) allowDirectives = false;
    if ( createNewLexicalScope === void 0 ) createNewLexicalScope = true;

    var node = this.startNode();
    this.expect(types.braceL);

    if (createNewLexicalScope) {
      this.scope.enter(SCOPE_OTHER);
    }

    this.parseBlockBody(node, allowDirectives, false, types.braceR, afterBlockParse);

    if (createNewLexicalScope) {
      this.scope.exit();
    }

    return this.finishNode(node, "BlockStatement");
  };

  StatementParser.prototype.isValidDirective = function isValidDirective (stmt) {
    return stmt.type === "ExpressionStatement" && stmt.expression.type === "StringLiteral" && !stmt.expression.extra.parenthesized;
  };

  StatementParser.prototype.parseBlockBody = function parseBlockBody (node, allowDirectives, topLevel, end, afterBlockParse) {
    var body = node.body = [];
    var directives = node.directives = [];
    this.parseBlockOrModuleBlockBody(body, allowDirectives ? directives : undefined, topLevel, end, afterBlockParse);
  };

  StatementParser.prototype.parseBlockOrModuleBlockBody = function parseBlockOrModuleBlockBody (body, directives, topLevel, end, afterBlockParse) {
    var octalPositions = [];
    var oldStrict = this.state.strict;
    var hasStrictModeDirective = false;
    var parsedNonDirective = false;

    while (!this.match(end)) {
      if (!parsedNonDirective && this.state.octalPositions.length) {
        octalPositions.push.apply(octalPositions, this.state.octalPositions);
      }

      var stmt = this.parseStatement(null, topLevel);

      if (directives && !parsedNonDirective && this.isValidDirective(stmt)) {
        var directive = this.stmtToDirective(stmt);
        directives.push(directive);

        if (!hasStrictModeDirective && directive.value.value === "use strict") {
          hasStrictModeDirective = true;
          this.setStrict(true);
        }

        continue;
      }

      parsedNonDirective = true;
      body.push(stmt);
    }

    if (this.state.strict && octalPositions.length) {
      for (var _i3 = 0; _i3 < octalPositions.length; _i3++) {
        var pos = octalPositions[_i3];
        this.raise(pos, Errors.StrictOctalLiteral);
      }
    }

    if (afterBlockParse) {
      afterBlockParse.call(this, hasStrictModeDirective);
    }

    if (!oldStrict) {
      this.setStrict(false);
    }

    this.next();
  };

  StatementParser.prototype.parseFor = function parseFor (node, init) {
    var this$1 = this;

    node.init = init;
    this.expect(types.semi);
    node.test = this.match(types.semi) ? null : this.parseExpression();
    this.expect(types.semi);
    node.update = this.match(types.parenR) ? null : this.parseExpression();
    this.expect(types.parenR);
    node.body = this.withTopicForbiddingContext(function () { return this$1.parseStatement("for"); });
    this.scope.exit();
    this.state.labels.pop();
    return this.finishNode(node, "ForStatement");
  };

  StatementParser.prototype.parseForIn = function parseForIn (node, init, awaitAt) {
    var this$1 = this;

    var isForIn = this.match(types._in);
    this.next();

    if (isForIn) {
      if (awaitAt > -1) { this.unexpected(awaitAt); }
    } else {
      node.await = awaitAt > -1;
    }

    if (init.type === "VariableDeclaration" && init.declarations[0].init != null && (!isForIn || this.state.strict || init.kind !== "var" || init.declarations[0].id.type !== "Identifier")) {
      this.raise(init.start, Errors.ForInOfLoopInitializer, isForIn ? "for-in" : "for-of");
    } else if (init.type === "AssignmentPattern") {
      this.raise(init.start, Errors.InvalidLhs, "for-loop");
    }

    node.left = init;
    node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
    this.expect(types.parenR);
    node.body = this.withTopicForbiddingContext(function () { return this$1.parseStatement("for"); });
    this.scope.exit();
    this.state.labels.pop();
    return this.finishNode(node, isForIn ? "ForInStatement" : "ForOfStatement");
  };

  StatementParser.prototype.parseVar = function parseVar (node, isFor, kind) {
    var declarations = node.declarations = [];
    var isTypescript = this.hasPlugin("typescript");
    node.kind = kind;

    for (;;) {
      var decl = this.startNode();
      this.parseVarId(decl, kind);

      if (this.eat(types.eq)) {
        decl.init = this.parseMaybeAssign(isFor);
      } else {
        if (kind === "const" && !(this.match(types._in) || this.isContextual("of"))) {
          if (!isTypescript) {
            this.unexpected();
          }
        } else if (decl.id.type !== "Identifier" && !(isFor && (this.match(types._in) || this.isContextual("of")))) {
          this.raise(this.state.lastTokEnd, Errors.DeclarationMissingInitializer, "Complex binding patterns");
        }

        decl.init = null;
      }

      declarations.push(this.finishNode(decl, "VariableDeclarator"));
      if (!this.eat(types.comma)) { break; }
    }

    return node;
  };

  StatementParser.prototype.parseVarId = function parseVarId (decl, kind) {
    decl.id = this.parseBindingAtom();
    this.checkLVal(decl.id, kind === "var" ? BIND_VAR : BIND_LEXICAL, undefined, "variable declaration", kind !== "var");
  };

  StatementParser.prototype.parseFunction = function parseFunction (node, statement, isAsync) {
    var this$1 = this;
    if ( statement === void 0 ) statement = FUNC_NO_FLAGS;
    if ( isAsync === void 0 ) isAsync = false;

    var isStatement = statement & FUNC_STATEMENT;
    var isHangingStatement = statement & FUNC_HANGING_STATEMENT;
    var requireId = !!isStatement && !(statement & FUNC_NULLABLE_ID);
    this.initFunction(node, isAsync);

    if (this.match(types.star) && isHangingStatement) {
      this.raise(this.state.start, Errors.GeneratorInSingleStatementContext);
    }

    node.generator = this.eat(types.star);

    if (isStatement) {
      node.id = this.parseFunctionId(requireId);
    }

    var oldMaybeInArrowParameters = this.state.maybeInArrowParameters;
    var oldYieldPos = this.state.yieldPos;
    var oldAwaitPos = this.state.awaitPos;
    this.state.maybeInArrowParameters = false;
    this.state.yieldPos = -1;
    this.state.awaitPos = -1;
    this.scope.enter(SCOPE_FUNCTION);
    this.prodParam.enter(functionFlags(isAsync, node.generator));

    if (!isStatement) {
      node.id = this.parseFunctionId();
    }

    this.parseFunctionParams(node);
    this.withTopicForbiddingContext(function () {
      this$1.parseFunctionBodyAndFinish(node, isStatement ? "FunctionDeclaration" : "FunctionExpression");
    });
    this.prodParam.exit();
    this.scope.exit();

    if (isStatement && !isHangingStatement) {
      this.registerFunctionStatementId(node);
    }

    this.state.maybeInArrowParameters = oldMaybeInArrowParameters;
    this.state.yieldPos = oldYieldPos;
    this.state.awaitPos = oldAwaitPos;
    return node;
  };

  StatementParser.prototype.parseFunctionId = function parseFunctionId (requireId) {
    return requireId || this.match(types.name) ? this.parseIdentifier() : null;
  };

  StatementParser.prototype.parseFunctionParams = function parseFunctionParams (node, allowModifiers) {
    var oldInParameters = this.state.inParameters;
    this.state.inParameters = true;
    this.expect(types.parenL);
    node.params = this.parseBindingList(types.parenR, 41, false, allowModifiers);
    this.state.inParameters = oldInParameters;
    this.checkYieldAwaitInDefaultParams();
  };

  StatementParser.prototype.registerFunctionStatementId = function registerFunctionStatementId (node) {
    if (!node.id) { return; }
    this.scope.declareName(node.id.name, this.state.strict || node.generator || node.async ? this.scope.treatFunctionsAsVar ? BIND_VAR : BIND_LEXICAL : BIND_FUNCTION, node.id.start);
  };

  StatementParser.prototype.parseClass = function parseClass (node, isStatement, optionalId) {
    this.next();
    this.takeDecorators(node);
    var oldStrict = this.state.strict;
    this.state.strict = true;
    this.parseClassId(node, isStatement, optionalId);
    this.parseClassSuper(node);
    node.body = this.parseClassBody(!!node.superClass, oldStrict);
    this.state.strict = oldStrict;
    return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
  };

  StatementParser.prototype.isClassProperty = function isClassProperty () {
    return this.match(types.eq) || this.match(types.semi) || this.match(types.braceR);
  };

  StatementParser.prototype.isClassMethod = function isClassMethod () {
    return this.match(types.parenL);
  };

  StatementParser.prototype.isNonstaticConstructor = function isNonstaticConstructor (method) {
    return !method.computed && !method.static && (method.key.name === "constructor" || method.key.value === "constructor");
  };

  StatementParser.prototype.parseClassBody = function parseClassBody (constructorAllowsSuper, oldStrict) {
    var this$1 = this;

    this.classScope.enter();
    var state = {
      hadConstructor: false
    };
    var decorators = [];
    var classBody = this.startNode();
    classBody.body = [];
    this.expect(types.braceL);
    this.withTopicForbiddingContext(function () {
      while (!this$1.match(types.braceR)) {
        if (this$1.eat(types.semi)) {
          if (decorators.length > 0) {
            throw this$1.raise(this$1.state.lastTokEnd, Errors.DecoratorSemicolon);
          }

          continue;
        }

        if (this$1.match(types.at)) {
          decorators.push(this$1.parseDecorator());
          continue;
        }

        var member = this$1.startNode();

        if (decorators.length) {
          member.decorators = decorators;
          this$1.resetStartLocationFromNode(member, decorators[0]);
          decorators = [];
        }

        this$1.parseClassMember(classBody, member, state, constructorAllowsSuper);

        if (member.kind === "constructor" && member.decorators && member.decorators.length > 0) {
          this$1.raise(member.start, Errors.DecoratorConstructor);
        }
      }
    });

    if (!oldStrict) {
      this.state.strict = false;
    }

    this.next();

    if (decorators.length) {
      throw this.raise(this.state.start, Errors.TrailingDecorator);
    }

    this.classScope.exit();
    return this.finishNode(classBody, "ClassBody");
  };

  StatementParser.prototype.parseClassMemberFromModifier = function parseClassMemberFromModifier (classBody, member) {
    var containsEsc = this.state.containsEsc;
    var key = this.parseIdentifier(true);

    if (this.isClassMethod()) {
      var method = member;
      method.kind = "method";
      method.computed = false;
      method.key = key;
      method.static = false;
      this.pushClassMethod(classBody, method, false, false, false, false);
      return true;
    } else if (this.isClassProperty()) {
      var prop = member;
      prop.computed = false;
      prop.key = key;
      prop.static = false;
      classBody.body.push(this.parseClassProperty(prop));
      return true;
    } else if (containsEsc) {
      throw this.unexpected();
    }

    return false;
  };

  StatementParser.prototype.parseClassMember = function parseClassMember (classBody, member, state, constructorAllowsSuper) {
    var isStatic = this.isContextual("static");

    if (isStatic && this.parseClassMemberFromModifier(classBody, member)) {
      return;
    }

    this.parseClassMemberWithIsStatic(classBody, member, state, isStatic, constructorAllowsSuper);
  };

  StatementParser.prototype.parseClassMemberWithIsStatic = function parseClassMemberWithIsStatic (classBody, member, state, isStatic, constructorAllowsSuper) {
    var publicMethod = member;
    var privateMethod = member;
    var publicProp = member;
    var privateProp = member;
    var method = publicMethod;
    var publicMember = publicMethod;
    member.static = isStatic;

    if (this.eat(types.star)) {
      method.kind = "method";
      this.parseClassPropertyName(method);

      if (method.key.type === "PrivateName") {
        this.pushClassPrivateMethod(classBody, privateMethod, true, false);
        return;
      }

      if (this.isNonstaticConstructor(publicMethod)) {
        this.raise(publicMethod.key.start, Errors.ConstructorIsGenerator);
      }

      this.pushClassMethod(classBody, publicMethod, true, false, false, false);
      return;
    }

    var containsEsc = this.state.containsEsc;
    var key = this.parseClassPropertyName(member);
    var isPrivate = key.type === "PrivateName";
    var isSimple = key.type === "Identifier";
    var maybeQuestionTokenStart = this.state.start;
    this.parsePostMemberNameModifiers(publicMember);

    if (this.isClassMethod()) {
      method.kind = "method";

      if (isPrivate) {
        this.pushClassPrivateMethod(classBody, privateMethod, false, false);
        return;
      }

      var isConstructor = this.isNonstaticConstructor(publicMethod);
      var allowsDirectSuper = false;

      if (isConstructor) {
        publicMethod.kind = "constructor";

        if (state.hadConstructor && !this.hasPlugin("typescript")) {
          this.raise(key.start, Errors.DuplicateConstructor);
        }

        state.hadConstructor = true;
        allowsDirectSuper = constructorAllowsSuper;
      }

      this.pushClassMethod(classBody, publicMethod, false, false, isConstructor, allowsDirectSuper);
    } else if (this.isClassProperty()) {
      if (isPrivate) {
        this.pushClassPrivateProperty(classBody, privateProp);
      } else {
        this.pushClassProperty(classBody, publicProp);
      }
    } else if (isSimple && key.name === "async" && !containsEsc && !this.isLineTerminator()) {
      var isGenerator = this.eat(types.star);

      if (publicMember.optional) {
        this.unexpected(maybeQuestionTokenStart);
      }

      method.kind = "method";
      this.parseClassPropertyName(method);
      this.parsePostMemberNameModifiers(publicMember);

      if (method.key.type === "PrivateName") {
        this.pushClassPrivateMethod(classBody, privateMethod, isGenerator, true);
      } else {
        if (this.isNonstaticConstructor(publicMethod)) {
          this.raise(publicMethod.key.start, Errors.ConstructorIsAsync);
        }

        this.pushClassMethod(classBody, publicMethod, isGenerator, true, false, false);
      }
    } else if (isSimple && (key.name === "get" || key.name === "set") && !containsEsc && !(this.match(types.star) && this.isLineTerminator())) {
      method.kind = key.name;
      this.parseClassPropertyName(publicMethod);

      if (method.key.type === "PrivateName") {
        this.pushClassPrivateMethod(classBody, privateMethod, false, false);
      } else {
        if (this.isNonstaticConstructor(publicMethod)) {
          this.raise(publicMethod.key.start, Errors.ConstructorIsAccessor);
        }

        this.pushClassMethod(classBody, publicMethod, false, false, false, false);
      }

      this.checkGetterSetterParams(publicMethod);
    } else if (this.isLineTerminator()) {
      if (isPrivate) {
        this.pushClassPrivateProperty(classBody, privateProp);
      } else {
        this.pushClassProperty(classBody, publicProp);
      }
    } else {
      this.unexpected();
    }
  };

  StatementParser.prototype.parseClassPropertyName = function parseClassPropertyName (member) {
    var key = this.parsePropertyName(member, true);

    if (!member.computed && member.static && (key.name === "prototype" || key.value === "prototype")) {
      this.raise(key.start, Errors.StaticPrototype);
    }

    if (key.type === "PrivateName" && key.id.name === "constructor") {
      this.raise(key.start, Errors.ConstructorClassPrivateField);
    }

    return key;
  };

  StatementParser.prototype.pushClassProperty = function pushClassProperty (classBody, prop) {
    if (!prop.computed && (prop.key.name === "constructor" || prop.key.value === "constructor")) {
      this.raise(prop.key.start, Errors.ConstructorClassField);
    }

    classBody.body.push(this.parseClassProperty(prop));
  };

  StatementParser.prototype.pushClassPrivateProperty = function pushClassPrivateProperty (classBody, prop) {
    this.expectPlugin("classPrivateProperties", prop.key.start);
    var node = this.parseClassPrivateProperty(prop);
    classBody.body.push(node);
    this.classScope.declarePrivateName(node.key.id.name, CLASS_ELEMENT_OTHER, node.key.start);
  };

  StatementParser.prototype.pushClassMethod = function pushClassMethod (classBody, method, isGenerator, isAsync, isConstructor, allowsDirectSuper) {
    classBody.body.push(this.parseMethod(method, isGenerator, isAsync, isConstructor, allowsDirectSuper, "ClassMethod", true));
  };

  StatementParser.prototype.pushClassPrivateMethod = function pushClassPrivateMethod (classBody, method, isGenerator, isAsync) {
    this.expectPlugin("classPrivateMethods", method.key.start);
    var node = this.parseMethod(method, isGenerator, isAsync, false, false, "ClassPrivateMethod", true);
    classBody.body.push(node);
    var kind = node.kind === "get" ? node.static ? CLASS_ELEMENT_STATIC_GETTER : CLASS_ELEMENT_INSTANCE_GETTER : node.kind === "set" ? node.static ? CLASS_ELEMENT_STATIC_SETTER : CLASS_ELEMENT_INSTANCE_SETTER : CLASS_ELEMENT_OTHER;
    this.classScope.declarePrivateName(node.key.id.name, kind, node.key.start);
  };

  StatementParser.prototype.parsePostMemberNameModifiers = function parsePostMemberNameModifiers (methodOrProp) {};

  StatementParser.prototype.parseAccessModifier = function parseAccessModifier () {
    return undefined;
  };

  StatementParser.prototype.parseClassPrivateProperty = function parseClassPrivateProperty (node) {
    this.scope.enter(SCOPE_CLASS | SCOPE_SUPER);
    this.prodParam.enter(PARAM);
    node.value = this.eat(types.eq) ? this.parseMaybeAssign() : null;
    this.semicolon();
    this.prodParam.exit();
    this.scope.exit();
    return this.finishNode(node, "ClassPrivateProperty");
  };

  StatementParser.prototype.parseClassProperty = function parseClassProperty (node) {
    if (!node.typeAnnotation) {
      this.expectPlugin("classProperties");
    }

    this.scope.enter(SCOPE_CLASS | SCOPE_SUPER);
    this.prodParam.enter(PARAM);

    if (this.match(types.eq)) {
      this.expectPlugin("classProperties");
      this.next();
      node.value = this.parseMaybeAssign();
    } else {
      node.value = null;
    }

    this.semicolon();
    this.prodParam.exit();
    this.scope.exit();
    return this.finishNode(node, "ClassProperty");
  };

  StatementParser.prototype.parseClassId = function parseClassId (node, isStatement, optionalId, bindingType) {
    if ( bindingType === void 0 ) bindingType = BIND_CLASS;

    if (this.match(types.name)) {
      node.id = this.parseIdentifier();

      if (isStatement) {
        this.checkLVal(node.id, bindingType, undefined, "class name");
      }
    } else {
      if (optionalId || !isStatement) {
        node.id = null;
      } else {
        this.unexpected(null, Errors.MissingClassName);
      }
    }
  };

  StatementParser.prototype.parseClassSuper = function parseClassSuper (node) {
    node.superClass = this.eat(types._extends) ? this.parseExprSubscripts() : null;
  };

  StatementParser.prototype.parseExport = function parseExport (node) {
    var hasDefault = this.maybeParseExportDefaultSpecifier(node);
    var parseAfterDefault = !hasDefault || this.eat(types.comma);
    var hasStar = parseAfterDefault && this.eatExportStar(node);
    var hasNamespace = hasStar && this.maybeParseExportNamespaceSpecifier(node);
    var parseAfterNamespace = parseAfterDefault && (!hasNamespace || this.eat(types.comma));
    var isFromRequired = hasDefault || hasStar;

    if (hasStar && !hasNamespace) {
      if (hasDefault) { this.unexpected(); }
      this.parseExportFrom(node, true);
      return this.finishNode(node, "ExportAllDeclaration");
    }

    var hasSpecifiers = this.maybeParseExportNamedSpecifiers(node);

    if (hasDefault && parseAfterDefault && !hasStar && !hasSpecifiers || hasNamespace && parseAfterNamespace && !hasSpecifiers) {
      throw this.unexpected(null, types.braceL);
    }

    var hasDeclaration;

    if (isFromRequired || hasSpecifiers) {
      hasDeclaration = false;
      this.parseExportFrom(node, isFromRequired);
    } else {
      hasDeclaration = this.maybeParseExportDeclaration(node);
    }

    if (isFromRequired || hasSpecifiers || hasDeclaration) {
      this.checkExport(node, true, false, !!node.source);
      return this.finishNode(node, "ExportNamedDeclaration");
    }

    if (this.eat(types._default)) {
      node.declaration = this.parseExportDefaultExpression();
      this.checkExport(node, true, true);
      return this.finishNode(node, "ExportDefaultDeclaration");
    }

    throw this.unexpected(null, types.braceL);
  };

  StatementParser.prototype.eatExportStar = function eatExportStar (node) {
    return this.eat(types.star);
  };

  StatementParser.prototype.maybeParseExportDefaultSpecifier = function maybeParseExportDefaultSpecifier (node) {
    if (this.isExportDefaultSpecifier()) {
      this.expectPlugin("exportDefaultFrom");
      var specifier = this.startNode();
      specifier.exported = this.parseIdentifier(true);
      node.specifiers = [this.finishNode(specifier, "ExportDefaultSpecifier")];
      return true;
    }

    return false;
  };

  StatementParser.prototype.maybeParseExportNamespaceSpecifier = function maybeParseExportNamespaceSpecifier (node) {
    if (this.isContextual("as")) {
      if (!node.specifiers) { node.specifiers = []; }
      var specifier = this.startNodeAt(this.state.lastTokStart, this.state.lastTokStartLoc);
      this.next();
      specifier.exported = this.parseIdentifier(true);
      node.specifiers.push(this.finishNode(specifier, "ExportNamespaceSpecifier"));
      return true;
    }

    return false;
  };

  StatementParser.prototype.maybeParseExportNamedSpecifiers = function maybeParseExportNamedSpecifiers (node) {
    var ref;

    if (this.match(types.braceL)) {
      if (!node.specifiers) { node.specifiers = []; }
      (ref = node.specifiers).push.apply(ref, this.parseExportSpecifiers());
      node.source = null;
      node.declaration = null;
      return true;
    }

    return false;
  };

  StatementParser.prototype.maybeParseExportDeclaration = function maybeParseExportDeclaration (node) {
    if (this.shouldParseExportDeclaration()) {
      if (this.isContextual("async")) {
        var next = this.nextTokenStart();

        if (!this.isUnparsedContextual(next, "function")) {
          this.unexpected(next, types._function);
        }
      }

      node.specifiers = [];
      node.source = null;
      node.declaration = this.parseExportDeclaration(node);
      return true;
    }

    return false;
  };

  StatementParser.prototype.isAsyncFunction = function isAsyncFunction () {
    if (!this.isContextual("async")) { return false; }
    var next = this.nextTokenStart();
    return !lineBreak.test(this.input.slice(this.state.pos, next)) && this.isUnparsedContextual(next, "function");
  };

  StatementParser.prototype.parseExportDefaultExpression = function parseExportDefaultExpression () {
    var expr = this.startNode();
    var isAsync = this.isAsyncFunction();

    if (this.match(types._function) || isAsync) {
      this.next();

      if (isAsync) {
        this.next();
      }

      return this.parseFunction(expr, FUNC_STATEMENT | FUNC_NULLABLE_ID, isAsync);
    } else if (this.match(types._class)) {
      return this.parseClass(expr, true, true);
    } else if (this.match(types.at)) {
      if (this.hasPlugin("decorators") && this.getPluginOption("decorators", "decoratorsBeforeExport")) {
        this.raise(this.state.start, Errors.DecoratorBeforeExport);
      }

      this.parseDecorators(false);
      return this.parseClass(expr, true, true);
    } else if (this.match(types._const) || this.match(types._var) || this.isLet()) {
      throw this.raise(this.state.start, Errors.UnsupportedDefaultExport);
    } else {
      var res = this.parseMaybeAssign();
      this.semicolon();
      return res;
    }
  };

  StatementParser.prototype.parseExportDeclaration = function parseExportDeclaration (node) {
    return this.parseStatement(null);
  };

  StatementParser.prototype.isExportDefaultSpecifier = function isExportDefaultSpecifier () {
    if (this.match(types.name)) {
      return this.state.value !== "async" && this.state.value !== "let";
    }

    if (!this.match(types._default)) {
      return false;
    }

    var next = this.nextTokenStart();
    return this.input.charCodeAt(next) === 44 || this.isUnparsedContextual(next, "from");
  };

  StatementParser.prototype.parseExportFrom = function parseExportFrom (node, expect) {
    if (this.eatContextual("from")) {
      node.source = this.parseImportSource();
      this.checkExport(node);
    } else {
      if (expect) {
        this.unexpected();
      } else {
        node.source = null;
      }
    }

    this.semicolon();
  };

  StatementParser.prototype.shouldParseExportDeclaration = function shouldParseExportDeclaration () {
    if (this.match(types.at)) {
      this.expectOnePlugin(["decorators", "decorators-legacy"]);

      if (this.hasPlugin("decorators")) {
        if (this.getPluginOption("decorators", "decoratorsBeforeExport")) {
          this.unexpected(this.state.start, Errors.DecoratorBeforeExport);
        } else {
          return true;
        }
      }
    }

    return this.state.type.keyword === "var" || this.state.type.keyword === "const" || this.state.type.keyword === "function" || this.state.type.keyword === "class" || this.isLet() || this.isAsyncFunction();
  };

  StatementParser.prototype.checkExport = function checkExport (node, checkNames, isDefault, isFrom) {
    if (checkNames) {
      if (isDefault) {
        this.checkDuplicateExports(node, "default");
      } else if (node.specifiers && node.specifiers.length) {
        for (var _i4 = 0, _node$specifiers = node.specifiers; _i4 < _node$specifiers.length; _i4++) {
          var specifier = _node$specifiers[_i4];
          this.checkDuplicateExports(specifier, specifier.exported.name);

          if (!isFrom && specifier.local) {
            this.checkReservedWord(specifier.local.name, specifier.local.start, true, false);
            this.scope.checkLocalExport(specifier.local);
          }
        }
      } else if (node.declaration) {
        if (node.declaration.type === "FunctionDeclaration" || node.declaration.type === "ClassDeclaration") {
          var id = node.declaration.id;
          if (!id) { throw new Error("Assertion failure"); }
          this.checkDuplicateExports(node, id.name);
        } else if (node.declaration.type === "VariableDeclaration") {
          for (var _i5 = 0, _node$declaration$dec = node.declaration.declarations; _i5 < _node$declaration$dec.length; _i5++) {
            var declaration = _node$declaration$dec[_i5];
            this.checkDeclaration(declaration.id);
          }
        }
      }
    }

    var currentContextDecorators = this.state.decoratorStack[this.state.decoratorStack.length - 1];

    if (currentContextDecorators.length) {
      var isClass = node.declaration && (node.declaration.type === "ClassDeclaration" || node.declaration.type === "ClassExpression");

      if (!node.declaration || !isClass) {
        throw this.raise(node.start, Errors.UnsupportedDecoratorExport);
      }

      this.takeDecorators(node.declaration);
    }
  };

  StatementParser.prototype.checkDeclaration = function checkDeclaration (node) {
    if (node.type === "Identifier") {
      this.checkDuplicateExports(node, node.name);
    } else if (node.type === "ObjectPattern") {
      for (var _i6 = 0, _node$properties = node.properties; _i6 < _node$properties.length; _i6++) {
        var prop = _node$properties[_i6];
        this.checkDeclaration(prop);
      }
    } else if (node.type === "ArrayPattern") {
      for (var _i7 = 0, _node$elements = node.elements; _i7 < _node$elements.length; _i7++) {
        var elem = _node$elements[_i7];

        if (elem) {
          this.checkDeclaration(elem);
        }
      }
    } else if (node.type === "ObjectProperty") {
      this.checkDeclaration(node.value);
    } else if (node.type === "RestElement") {
      this.checkDeclaration(node.argument);
    } else if (node.type === "AssignmentPattern") {
      this.checkDeclaration(node.left);
    }
  };

  StatementParser.prototype.checkDuplicateExports = function checkDuplicateExports (node, name) {
    if (this.state.exportedIdentifiers.indexOf(name) > -1) {
      this.raise(node.start, name === "default" ? Errors.DuplicateDefaultExport : Errors.DuplicateExport, name);
    }

    this.state.exportedIdentifiers.push(name);
  };

  StatementParser.prototype.parseExportSpecifiers = function parseExportSpecifiers () {
    var nodes = [];
    var first = true;
    this.expect(types.braceL);

    while (!this.eat(types.braceR)) {
      if (first) {
        first = false;
      } else {
        this.expect(types.comma);
        if (this.eat(types.braceR)) { break; }
      }

      var node = this.startNode();
      node.local = this.parseIdentifier(true);
      node.exported = this.eatContextual("as") ? this.parseIdentifier(true) : node.local.__clone();
      nodes.push(this.finishNode(node, "ExportSpecifier"));
    }

    return nodes;
  };

  StatementParser.prototype.parseImport = function parseImport (node) {
    node.specifiers = [];

    if (!this.match(types.string)) {
      var hasDefault = this.maybeParseDefaultImportSpecifier(node);
      var parseNext = !hasDefault || this.eat(types.comma);
      var hasStar = parseNext && this.maybeParseStarImportSpecifier(node);
      if (parseNext && !hasStar) { this.parseNamedImportSpecifiers(node); }
      this.expectContextual("from");
    }

    node.source = this.parseImportSource();
    this.semicolon();
    return this.finishNode(node, "ImportDeclaration");
  };

  StatementParser.prototype.parseImportSource = function parseImportSource () {
    if (!this.match(types.string)) { this.unexpected(); }
    return this.parseExprAtom();
  };

  StatementParser.prototype.shouldParseDefaultImport = function shouldParseDefaultImport (node) {
    return this.match(types.name);
  };

  StatementParser.prototype.parseImportSpecifierLocal = function parseImportSpecifierLocal (node, specifier, type, contextDescription) {
    specifier.local = this.parseIdentifier();
    this.checkLVal(specifier.local, BIND_LEXICAL, undefined, contextDescription);
    node.specifiers.push(this.finishNode(specifier, type));
  };

  StatementParser.prototype.maybeParseDefaultImportSpecifier = function maybeParseDefaultImportSpecifier (node) {
    if (this.shouldParseDefaultImport(node)) {
      this.parseImportSpecifierLocal(node, this.startNode(), "ImportDefaultSpecifier", "default import specifier");
      return true;
    }

    return false;
  };

  StatementParser.prototype.maybeParseStarImportSpecifier = function maybeParseStarImportSpecifier (node) {
    if (this.match(types.star)) {
      var specifier = this.startNode();
      this.next();
      this.expectContextual("as");
      this.parseImportSpecifierLocal(node, specifier, "ImportNamespaceSpecifier", "import namespace specifier");
      return true;
    }

    return false;
  };

  StatementParser.prototype.parseNamedImportSpecifiers = function parseNamedImportSpecifiers (node) {
    var first = true;
    this.expect(types.braceL);

    while (!this.eat(types.braceR)) {
      if (first) {
        first = false;
      } else {
        if (this.eat(types.colon)) {
          throw this.raise(this.state.start, Errors.DestructureNamedImport);
        }

        this.expect(types.comma);
        if (this.eat(types.braceR)) { break; }
      }

      this.parseImportSpecifier(node);
    }
  };

  StatementParser.prototype.parseImportSpecifier = function parseImportSpecifier (node) {
    var specifier = this.startNode();
    specifier.imported = this.parseIdentifier(true);

    if (this.eatContextual("as")) {
      specifier.local = this.parseIdentifier();
    } else {
      this.checkReservedWord(specifier.imported.name, specifier.start, true, true);
      specifier.local = specifier.imported.__clone();
    }

    this.checkLVal(specifier.local, BIND_LEXICAL, undefined, "import specifier");
    node.specifiers.push(this.finishNode(specifier, "ImportSpecifier"));
  };

  return StatementParser;
}(ExpressionParser));

var ClassScope = function ClassScope() {
  this.privateNames = new Set();
  this.loneAccessors = new Map();
  this.undefinedPrivateNames = new Map();
};
var ClassScopeHandler = function ClassScopeHandler(raise) {
  this.stack = [];
  this.undefinedPrivateNames = new Map();
  this.raise = raise;
};

ClassScopeHandler.prototype.current = function current () {
  return this.stack[this.stack.length - 1];
};

ClassScopeHandler.prototype.enter = function enter () {
  this.stack.push(new ClassScope());
};

ClassScopeHandler.prototype.exit = function exit () {
  var oldClassScope = this.stack.pop();
  var current = this.current();

  for (var _i = 0, _Array$from = Array.from(oldClassScope.undefinedPrivateNames); _i < _Array$from.length; _i++) {
    var ref = _Array$from[_i];
      var name = ref[0];
      var pos = ref[1];

    if (current) {
      if (!current.undefinedPrivateNames.has(name)) {
        current.undefinedPrivateNames.set(name, pos);
      }
    } else {
      this.raise(pos, Errors.InvalidPrivateFieldResolution, name);
    }
  }
};

ClassScopeHandler.prototype.declarePrivateName = function declarePrivateName (name, elementType, pos) {
  var classScope = this.current();
  var redefined = classScope.privateNames.has(name);

  if (elementType & CLASS_ELEMENT_KIND_ACCESSOR) {
    var accessor = redefined && classScope.loneAccessors.get(name);

    if (accessor) {
      var oldStatic = accessor & CLASS_ELEMENT_FLAG_STATIC;
      var newStatic = elementType & CLASS_ELEMENT_FLAG_STATIC;
      var oldKind = accessor & CLASS_ELEMENT_KIND_ACCESSOR;
      var newKind = elementType & CLASS_ELEMENT_KIND_ACCESSOR;
      redefined = oldKind === newKind || oldStatic !== newStatic;
      if (!redefined) { classScope.loneAccessors.delete(name); }
    } else if (!redefined) {
      classScope.loneAccessors.set(name, elementType);
    }
  }

  if (redefined) {
    this.raise(pos, Errors.PrivateNameRedeclaration, name);
  }

  classScope.privateNames.add(name);
  classScope.undefinedPrivateNames.delete(name);
};

ClassScopeHandler.prototype.usePrivateName = function usePrivateName (name, pos) {
  var classScope;

  for (var _i2 = 0, _this$stack = this.stack; _i2 < _this$stack.length; _i2++) {
    classScope = _this$stack[_i2];
    if (classScope.privateNames.has(name)) { return; }
  }

  if (classScope) {
    classScope.undefinedPrivateNames.set(name, pos);
  } else {
    this.raise(pos, Errors.InvalidPrivateFieldResolution, name);
  }
};

var Parser = /*@__PURE__*/(function (StatementParser) {
  function Parser(options, input) {
    options = getOptions(options);
    StatementParser.call(this, options, input);
    var ScopeHandler = this.getScopeHandler();
    this.options = options;
    this.inModule = this.options.sourceType === "module";
    this.scope = new ScopeHandler(this.raise.bind(this), this.inModule);
    this.prodParam = new ProductionParameterHandler();
    this.classScope = new ClassScopeHandler(this.raise.bind(this));
    this.plugins = pluginsMap(this.options.plugins);
    this.filename = options.sourceFilename;
  }

  if ( StatementParser ) Parser.__proto__ = StatementParser;
  Parser.prototype = Object.create( StatementParser && StatementParser.prototype );
  Parser.prototype.constructor = Parser;

  Parser.prototype.getScopeHandler = function getScopeHandler () {
    return ScopeHandler;
  };

  Parser.prototype.parse = function parse () {
    var paramFlags = PARAM;

    if (this.hasPlugin("topLevelAwait") && this.inModule) {
      paramFlags |= PARAM_AWAIT;
    }

    this.scope.enter(SCOPE_PROGRAM);
    this.prodParam.enter(paramFlags);
    var file = this.startNode();
    var program = this.startNode();
    this.nextToken();
    file.errors = null;
    this.parseTopLevel(file, program);
    file.errors = this.state.errors;
    return file;
  };

  return Parser;
}(StatementParser));

function pluginsMap(plugins) {
  var pluginMap = new Map();

  for (var _i = 0; _i < plugins.length; _i++) {
    var plugin = plugins[_i];
    var ref = Array.isArray(plugin) ? plugin : [plugin, {}];
    var name = ref[0];
    var options = ref[1];
    if (!pluginMap.has(name)) { pluginMap.set(name, options || {}); }
  }

  return pluginMap;
}

function parse(input, options) {
  if (options && options.sourceType === "unambiguous") {
    options = Object.assign({}, options);

    try {
      options.sourceType = "module";
      var parser = getParser(options, input);
      var ast = parser.parse();

      if (parser.sawUnambiguousESM) {
        return ast;
      }

      if (parser.ambiguousScriptDifferentAst) {
        try {
          options.sourceType = "script";
          return getParser(options, input).parse();
        } catch (_unused) {}
      } else {
        ast.program.sourceType = "script";
      }

      return ast;
    } catch (moduleError) {
      try {
        options.sourceType = "script";
        return getParser(options, input).parse();
      } catch (_unused2) {}

      throw moduleError;
    }
  } else {
    return getParser(options, input).parse();
  }
}
function parseExpression(input, options) {
  var parser = getParser(options, input);

  if (parser.options.strictMode) {
    parser.state.strict = true;
  }

  return parser.getExpression();
}

function getParser(options, input) {
  var cls = Parser;

  if (options && options.plugins) {
    validatePlugins(options.plugins);
    cls = getParserClass(options.plugins);
  }

  return new cls(options, input);
}

var parserClassCache = {};

function getParserClass(pluginsFromOptions) {
  var pluginList = mixinPluginNames.filter(function (name) { return hasPlugin(pluginsFromOptions, name); });
  var key = pluginList.join("/");
  var cls = parserClassCache[key];

  if (!cls) {
    cls = Parser;

    for (var _i = 0; _i < pluginList.length; _i++) {
      var plugin = pluginList[_i];
      cls = mixinPlugins[plugin](cls);
    }

    parserClassCache[key] = cls;
  }

  return cls;
}

exports.parse = parse;
exports.parseExpression = parseExpression;
exports.tokTypes = types;

});

unwrapExports(lib);
var lib_1 = lib.parse;
var lib_2 = lib.parseExpression;
var lib_3 = lib.tokTypes;

/*  */
var vm$2 = require('vm');

var onCompilationError$1 = function (err, vm) {
  var trace = vm ? generateComponentTrace(vm) : '';
  throw new Error(("\n\u001b[31m" + err + trace + "\u001b[39m\n"))
};

var normalizeRender$1 = function (vm) {
  var ref = vm.$options;
  var render = ref.render;
  var template = ref.template;
  var _scopeId = ref._scopeId;
  if (isUndef(render)) {
    if (template) {
      var compiled = compileToFunctions(template, {
        scopeId: _scopeId,
        warn: onCompilationError$1
      }, vm);

      vm.$options.render = compiled.render;
      vm.$options.staticRenderFns = compiled.staticRenderFns;
    } else {
      throw new Error(
        ("render function or template not defined in component: " + (vm.$options.name || vm.$options._componentTag || 'anonymous'))
      )
    }
  }
};

function waitForServerPrefetch$1 (vm, resolve, reject) {
  var handlers = vm.$options.serverPrefetch;
  if (isDef(handlers)) {
    if (!Array.isArray(handlers)) { handlers = [handlers]; }
    try {
      var promises = [];
      for (var i = 0, j = handlers.length; i < j; i++) {
        var result = handlers[i].call(vm, vm);
        if (result && typeof result.then === 'function') {
          promises.push(result);
        }
      }
      Promise.all(promises).then(resolve).catch(reject);
      return
    } catch (e) {
      reject(e);
    }
  }
  resolve();
}

function hasAncestorData$1 (node) {
  var parentNode = node.parent;
  return isDef(parentNode) && (isDef(parentNode.data) || hasAncestorData$1(parentNode))
}

function getVShowDirectiveInfo$1 (node) {
  var dir;
  var tmp;

  while (isDef(node)) {
    if (node.data && node.data.directives) {
      tmp = node.data.directives.find(function (dir) { return dir.name === 'show'; });
      if (tmp) {
        dir = tmp;
      }
    }
    node = node.parent;
  }
  return dir
}

function renderStartingTag$1 (node, context, activeInstance) {
  var markup = "<" + (node.tag);
  var directives = context.directives;
  var modules = context.modules;

  // construct synthetic data for module processing
  // because modules like style also produce code by parent VNode data
  if (isUndef(node.data) && hasAncestorData$1(node)) {
    node.data = {};
  }
  if (isDef(node.data)) {
    // check directives
    var dirs = node.data.directives;
    if (dirs) {
      for (var i = 0; i < dirs.length; i++) {
        var name = dirs[i].name;
        if (name !== 'show') {
          var dirRenderer = resolveAsset(context, 'directives', name);
          if (dirRenderer) {
            // directives mutate the node's data
            // which then gets rendered by modules
            dirRenderer(node, dirs[i]);
          }
        }
      }
    }

    // v-show directive needs to be merged from parent to child
    var vshowDirectiveInfo = getVShowDirectiveInfo$1(node);
    if (vshowDirectiveInfo) {
      directives.show(node, vshowDirectiveInfo);
    }

    // apply other modules
    for (var i$1 = 0; i$1 < modules.length; i$1++) {
      var res = modules[i$1](node);
      if (res) {
        markup += res;
      }
    }
  }
  // attach scoped CSS ID
  var scopeId;
  if (isDef(activeInstance) &&
    activeInstance !== node.context &&
    isDef(scopeId = activeInstance.$options._scopeId)
  ) {
    markup += " " + ((scopeId));
  }
  if (isDef(node.fnScopeId)) {
    markup += " " + (node.fnScopeId);
  } else {
    while (isDef(node)) {
      if (isDef(scopeId = node.context.$options._scopeId)) {
        markup += " " + scopeId;
      }
      node = node.parent;
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
  if (!types.isConditionalExpression(ast)) {
    return ast
  }
  var boolFn = new vm$2.Script(("\n    (function() {\n      var _h = _vm.$createElement\n      var _c = _vm._self._c || _h\n      return " + (generate$2(ast.test).code) + "\n    })()\n  "));
  var result = boolFn.runInNewContext({_vm: context});
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
  var astChildren = getVNodeAstChildren(ast);
  var nodeChildren = node.children;

  var unMatchedAst = !astChildren || astChildren.elements.length !== nodeChildren.length;

  // 如果子语法树里面有循环语句，则当前语法树和子语法树全部都置为 unMatchedAst
  if (astChildren && Array.isArray(astChildren.elements)) {
    astChildren.elements.forEach(function (node) {
      if (isLCallExpression(node)) {
        ast.unMatchedAst = true;
        unMatchedAst = true;
      }
    });
  }

  if (unMatchedAst === false) {
    node.children.forEach(function (v, i) {
      var ast = astChildren.elements[i];
      // 子语法树如果是 ConditionalExpression 类型，需要进行一次求值，获取到真正的 CallExpression
      if (types.isConditionalExpression(ast)) {
        ast = calcuConditionalExpression(context, ast);
      }

      v.ast = ast;
    });
  } else {
    node.children.forEach(function (v) {
      v.ast = {
        unMatchedAst: unMatchedAst
      };
    });
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
  var ast = staticVNode.ast;
  var prevStaticActive = patchContext.staticActiveInstance;
  var prevDynamicActive = patchContext.dynamicActiveInstance;

  staticVNode.ssrContext = patchContext.userContext;
  dynamicVNode.ssrContext = patchContext.userContext;

  var staticChild = patchContext.staticActiveInstance = createComponentInstanceForVnode(
    staticVNode,
    patchContext.staticActiveInstance
  );
  var dynamicChild = patchContext.dynamicActiveInstance = createComponentInstanceForVnode(
    dynamicVNode,
    patchContext.dynamicActiveInstance
  );
  normalizeRender$1(staticChild);
  normalizeRender$1(dynamicChild);

  ast.ssrStyles = patchContext.userContext._styles;
  delete patchContext.userContext._styles;

  var staticRenderStr = staticChild.$options.render.toString();
  var staticAst = lib_1(("var render = " + staticRenderStr));
  ast.ssrRenderAst = staticAst;
  ast.render = staticChild.$options.render;

  var resolve = function () {
    var staticChildNode = staticChild._render();
    var dynamicChildNode = dynamicChild._render();

    staticChildNode.parent = staticVNode;
    dynamicChildNode.parent = dynamicVNode;

    patchContext.patchStates.push({
      type: 'Component',
      prevAst: ast,
      prevStaticActive: prevStaticActive,
      prevDynamicActive: prevDynamicActive
    });

    /**
     * 当前组件有可能不是通过 <template></template> 模板语法创建
     * 这种情况不对当前组件做语法树节点级别的优化
     * 转而判断当前组件是否完全是静态组件，如果是，则对整个组件做静态优化
     */
    var childAst = getVNodeRenderAst(staticAst);
    if (childAst) {
      staticChildNode.ast = childAst;
    } else {
      staticChildNode.ast = Object.assign(staticAst, { unMatchedAst: true });
    }
    patchNode(staticChildNode, dynamicChildNode, patchContext, isRoot);
  };

  var reject = patchContext.done;

  waitForServerPrefetch$1(dynamicChild, resolve, reject);
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
  var ast = staticVNode.ast;
  var staticFactory = staticVNode.asyncFactory;
  var dynamicFactory = dynamicVNode.asyncFactory;

  var resolve = function (staticComp, dynamicComp) {
    var staticResolvedNode = getResolevdNode(staticVNode, staticComp);
    var dynamicRedolvedNode = getResolevdNode(dynamicVNode, dynamicComp);
    if (staticResolvedNode && dynamicRedolvedNode) {
      staticResolvedNode.ast = Object.assign(ast, {unMatchedAst: true });
      if (staticResolvedNode.componentOptions && dynamicRedolvedNode.componentOptions) {
        patchComponent(staticResolvedNode, dynamicRedolvedNode, patchContext, isRoot);
        return
      }
      if (!Array.isArray(staticResolvedNode) && !Array.isArray(dynamicRedolvedNode)) {
        patchNode(staticResolvedNode, dynamicRedolvedNode, patchContext, isRoot);
        return
      }
      if (Array.isArray(staticResolvedNode) && Array.isArray(dynamicRedolvedNode)) {
        patchContext.patchStates.push({
          type: 'Fragment',
          staticChildren: staticResolvedNode,
          dynamicChildren: dynamicRedolvedNode,
          rendered: 0,
          ast: ast,
          total: staticResolvedNode.length
        });
        patchContext.next();
        return
      }
    }

    // invalid component, but this does not throw on the client
    // so render empty comment node
    ast.ssrString = "<!---->";
    ast.ssrStatic = true;
    patchContext.next();
  };

  if (staticFactory.resolved && dynamicFactory.resolved) {
    resolve(staticFactory.resolved, dynamicFactory.resolved);
    return
  }

  var reject = patchContext.done;
  var staticRes;
  var dynamicRes;
  try {
    Promise.all([
      new Promise(function (resolve, reject) {
        staticRes = staticFactory(function (comp) { return resolve(comp); }, reject);
      }),
      new Promise(function (resolve, reject) {
        dynamicRes = dynamicFactory(function (comp) { return resolve(comp); }, reject);
      })
    ]).then(function (res) {
      resolve(res[0], res[1]);
    }).catch(reject);
  } catch (e) {
    reject(e);
  }

  if (staticRes && dynamicRes) {
    if (typeof staticRes.then === 'function' && typeof dynamicRes.then === 'function') {
      Promise.all([staticRes, dynamicRes]).then(function (res) {
        resolve(res[0], res[1]);
      }).catch(reject);
      return
    } 
    var staticComponent = staticRes.component;
    var dynamicComponent = dynamicRes.component;
    if (typeof staticComponent.then === 'function' && typeof dynamicComponent.then === 'function') {
      Promise.all([staticComponent, dynamicComponent]).then(function (res) {
        resolve(res[0], res[1]);
      }).catch(reject);
      return
    }
  }
  patchContext.next();
}

function getResolevdNode(node, comp) {
  if (comp.__esModule && comp.default) {
    comp = comp.default;
  }
  var ref = node.asyncMeta;
  var data = ref.data;
  var children = ref.children;
  var tag = ref.tag;
  var nodeContext = node.asyncMeta.context;
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
  var ast = staticVNode.ast;
  if ((isUndef(staticVNode.children) && isUndef(dynamicVNode.children)) ||
    (staticVNode.children.length === 0 && dynamicVNode.children.length === 0)) {
      var staticString = staticVNode.open + (staticVNode.close || '');
      var dynamicString = dynamicVNode.open + (dynamicVNode.close || '');
      if (staticString.trim() === dynamicString.trim()) {
        ast.ssrString = staticString;
        ast.ssrStatic = true;
      }
  } else if (staticVNode.children.length === dynamicVNode.children.length) {
    if (staticVNode.open === dynamicVNode.open && staticVNode.close === dynamicVNode.close) {
      setVNodeChildrenAst(staticVNode, ast, patchContext.staticActiveInstance);
      patchContext.patchStates.push({
        type: 'Element',
        staticChildren: staticVNode.children,
        dynamicChildren: dynamicVNode.children,
        rendered: 0,
        ast: ast,
        total: staticVNode.children.length,
        endTag: staticVNode.close
      });
      ast.ssrString = staticVNode.open;
    }
  }
  patchContext.next();
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
    if (!staticVNode.data) { staticVNode.data = {}; }
    if (!staticVNode.data.attrs) { staticVNode.data.attrs = {}; }
    staticVNode.data.attrs[SSR_ATTR] = 'true';
    if (!dynamicVNode.data) { dynamicVNode.data = {}; }
    if (!dynamicVNode.data.attrs) { dynamicVNode.data.attrs = {}; }
    dynamicVNode.data.attrs[SSR_ATTR] = 'true';
  }
  
  var ast = staticVNode.ast;
  var staticStartTag = renderStartingTag$1(staticVNode, patchContext, patchContext.staticActiveInstance);
  var dynamicStartTag = renderStartingTag$1(dynamicVNode, patchContext, patchContext.dynamicActiveInstance);
  var staticEndTag = "</" + (staticVNode.tag) + ">";
  var dynamicEndTag = "</" + (dynamicVNode.tag) + ">";
  if (patchContext.isUnaryTag(staticVNode.tag) && patchContext.isUnaryTag(dynamicVNode.tag)) {
    if (staticStartTag === dynamicStartTag) {
      ast.ssrString = staticStartTag;
      ast.ssrStatic = true;
    }
  } else if ((isUndef(staticVNode.children) && isUndef(dynamicVNode.children)) ||
    (staticVNode.children.length === 0 && dynamicVNode.children.length === 0)) {
    if (staticStartTag + staticEndTag === dynamicStartTag + dynamicEndTag) {
      ast.ssrString = staticStartTag + staticEndTag;
      ast.ssrStatic = true;
    }
  } else if (staticVNode.children.length === dynamicVNode.children.length) {
    if (staticStartTag === dynamicStartTag && staticEndTag === dynamicEndTag) {
      setVNodeChildrenAst(staticVNode, ast, patchContext.staticActiveInstance);
      patchContext.patchStates.push({
        type: 'Element',
        staticChildren: staticVNode.children,
        dynamicChildren: dynamicVNode.children,
        rendered: 0,
        ast: ast,
        total: staticVNode.children.length,
        endTag: staticEndTag
      });
      ast.ssrString = staticStartTag;
    }
  }
  patchContext.next();
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

  var ast = staticVNode.ast;

  if (staticVNode.isString && dynamicVNode.isString) {
    patchStringNode(staticVNode, dynamicVNode, patchContext);
  }
  else if (isDef(staticVNode.componentOptions) && isDef(dynamicVNode.componentOptions)) {
    patchComponent(staticVNode, dynamicVNode, patchContext, isRoot);
  }
  else if (isDef(staticVNode.tag) && isDef(dynamicVNode.tag)) {
    patchElement(staticVNode, dynamicVNode, patchContext, isRoot);
  }
  else if (isTrue(staticVNode.isComment) && isTrue(dynamicVNode.isComment)) {
    if (isDef(staticVNode.asyncFactory) && isDef(dynamicVNode.asyncFactory)) {
      patchAsyncComponent(staticVNode, dynamicVNode, patchContext, isRoot);
    }
    else {
      if (staticVNode.text === dynamicVNode.text) {
        ast.ssrString = "<!--" + (staticVNode.text) + "-->";
        ast.ssrStatic = true;
      }
      patchContext.next();
    }
  }
  else if (isDef(staticVNode.text) && isDef(dynamicVNode.text)){
    var staticText = staticVNode.raw ? staticVNode.text : escape(String(staticVNode.text));
    var dynamicText = dynamicVNode.raw ? dynamicVNode.text : escape(String(dynamicVNode.text));
    if (staticText === dynamicText) {
      ast.ssrString = staticText;
      ast.ssrStatic = true;
    }
    patchContext.next();
  } else  {
    patchContext.next();
  }
}

function createPatchFunction (ref) {
  var modules = ref.modules;
  var directives = ref.directives;
  var isUnaryTag = ref.isUnaryTag;
  var cache = ref.cache;

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
    staticComponent,
    dynamiComponent,
    userContext,
    done
  ) {
    var render = staticComponent.$options.render;
    var staticAst = lib_1(("var render = " + (render.toString())));

    var patchContext = new PatchContext({
      staticActiveInstance: staticComponent,
      dynamicActiveInstance: dynamiComponent,
      userContext: userContext,
      staticAst: staticAst,
      done: done,
      patchNode: patchNode,
      isUnaryTag: isUnaryTag, modules: modules, directives: directives,
      cache: cache
    });

    installSSRHelpers(staticComponent);
    installSSRHelpers(dynamiComponent);
    normalizeRender$1(staticComponent);
    normalizeRender$1(dynamiComponent);

    var resolve = function () {
      var staticVNode = staticComponent._render();
      var dynamicVNode = dynamiComponent._render();

      var childAst = getVNodeRenderAst(staticAst);
      if (childAst) {
        staticVNode.ast = childAst;
      } else {
        staticVNode.ast = Object.assign(staticAst, { unMatchedAst: true });
      }


      patchContext.patchStates.push({
        type: 'Component',
        prevAst: {
          ssrRenderAst: staticAst,
          render: staticComponent.$options.render
        }
      });

      try {
        patchNode(staticVNode, dynamicVNode, patchContext, true);
      } catch(e) {
        done(e);
      }
    };

    waitForServerPrefetch$1(dynamiComponent, resolve, done);
  }
}

/*  */

var fs = require('fs');
var path$2 = require('path');
var PassThrough = require('stream').PassThrough;

var INVALID_MSG =
  'Invalid server-rendering bundle format. Should be a string ' +
  'or a bundle Object of type:\n\n' +
"{\n  entry: string;\n  files: { [filename: string]: string; };\n  maps: { [filename: string]: string; };\n}\n";

// The render bundle can either be a string (single bundled file)
// or a bundle manifest object generated by vue-ssr-webpack-plugin.


function createBundleRendererCreator (
  createRenderer,
  baseRenderOptions
) {
  var ssrRenderMap = {};
  return function createBundleRenderer (
    bundle,
    rendererOptions
  ) {
    if ( rendererOptions === void 0 ) rendererOptions = {};

    extend(rendererOptions, baseRenderOptions);
    var files, entry, maps;
    var basedir = rendererOptions.basedir;

    // load bundle if given filepath
    if (
      typeof bundle === 'string' &&
      /\.js(on)?$/.test(bundle) &&
      path$2.isAbsolute(bundle)
    ) {
      if (fs.existsSync(bundle)) {
        var isJSON = /\.json$/.test(bundle);
        basedir = basedir || path$2.dirname(bundle);
        bundle = fs.readFileSync(bundle, 'utf-8');
        if (isJSON) {
          try {
            bundle = JSON.parse(bundle);
          } catch (e) {
            throw new Error(("Invalid JSON bundle file: " + bundle))
          }
        }
      } else {
        throw new Error(("Cannot locate bundle file: " + bundle))
      }
    }

    if (typeof bundle === 'object') {
      entry = bundle.entry;
      files = bundle.files;
      basedir = basedir || bundle.basedir;
      maps = createSourceMapConsumers(bundle.maps);
      if (typeof entry !== 'string' || typeof files !== 'object') {
        throw new Error(INVALID_MSG)
      }
    } else if (typeof bundle === 'string') {
      entry = '__vue_ssr_bundle__';
      files = { '__vue_ssr_bundle__': bundle };
      maps = {};
    } else {
      throw new Error(INVALID_MSG)
    }

    var renderer = createRenderer(rendererOptions);

    var run = createBundleRunner(
      entry,
      files,
      basedir,
      rendererOptions.runInNewContext
    );

    var patcher = createPatchFunction(rendererOptions);

    return {
      renderToString: function (context, cb) {
        var assign;

        if (typeof context === 'function') {
          cb = context;
          context = {};
        }

        var promise;
        if (!cb) {
          ((assign = createPromiseCallback(), promise = assign.promise, cb = assign.cb));
        }

        run(context).catch(function (err) {
          rewriteErrorTrace(err, maps);
          cb(err);
        })
        .then(function (runner) {
          var base = runner.base || runner;
          var url = context.url || "";
          var ssrRenderUrl = Object.keys(ssrRenderMap)
            .filter(function (v) { return ssrRenderMap[v].regex.test(url); })[0];
          var ssrRenderTree = ssrRenderMap[ssrRenderUrl] && ssrRenderMap[ssrRenderUrl].tree;

          if (!ssrRenderTree) {
            console.log('start parse ssr render');
            return new Promise(function (resolve) {
              Promise.all([base(context), runner(context)]).then(function (res) {
                var ssrRender = {};
                if (res[0].$route && res[0].$route.matched[0]) {
                  var match = res[0].$route.matched[0];
                  if (!ssrRenderMap[match.path]) {
                    ssrRender = {
                      regex: match.regex
                    };
                    ssrRenderMap[match.path] = ssrRender;
                  }
                } else if (url) {
                  if (!ssrRenderMap[url]) {
                    ssrRender = {
                      regex: new RegExp(url)
                    };
                    ssrRenderMap[url] = ssrRender;
                  }
                }

                var done = function(e) {
                  if (e && e.success) {
                    context.ssrRenderTree = e.ssrRenderTree;
                    ssrRender.tree = e.ssrRenderTree;
                    {
                      console.log('new ssrRenderTree: ', e.ssrRenderTree);
                    }
                    resolve(res[1]);
                  } else {
                    rewriteErrorTrace(e, maps);
                    cb(e);
                  }
                };
                patcher(res[0], res[1], context, done);
              });
            })
          } else {
            context.ssrRenderTree = ssrRenderTree;
            console.log('use vue ssr jit');
            return runner(context)
          }
        })
        .then(function (app) {
          if (app) {
            renderer.renderToString(app, context, function (err, res) {
              rewriteErrorTrace(err, maps);
              cb(err, res);
            });
          }
        });

        return promise
      },

      renderToStream: function (context) {
        var res = new PassThrough();
        run(context).catch(function (err) {
          rewriteErrorTrace(err, maps);
          // avoid emitting synchronously before user can
          // attach error listener
          process.nextTick(function () {
            res.emit('error', err);
          });
        }).then(function (app) {
          if (app) {
            var renderStream = renderer.renderToStream(app, context);

            renderStream.on('error', function (err) {
              rewriteErrorTrace(err, maps);
              res.emit('error', err);
            });

            // relay HTMLStream special events
            if (rendererOptions && rendererOptions.template) {
              renderStream.on('beforeStart', function () {
                res.emit('beforeStart');
              });
              renderStream.on('beforeEnd', function () {
                res.emit('beforeEnd');
              });
            }

            renderStream.pipe(res);
          }
        });

        return res
      }
    }
  }
}

/*  */

process.env.VUE_ENV = "server";

var renderOptions = {
  isUnaryTag: isUnaryTag,
  canBeLeftOpenTag: canBeLeftOpenTag,
  modules: modules,
  // user can provide server-side implementations for custom directives
  // when creating the renderer.
  directives: baseDirectives
};

var createBundleRenderer = createBundleRendererCreator(createRenderer, renderOptions);

exports.createBundleRenderer = createBundleRenderer;
