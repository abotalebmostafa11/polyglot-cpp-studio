'use strict';

(() => {
  const editor = document.getElementById('source');
  const { parser, tags: t, tagHighlighter, highlightTree, TreeFragment } = CppGrammar;
  const palette = tagHighlighter([
    { tag: t.controlKeyword, class: 'cpp-control' },
    { tag: [t.keyword, t.bool, t.null, t.self], class: 'cpp-keyword' },
    { tag: t.typeName, class: 'cpp-type' },
    { tag: t.namespace, class: 'cpp-namespace' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'cpp-function' },
    { tag: [t.variableName, t.propertyName], class: 'cpp-variable' },
    { tag: [t.string, t.character], class: 'cpp-string' },
    { tag: t.escape, class: 'cpp-escape' },
    { tag: t.number, class: 'cpp-number' },
    { tag: t.comment, class: 'cpp-comment' },
    { tag: [t.processingInstruction, t.special(t.name), t.meta], class: 'cpp-directive' },
    { tag: t.operator, class: 'cpp-operator' }
  ]);

  let text, lineStarts = [0], fragments = [], parse, tree, covered = -1;
  let finishAt = 0, frame = 0, paintedFrom = -1, paintedTo = -1;
  const registered = new Map();

  function clearPaint() {
    for (const [name, group] of registered) {
      CSS.highlights.delete(name);
      for (const range of group) range.disconnect?.();
    }
    registered.clear();
    paintedFrom = paintedTo = -1;
  }

  function changed() {
    const next = editor.value;
    if (next === text) return;
    if (text !== undefined && fragments.length) {
      let from = 0, oldEnd = text.length, newEnd = next.length;
      while (from < oldEnd && from < newEnd && text.charCodeAt(from) === next.charCodeAt(from)) from++;
      while (oldEnd > from && newEnd > from && text.charCodeAt(oldEnd - 1) === next.charCodeAt(newEnd - 1)) {
        oldEnd--;
        newEnd--;
      }
      fragments = TreeFragment.applyChanges(fragments, [{ fromA: from, toA: oldEnd, fromB: from, toB: newEnd }]);
    }
    text = next;
    lineStarts = [0];
    for (let n = text.indexOf('\n'); n !== -1; n = text.indexOf('\n', n + 1)) lineStarts.push(n + 1);
    parse = tree = null;
    covered = -1;
    clearPaint();
    schedule();
  }

  function visibleBuffer() {
    const style = getComputedStyle(editor);
    const height = parseFloat(style.lineHeight);
    const first = Math.max(0, Math.floor((editor.scrollTop - parseFloat(style.paddingTop)) / height));
    const rows = Math.ceil(editor.clientHeight / height) + 1;
    return {
      from: lineStarts[Math.max(0, first - rows)] ?? text.length,
      to: lineStarts[first + rows * 2] ?? text.length
    };
  }

  function paint(from, to) {
    if (from === paintedFrom && to === paintedTo) return;
    clearPaint();
    highlightTree(tree, palette, (start, end, name) => {
      const group = registered.get(name) ?? new Highlight();
      // Opaque ranges colour the actual editable text, including shaped Unicode.
      group.add(editor.createValueRange(start, end));
      registered.set(name, group);
    }, from, to);
    for (const [name, group] of registered) CSS.highlights.set(name, group);
    paintedFrom = from;
    paintedTo = to;
  }

  function draw() {
    frame = 0;
    if (!text) return;
    const { from, to } = visibleBuffer();
    if (!tree || covered < to) {
      if (!parse) {
        parse = parser.startParse(text, fragments);
        finishAt = Math.min(text.length, to + 4096);
        if (finishAt < text.length) parse.stopAt(finishAt);
      }
      const deadline = performance.now() + 6;
      let result;
      do { result = parse.advance(); } while (!result && performance.now() < deadline);
      if (!result) { schedule(); return; }
      tree = result;
      covered = finishAt;
      fragments = TreeFragment.addTree(tree, fragments, covered < text.length);
      parse = null;
      if (covered < to) { schedule(); return; }
    }
    paint(from, to);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  editor.addEventListener('input', changed);
  editor.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('documentchanged', changed);
  new ResizeObserver(schedule).observe(editor);
  changed();
})();
