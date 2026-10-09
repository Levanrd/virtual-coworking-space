import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowRight, Coffee, Eye, EyeSlash } from "@phosphor-icons/react";
import { RecoveryForm, VerificationGate } from './AccountRecovery.jsx';
import { WorkspaceGate } from './WorkspaceAccess.jsx';
import { recoveryLink } from './authLinks.js';

const App = lazy(() => import("./App.jsx"));

async function request(path, body) {
  const response = await fetch(`/api/auth/${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  return { ...data, status: response.status, ok: response.ok };
}

function AuthForm({ onAuthenticated }) {
  const [forgot,setForgot]=useState(false);
  const [mode, setMode] = useState("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const errorRef = useRef(null);
  const register = mode === "register";
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setFields({});
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await request(mode, values);
      if (result.ok) onAuthenticated(result.user);
      else {
        setError(result.error || "Unable to sign in. Please try again.");
        setFields(result.fields || {});
      }
    } catch {
      setError("Cannot reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }
  function field(name, label, options = {}) {
    return (
      <div className="auth-field">
        <label htmlFor={`auth-${name}`}>{label}</label>
        <input
          id={`auth-${name}`}
          name={name}
          required
          aria-invalid={!!fields[name]}
          aria-describedby={fields[name] ? `error-${name}` : undefined}
          {...options}
        />
        {fields[name] && (
          <span className="auth-field-error" id={`error-${name}`}>
            {fields[name]}
          </span>
        )}
      </div>
    );
  }
  if(forgot) return <RecoveryForm onDone={()=>setForgot(false)}/>;
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span>
            <Coffee size={25} weight="fill" />
          </span>
          common ground.
        </div>
        <h1 id="auth-title">
          {register ? "Find your place." : "Welcome back."}
        </h1>
        <p className="auth-intro">
          {register
            ? "Create an account and make room for good work."
            : "Sign in to your shared working space."}
        </p>
        <form key={mode} onSubmit={submit} aria-busy={pending}>
          <fieldset disabled={pending}>
            {register ? (
              <>
                {field("fullName", "Full name", {
                  autoComplete: "name",
                  minLength: 2,
                  maxLength: 100,
                  placeholder: "Your full name",
                })}
                {field("username", "Username", {
                  autoComplete: "username",
                  minLength: 3,
                  maxLength: 30,
                  pattern: "[a-zA-Z0-9_]{3,30}",
                  title: "3–30 letters, numbers, or underscores",
                  autoCapitalize: "none",
                  spellCheck: false,
                  placeholder: "Choose a username",
                })}
                <div className="auth-field-pair">
                  {field("email", "Email", {
                    type: "email",
                    autoComplete: "email",
                    maxLength: 254,
                    autoCapitalize: "none",
                    placeholder: "you@example.com",
                  })}
                  {field("age", "Age", {
                    type: "number",
                    min: 1,
                    max: 120,
                    step: 1,
                    inputMode: "numeric",
                    placeholder: "Age",
                  })}
                </div>
              </>
            ) : (
              field("identifier", "Username or email", {
                autoComplete: "username",
                maxLength: 254,
                autoCapitalize: "none",
                spellCheck: false,
                placeholder: "Your username or email",
              })
            )}
            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <div className="auth-password">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  required
                  minLength={register ? 12 : undefined}
                  maxLength={128}
                  placeholder={
                    register ? "Create a password" : "Enter your password"
                  }
                  aria-invalid={!!fields.password}
                  aria-describedby="auth-password-hint"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <span
                id="auth-password-hint"
                className={fields.password ? "auth-field-error" : "auth-hint"}
              >
                {fields.password || (register ? "At least 12 characters." : "")}
              </span>
            </div>
            {error && (
              <p
                ref={errorRef}
                tabIndex={-1}
                className="auth-error"
                role="alert"
              >
                {error}
              </p>
            )}
            <button className="auth-submit" type="submit">
              {pending
                ? register
                  ? "Creating account…"
                  : "Signing in…"
                : register
                  ? "Create account"
                  : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </fieldset>
        </form>
        <p className="auth-switch">
          {register ? "Already have an account?" : "New to Common Ground?"}{" "}
          <button
            disabled={pending}
            onClick={() => {
              setMode(register ? "login" : "register");
              setError("");
              setFields({});
              setShowPassword(false);
            }}
          >
            {register ? "Sign in" : "Create an account"}
          </button>
        </p>
        {!register && <button className="text-button" disabled={pending} onClick={()=>setForgot(true)}>Forgot password?</button>}
      </section>
      <p className="auth-footer">A little company. A better workday.</p>
    </main>
  );
}

export default function AuthGate() {
  const [recovery,setRecovery]=useState(()=>recoveryLink(location.href));
  useEffect(() => {
    const receiveLink = () => {
      const link = recoveryLink(location.href);
      if (!link) return;
      history.replaceState(null, '', link.cleanURL);
      setRecovery(link);
    };
    receiveLink();
    window.addEventListener('hashchange', receiveLink);
    return () => window.removeEventListener('hashchange', receiveLink);
  }, []);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const channel = useRef(null);
  const refresh = useCallback(async (reconnect = false) => {
    const current = ++generation.current;
    try {
      const result = await request("me");
      if (current !== generation.current) return;
      if (!result.ok && result.status !== 401) throw new Error();
      setUser(result.user || null);
      setError("");
      if (reconnect) setRevision((v) => v + 1);
    } catch {
      if (current === generation.current)
        setError(
          "Cannot reach the server. Check your connection and try again.",
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const authChanged = () => refresh(true);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("cg-auth");
      channel.current.onmessage = authChanged;
    }
    window.addEventListener("cg-auth-required", authChanged);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++;
      channel.current?.close();
      window.removeEventListener("cg-auth-required", authChanged);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  const authenticated = (account) => {
    generation.current++;
    setUser(account);
    setError("");
    channel.current?.postMessage("changed");
  };
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const result = await request("logout", {});
      if (!result.ok) throw new Error();
      authenticated(null);
    } catch {
      setError("Could not sign out. Check your connection and try again.");
    } finally {
      setLoggingOut(false);
    }
  }
  if(recovery) return <RecoveryForm key={`${recovery.kind}:${recovery.token}`} {...recovery} onDone={()=>{setRecovery(null);refresh(true);}}/>;
  if (loading)
    return (
      <main className="auth-page">
        <p role="status">Getting your space ready…</p>
      </main>
    );
  if (!user && error)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p role="alert">{error}</p>
          <button
            className="auth-submit"
            onClick={() => {
              setLoading(true);
              refresh();
            }}
          >
            Try again
          </button>
        </div>
      </main>
    );
  if (!user) return <AuthForm onAuthenticated={authenticated} />;
  if(user.requiresVerification && !user.emailVerified) return <VerificationGate user={user} onRefresh={()=>refresh(true)} onLogout={logout}/>;
  return (
    <Suspense
      fallback={
        <main className="auth-page">
          <p role="status">Opening your workspace…</p>
        </main>
      }
    >
      <WorkspaceGate key={user.id} onLogout={logout}>{access => <App
        key={`${user.id}:${revision}`}
        account={user}
        onLogout={logout}
        loggingOut={loggingOut}
        authError={error}
        workspaceAccess={access}
      />}</WorkspaceGate>
    </Suspense>
  );
}
