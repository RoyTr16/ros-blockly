import React from 'react';
import './CodeDisplay.css';

const CodeDisplay = ({ code }) => {
  return (
    <div className="code-display-container">
      <h3>Generated Code</h3>
      <textarea
        className="code-textarea"
        value={code}
        readOnly
      />
    </div>
  );
};

export default CodeDisplay;
