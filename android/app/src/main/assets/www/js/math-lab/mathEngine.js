/* ============================================================
   Math Lab · 数学引擎（表达式解析 + 数值计算）
   ------------------------------------------------------------
   独立模块：不依赖 app.js / knowledge.js / DOM。
   挂载到 window.VH_MathLab.engine，供绘图与配置模块调用。
   支持：+ - * / ^ ( ) 一元负号、隐式乘法（2x / 2sin(x) / (x+1)(x-1)）、
        常数 pi π e tau、常用函数、多变量名编译（默认 x）。
   ============================================================ */
(function () {
  "use strict";
  window.VH_MathLab = window.VH_MathLab || {};

  /* ================= 常数与函数表 ================= */

  var CONSTS = {
    pi: Math.PI, tau: Math.PI * 2, e: Math.E
  };

  var FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2, log10: Math.log10,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
    min: Math.min, max: Math.max, pow: Math.pow, mod: function (a, b) { return a - b * Math.floor(a / b); }
  };

  var FUNC_ARGC = {
    atan2: 2, min: 2, max: 2, pow: 2, mod: 2
  };

  /* ================= 词法分析 ================= */

  function isDigit(c) { return c >= "0" && c <= "9"; }
  function isAsciiLetter(c) { return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z"); }

  /** 单词符号别名（允许自然输入） */
  var SYMBOL_ALIAS = { "×": "*", "·": "*", "÷": "/", "−": "-", "—": "-", "（": "(", "）": ")", "，": ",", "【": "(", "】": ")", "［": "(", "］": ")", "√": "sqrt" };

  function tokenize(src) {
    var toks = [], i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
      if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
        var j = i;
        while (j < n && (isDigit(src[j]) || src[j] === ".")) j++;
        // 科学计数法：数字 e/E ± 数字（避免与常数 e 混淆，仅在紧跟数字时生效）
        if (j < n && (src[j] === "e" || src[j] === "E")) {
          var k = j + 1;
          if (k < n && (src[k] === "+" || src[k] === "-")) k++;
          if (k < n && isDigit(src[k])) {
            k++;
            while (k < n && isDigit(src[k])) k++;
            j = k;
          }
        }
        var txt = src.slice(i, j);
        var v = parseFloat(txt);
        if (isNaN(v)) throw new Error("数字格式错误：“" + txt + "”");
        toks.push({ t: "num", v: v });
        i = j;
        continue;
      }
      if (isAsciiLetter(c) || c === "π") {
        var j2 = i;
        while (j2 < n && (isAsciiLetter(src[j2]) || src[j2] === "π")) j2++;
        var name = src.slice(i, j2).toLowerCase().replace(/π/g, "pi");
        if (name === "π") name = "pi";
        toks.push({ t: "ident", v: name });
        i = j2;
        continue;
      }
      var alias = SYMBOL_ALIAS[c];
      if (alias) {
        if (alias.length > 1) toks.push({ t: "ident", v: alias });
        else toks.push({ t: alias });
        i++;
        continue;
      }
      if ("+-*/^(),".indexOf(c) !== -1) { toks.push({ t: c }); i++; continue; }
      throw new Error("无法识别的字符：“" + c + "”");
    }
    return toks;
  }

  /* ================= 语法分析（递归下降） ================= */

  function parse(toks) {
    var p = 0;
    function peek() { return toks[p]; }
    function eat(t) { if (toks[p] && toks[p].t === t) return toks[p++]; return null; }
    function expect(t) {
      if (!eat(t)) throw new Error(t === ")" ? "缺少右括号" : "缺少 “" + t + "”");
    }

    function parseExpr() {
      var n = parseTerm();
      while (true) {
        if (eat("+")) n = { k: "add", a: n, b: parseTerm() };
        else if (eat("-")) n = { k: "sub", a: n, b: parseTerm() };
        else return n;
      }
    }

    function startsAtom(tk) {
      return !!tk && (tk.t === "num" || tk.t === "ident" || tk.t === "(");
    }

    function parseTerm() {
      var n = parseUnary();
      while (true) {
        if (eat("*")) n = { k: "mul", a: n, b: parseUnary() };
        else if (eat("/")) n = { k: "div", a: n, b: parseUnary() };
        else if (startsAtom(peek())) n = { k: "mul", a: n, b: parseUnary() }; // 隐式乘法
        else return n;
      }
    }

    function parseUnary() {
      if (eat("-")) return { k: "neg", a: parseUnary() };
      if (eat("+")) return parseUnary();
      return parsePower();
    }

    function parsePower() {
      var base = parseAtom();
      if (eat("^")) return { k: "pow", a: base, b: parseUnary() };
      return base;
    }

    function parseAtom() {
      var tk = peek();
      if (!tk) throw new Error("表达式不完整");
      if (tk.t === "num") { p++; return { k: "num", v: tk.v }; }
      if (tk.t === "(") {
        p++;
        var n = parseExpr();
        expect(")");
        return n;
      }
      if (tk.t === "ident") {
        p++;
        if (peek() && peek().t === "(" && FUNCS[tk.v]) { // 已知函数调用；未知标识符后跟 ( → 交给隐式乘法（如 x(x+1)）
          p++;
          var args = [parseExpr()];
          while (eat(",")) args.push(parseExpr());
          expect(")");
          return { k: "call", fn: tk.v, args: args };
        }
        return { k: "sym", name: tk.v };
      }
      throw new Error("意外的符号“" + (tk.t === "num" ? tk.v : tk.t) + "”");
    }

    var root = parseExpr();
    if (p < toks.length) throw new Error("第 " + p + " 个符号后有多余内容");
    return root;
  }

  /* ================= 编译为求值闭包 ================= */

  function compileNode(node, varName) {
    switch (node.k) {
      case "num": var v = node.v; return function () { return v; };
      case "sym":
        if (node.name === varName) return function (x) { return x; };
        if (Object.prototype.hasOwnProperty.call(CONSTS, node.name)) {
          var c = CONSTS[node.name]; return function () { return c; };
        }
        throw new Error("未知符号“" + node.name + "”（变量请用 " + varName + "，常数为 pi / e）");
      case "neg":
        var a = compileNode(node.a, varName);
        return function (x) { return -a(x); };
      case "add": case "sub": case "mul": case "div": case "pow":
        var l = compileNode(node.a, varName), r = compileNode(node.b, varName);
        if (node.k === "add") return function (x) { return l(x) + r(x); };
        if (node.k === "sub") return function (x) { return l(x) - r(x); };
        if (node.k === "mul") return function (x) { return l(x) * r(x); };
        if (node.k === "div") return function (x) { return l(x) / r(x); };
        return function (x) { return Math.pow(l(x), r(x)); };
      case "call":
        var fn = FUNCS[node.fn];
        if (!fn) throw new Error("未知函数“" + node.fn + "”");
        var argc = FUNC_ARGC[node.fn] || 1;
        if (node.args.length !== argc)
          throw new Error("函数 " + node.fn + " 需要 " + argc + " 个参数");
        var cs = node.args.map(function (a) { return compileNode(a, varName); });
        if (cs.length === 1) { var c0 = cs[0]; return function (x) { return fn(c0(x)); }; }
        if (cs.length === 2) { var d0 = cs[0], d1 = cs[1]; return function (x) { return fn(d0(x), d1(x)); }; }
        return function (x) { return fn.apply(null, cs.map(function (c) { return c(x); })); };
    }
    throw new Error("内部错误：未知节点");
  }

  /** 解析公式 → {f, ast, error}；varName 默认 x */
  function parseFormula(src, varName) {
    try {
      var s = String(src || "").trim();
      if (!s) return { f: null, error: "公式为空" };
      var var0 = varName || "x";
      var ast = parse(tokenize(s));
      var f = compileNode(ast, var0);
      var probe = f(1); // 探测一次：未知符号在此抛出
      if (typeof probe !== "number") return { f: null, error: "公式无法求值" };
      return { f: f, ast: ast, error: null };
    } catch (e) {
      return { f: null, error: e && e.message ? e.message : "公式解析失败" };
    }
  }

  /* ================= 数值计算 ================= */

  /** 数值导数（中心差分，自动步长） */
  function derivative(f, x) {
    var h = Math.max(1e-6, Math.abs(x) * 1e-6);
    for (var i = 0; i < 4; i++) {
      var a = f(x - h), b = f(x + h);
      if (isFinite(a) && isFinite(b)) {
        var d = (b - a) / (2 * h);
        if (isFinite(d)) return d;
      }
      h *= 8; // 奇点附近放大步长再试
    }
    return NaN;
  }

  /** 导函数闭包（逐点数值求导） */
  function derivativeFn(f) {
    return function (x) { return derivative(f, x); };
  }

  /** 定积分（复合 Simpson，n=2000；区间含奇点返回 NaN） */
  function definiteIntegral(f, a, b) {
    if (!isFinite(a) || !isFinite(b)) return NaN;
    if (a === b) return 0;
    var sign = 1;
    if (a > b) { var t = a; a = b; b = t; sign = -1; }
    // 粗扫奇点：64 点预检，避免大规模计算后才发现无效
    var n0 = 64, h0 = (b - a) / n0;
    for (var i = 0; i <= n0; i++) {
      var vv = f(a + i * h0);
      if (!isFinite(vv)) {
        if (vv === Infinity || vv === -Infinity) return NaN;
        if (!isFinite(f(a + i * h0 + h0 / 2))) return NaN; // NaN（如负数开方）细分再探一次
      }
    }
    var n = 2000, h = (b - a) / n;
    var sum = f(a) + f(b);
    if (!isFinite(sum)) return NaN;
    for (var j = 1; j < n; j++) {
      var vj = f(a + j * h);
      if (!isFinite(vj)) return NaN;
      sum += vj * (j % 2 ? 4 : 2);
    }
    return sign * sum * h / 3;
  }

  /** 不定积分数值采样：返回 {xs[], ys[]}（ys[i]=null 表示断点） */
  function antiderivative(f, x0, x1, steps) {
    var N = Math.max(2, Math.min(4000, steps || 1200));
    var xs = new Array(N + 1), ys = new Array(N + 1);
    var dx = (x1 - x0) / N;
    var acc = 0, prevV = f(x0), prevValid = isFinite(prevV);
    xs[0] = x0; ys[0] = prevValid ? 0 : null;
    for (var i = 1; i <= N; i++) {
      var x = x0 + i * dx, v = f(x);
      xs[i] = x;
      if (!isFinite(v) || !prevValid) {
        ys[i] = null; acc = 0; prevValid = isFinite(v);
      } else {
        acc += (prevV + v) / 2 * dx;
        ys[i] = acc;
      }
      prevV = v;
    }
    return { xs: xs, ys: ys };
  }

  function bisect(f, lo, hi) {
    var flo = f(lo), fhi = f(hi);
    if (flo === 0) return lo;
    if (fhi === 0) return hi;
    for (var i = 0; i < 80; i++) {
      var mid = (lo + hi) / 2, fm = f(mid);
      if (fm === 0 || hi - lo < 1e-13 * Math.max(1, Math.abs(mid))) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; }
      else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }

  /** 扫描区间求根（变号二分 + 零点采样；返回去重升序数组） */
  function findRoots(f, a, b, maxRoots) {
    var cap = maxRoots || 200, roots = [];
    var n = 900, px = a, pv = f(a);
    if (pv === 0) roots.push(a);
    for (var i = 1; i <= n; i++) {
      var x = a + (b - a) * i / n, v = f(x);
      if (isFinite(pv) && isFinite(v)) {
        if (v === 0) roots.push(x);
        else if (pv * v < 0) roots.push(bisect(f, px, x));
      }
      if (roots.length >= cap) break;
      px = x; pv = v;
    }
    roots.sort(function (r, s) { return r - s; });
    var tol = (b - a) / n * 0.5, out = [];
    for (var k = 0; k < roots.length; k++) {
      if (!out.length || roots[k] - out[out.length - 1] > tol) out.push(roots[k]);
    }
    return out;
  }

  /** 解析极限目标：数字或 "inf"/"-inf"/"∞"/"-∞" → {v, ok, error} */
  function parseLimitTarget(s) {
    var t = String(s == null ? "" : s).trim().toLowerCase()
      .replace(/∞/g, "inf").replace(/\s+/g, "");
    if (t === "inf" || t === "+inf" || t === "infinity") return { v: Infinity, ok: true };
    if (t === "-inf") return { v: -Infinity, ok: true };
    if (t === "") return { v: 0, ok: false, error: "请输入趋近目标" };
    var v = parseFloat(t);
    if (!isFinite(v)) return { v: 0, ok: false, error: "目标值无效（可用 inf / -inf）" };
    return { v: v, ok: true };
  }

  /** 单侧极限估计 → {value:number|Infinity|-Infinity|null, converged:boolean} */
  function limitSide(f, target, dir) {
    var last = null, last2 = null, blow = 0;
    for (var k = 1; k <= 15; k++) {
      var x, v;
      if (target === Infinity || target === -Infinity) x = target * Math.pow(10, k);
      else x = target + dir * Math.pow(10, -k);
      v = f(x);
      if (isFinite(v)) {
        if (Math.abs(v) >= 1e12) return { value: v > 0 ? Infinity : -Infinity, converged: true };
        if (last !== null && k >= 4) {
          if (Math.abs(v - last) < 1e-7 * Math.max(1, Math.abs(last)))
            return { value: (v + last) / 2, converged: true };
        }
        last2 = last; last = v;
      } else if (v === Infinity || v === -Infinity) {
        blow = v; // 记录无穷方向，继续看是否稳定
        if (k >= 6) return { value: blow, converged: true };
      }
    }
    if (last !== null && last2 !== null && Math.abs(last - last2) < 1e-3 * Math.max(1, Math.abs(last)))
      return { value: last, converged: false };
    return { value: null, converged: false };
  }

  /** 极限估计（side: both|left|right）→ {left, right, value, same, side} */
  function estimateLimit(f, target, side) {
    var s = side || "both";
    var L = (s === "both" || s === "left") ? limitSide(f, target, -1) : null;
    var R = (s === "both" || s === "right") ? limitSide(f, target, 1) : null;
    var lv = L ? L.value : null, rv = R ? R.value : null;
    var same = false, value = null;
    if (s === "left") { value = lv; }
    else if (s === "right") { value = rv; }
    else if (lv !== null && rv !== null &&
      (lv === rv || (isFinite(lv) && isFinite(rv) && Math.abs(lv - rv) < 1e-5 * Math.max(1, Math.abs(lv))))) {
      same = true; value = (lv + rv) / 2;
    }
    return { left: lv, right: rv, value: value, same: same, side: s };
  }

  /* ================= 展示格式化 ================= */

  /** 数值展示：去浮点噪声，超大/超小用指数 */
  function fmtNum(v, sig) {
    if (v === Infinity) return "∞";
    if (v === -Infinity) return "-∞";
    if (typeof v !== "number" || isNaN(v)) return "不存在";
    if (v === 0) return "0";
    var a = Math.abs(v);
    if (a >= 1e6 || a < 1e-4) {
      return v.toExponential(4).replace(/\.?0+e/, "e");
    }
    return String(parseFloat(v.toPrecision(sig || 6)));
  }

  /* ================= 导出 ================= */

  window.VH_MathLab.engine = {
    CONSTS: CONSTS,
    FUNCS: FUNCS,
    tokenize: tokenize,
    parse: parse,
    compileNode: compileNode,
    parseFormula: parseFormula,
    derivative: derivative,
    derivativeFn: derivativeFn,
    definiteIntegral: definiteIntegral,
    antiderivative: antiderivative,
    findRoots: findRoots,
    parseLimitTarget: parseLimitTarget,
    estimateLimit: estimateLimit,
    limitSide: limitSide,
    fmtNum: fmtNum
  };
})();
