import React, { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import './CodeDisplay.css';

const CodeDisplay = ({ code }) => {
  const codeRef = useRef(null);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code]);

  return (
    <div className="code-display-container">
      <h3>Generated Code</h3>
      <pre className="code-pre">
        <code ref={codeRef} className="language-javascript">
          {code || '// No code generated yet'}
        </code>
      </pre>
    </div>
  );
};

export default CodeDisplay;
