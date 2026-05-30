/**
 * Do you have brains - Puzzle Generator
 * Rooted in Relational Frame Theory (RFT)
 * Generates deterministic logic puzzles across 5 tech-themed modes.
 */

const Generator = (() => {
  // Vocabulary databases for tech modes
  const vocab = {
    network: {
      nodes: ['Router-Alpha', 'Router-Beta', 'Router-Gamma', 'Router-Delta', 'Router-Epsilon', 'Router-Zeta', 'Router-Eta', 'Router-Theta', 'Router-Iota', 'Router-Kappa', 'Gateway-Main', 'Edge-Cache', 'Proxy-Node'],
      relations: {
        faster: ['is faster than', 'has lower latency than', 'responds quicker than'],
        slower: ['is slower than', 'has higher latency than', 'responds slower than']
      }
    },
    git: {
      nodes: ['feature-auth', 'feature-ui', 'hotfix-db', 'bugfix-parser', 'release-candidate', 'main-branch', 'dev-branch', 'feature-payment', 'patch-ssl', 'feature-search', 'hotfix-cache', 'refactor-core'],
      relations: {
        parent: ['is branched from', 'is created directly from', 'parent commit is'],
        ancestor: ['contains commits older than', 'is ahead of', 'is downstream from'],
        descendant: ['is an ancestor of', 'is integrated before', 'is upstream from']
      }
    },
    dependency: {
      nodes: ['AuthModule', 'DbConnector', 'QueryParser', 'LogManager', 'ConfigProvider', 'SslHandshaker', 'CacheStore', 'TokenValidator', 'SessionStore', 'EventBus', 'MetricsCollector', 'RetryPolicy', 'SchemaValidator'],
      relations: {
        depends: ['depends on', 'requires', 'imports'],
        conflicts: ['conflicts with', 'is incompatible with', 'cannot run alongside']
      }
    },
    inheritance: {
      nodes: ['BaseController', 'ApiController', 'AuthController', 'QueryBuilder', 'DataRepository', 'MongoRepository', 'SqlRepository', 'ModelSchema', 'EntityModel', 'ServiceLayer', 'MiddlewareBase', 'ViewComponent', 'EventEmitter'],
      relations: {
        inherits: ['inherits from', 'extends', 'is a subclass of'],
        parent: ['is the parent class of', 'is overridden by', 'is the superclass of']
      }
    },
    logic: {
      inputs: ['Signal-A', 'Signal-B', 'Signal-C', 'Signal-D'],
      gates: ['AND-Gate-1', 'OR-Gate-2', 'XOR-Gate-3', 'NAND-Gate-4', 'NOR-Gate-5'],
      relations: {
        connected: ['is connected to', 'feeds into', 'is the input for']
      }
    }
  };

  // Helper to shuffle array
  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Helper to pick random item from array
  function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Mode 1: Network Latency (Linear reasoning)
   * A > B > C > D ...
   */
  function generateNetworkPuzzle(numPremises) {
    const numNodes = numPremises + 1;
    const selectedNodes = shuffle(vocab.network.nodes).slice(0, numNodes);
    
    const relations = [];
    for (let i = 0; i < numNodes - 1; i++) {
      const isFasterRelation = Math.random() > 0.5;
      if (isFasterRelation) {
        relations.push({
          from: selectedNodes[i],
          to: selectedNodes[i + 1],
          type: 'faster',
          text: `${selectedNodes[i]} ${randChoice(vocab.network.relations.faster)} ${selectedNodes[i + 1]}`
        });
      } else {
        relations.push({
          from: selectedNodes[i + 1],
          to: selectedNodes[i],
          type: 'slower',
          text: `${selectedNodes[i + 1]} ${randChoice(vocab.network.relations.slower)} ${selectedNodes[i]}`
        });
      }
    }

    const shuffledPremises = shuffle(relations);
    
    let idx1, idx2;
    if (numNodes > 2) {
      idx1 = Math.floor(Math.random() * (numNodes - 2));
      idx2 = idx1 + 2 + Math.floor(Math.random() * (numNodes - idx1 - 2));
    } else {
      idx1 = 0;
      idx2 = 1;
    }

    const askTrue = Math.random() > 0.5;
    const reverseConclusion = Math.random() > 0.5;
    
    let nodeA = selectedNodes[idx1]; 
    let nodeB = selectedNodes[idx2]; 
    
    let conclusionText = '';
    let correctAnswer = false;

    if (reverseConclusion) {
      const askFaster = Math.random() > 0.5;
      if (askFaster) {
        conclusionText = `${nodeB} is faster than ${nodeA}`;
        correctAnswer = false;
      } else {
        conclusionText = `${nodeB} is slower than ${nodeA}`;
        correctAnswer = true;
      }
    } else {
      const askFaster = Math.random() > 0.5;
      if (askFaster) {
        conclusionText = `${nodeA} is faster than ${nodeB}`;
        correctAnswer = true;
      } else {
        conclusionText = `${nodeA} is slower than ${nodeB}`;
        correctAnswer = false;
      }
    }

    if (!askTrue && correctAnswer) {
      if (conclusionText.includes('faster')) {
        conclusionText = conclusionText.replace('faster', 'slower');
      } else {
        conclusionText = conclusionText.replace('slower', 'faster');
      }
      correctAnswer = false;
    } else if (!askTrue && !correctAnswer) {
      if (conclusionText.includes('faster')) {
        conclusionText = conclusionText.replace('faster', 'slower');
      } else {
        conclusionText = conclusionText.replace('slower', 'faster');
      }
      correctAnswer = true;
    }

    const graphData = {
      nodes: selectedNodes.map(name => ({ id: name, label: name })),
      edges: relations.map(r => ({
        from: r.type === 'faster' ? r.from : r.to,
        to: r.type === 'faster' ? r.to : r.from,
        label: 'faster'
      })),
      orderedList: selectedNodes
    };

    return {
      mode: 'network',
      title: 'Network Latency Analyzer',
      instruction: 'Trace the latency logs to determine the relative speeds of the routers.',
      premises: shuffledPremises.map(p => p.text),
      conclusion: conclusionText,
      correctAnswer: correctAnswer,
      graphData: graphData
    };
  }

  /**
   * Mode 2: Git Ancestry (Direct ancestry tree)
   * A -> B -> C -> D
   */
  function generateGitPuzzle(numPremises) {
    const numNodes = numPremises + 1;
    const selectedNodes = shuffle(vocab.git.nodes).slice(0, numNodes);
    
    const relations = [];
    for (let i = 0; i < numNodes - 1; i++) {
      const relType = Math.random() > 0.5 ? 'parent' : 'descendant';
      if (relType === 'parent') {
        relations.push({
          from: selectedNodes[i],
          to: selectedNodes[i + 1],
          type: 'ancestor',
          text: `${selectedNodes[i + 1]} ${randChoice(vocab.git.relations.parent)} ${selectedNodes[i]}`
        });
      } else {
        relations.push({
          from: selectedNodes[i],
          to: selectedNodes[i + 1],
          type: 'ancestor',
          text: `${selectedNodes[i]} ${randChoice(vocab.git.relations.descendant)} ${selectedNodes[i + 1]}`
        });
      }
    }

    const shuffledPremises = shuffle(relations);

    let idx1 = Math.floor(Math.random() * (numNodes - 1));
    let idx2 = idx1 + 1 + Math.floor(Math.random() * (numNodes - idx1 - 1));

    const nodeA = selectedNodes[idx1]; 
    const nodeB = selectedNodes[idx2]; 

    const askTrue = Math.random() > 0.5;
    let conclusionText = '';
    let correctAnswer = false;

    const conclusionType = Math.random() > 0.5;
    if (conclusionType) {
      conclusionText = `Branch "${nodeB}" contains all changes from "${nodeA}"`;
      correctAnswer = true;
    } else {
      conclusionText = `Branch "${nodeA}" contains all changes from "${nodeB}"`;
      correctAnswer = false;
    }

    if (!askTrue) {
      if (correctAnswer) {
        conclusionText = `Branch "${nodeB}" does NOT contain changes from "${nodeA}"`;
        correctAnswer = false;
      } else {
        conclusionText = `Branch "${nodeA}" does NOT contain changes from "${nodeB}"`;
        correctAnswer = true;
      }
    }

    const graphData = {
      nodes: selectedNodes.map(name => ({ id: name, label: name })),
      edges: relations.map(r => ({
        from: r.from,
        to: r.to,
        label: 'ancestor'
      })),
      orderedList: selectedNodes
    };

    return {
      mode: 'git',
      title: 'Git Ancestry Inspector',
      instruction: 'Determine branch inheritance to trace which commits contain which changes.',
      premises: shuffledPremises.map(p => p.text),
      conclusion: conclusionText,
      correctAnswer: correctAnswer,
      graphData: graphData
    };
  }

  /**
   * Mode 3: Dependency Conflict (Transitive require + exclusion)
   */
  function generateDependencyPuzzle(numPremises) {
    const numNodes = numPremises + 1;
    const selectedNodes = shuffle(vocab.dependency.nodes).slice(0, numNodes);
    
    const relations = [];
    for (let i = 0; i < numNodes - 2; i++) {
      relations.push({
        from: selectedNodes[i],
        to: selectedNodes[i + 1],
        type: 'requires',
        text: `${selectedNodes[i]} ${randChoice(vocab.dependency.relations.depends)} ${selectedNodes[i + 1]}`
      });
    }
    
    const lastNode = selectedNodes[numNodes - 1];
    const targetConflictNode = selectedNodes[numNodes - 2];
    relations.push({
      from: lastNode,
      to: targetConflictNode,
      type: 'conflicts',
      text: `${lastNode} ${randChoice(vocab.dependency.relations.conflicts)} ${targetConflictNode}`
    });

    const shuffledPremises = shuffle(relations);

    const firstNode = selectedNodes[0];
    const askCoInstallable = Math.random() > 0.5;
    
    let conclusionText = '';
    let correctAnswer = false;
    
    if (askCoInstallable) {
      conclusionText = `Module "${firstNode}" and Module "${lastNode}" can be installed together in the same package.`;
      correctAnswer = false; 
    } else {
      conclusionText = `Module "${firstNode}" and Module "${lastNode}" will cause a dependency conflict if installed together.`;
      correctAnswer = true;
    }

    const isControlQuestion = Math.random() > 0.5 && numNodes > 3;
    if (isControlQuestion) {
      const idx = Math.floor(Math.random() * (numNodes - 2));
      const nodeX = selectedNodes[idx];
      const nodeY = selectedNodes[idx + 1];
      if (Math.random() > 0.5) {
        conclusionText = `Module "${nodeX}" and Module "${nodeY}" can be installed together.`;
        correctAnswer = true;
      } else {
        conclusionText = `Module "${nodeX}" and Module "${nodeY}" will cause a dependency conflict if installed together.`;
        correctAnswer = false;
      }
    }

    const graphData = {
      nodes: selectedNodes.map(name => ({ id: name, label: name })),
      edges: relations.map(r => ({
        from: r.from,
        to: r.to,
        label: r.type
      }))
    };

    return {
      mode: 'dependency',
      title: 'Dependency Conflict Resolver',
      instruction: 'Analyze the module requirements and conflicts to prevent dependency resolution errors.',
      premises: shuffledPremises.map(p => p.text),
      conclusion: conclusionText,
      correctAnswer: correctAnswer,
      graphData: graphData
    };
  }

  /**
   * Mode 4: Type Inheritance (OOP Tree hierarchy)
   */
  function generateInheritancePuzzle(numPremises) {
    const numNodes = numPremises + 1;
    const selectedNodes = shuffle(vocab.inheritance.nodes).slice(0, numNodes);
    
    const relations = [];
    for (let i = 0; i < numNodes - 1; i++) {
      const extendsRelation = Math.random() > 0.5;
      if (extendsRelation) {
        relations.push({
          child: selectedNodes[i],
          parent: selectedNodes[i + 1],
          text: `${selectedNodes[i]} ${randChoice(vocab.inheritance.relations.inherits)} ${selectedNodes[i + 1]}`
        });
      } else {
        relations.push({
          child: selectedNodes[i],
          parent: selectedNodes[i + 1],
          text: `${selectedNodes[i + 1]} ${randChoice(vocab.inheritance.relations.parent)} ${selectedNodes[i]}`
        });
      }
    }

    const shuffledPremises = shuffle(relations);

    let idx1 = Math.floor(Math.random() * (numNodes - 1));
    let idx2 = idx1 + 1 + Math.floor(Math.random() * (numNodes - idx1 - 1));

    const childNode = selectedNodes[idx1];
    const parentNode = selectedNodes[idx2];

    const askTrue = Math.random() > 0.5;
    let conclusionText = '';
    let correctAnswer = false;

    const askCorrectInherit = Math.random() > 0.5;
    if (askCorrectInherit) {
      conclusionText = `Class "${childNode}" inherits properties and methods from Class "${parentNode}"`;
      correctAnswer = true;
    } else {
      conclusionText = `Class "${parentNode}" inherits properties and methods from Class "${childNode}"`;
      correctAnswer = false;
    }

    if (!askTrue) {
      if (correctAnswer) {
        conclusionText = `Class "${childNode}" does NOT inherit properties and methods from Class "${parentNode}"`;
        correctAnswer = false;
      } else {
        conclusionText = `Class "${parentNode}" does NOT inherit properties and methods from Class "${childNode}"`;
        correctAnswer = true;
      }
    }

    const graphData = {
      nodes: selectedNodes.map(name => ({ id: name, label: name })),
      edges: relations.map(r => ({
        from: r.child,
        to: r.parent,
        label: 'extends'
      }))
    };

    return {
      mode: 'inheritance',
      title: 'Type Inheritance Validator',
      instruction: 'Trace the class extensions to determine valid subclassing and polymorphism relationships.',
      premises: shuffledPremises.map(p => p.text),
      conclusion: conclusionText,
      correctAnswer: correctAnswer,
      graphData: graphData
    };
  }

  /**
   * Mode 5: Logic Gateways (Circuit simulation)
   */
  function generateLogicPuzzle(numPremises) {
    const signals = ['Signal-A', 'Signal-B', 'Signal-C', 'Signal-D'];
    const inputVals = {};
    const premises = [];
    const relations = []; 
    
    const inputsUsed = numPremises >= 4 ? 3 : 2;
    for (let i = 0; i < inputsUsed; i++) {
      const val = Math.random() > 0.5;
      inputVals[signals[i]] = val;
      premises.push({
        text: `Input ${signals[i]} is set to ${val ? 'HIGH (1)' : 'LOW (0)'}`,
        type: 'input',
        node: signals[i],
        value: val
      });
    }

    const gateVal = {};
    let currentInputs = Object.keys(inputVals);
    
    const gateType1 = randChoice(['AND', 'OR', 'XOR']);
    const in1_1 = currentInputs[0];
    const in1_2 = currentInputs[1];
    let val1 = false;
    
    if (gateType1 === 'AND') val1 = inputVals[in1_1] && inputVals[in1_2];
    else if (gateType1 === 'OR') val1 = inputVals[in1_1] || inputVals[in1_2];
    else if (gateType1 === 'XOR') val1 = inputVals[in1_1] !== inputVals[in1_2];
    
    gateVal['Gate-X'] = val1;
    premises.push({
      text: `Gate-X is an ${gateType1} gate with inputs ${in1_1} and ${in1_2}`,
      type: 'gate',
      node: 'Gate-X',
      inputs: [in1_1, in1_2],
      gateType: gateType1
    });
    
    relations.push({ from: in1_1, to: 'Gate-X', label: 'input' });
    relations.push({ from: in1_2, to: 'Gate-X', label: 'input' });

    let finalGate = 'Gate-X';

    if (inputsUsed === 3 && numPremises >= 4) {
      const gateType2 = Math.random() > 0.5 ? 'NOT' : 'AND';
      let val2 = false;
      if (gateType2 === 'NOT') {
        val2 = !inputVals['Signal-C'];
        premises.push({
          text: `Gate-Y is a NOT gate with input Signal-C`,
          type: 'gate',
          node: 'Gate-Y',
          inputs: ['Signal-C'],
          gateType: 'NOT'
        });
        relations.push({ from: 'Signal-C', to: 'Gate-Y', label: 'input' });
      } else {
        val2 = inputVals['Signal-C'] && gateVal['Gate-X'];
        premises.push({
          text: `Gate-Y is an AND gate with inputs Signal-C and Gate-X`,
          type: 'gate',
          node: 'Gate-Y',
          inputs: ['Signal-C', 'Gate-X'],
          gateType: 'AND'
        });
        relations.push({ from: 'Signal-C', to: 'Gate-Y', label: 'input' });
        relations.push({ from: 'Gate-X', to: 'Gate-Y', label: 'input' });
      }
      gateVal['Gate-Y'] = val2;
      
      const gateType3 = randChoice(['OR', 'AND', 'XOR']);
      let val3 = false;
      if (gateType3 === 'OR') val3 = gateVal['Gate-X'] || gateVal['Gate-Y'];
      else if (gateType3 === 'AND') val3 = gateVal['Gate-X'] && gateVal['Gate-Y'];
      else if (gateType3 === 'XOR') val3 = gateVal['Gate-X'] !== gateVal['Gate-Y'];
      
      gateVal['Gate-Z'] = val3;
      premises.push({
        text: `Gate-Z is an ${gateType3} gate with inputs Gate-X and Gate-Y`,
        type: 'gate',
        node: 'Gate-Z',
        inputs: ['Gate-X', 'Gate-Y'],
        gateType: gateType3
      });
      relations.push({ from: 'Gate-X', to: 'Gate-Z', label: 'input' });
      relations.push({ from: 'Gate-Y', to: 'Gate-Z', label: 'input' });
      
      finalGate = 'Gate-Z';
    }

    const expectedVal = gateVal[finalGate];
    const askHigh = Math.random() > 0.5;
    
    let conclusionText = '';
    let correctAnswer = false;
    
    if (askHigh) {
      conclusionText = `The output of ${finalGate} is HIGH (1).`;
      correctAnswer = expectedVal === true;
    } else {
      conclusionText = `The output of ${finalGate} is LOW (0).`;
      correctAnswer = expectedVal === false;
    }

    const shuffledPremises = shuffle(premises);

    const graphNodes = [];
    for (let i = 0; i < inputsUsed; i++) {
      graphNodes.push({ id: signals[i], label: signals[i], val: inputVals[signals[i]] });
    }
    graphNodes.push({ id: 'Gate-X', label: `Gate-X (${gateType1})`, val: gateVal['Gate-X'] });
    if (gateVal['Gate-Y'] !== undefined) {
      const gt = premises.find(p => p.node === 'Gate-Y').gateType;
      graphNodes.push({ id: 'Gate-Y', label: `Gate-Y (${gt})`, val: gateVal['Gate-Y'] });
    }
    if (gateVal['Gate-Z'] !== undefined) {
      const gt = premises.find(p => p.node === 'Gate-Z').gateType;
      graphNodes.push({ id: 'Gate-Z', label: `Gate-Z (${gt})`, val: gateVal['Gate-Z'] });
    }

    const graphData = {
      nodes: graphNodes,
      edges: relations,
      gateValues: { ...inputVals, ...gateVal }
    };

    return {
      mode: 'logic',
      title: 'Logic Gateway Simulator',
      instruction: 'Calculate the propagation of input signals through the digital logic gates.',
      premises: shuffledPremises.map(p => p.text),
      conclusion: conclusionText,
      correctAnswer: correctAnswer,
      graphData: graphData
    };
  }

  // Scramble / Gibberish Mode helper mapping
  function applyModifiers(puzzle, modifiers = {}) {
    let { gibberish, negation } = modifiers;
    
    const p = JSON.parse(JSON.stringify(puzzle));
    
    if (gibberish) {
      const nodeIds = p.graphData.nodes.map(n => n.id);
      nodeIds.sort((a,b) => b.length - a.length); // Descending length sorting
      
      const syllables = ['flib', 'zoop', 'bort', 'zax', 'quip', 'vlon', 'krog', 'plen', 'shru', 'wob', 'glip', 'tron', 'blip', 'drog', 'plam'];
      const shuffledSyls = shuffle(syllables);
      
      const mapping = {};
      nodeIds.forEach((id, idx) => {
        const prefix = shuffledSyls[idx % shuffledSyls.length];
        const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
        const codeNum = 10 + (idx * 7) % 90;
        mapping[id] = `${capPrefix}-${codeNum}`;
      });

      p.premises = p.premises.map(text => {
        let newText = text;
        nodeIds.forEach(id => {
          const escapedId = id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          newText = newText.replace(new RegExp(escapedId, 'g'), mapping[id]);
        });
        return newText;
      });

      nodeIds.forEach(id => {
        const escapedId = id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        p.conclusion = p.conclusion.replace(new RegExp(escapedId, 'g'), mapping[id]);
      });

      p.graphData.nodes.forEach(n => {
        n.label = mapping[n.id] || n.label;
        n.id = mapping[n.id] || n.id;
      });

      p.graphData.edges.forEach(e => {
        e.from = mapping[e.from] || e.from;
        e.to = mapping[e.to] || e.to;
      });

      if (p.graphData.orderedList) {
        p.graphData.orderedList = p.graphData.orderedList.map(id => mapping[id] || id);
      }
    }

    if (negation) {
      p.premises = p.premises.map(text => negateText(text));
      p.conclusion = negateText(p.conclusion);
    }

    return p;
  }

  function negateText(text) {
    // Negation mode rephrases statements as double-negatives that PRESERVE both
    // truth value and direction, so the puzzle stays solvable. Only phrases with
    // a clean logical opposite are rewritten; everything else is left untouched.
    //
    // Critical: all swaps are applied in a SINGLE left-to-right pass via one
    // combined regex. This guarantees an inserted word (e.g. "LOW (0)") is never
    // re-matched by a later rule, which is what produced the old "not not" bug.
    const swaps = [
      // Inheritance conclusion (longest first)
      ['does NOT inherit properties and methods from', 'lacks the properties and methods of'],
      ['inherits properties and methods from', 'does not lack the properties and methods of'],
      // Git conclusion
      ['does NOT contain changes from', 'is missing some changes from'],
      ['contains all changes from', 'is not missing any changes from'],
      // Git premises (clean directional opposites only)
      ['is integrated before', 'is not integrated after'],
      ['is upstream from', 'is not downstream from'],
      // Network latency (faster/slower are exact opposites in a strict order)
      ['has lower latency than', 'does not have higher latency than'],
      ['has higher latency than', 'does not have lower latency than'],
      ['responds quicker than', 'does not respond slower than'],
      ['responds slower than', 'does not respond quicker than'],
      ['is faster than', 'is not slower than'],
      ['is slower than', 'is not faster than'],
      // Dependency (conflict/compatible and depend/independent are opposites)
      ['cannot run alongside', 'is not safe to run alongside'],
      ['is incompatible with', 'is not compatible with'],
      ['conflicts with', 'is not compatible with'],
      ['depends on', 'is not independent of'],
      ['requires', 'does not work without'],
      // Logic levels (binary, exact opposites)
      ['HIGH (1)', 'not LOW (0)'],
      ['LOW (0)', 'not HIGH (1)']
    ];

    const map = {};
    swaps.forEach(([k, v]) => { map[k] = v; });

    // Build one alternation regex, longest patterns first (array order preserved),
    // escaping any regex-special characters in the phrases.
    const pattern = swaps
      .map(([k]) => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .join('|');
    const re = new RegExp(pattern, 'g');

    return text.replace(re, (matched) => map[matched] || matched);
  }

  // Master Generate Function
  function generate(mode, numPremises, modifiers = {}) {
    // Resolve the effective mode first so we can clamp against its vocabulary.
    const validModes = ['network', 'git', 'dependency', 'inheritance', 'logic'];
    const resolvedMode = validModes.includes(mode) ? mode : randChoice(validModes);

    // Each non-logic mode needs (numPremises + 1) distinct nodes. Never request
    // more nodes than the vocabulary holds, or names come back undefined.
    let maxPremises = 10;
    if (resolvedMode === 'network') maxPremises = vocab.network.nodes.length - 1;
    else if (resolvedMode === 'git') maxPremises = vocab.git.nodes.length - 1;
    else if (resolvedMode === 'dependency') maxPremises = vocab.dependency.nodes.length - 1;
    else if (resolvedMode === 'inheritance') maxPremises = vocab.inheritance.nodes.length - 1;

    const clampedPremises = Math.max(2, Math.min(maxPremises, numPremises));
    let basePuzzle;

    switch (resolvedMode) {
      case 'network':
        basePuzzle = generateNetworkPuzzle(clampedPremises);
        break;
      case 'git':
        basePuzzle = generateGitPuzzle(clampedPremises);
        break;
      case 'dependency':
        basePuzzle = generateDependencyPuzzle(clampedPremises);
        break;
      case 'inheritance':
        basePuzzle = generateInheritancePuzzle(clampedPremises);
        break;
      case 'logic':
        basePuzzle = generateLogicPuzzle(clampedPremises);
        break;
    }

    return applyModifiers(basePuzzle, modifiers);
  }

  return {
    generate
  };
})();

// Export for ES6 or window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Generator;
} else {
  window.Generator = Generator;
}
