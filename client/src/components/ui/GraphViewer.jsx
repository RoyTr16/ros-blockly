import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import './GraphViewer.css';

Chart.register(...registerables);

const GraphOverlay = ({ blocklyRef }) => {
  const containerRef = useRef(null);
  const chartsRef = useRef({}); // blockId -> Chart instance
  const [viewers, setViewers] = useState([]); // [{ id, varName }]
  const rafRef = useRef(null);

  // Scan workspace for graph viewer blocks
  const scanViewers = useCallback(() => {
    const ws = blocklyRef.current?.getWorkspace?.();
    if (!ws) return;

    const blocks = ws.getBlocksByType('utilities_graph_viewer', false);
    const found = blocks.map(block => ({
      id: block.id,
      varName: block.getField('VAR')?.getText() || '',
    }));

    setViewers(prev => {
      if (prev.length === found.length && prev.every((v, i) => v.id === found[i]?.id && v.varName === found[i]?.varName)) {
        return prev;
      }
      return found;
    });
  }, [blocklyRef]);

  // Update chart positions using getBoundingClientRect
  const updatePositions = useCallback(() => {
    const ws = blocklyRef.current?.getWorkspace?.();
    const container = containerRef.current;
    if (!ws || !container) return;

    const containerRect = container.getBoundingClientRect();

    for (const viewer of viewers) {
      const block = ws.getBlockById(viewer.id);
      const panel = container.querySelector(`[data-graph-id="${viewer.id}"]`);
      if (!block || !panel) continue;

      const svgRoot = block.getSvgRoot();
      if (!svgRoot) continue;

      const blockRect = svgRoot.getBoundingClientRect();
      const left = blockRect.right - containerRect.left + 12;
      const top = blockRect.top - containerRect.top;

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }
  }, [blocklyRef, viewers]);

  // Create/update/destroy Chart.js instances
  const updateCharts = useCallback(() => {
    const graphs = window.rosBlockly?.graphs || {};
    const activeIds = new Set(viewers.map(v => v.id));

    // Destroy removed
    for (const id of Object.keys(chartsRef.current)) {
      if (!activeIds.has(id)) {
        chartsRef.current[id].destroy();
        delete chartsRef.current[id];
      }
    }

    // Create or update
    for (const viewer of viewers) {
      const data = graphs[viewer.varName];
      const canvas = containerRef.current?.querySelector(`[data-canvas-id="${viewer.id}"]`);
      if (!canvas) continue;

      if (!chartsRef.current[viewer.id]) {
        chartsRef.current[viewer.id] = new Chart(canvas, {
          type: data?.style || 'line',
          data: {
            labels: data?.x || [],
            datasets: [{
              data: data?.y || [],
              borderColor: data?.color || '#4285f4',
              backgroundColor: (data?.style === 'scatter') ? (data?.color || '#4285f4') : 'transparent',
              borderWidth: 2,
              pointRadius: (data?.style === 'scatter') ? 3 : 1,
              tension: 0.1,
              fill: false,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            scales: {
              x: { title: { display: true, text: data?.xLabel || 'X' }, ticks: { maxTicksLimit: 8 } },
              y: { title: { display: true, text: data?.yLabel || 'Y' } },
            },
            plugins: { legend: { display: false } },
          },
        });
      } else if (data) {
        const chart = chartsRef.current[viewer.id];
        chart.config.type = data.style || 'line';
        chart.data.labels = data.x;
        chart.data.datasets[0].data = data.y;
        chart.data.datasets[0].borderColor = data.color || '#4285f4';
        chart.data.datasets[0].pointRadius = (data.style === 'scatter') ? 3 : 1;
        chart.options.scales.x.title.text = data.xLabel || 'X';
        chart.options.scales.y.title.text = data.yLabel || 'Y';
        chart.update('none');
      }
    }
  }, [viewers]);

  // Listen for workspace changes + graph data updates
  useEffect(() => {
    const pollInterval = setInterval(() => {
      const ws = blocklyRef.current?.getWorkspace?.();
      if (!ws) return;
      clearInterval(pollInterval);

      const onChange = () => {
        scanViewers();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(updatePositions);
      };
      ws.addChangeListener(onChange);
    }, 200);

    if (!window.rosBlockly) window.rosBlockly = {};
    window.rosBlockly.onGraphUpdate = () => {
      updateCharts();
    };

    return () => {
      clearInterval(pollInterval);
      if (window.rosBlockly) window.rosBlockly.onGraphUpdate = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      Object.values(chartsRef.current).forEach(c => c.destroy());
      chartsRef.current = {};
    };
  }, [blocklyRef, scanViewers, updatePositions, updateCharts]);

  // When viewers list changes, update charts and positions
  useEffect(() => {
    // Small delay to let React render the canvas elements
    const t = setTimeout(() => {
      updateCharts();
      updatePositions();
    }, 50);
    return () => clearTimeout(t);
  }, [viewers, updateCharts, updatePositions]);

  return (
    <div ref={containerRef} className="graph-overlay">
      {viewers.map(v => (
        <div key={v.id} data-graph-id={v.id} className="graph-panel">
          <div className="graph-panel-title">{v.varName}</div>
          <div className="graph-panel-canvas">
            <canvas data-canvas-id={v.id} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default GraphOverlay;
