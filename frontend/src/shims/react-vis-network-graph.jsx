import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';

// Modern replacement for react-vis-network-graph built on reactflow.
// Accepts { graph: { nodes, edges }, options, events, style } like vis-network.
export default function VisNetwork({ graph = {}, options = {}, events = {}, style = {} }) {
  const nodes = useMemo(() => {
    const list = graph.nodes || [];
    const n = list.length || 1;
    const radius = Math.max(180, n * 30);
    return list.map((node, i) => {
      const angle = (2 * Math.PI * i) / n;
      return {
        id: String(node.id),
        data: { label: node.label ?? String(node.id) },
        position: node.x != null && node.y != null
          ? { x: node.x, y: node.y }
          : { x: radius + radius * Math.cos(angle), y: radius + radius * Math.sin(angle) },
        style: {
          background: node.color?.background || node.color || '#00338e',
          color: '#fff',
          border: '1px solid #002a6e',
          borderRadius: node.shape === 'box' ? 4 : 20,
          padding: 8,
          fontSize: 12,
        },
      };
    });
  }, [graph.nodes]);

  const edges = useMemo(() => {
    return (graph.edges || []).map((edge, i) => ({
      id: `e-${edge.from}-${edge.to}-${i}`,
      source: String(edge.from),
      target: String(edge.to),
      label: edge.label,
      animated: !!edge.dashes,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: edge.color?.color || edge.color || '#94a3b8' },
    }));
  }, [graph.edges]);

  const handleNodeClick = (_evt, node) => {
    if (events && typeof events.selectNode === 'function') {
      events.selectNode({ nodes: [node.id] });
    } else if (events && typeof events.select === 'function') {
      events.select({ nodes: [node.id] });
    }
  };

  return (
    <div style={{ width: '100%', height: 500, ...style }}>
      <ReactFlow nodes={nodes} edges={edges} onNodeClick={handleNodeClick} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
