import { useState } from 'react';

export async function authRequest(path, body) {
  const response=await fetch(`/api/auth/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || 'Please try again.');
  return data;
}
export function RecoveryForm({kind='forgot',token,onDone}) {
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  async function submit(event) {
    event.preventDefault();setError('');setPending(true);
    const values=Object.fromEntries(new FormData(event.currentTarget));
    try {
      if(kind==='reset' && values.password!==values.confirm) throw new Error('The passwords do not match.');
      await authRequest(kind==='forgot'?'forgot-password':kind==='reset'?'reset-password':'verify-email',{...values,token});
      setDone(true);
    } catch(e) {setError(e.message);} finally {setPending(false);}
  }
  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand">common ground.</div>
    <h1>{kind==='forgot'?'Forgot your password?':kind==='reset'?'Choose a new password.':'Verify your email.'}</h1>
    {done ? <><p role="status">{kind==='forgot'?'If that email has an account, a reset link is on its way.':kind==='reset'?'Your password has been changed. Sign in again on your devices.':'Your email is verified. You can enter your workspace.'}</p><button className="auth-submit" onClick={onDone}>Continue</button></> : <form onSubmit={submit}><fieldset disabled={pending}>
      {kind==='forgot' && <label className="field-label">Email<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>}
      {kind==='reset' && <><label className="field-label">New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label><label className="field-label">Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label><p>At least 12 characters.</p></>}
      {kind==='verify' && <p>Confirm this email address belongs to you.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-submit">{pending?'Please wait…':kind==='forgot'?'Send reset link':kind==='reset'?'Save new password':'Verify email'}</button>
      <button className="text-button" type="button" onClick={onDone}>{kind==='forgot'?'Back to sign in':'Back to Common Ground'}</button>
    </fieldset></form>}
  </section></main>;
}
export function VerificationGate({user,onRefresh,onLogout}) {
  const [message,setMessage]=useState(''),[pending,setPending]=useState(false);
  async function resend() {
    setPending(true);
    try {await authRequest('resend-verification',{});setMessage('Verification email sent. Check your inbox.');}
    catch(e){setMessage(e.message);} finally{setPending(false);}
  }
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand">common ground.</div><h1>Check your inbox.</h1><p>Verify <strong>{user.email}</strong> before entering a workspace.</p><p role="status">{message}</p><button className="auth-submit" onClick={onRefresh}>I’ve verified my email</button><button className="text-button" disabled={pending} onClick={resend}>{pending?'Sending…':'Resend verification email'}</button><button className="text-button" onClick={onLogout}>Sign out</button></section></main>;
}
