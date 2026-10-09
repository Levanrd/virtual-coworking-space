import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from '../src/ErrorBoundary.jsx';
import '../src/styles.css';
function FailureCheck() {
  const [fail, setFail] = useState(false);
  if (fail) throw new Error('Synthetic local render failure');
  return <button onClick={() => setFail(true)}>Simulate render failure</button>;
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><FailureCheck /></ErrorBoundary>);
