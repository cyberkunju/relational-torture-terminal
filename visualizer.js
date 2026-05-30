/**
 * Do you have brains - Feedback Visualizer
 * Renders the deduction graph onto an HTML5 Canvas with a clean, crisp,
 * fully responsive layout. High-DPI aware (no blur) and overlap-free at any size.
 *
 * Most puzzle modes are linear chains (network, git, dependency, inheritance),
 * so they render as a vertical "deduction ladder": stacked node pills connected
 * top-to-bottom. Logic puzzles render as a left-to-right circuit. Both layouts
 * scale node size to the available space so nodes never collide or clip labels.
 */

const Visualizer = (() => {
  let animationFrameId = null;
  let particles = [];
  // Live highlight updated by the app on hover; the render loop reads this each
  // frame so hovering re-traces paths.
  let liveHighlight = null;
  // Cache the last render args so the animation loop can repaint each frame.
  let lastCanvas = null;
  let lastPuzzle = null;

  // Theme Colors
  const colors = {
    bg: '#080c10',
    grid: 'rgba(0, 255, 128, 0.05)',
    primary: '#00ff80',       // Glowing Green
    secondary: '#00e5ff',     // Neon Cyan
    accent: '#ff0055',        // Neon Red / Conflict
    warning: '#ffaa00',       // Amber
    text: '#d0f8ff',          // Off-white cyan
    textDim: '#7e9aa3',
    nodeBg: '#0f171e',
  };

  class Particle {
    constructor(startX, startY, endX, endY, speed = 1.2) {
      this.startX = startX;
      this.startY = startY;
      this.endX = endX;
      this.endY = endY;
      this.progress = Math.random();
      this.speed = speed + Math.random() * 0.6;
    }
    update() {
      this.progress += 0.006 * this.speed;
      if (this.progress >= 1) this.progress = 0;
      this.x = this.startX + (this.endX - this.startX) * this.progress;
      this.y = this.startY + (this.endY - this.startY) * this.progress;
    }
    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.secondary;
      ctx.shadowBlur = 8;
      ctx.shadowColor = colors.secondary;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ---- High-DPI canvas setup: draw in CSS pixels, store at device resolution.
  function getCtx(canvas) {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const parent = canvas.parentElement;
    const cssW = (parent && parent.clientWidth) || 600;
    const cssH = (parent && parent.clientHeight) || 340;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext('2d');
    // Fallback for engines without CanvasRenderingContext2D.roundRect.
    if (typeof ctx.roundRect !== 'function') {
      ctx.roundRect = function (x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        this.beginPath();
        this.moveTo(x + rr, y);
        this.arcTo(x + w, y, x + w, y + h, rr);
        this.arcTo(x + w, y + h, x, y + h, rr);
        this.arcTo(x, y + h, x, y, rr);
        this.arcTo(x, y, x + w, y, rr);
        this.closePath();
        return this;
      };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // all drawing now uses CSS pixels
    return { ctx, width: cssW, height: cssH, dpr };
  }

  // ---- Shared layout: returns CSS-pixel coords + size for every node.
  // Used by BOTH render and hitTest so they can never drift apart.
  function computeLayout(puzzleData, width, height) {
    const { nodes } = puzzleData.graphData;
    const mode = puzzleData.mode;
    const coords = {};

    if (mode === 'logic') {
      // Left-to-right circuit: inputs column, then one column per gate.
      const inputs = nodes.filter(n => n.id.startsWith('Signal-'));
      const gates = nodes.filter(n => n.id.startsWith('Gate-'))
        .sort((a, b) => a.id.localeCompare(b.id));
      const colCount = 1 + gates.length;
      const colGap = width / (colCount + 1);
      // Node width must stay below the column gap so neighbouring columns never
      // touch; leave ~18% breathing room between columns.
      const nodeW = Math.max(64, Math.min(132, colGap * 0.82));
      const nodeH = Math.max(28, Math.min(42, height / (inputs.length + 2)));

      inputs.forEach((node, i) => {
        coords[node.id] = {
          x: colGap,
          y: (height / (inputs.length + 1)) * (i + 1),
          w: nodeW, h: nodeH
        };
      });
      gates.forEach((node, i) => {
        const stagger = gates.length > 1 ? (i % 2 === 0 ? -height * 0.12 : height * 0.12) : 0;
        coords[node.id] = {
          x: colGap * (i + 2),
          y: height / 2 + stagger,
          w: nodeW, h: nodeH
        };
      });
      return { coords, type: 'circuit' };
    }

    // Linear "ladder": stack node pills vertically in array order (which is the
    // chain order for every linear mode). Node size fits the available space.
    const n = Math.max(1, nodes.length);
    const sidePad = Math.max(14, width * 0.05);
    const topPad = 22;
    const botPad = 16;
    const nodeW = width - sidePad * 2;
    const usableH = height - topPad - botPad;
    const rowH = usableH / n;
    const nodeH = Math.max(22, Math.min(48, rowH * 0.66));

    nodes.forEach((node, i) => {
      coords[node.id] = {
        x: width / 2,
        y: topPad + rowH * i + rowH / 2,
        w: nodeW, h: nodeH
      };
    });
    return { coords, type: 'ladder' };
  }

  function drawGrid(ctx, width, height) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    const g = 28;
    for (let x = g; x < width; x += g) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = g; y < height; y += g) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
  }

  // Pick perimeter anchor points so the connector touches box edges, not centers.
  function anchorPoints(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const start = { x: a.x, y: a.y }, end = { x: b.x, y: b.y };
    if (Math.abs(dy) >= Math.abs(dx)) {
      start.y = a.y + Math.sign(dy) * (a.h / 2);
      end.y = b.y - Math.sign(dy) * (b.h / 2);
    } else {
      start.x = a.x + Math.sign(dx) * (a.w / 2);
      end.x = b.x - Math.sign(dx) * (b.w / 2);
    }
    return { start, end };
  }

  function drawArrow(ctx, sx, sy, ex, ey, highlighted) {
    const angle = Math.atan2(ey - sy, ex - sx);
    const head = 9;
    ctx.save();
    ctx.strokeStyle = highlighted ? colors.secondary : colors.textDim;
    ctx.fillStyle = highlighted ? colors.secondary : colors.textDim;
    ctx.lineWidth = highlighted ? 2.5 : 1.6;
    if (highlighted) { ctx.shadowBlur = 8; ctx.shadowColor = colors.secondary; }
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - head * Math.cos(angle - Math.PI / 6), ey - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(ex - head * Math.cos(angle + Math.PI / 6), ey - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEdgeLabel(ctx, sx, sy, ex, ey, label, highlighted) {
    if (!label) return;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    ctx.save();
    ctx.font = '600 9px "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const padX = 4;
    const w = ctx.measureText(label).width + padX * 2;
    // small chip background so the label never collides with the line
    ctx.fillStyle = colors.bg;
    ctx.fillRect(mx - w / 2, my - 7, w, 14);
    ctx.fillStyle = highlighted ? colors.secondary : colors.textDim;
    ctx.fillText(label, mx, my);
    ctx.restore();
  }

  function drawConflict(ctx, a, b) {
    // Bowed dashed line to the right + an X marker (dependency conflicts).
    const x = Math.max(a.x + a.w / 2, b.x + b.w / 2) - 6;
    const y1 = a.y, y2 = b.y;
    const ctrlX = x + Math.min(46, a.w * 0.18);
    const midY = (y1 + y2) / 2;
    ctx.save();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.quadraticCurveTo(ctrlX, midY, x, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    // X badge
    ctx.beginPath();
    ctx.arc(ctrlX, midY, 11, 0, Math.PI * 2);
    ctx.fillStyle = colors.bg;
    ctx.fill();
    ctx.stroke();
    const r = 4.5;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ctrlX - r, midY - r); ctx.lineTo(ctrlX + r, midY + r);
    ctx.moveTo(ctrlX + r, midY - r); ctx.lineTo(ctrlX - r, midY + r);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.restore();
  }

  function relationLabel(mode) {
    switch (mode) {
      case 'network': return 'faster';
      case 'git': return 'newer';
      case 'dependency': return 'needs';
      case 'inheritance': return 'extends';
      default: return '';
    }
  }

  function drawNode(ctx, node, c, isHovered, isLogic) {
    ctx.save();
    const radius = Math.min(10, c.h / 2);
    if (isHovered) {
      ctx.shadowBlur = 16; ctx.shadowColor = colors.secondary;
      ctx.strokeStyle = colors.secondary; ctx.lineWidth = 2.5;
    } else {
      ctx.shadowBlur = 6; ctx.shadowColor = colors.primary;
      ctx.strokeStyle = colors.primary; ctx.lineWidth = 1.6;
    }
    ctx.fillStyle = colors.nodeBg;
    ctx.beginPath();
    ctx.roundRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, radius);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    const fontSize = Math.max(9, Math.min(13, c.h * 0.4));
    let label = node.label || node.id;

    if (isLogic && node.val !== undefined) {
      // status dot + label + level text
      const dotX = c.x - c.w / 2 + 12;
      ctx.beginPath();
      ctx.arc(dotX, c.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = node.val ? colors.primary : colors.accent;
      ctx.shadowBlur = 6; ctx.shadowColor = node.val ? colors.primary : colors.accent;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `${fontSize}px "Fira Code", monospace`;
      ctx.fillStyle = isHovered ? colors.secondary : colors.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const maxChars = Math.floor((c.w - 28) / (fontSize * 0.62));
      if (label.length > maxChars) label = label.slice(0, Math.max(3, maxChars - 1)) + '…';
      ctx.fillText(label, dotX + 10, c.y - fontSize * 0.45);
      ctx.font = `bold ${Math.max(8, fontSize - 2)}px "Fira Code", monospace`;
      ctx.fillStyle = node.val ? colors.primary : colors.accent;
      ctx.fillText(node.val ? 'HIGH (1)' : 'LOW (0)', dotX + 10, c.y + fontSize * 0.7);
    } else {
      ctx.font = `${fontSize}px "Fira Code", monospace`;
      ctx.fillStyle = isHovered ? colors.secondary : colors.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const maxChars = Math.floor((c.w - 16) / (fontSize * 0.62));
      if (label.length > maxChars) label = label.slice(0, Math.max(3, maxChars - 1)) + '…';
      ctx.fillText(label, c.x, c.y);
    }
    ctx.restore();
  }

  // ---- Main render
  function render(canvas, puzzleData, highlightedNode = null) {
    if (!canvas) return;
    if (highlightedNode !== null) liveHighlight = highlightedNode;
    lastCanvas = canvas;
    lastPuzzle = puzzleData;
    const activeHighlight = liveHighlight;

    const { ctx, width, height } = getCtx(canvas);

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    drawGrid(ctx, width, height);

    if (!puzzleData || !puzzleData.graphData) { loop(); return; }

    const { nodes, edges } = puzzleData.graphData;
    const { coords } = computeLayout(puzzleData, width, height);

    // (Re)build flow particles for non-conflict edges.
    if (particles.length === 0) {
      edges.forEach(edge => {
        const a = coords[edge.from], b = coords[edge.to];
        if (a && b && edge.label !== 'conflicts') {
          const { start, end } = anchorPoints(a, b);
          particles.push(new Particle(start.x, start.y, end.x, end.y));
        }
      });
    }

    // Edges
    edges.forEach(edge => {
      const a = coords[edge.from], b = coords[edge.to];
      if (!a || !b) return;
      if (edge.label === 'conflicts') {
        drawConflict(ctx, a, b);
        return;
      }
      const hl = activeHighlight && (edge.from === activeHighlight || edge.to === activeHighlight);
      const { start, end } = anchorPoints(a, b);
      drawArrow(ctx, start.x, start.y, end.x, end.y, hl);
      drawEdgeLabel(ctx, start.x, start.y, end.x, end.y, relationLabel(puzzleData.mode), hl);
    });

    // Particles
    particles.forEach(p => { p.update(); p.draw(ctx); });

    // Nodes
    const isLogic = puzzleData.mode === 'logic';
    nodes.forEach(node => {
      const c = coords[node.id];
      if (!c) return;
      drawNode(ctx, node, c, activeHighlight === node.id, isLogic);
    });

    loop();
  }

  function loop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(() => {
      if (lastCanvas && lastPuzzle) render(lastCanvas, lastPuzzle, null);
    });
  }

  function stop() {
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    particles = [];
    liveHighlight = null;
    lastCanvas = null;
    lastPuzzle = null;
  }

  function setHighlight(nodeId) {
    liveHighlight = nodeId;
  }

  // ---- Hit test in CSS-pixel space (app passes CSS-pixel coords).
  function hitTest(canvas, puzzleData, x, y) {
    if (!canvas || !puzzleData || !puzzleData.graphData) return null;
    const parent = canvas.parentElement;
    const width = (parent && parent.clientWidth) || 600;
    const height = (parent && parent.clientHeight) || 340;
    const { coords } = computeLayout(puzzleData, width, height);
    for (const id in coords) {
      const c = coords[id];
      if (Math.abs(x - c.x) <= c.w / 2 && Math.abs(y - c.y) <= c.h / 2) return id;
    }
    return null;
  }

  return { render, stop, hitTest, setHighlight };
})();

// Export for ES6 or window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Visualizer;
} else {
  window.Visualizer = Visualizer;
}
