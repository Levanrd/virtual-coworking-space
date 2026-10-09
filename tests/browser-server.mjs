// Disposable, loopback-only browser QA. Accounts exist only in memory.
import {createWorkspaceServer} from '../server/index.js';
process.env.TURN_URLS ||= 'turn:127.0.0.1:3478?transport=udp,turn:127.0.0.1:3478?transport=tcp';
const server = createWorkspaceServer({authFile: ':memory:', requireVerification: false, origin: 'http://127.0.0.1:5175', mailer: async () => {}});
await server.auth.register({fullName:'Browser QA',username:'browserqa',email:'browserqa@example.test',age:30,password:'Local-browser-check-2026'});
await server.auth.register({fullName:'Browser QA Two',username:'browserqa2',email:'browserqa2@example.test',age:30,password:'Local-browser-check-2026'});
server.http.listen(3007, '127.0.0.1', () => console.log('Disposable browser QA server ready on 127.0.0.1:3007'));
process.once('SIGINT', () => server.io.close(() => process.exit(0)));
