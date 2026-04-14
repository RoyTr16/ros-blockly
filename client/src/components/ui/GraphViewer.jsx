import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import './GraphViewer.css';

Chart.register(...registerables);

const GraphOverlay = ({ blocklyRef }) => {
  const containerRef = useRef(null);
  const chartsRef = useRef({}); // blockId -> Chart instance
  const panelsRef = useRef({}); // blockId -> { el, lastX, lastY }
  const [viewers, setViewers] = useState([]); // [{ id, varName }]
  const rafRef = useRef(null);
  const mountedRef = useRef(true);

  // Scan workspace for graph viewer blocks that have visibility toggled on
  const scanViewers = useCallback(() => {
    const ws = blocklyRef.current?.getWorkspace?.();
    if (!ws) return;

    const blocks = ws.getBlocksByType('utilities_graph_viewer', false);
    const found = blocks
      .filter(block => block.getFieldValue('VISIBLE') === 'TRUE')
      .map(block => ({
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

  // Continuous RAF loop — updates panel positions every frame
  const positionLoop = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = blocklyRef.current?.getWorkspace?.();
    const container = containerRef.current;
    if (ws && container) {
      const containerRect = container.getBoundingClientRect();

      for (const [blockId, ref] of Object.entries(panelsRef.current)) {
        const block = ws.getBlockById(blockId);
        if (!block || !ref.el) continue;

        const svgRoot = block.getSvgRoot();
        if (!svgRoot) continue;

        const blockRect = svgRoot.getBoundingClientRect();

        // Skip if block hasn't been rendered yet (rect is all zeros)
        if (blockRect.width === 0 && blockRect.height === 0) continue;

        const panelWidth = ref.el.offsetWidth;
        const panelHeight = ref.el.offsetHeight;

        // Skip if panel hasn't been laid out yet
        if (panelWidth === 0 || panelHeight === 0) continue;

        // Position above the block, centered horizontally
        const x = blockRect.left - containerRect.left + (blockRect.width / 2) - (panelWidth / 2);
        const y = blockRect.top - containerRect.top - panelHeight - 8;

        // Only update if moved (avoids layout thrash)
        const dx = Math.abs(x - ref.lastX);
        const dy = Math.abs(y - ref.lastY);
        if (!(dx < 0.5 && dy < 0.5)) {
          ref.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
          ref.lastX = x;
          ref.lastY = y;
        }
      }
    }

    rafRef.current = requestAnimationFrame(positionLoop);
  }, [blocklyRef]);

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
              borderColor: data?.color || '#4f8cff',
              backgroundColor: (data?.style === 'scatter') ? (data?.color || '#4f8cff') : 'rgba(79, 140, 255, 0.08)',
              borderWidth: 2,
              pointRadius: (data?.style === 'scatter') ? 3 : 0,
              pointHoverRadius: 4,
              tension: 0.3,
              fill: true,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            scales: {
              x: {
                title: { display: true, text: data?.xLabel || 'X', color: '#9ea3b5', font: { size: 11 } },
                ticks: { maxTicksLimit: 8, color: '#636880', font: { size: 10 } },
                grid: { color: 'rgba(99, 102, 241, 0.08)' },
              },
              y: {
                title: { display: true, text: data?.yLabel || 'Y', color: '#9ea3b5', font: { size: 11 } },
                ticks: { color: '#636880', font: { size: 10 } },
                grid: { color: 'rgba(99, 102, 241, 0.08)' },
              },
            },
            plugins: { legend: { display: false } },
          },
        });
      } else if (data) {
        const chart = chartsRef.current[viewer.id];
        chart.config.type = data.style || 'line';
        chart.data.labels = data.x;
        chart.data.datasets[0].data = data.y;
        chart.data.datasets[0].borderColor = data.color || '#4f8cff';
        chart.data.datasets[0].pointRadius = (data.style === 'scatter') ? 3 : 0;
        chart.options.scales.x.title.text = data.xLabel || 'X';
        chart.options.scales.y.title.text = data.yLabel || 'Y';
        chart.update('none');
      }
    }
  }, [viewers]);

  // Register panel DOM refs
  const setPanelRef = useCallback((blockId, el) => {
    if (el) {
      el.style.transform = 'translate(-9999px, -9999px)';
      panelsRef.current[blockId] = { el, lastX: NaN, lastY: NaN };
    } else {
      delete panelsRef.current[blockId];
    }
  }, []);

  // Listen for workspace changes (add/remove blocks) + start RAF loop
  useEffect(() => {
    mountedRef.current = true;

    const pollInterval = setInterval(() => {
      const ws = blocklyRef.current?.getWorkspace?.();
      if (!ws) return;
      clearInterval(pollInterval);

      ws.addChangeListener(scanViewers);
      scanViewers();

      // Start the continuous position loop
      rafRef.current = requestAnimationFrame(positionLoop);
    }, 200);

    if (!window.rosBlockly) window.rosBlockly = {};
    window.rosBlockly.onGraphToggle = () => scanViewers();

    return () => {
      mountedRef.current = false;
      clearInterval(pollInterval);
      if (window.rosBlockly) {
        window.rosBlockly.onGraphToggle = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      Object.values(chartsRef.current).forEach(c => c.destroy());
      chartsRef.current = {};
      panelsRef.current = {};
    };
  }, [blocklyRef, scanViewers, positionLoop]);

  // Separate effect for graph update callback — updateCharts changes with viewers,
  // but must NOT cause the main effect (RAF loop / panelsRef) to re-run.
  useEffect(() => {
    if (!window.rosBlockly) window.rosBlockly = {};
    window.rosBlockly.onGraphUpdate = () => updateCharts();
    return () => {
      if (window.rosBlockly) window.rosBlockly.onGraphUpdate = null;
    };
  }, [updateCharts]);

  // When viewers list changes, update charts
  useEffect(() => {
    const t = setTimeout(() => updateCharts(), 50);
    return () => clearTimeout(t);
  }, [viewers, updateCharts]);

  // Handle panel resize — tell Chart.js to resize
  const handleResize = useCallback((blockId) => {
    const chart = chartsRef.current[blockId];
    if (chart) chart.resize();
  }, []);

  return (
    <div ref={containerRef} className="graph-overlay">
      {viewers.map(v => (
        <div
          key={v.id}
          ref={el => setPanelRef(v.id, el)}
          className="graph-panel"
        >
          <div className="graph-panel-header">
            <span className="graph-panel-title">{v.varName}</span>
          </div>
          <div className="graph-panel-canvas" onMouseUp={() => handleResize(v.id)}>
            <canvas data-canvas-id={v.id} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default GraphOverlay;
