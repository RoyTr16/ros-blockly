import React, { useRef, useEffect, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import './GraphViewer.css';

Chart.register(...registerables);

const GraphViewer = () => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const updateChart = useCallback((graphData) => {
    if (!canvasRef.current) return;

    if (!graphData) {
      // Clear chart
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return;
    }

    if (!chartRef.current) {
      // Create new chart
      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data: {
          labels: graphData.x,
          datasets: [{
            label: graphData.yLabel || 'Y',
            data: graphData.y,
            borderColor: '#4285f4',
            backgroundColor: 'rgba(66, 133, 244, 0.1)',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.1,
            fill: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          scales: {
            x: {
              title: { display: true, text: graphData.xLabel || 'X' },
              ticks: { maxTicksLimit: 10 },
            },
            y: {
              title: { display: true, text: graphData.yLabel || 'Y' },
              beginAtZero: false,
            },
          },
          plugins: {
            legend: { display: false },
          },
        },
      });
    } else {
      // Update existing chart data
      const chart = chartRef.current;
      chart.data.labels = graphData.x;
      chart.data.datasets[0].data = graphData.y;
      chart.data.datasets[0].label = graphData.yLabel || 'Y';
      chart.options.scales.x.title.text = graphData.xLabel || 'X';
      chart.options.scales.y.title.text = graphData.yLabel || 'Y';
      chart.update('none');
    }
  }, []);

  useEffect(() => {
    if (!window.rosBlockly) window.rosBlockly = {};
    window.rosBlockly.onGraphUpdate = updateChart;

    return () => {
      if (window.rosBlockly) {
        window.rosBlockly.onGraphUpdate = null;
      }
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [updateChart]);

  return (
    <div className="graph-viewer-container">
      <h3>Graph</h3>
      <div className="graph-canvas-wrapper">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};

export default GraphViewer;
