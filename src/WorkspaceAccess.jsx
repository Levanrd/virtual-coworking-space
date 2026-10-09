import { useEffect, useState } from 'react';

export async function workspaceRequest(path='',body) {
  const response=await fetch(`/api/workspaces${path}`,{cache:'no-store',credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || 'Workspace request failed.');
  return data;
}
const openSpace = space => {const url=new URL(location.href);url.searchParams.set('space',space);url.hash='';location.assign(url);};
export function WorkspacePicker() {
  const [spaces,setSpaces]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{workspaceRequest().then(r=>setSpaces(r.workspaces)).catch(e=>setError(e.message));},[]);
  async function create(event){event.preventDefault();setBusy(true);setError('');try{const values=Object.fromEntries(new FormData(event.currentTarget));const result=await workspaceRequest('',values);openSpace(result.space);}catch(e){setError(e.message);setBusy(false);}}
  return <div className="workspace-access"><h3>Your workspaces</h3><div className="workspace-list"><button onClick={()=>openSpace('common-ground')}>Common Ground · community</button>{spaces.filter(s=>s.id!=='common-ground').map(s=><button key={s.id} onClick={()=>openSpace(s.id)}>{s.name} · {s.role}</button>)}</div><h3>Create a private workspace</h3><form onSubmit={create}><fieldset disabled={busy}><label className="field-label">Name<input name="name" maxLength={80} required placeholder="Your team"/></label><label className="field-label">Workspace address<input name="space" pattern="[a-z0-9][a-z0-9-]{2,39}" minLength={3} maxLength={40} required placeholder="your-team"/></label><p>Only members can enter. You’ll be the owner and can invite coworkers.</p><button className="primary-button">{busy?'Creating…':'Create workspace'}</button></fieldset></form>{error&&<p role="alert" className="auth-error">{error}</p>}</div>;
}
export function WorkspaceGate({children,onLogout}) {
  const space=new URLSearchParams(location.search).get('space') || 'common-ground';
  const [access,setAccess]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [invite,setInvite]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('invite'));
  useEffect(()=>{
    const receiveInvite=()=>{const token=new URLSearchParams(location.hash.slice(1)).get('invite');if(token){setError('');setInvite(token);}};
    window.addEventListener('hashchange',receiveInvite);
    return()=>window.removeEventListener('hashchange',receiveInvite);
  },[]);
  async function refresh(){setLoading(true);try{const result=await workspaceRequest(`/${encodeURIComponent(space)}`);setAccess(result);setError('');}catch(e){setAccess(null);setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{refresh();window.addEventListener('cg-access-revoked',refresh);return()=>window.removeEventListener('cg-access-revoked',refresh);},[space]);
  async function accept(){setBusy(true);setError('');try{const result=await workspaceRequest('/redeem',{token:invite});setInvite(null);openSpace(result.space);}catch(e){setError(e.message);setBusy(false);}}
  if(invite) return <main className="auth-page"><section className="auth-card"><h1>You’re invited.</h1><p>Accept this single-use invitation to join the workspace.</p>{error&&<p role="alert">{error}</p>}<button className="auth-submit" disabled={busy} onClick={accept}>{busy?'Joining…':'Accept invitation'}</button><button className="text-button" onClick={()=>{history.replaceState(null,'',location.pathname+location.search);setInvite(null);}}>Cancel</button></section></main>;
  if(loading)return <main className="auth-page"><p role="status">Opening your workspace…</p></main>;
  if(!access)return <main className="auth-page"><section className="auth-card"><h1>Find your workspace.</h1><p role="alert">{error}</p><WorkspacePicker/><button className="text-button" onClick={refresh}>Try again</button><button className="text-button" onClick={onLogout}>Sign out</button></section></main>;
  return children(access);
}
export function WorkspaceInvite({space,role,notify}) {
  const [url,setUrl]=useState(''),[busy,setBusy]=useState(false);
  async function generate(){setBusy(true);try{const result=await workspaceRequest(`/${encodeURIComponent(space)}/invites`,{});const link=new URL(location.origin);link.searchParams.set('space',space);link.hash=`invite=${result.token}`;setUrl(link.toString());}catch(e){notify(e.message);}finally{setBusy(false);}}
  return <div className="workspace-access">{space==='common-ground'?<p>The community is open to signed-in members. Share the workspace link below.</p>:['owner','moderator'].includes(role)?<><p>Each invitation admits one person and expires after 24 hours.</p><button className="primary-button" disabled={busy} onClick={generate}>{busy?'Creating…':'Create invitation'}</button>{url&&<label className="field-label">Single-use invitation<input aria-label="Single-use invitation" readOnly value={url}/><button className="text-button" onClick={()=>navigator.clipboard.writeText(url).then(()=>notify('Invitation copied.')).catch(()=>notify('Select the invitation and copy it manually.'))}>Copy invitation</button></label>}</>:<p>Ask a workspace owner or moderator to create an invitation. A workspace address alone does not grant access.</p>}</div>;
}
export function ModerationPanel({space,account,role,notify}) {
  const [members,setMembers]=useState([]),[reports,setReports]=useState([]),[audit,setAudit]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){setError('');try{const [m,r,a]=await Promise.all([workspaceRequest(`/${space}/members`),workspaceRequest(`/${space}/reports`),workspaceRequest(`/${space}/audit`)]);setMembers(m.members);setReports(r.reports);setAudit(a.entries);}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[space]);
  async function moderate(event){event.preventDefault();setBusy(true);setError('');try{await workspaceRequest(`/${space}/moderate`,Object.fromEntries(new FormData(event.currentTarget)));notify('Moderation action saved.');await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  const eligible=members.filter(m=>m.id!==account.id&&m.role!=='owner'&&(role==='owner'||m.role!=='moderator'));
  return <div className="workspace-access"><p>Kicks last five minutes. Bans remain until an owner or moderator removes them.</p>{error&&<p role="alert">{error}</p>}<form onSubmit={moderate}><fieldset disabled={busy}><label className="field-label">Member<select name="target" aria-label="Member" required><option value="">Choose a member</option>{eligible.map(m=><option key={m.id} value={m.id}>{m.username} · {m.banned?'banned':m.role}</option>)}</select></label><label className="field-label">Action<select name="action" aria-label="Action"><option value="kick">Remove for five minutes</option><option value="ban">Ban from workspace</option><option value="unban">Remove ban</option>{role==='owner'&&<><option value="promote">Make moderator</option><option value="demote">Make member</option></>}</select></label><label className="field-label">Reason<textarea name="reason" required maxLength={500}/></label><button className="primary-button" disabled={!eligible.length}>{busy?'Saving...':'Apply action'}</button>{!eligible.length&&<p>No other members are available to moderate. Invite your team to get started.</p>}</fieldset></form><h3>Reports</h3>{reports.length?reports.map(r=><div className="moderation-entry" key={r.id}><strong>{r.targetName}</strong><p>{r.reason}</p><small>Reported by {r.reporterName} · {new Date(r.created_at).toLocaleString()}</small>{r.resolved?<p>Resolved</p>:<button className="text-button" onClick={async()=>{try{await workspaceRequest(`/${space}/reports/${r.id}/resolve`,{});await load();}catch(e){setError(e.message);}}}>Mark resolved</button>}</div>):<p>No reports yet.</p>}<h3>Recent moderation</h3>{audit.length?audit.map(a=><div className="moderation-entry" key={a.id}><strong>{a.action} · {members.find(m=>m.id===a.target)?.username || 'Member'}</strong><p>{a.reason}</p><small>{new Date(a.created_at).toLocaleString()}</small></div>):<p>No actions yet.</p>}</div>;
}
export function ReportForm({space,users,account,notify,onDone}) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const coworkers=[...new Map(users.filter(u=>u.accountId && u.accountId!==account.id).map(u=>[u.accountId,u])).values()];
  if (!coworkers.length) return <div className="workspace-access"><p>No other coworkers are online in this workspace right now.</p><p>You can report a concern here when a coworker is present.</p><button className="primary-button" onClick={onDone}>Back to the campus</button></div>;
  return <form className="workspace-access" onSubmit={async event=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try{await workspaceRequest('/'+space+'/reports',Object.fromEntries(new FormData(event.currentTarget)));notify('Report sent to workspace moderators.');onDone();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }}><fieldset disabled={busy}>
    <label className="field-label">Coworker<select name="target" aria-label="Coworker" required><option value="">Choose a coworker</option>{coworkers.map(u=><option key={u.accountId} value={u.accountId}>{u.name} (@{u.username})</option>)}</select></label>
    <label className="field-label">What happened?<textarea name="reason" minLength={5} maxLength={1000} required/></label>
    <p>Only workspace owners and moderators can read your report.</p>
    {error&&<p role="alert">{error}</p>}
    <button className="primary-button">{busy?'Sending…':'Send report'}</button>
  </fieldset></form>;
}
