// Which of the game's methods can run, read from the code itself (TypeScript's
// parser over the built game.js). Entry points: the constructor and any method
// named outside the BobbyGame class. A call counts once the method holding it
// can run, and when it sits under a game-state check, once that state can be
// entered: `if (A && B)` needs what A or B needs, `if (A || B)` needs a state
// only when both sides do, and any other condition needs none, so the reading
// errs towards "can run". Staff debug methods count as entry points too.
//
// moth-code-trim.mjs removes only methods this finds unreachable, and the build
// stops if one it lists becomes reachable.

export function analyzeReachability(source, ts) {
  const sf = ts.createSourceFile('game.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const cls = sf.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'BobbyGame');
  if (!cls) throw new Error('BobbyGame class not found');
  const methods = new Map();
  for (const member of cls.members) {
    const name = ts.isConstructorDeclaration(member) ? 'constructor' : member.name?.getText(sf);
    if (name) methods.set(name, [...(methods.get(name) || []), member]);
  }
  const unparen = e => { while (ts.isParenthesizedExpression(e)) e = e.expression; return e; };
  // The states an expression needs to be true, or null for none.
  const requires = expr => {
    expr = unparen(expr);
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return requires(expr.left) || requires(expr.right);
      if (op === ts.SyntaxKind.BarBarToken) {
        const a = requires(expr.left), b = requires(expr.right);
        return a && b ? [...new Set([...a, ...b])] : null;
      }
      if (op === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isStringLiteral(expr.right)) {
        const left = expr.left.getText(sf);
        if (left === 'this.state') return [expr.right.text];
        if (/sewerTransition\??\.direction$/.test(left)) return ['dir:' + expr.right.text];
      }
      return null;
    }
    if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression) && expr.expression.name.text === 'includes'
      && expr.arguments[0]?.getText(sf) === 'this.state') {
      const list = unparen(expr.expression.expression);
      if (ts.isArrayLiteralExpression(list) && list.elements.every(ts.isStringLiteral)) return list.elements.map(e => e.text);
    }
    // Developer URL switches (?debugLevel5=1 and the like) are debug entries.
    if (/params\.get\("debug|searchParams.*debug|get\("debug/i.test(expr.getText(sf))) return ['__debug__'];
    return null;
  };
  const info = new Map();
  for (const [name, members] of methods) {
    const calls = [], assigns = new Set();
    const visit = (node, guard) => {
      if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) {
        const condition = node.expression || node.condition;
        visit(condition, guard);
        visit(node.thenStatement || node.whenTrue, requires(condition) || guard);
        const other = node.elseStatement || node.whenFalse;
        if (other) visit(other, guard);
        return;
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        visit(node.left, guard);
        visit(node.right, requires(node.left) || guard);
        return;
      }
      if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword && methods.has(node.name.text)) {
        calls.push({ name: node.name.text, guard });
      }
      if (ts.isCallExpression(node) && node.expression.getText(sf) === 'this.startSewerTransition' && ts.isStringLiteral(node.arguments[0] || {})) {
        assigns.add('dir:' + node.arguments[0].text);
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText(sf) === 'this.state') {
        const value = unparen(node.right);
        if (ts.isStringLiteral(value)) assigns.add(value.text);
        else for (const match of value.getText(sf).matchAll(/"([^"]+)"/g)) assigns.add(match[1]);
      }
      ts.forEachChild(node, child => visit(child, guard));
    };
    for (const member of members) visit(member, null);
    info.set(name, { calls, assigns });
  }
  const roots = new Set(['constructor', ...[...methods.keys()].filter(name => /debug/i.test(name))]);
  for (const statement of sf.statements) {
    if (statement === cls) continue;
    for (const match of statement.getText(sf).matchAll(/\.([A-Za-z_$][\w$]*)\b/g)) if (methods.has(match[1])) roots.add(match[1]);
  }
  const live = new Set(), states = new Set(['title', 'loading', 'playing']);
  for (let changed = true; changed;) {
    changed = false;
    for (const root of roots) if (methods.has(root) && !live.has(root)) { live.add(root); changed = true; }
    for (const name of [...live]) {
      const { calls, assigns } = info.get(name);
      for (const state of assigns) if (!states.has(state)) { states.add(state); changed = true; }
      for (const call of calls) {
        if (!live.has(call.name) && (!call.guard || call.guard.some(state => states.has(state)))) { live.add(call.name); changed = true; }
      }
    }
  }
  return { methods: [...methods.keys()], live, unreachable: [...methods.keys()].filter(name => !live.has(name)), states };
}
