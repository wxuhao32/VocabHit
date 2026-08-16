/* ============================================================
   ECDICT 通用英语兜底词典（懒加载查询层）
   - 数据：data/ecdict-<letter>.js，按首字母分片（a-z / #），
     每片内容形如：window.ECDICT_a={word:{p:"音标",s:"释义"}};
   - 加载：APK 内经 AndroidBridge/AndroidOverlay.readDictionary(letter)
     同步读取；Web 预览回退动态 <script> 标签
   - 查询优先级：考研词书（dict.js）> ECDICT（由调用方保证）
   - 分片首次查询时按需加载并缓存，不阻塞启动
   ============================================================ */
"use strict";

window.ECDICT = (function () {
  var cache = Object.create(null);   // letter -> 词表对象 | null（加载失败/null 也缓存）
  var pending = Object.create(null); // letter -> Promise

  function letterOf(word) {
    var c = word.charAt(0);
    return c >= "a" && c <= "z" ? c : "#";
  }

  /** 从分片 JS 文本中提取 JSON 词表（兼容 window.ECDICT_x={...}; 包裹） */
  function parsePart(text) {
    if (!text) return null;
    var m = text.match(/=\s*(\{.*\})\s*;?\s*$/s);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (_) { return null; }
  }

  /** 原生桥接读取（APK）；无桥接时用动态 script（Web 预览） */
  function readPart(letter) {
    var bridge =
      typeof window.AndroidBridge !== "undefined" && window.AndroidBridge.readDictionary
        ? window.AndroidBridge
        : typeof window.AndroidOverlay !== "undefined" && window.AndroidOverlay.readDictionary
          ? window.AndroidOverlay
          : null;
    if (bridge) return Promise.resolve(parsePart(bridge.readDictionary(letter)));
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "data/ecdict-" + letter + ".js";
      s.onload = function () {
        var data = window["ECDICT_" + letter] || null;
        s.remove();
        resolve(data);
      };
      s.onerror = function () { s.remove(); resolve(null); };
      document.head.appendChild(s);
    });
  }

  function loadPart(letter) {
    if (cache[letter] !== undefined) return Promise.resolve(cache[letter]);
    if (!pending[letter]) {
      pending[letter] = readPart(letter).then(function (data) {
        cache[letter] = data;
        return data;
      });
    }
    return pending[letter];
  }

  return {
    /** 同步查询（仅已加载的分片）；未命中返回 null */
    get: function (word) {
      var w = String(word).trim().toLowerCase();
      if (!w) return null;
      var part = cache[letterOf(w)];
      return part ? (part[w] || null) : null;
    },
    /** 异步查询：未加载分片时先加载再查 */
    getAsync: function (word) {
      var w = String(word).trim().toLowerCase();
      if (!w) return Promise.resolve(null);
      var direct = this.get(w);
      if (direct) return Promise.resolve(direct);
      return loadPart(letterOf(w)).then(function (part) {
        return part ? (part[w] || null) : null;
      });
    },
    /** 后台预加载某个分片（可选优化，当前按需） */
    preload: function (letter) {
      if (cache[letter] === undefined) loadPart(letter);
    },
    isLoaded: function (letter) {
      return cache[letter] !== undefined;
    },
    loadedCount: function () {
      var n = 0;
      for (var k in cache) if (cache[k]) n += Object.keys(cache[k]).length;
      return n;
    },
  };
})();
