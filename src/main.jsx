import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import AuthGate from "./Auth.jsx";
import "./styles.css";
import "./campus.css";
import ErrorBoundary, { reportClientError } from './ErrorBoundary.jsx';

window.addEventListener('error', () => reportClientError('script_failed'));
window.addEventListener('unhandledrejection', () => reportClientError('promise_failed'));
createRoot(document.getElementById("root")).render(<ErrorBoundary><AuthGate /></ErrorBoundary>);
