// Development-only controls for testing the real client hook after transport loss.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DEFAULT_PROFILE, useWorkspace} from '../src/useWorkspace.js';

function Harness() {
  const [message, setMessage] = useState('');
  const {self, connected, action, socketRef} = useWorkspace({...DEFAULT_PROFILE, name:'Reconnect QA'}, setMessage);
  return <main style={{fontFamily:'sans-serif',padding:32}}>
    <h1>Workspace reconnect verification</h1>
    <p>Sign in first. The space parameter must identify an isolated QA workspace.</p>
    <p role="status">{connected?'Connected':'Disconnected'} · Room: {self?.room || 'none'} · Table: {self?.table || 'none'}</p>
    <p>Connection ID: {self?.id || 'none'}</p>
    <p>Position: {self ? `${self.x.toFixed(2)}, ${self.z.toFixed(2)}` : 'none'}</p>
    <button onClick={()=>self && socketRef.current?.emit('move',{x:self.x+0.1,z:self.z,rotation:self.rotation,motionVersion:self.motionVersion})}>Take a step</button>{' '}
    <button onClick={()=>action('room','terrace')}>Enter terrace</button>{' '}
    <button onClick={()=>action('join-table',{table:'design',seat:5})}>Sit at terrace table</button>{' '}
    <button onClick={()=>socketRef.current?.io.engine?.close()}>Interrupt transport</button>
    <p>{message}</p>
  </main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
