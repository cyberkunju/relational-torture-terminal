/**
 * RelationalTerminal Feedback Visualizer
 * Renders graph structures onto an HTML5 Canvas with retro cyber HUD aesthetics.
 */

const Visualizer = (() => {
  let animationFrameId = null;
  let particles = [];

  // Theme Colors
  const colors = {
    bg: '#080c10',
    grid: 'rgba(0, 255, 128, 0.05)',
    primary: '#00ff80',       // Glowing Green
    secondary: '#00e5ff',     // Neon Cyan
    accent: '#ff0055',        // Neon Red / Conflict
    warning: '#ffaa00',       // Amber
    text: '#d0f8ff',          // Off-white cyan
    textDim: '#7098a0',
    nodeBg: '#0f171e',
    nodeBorder: '#00ff80',
    glow: '#00ff80'
  };

  class Particle {
    constructor(startX, startY, endX, endY, speed = 1.5) {
      this.startX = startX;
      this.startY = startY;
      this.endX = endX;
      this.endY = endY;
      this.x = startX;
      this.y = startY;
      this.progress = 0;
      this.speed = speed + Math.random() * 0.5;
    }

    update() {
      this.progress += 0.01 * this.speed;
      if (this.progress >= 1) {
        this.progress = 0;
        this.x = this.startX;
        this.y = this.startY;
      } else {
        this.x = this.startX + (this.endX - this.startX) * this.progress;
        this.y = this.startY + (this.endY - this.startY) * this.progress;
      }
    }

    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = colors.secondary;
      ctx.shadowBlur = 10;
      ctx.shadowColor = colors.secondary;
      ctx.fill();
      ctx.shadowBlur = 0; // reset
    }
  }

  // Draw arrowheads on directed edges
  function drawArrow(ctx, fromx, fromy, tox, toy, label, labelColor = colors.textDim) {
    const headlen = 10; // length of head in pixels
    const dx = tox - fromx;
    const dy = toy - fromy;
    const angle = Math.atan2(dy, dx);
    
    // Draw the line
    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.strokeStyle = colors.textDim;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw the arrowhead
    ctx.beginPath();
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = colors.textDim;
    ctx.fill();

    // Draw connection label (if any)
    if (label) {
      const midX = (fromx + tox) / 2;
      const midY = (fromy + toy) / 2;
      ctx.font = '9px monospace';
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.save();
      ctx.translate(midX, midY);
      // Rotate label text slightly along the line path if angled
      let rotation = angle;
      if (rotation > Math.PI/2 || rotation < -Math.PI/2) {
        rotation += Math.PI; // Keep text right side up
      }
      ctx.rotate(rotation);
      ctx.fillText(label, 0, -2);
      ctx.restore();
    }
  }

  // Draw undirected conflict line
  function drawConflictEdge(ctx, fromx, fromy, tox, toy, label) {
    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // dashed line for conflict
    ctx.stroke();
    ctx.setLineDash([]); // reset

    // Draw conflict X in center
    const midX = (fromx + tox) / 2;
    const midY = (fromy + toy) / 2;
    ctx.beginPath();
    ctx.arc(midX, midY, 12, 0, Math.PI * 2);
    ctx.fillStyle = colors.bg;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Crisp vector "X" cross instead of an emoji glyph
    const xr = 5;
    ctx.beginPath();
    ctx.moveTo(midX - xr, midY - xr);
    ctx.lineTo(midX + xr, midY + xr);
    ctx.moveTo(midX + xr, midY - xr);
    ctx.lineTo(midX - xr, midY + xr);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    if (label) {
      ctx.font = '10px monospace';
      ctx.fillStyle = colors.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, midX, midY - 20);
    }
  }

  // Main Draw function
  function render(canvas, puzzleData, highlightedNode = null) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width = canvas.parentElement.clientWidth || 600;
    const height = canvas.height = 320;

    // Clear background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    // Draw subtle grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    const gridSize = 30;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!puzzleData || !puzzleData.graphData) return;

    const { nodes, edges, orderedList } = puzzleData.graphData;
    const nodeCoords = {};

    // Layout configuration depending on mode
    if (puzzleData.mode === 'network' && orderedList) {
      // Linear chain layout: fastest to slowest
      const padding = 60;
      const step = (width - padding * 2) / (nodes.length - 1);
      nodes.forEach((node) => {
        const idx = orderedList.indexOf(node.id);
        nodeCoords[node.id] = {
          x: padding + idx * step,
          y: height / 2 + (idx % 2 === 0 ? -25 : 25) // zig-zag slightly for better view
        };
      });
    } else if (puzzleData.mode === 'git' && orderedList) {
      // Linear chain layout: oldest to newest
      const padding = 70;
      const step = (width - padding * 2) / (nodes.length - 1);
      nodes.forEach((node) => {
        const idx = orderedList.indexOf(node.id);
        nodeCoords[node.id] = {
          x: padding + idx * step,
          y: height / 2
        };
      });
    } else if (puzzleData.mode === 'inheritance') {
      // Tree layout: top to bottom base-to-subclass
      // Let's deduce vertical levels from edges.
      // In our generator, selectedNodes[numNodes-1] is Root, selectedNodes[0] is Leaf.
      // So level of node = index in nodes list
      const padding = 50;
      const levels = {};
      
      // Compute parent/children relationships
      const parents = {};
      nodes.forEach(n => {
        parents[n.id] = null;
      });
      edges.forEach(e => {
        parents[e.from] = e.to; // Child extends parent
      });

      // Simple level solver
      const getLevel = (id) => {
        if (parents[id] === null) return 0;
        return 1 + getLevel(parents[id]);
      };

      const maxLevelNodes = {};
      nodes.forEach(n => {
        const lvl = getLevel(n.id);
        levels[n.id] = lvl;
        maxLevelNodes[lvl] = (maxLevelNodes[lvl] || 0) + 1;
      });

      const maxLvl = Math.max(...Object.values(levels), 0);
      const levelYStep = (height - padding * 2) / (maxLvl || 1);
      
      const levelCounter = {};
      nodes.forEach((node) => {
        const lvl = levels[node.id];
        levelCounter[lvl] = (levelCounter[lvl] || 0) + 1;
        
        // Calculate X coordinate
        const numNodesInLvl = maxLevelNodes[lvl];
        const xStep = width / (numNodesInLvl + 1);
        
        nodeCoords[node.id] = {
          x: xStep * levelCounter[lvl],
          y: padding + (maxLvl - lvl) * levelYStep // Root on top
        };
      });
    } else if (puzzleData.mode === 'logic') {
      // Left-to-right circuit layout
      // Inputs on left (X=100), Gates in middle (X=280/400), Outputs on right (X=500)
      const inputs = nodes.filter(n => n.id.startsWith('Signal-'));
      const gates = nodes.filter(n => n.id.startsWith('Gate-'));
      
      const inputStep = height / (inputs.length + 1);
      inputs.forEach((node, idx) => {
        nodeCoords[node.id] = {
          x: 100,
          y: inputStep * (idx + 1)
        };
      });

      // Gates sorted by their dependencies (X, then Y, then Z)
      const sortedGates = [...gates].sort((a, b) => a.id.localeCompare(b.id));
      const gateStep = height / (sortedGates.length + 1);
      sortedGates.forEach((node, idx) => {
        nodeCoords[node.id] = {
          x: 280 + idx * 140,
          y: height / 2 + (idx === 1 ? 60 : idx === 2 ? -60 : 0)
        };
      });
    } else {
      // Default / Dependency Circle DAG layout
      // Standard circle layout
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.35;
      
      nodes.forEach((node, idx) => {
        const angle = (idx / nodes.length) * Math.PI * 2;
        nodeCoords[node.id] = {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius
        };
      });
    }

    // Generate path flow particles if not already initialized
    if (particles.length === 0) {
      edges.forEach(edge => {
        const from = nodeCoords[edge.from];
        const to = nodeCoords[edge.to];
        if (from && to && edge.label !== 'conflicts') {
          particles.push(new Particle(from.x, from.y, to.x, to.y));
        }
      });
    }

    // Render Edges
    edges.forEach((edge) => {
      const from = nodeCoords[edge.from];
      const to = nodeCoords[edge.to];
      if (!from || !to) return;

      // Highlight route if connected to hovered node
      const isHighlighted = highlightedNode && 
        (edge.from === highlightedNode || edge.to === highlightedNode);
      
      if (edge.label === 'conflicts') {
        drawConflictEdge(ctx, from.x, from.y, to.x, to.y, 'CONFLICT');
      } else {
        let label = '';
        if (puzzleData.mode === 'network') {
          label = 'latency';
        } else if (puzzleData.mode === 'git') {
          label = 'parent';
        } else if (puzzleData.mode === 'dependency') {
          label = 'depends';
        } else if (puzzleData.mode === 'inheritance') {
          label = 'extends';
        }
        
        ctx.save();
        if (isHighlighted) {
          ctx.strokeStyle = colors.secondary;
          ctx.lineWidth = 3;
          ctx.shadowBlur = 10;
          ctx.shadowColor = colors.secondary;
        }
        drawArrow(ctx, from.x, from.y, to.x, to.y, label, isHighlighted ? colors.secondary : colors.textDim);
        ctx.restore();
      }
    });

    // Draw signal particles
    particles.forEach(p => {
      p.update();
      p.draw(ctx);
    });

    // Render Nodes
    nodes.forEach((node) => {
      const coords = nodeCoords[node.id];
      if (!coords) return;

      const isHovered = highlightedNode === node.id;
      const isSignalNode = puzzleData.mode === 'logic';
      const nodeRadiusX = 65;
      const nodeRadiusY = 22;

      ctx.save();
      
      // Node glow properties
      if (isHovered) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = colors.secondary;
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 2.5;
      } else {
        ctx.shadowBlur = 4;
        ctx.shadowColor = colors.primary;
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 1.5;
      }

      // Draw rounded rectangle for node
      ctx.fillStyle = colors.nodeBg;
      ctx.beginPath();
      ctx.roundRect(coords.x - nodeRadiusX, coords.y - nodeRadiusY, nodeRadiusX * 2, nodeRadiusY * 2, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0; // reset glow for text

      // Draw Logic Signal Status Indicators
      if (isSignalNode && node.val !== undefined) {
        ctx.beginPath();
        ctx.arc(coords.x - nodeRadiusX + 15, coords.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = node.val ? colors.primary : colors.accent;
        ctx.shadowBlur = 6;
        ctx.shadowColor = node.val ? colors.primary : colors.accent;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw Node text
      ctx.font = '10px monospace';
      ctx.fillStyle = isHovered ? colors.secondary : colors.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Shorten label if too long
      let label = node.label || node.id;
      if (label.length > 18) {
        label = label.substring(0, 16) + '..';
      }
      
      // If logic node, position label offset to accommodate status dot
      if (isSignalNode && node.val !== undefined) {
        ctx.fillText(label, coords.x + 8, coords.y - 4);
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = node.val ? colors.primary : colors.accent;
        ctx.fillText(node.val ? 'HIGH (1)' : 'LOW (0)', coords.x + 8, coords.y + 6);
      } else {
        ctx.fillText(label, coords.x, coords.y);
      }

      ctx.restore();
    });

    // Recursive animation loop
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(() => render(canvas, puzzleData, highlightedNode));
  }

  function stop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    particles = [];
  }

  // Helper to detect if a click is over a node (returns node id)
  function hitTest(canvas, puzzleData, x, y) {
    if (!canvas || !puzzleData || !puzzleData.graphData) return null;
    
    // We recreate coordinates calculations for click detection
    const { nodes, edges, orderedList } = puzzleData.graphData;
    const width = canvas.width;
    const height = canvas.height;
    const nodeCoords = {};

    if (puzzleData.mode === 'network' && orderedList) {
      const padding = 60;
      const step = (width - padding * 2) / (nodes.length - 1);
      nodes.forEach((node) => {
        const idx = orderedList.indexOf(node.id);
        nodeCoords[node.id] = { x: padding + idx * step, y: height / 2 + (idx % 2 === 0 ? -25 : 25) };
      });
    } else if (puzzleData.mode === 'git' && orderedList) {
      const padding = 70;
      const step = (width - padding * 2) / (nodes.length - 1);
      nodes.forEach((node) => {
        const idx = orderedList.indexOf(node.id);
        nodeCoords[node.id] = { x: padding + idx * step, y: height / 2 };
      });
    } else if (puzzleData.mode === 'inheritance') {
      const padding = 50;
      const parents = {};
      nodes.forEach(n => parents[n.id] = null);
      edges.forEach(e => parents[e.from] = e.to);
      const getLevel = (id) => parents[id] === null ? 0 : 1 + getLevel(parents[id]);
      const maxLevelNodes = {};
      nodes.forEach(n => {
        const lvl = getLevel(n.id);
        maxLevelNodes[lvl] = (maxLevelNodes[lvl] || 0) + 1;
      });
      const maxLvl = Math.max(...nodes.map(n => getLevel(n.id)), 0);
      const levelYStep = (height - padding * 2) / (maxLvl || 1);
      const levelCounter = {};
      nodes.forEach((node) => {
        const lvl = getLevel(node.id);
        levelCounter[lvl] = (levelCounter[lvl] || 0) + 1;
        const numNodesInLvl = maxLevelNodes[lvl];
        const xStep = width / (numNodesInLvl + 1);
        nodeCoords[node.id] = { x: xStep * levelCounter[lvl], y: padding + (maxLvl - lvl) * levelYStep };
      });
    } else if (puzzleData.mode === 'logic') {
      const inputs = nodes.filter(n => n.id.startsWith('Signal-'));
      const gates = nodes.filter(n => n.id.startsWith('Gate-'));
      const inputStep = height / (inputs.length + 1);
      inputs.forEach((node, idx) => {
        nodeCoords[node.id] = { x: 100, y: inputStep * (idx + 1) };
      });
      const sortedGates = [...gates].sort((a, b) => a.id.localeCompare(b.id));
      sortedGates.forEach((node, idx) => {
        nodeCoords[node.id] = { x: 280 + idx * 140, y: height / 2 + (idx === 1 ? 60 : idx === 2 ? -60 : 0) };
      });
    } else {
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.35;
      nodes.forEach((node, idx) => {
        const angle = (idx / nodes.length) * Math.PI * 2;
        nodeCoords[node.id] = { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
      });
    }

    for (const nodeId in nodeCoords) {
      const coord = nodeCoords[nodeId];
      if (Math.abs(x - coord.x) < 65 && Math.abs(y - coord.y) < 22) {
        return nodeId;
      }
    }
    return null;
  }

  return {
    render,
    stop,
    hitTest
  };
})();

// Export for ES6 or window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Visualizer;
} else {
  window.Visualizer = Visualizer;
}
