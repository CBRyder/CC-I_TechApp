# CC&I TechApp Security Handoff

## Security posture implemented on main

### Authentication and sessions
- Access tokens: 15 minutes for employees, 10 minutes for admins.
- Refresh tokens: 7-day sliding lifetime.
- Refresh rotation: every successful refresh issues a new token and invalidates the previous token.
- Refresh-token reuse revokes the complete session family.
- Refresh tokens are hashed at rest.
- Refresh tokens are device-bound.
- Maximum active devices: 3.
- A fourth new device is blocked; existing devices are not silently removed.
- Admins can list and revoke active sessions.
- Logout revokes the server-side refresh session.
- Deleted/inactive users are rejected by auth middleware immediately.
- Password changes and admin password resets keep the current session active.

### Login abuse protection
- Failed login tracking by normalized account identifier hash, IP, and device.
- Account threshold: 5 failed attempts / 15 minutes.
- Device threshold: 10 failed attempts / 15 minutes.
- IP threshold: 20 failed attempts / 15 minutes.
- Login-abuse telemetry is retained for 30 days.
- Client IP uses the trusted Render reverse proxy configuration.

### Authorization
- Role authorization is checked against the current database role assignment.
- Job discovery is limited to admins or jobs assigned to the employee.
- Job history requires admin access or an assignment to the job.
- Job segment synchronization requires current job assignment.
- Offline time, segment, completion, part, and photo operations are scoped to the authenticated user.
- Business-critical offline timestamps are validated on the server.

### Account deletion
Employee deletion is a hard delete of the account and personal account data.
Historical business records remain and receive First Name + Last Initial plus an employee tech-type snapshot where applicable.
Historical user foreign keys are nullable and use ON DELETE SET NULL. Session/role records use ON DELETE CASCADE.

### Offline storage
Production native builds enable SQLCipher through the expo-sqlite config plugin.
The local database key is generated with native cryptographic randomness, stored in SecureStore, device-only, and never sent to the backend.
Expo Go does not support SQLCipher. Production/development builds must therefore be native builds with SQLCipher enabled.

### Photo security
- Photo uploads use short-lived presigned URLs.
- Upload URLs expire after 5 minutes.
- Only JPEG uploads are accepted.
- Photo uploads are capped at 15 MB.
- R2 objects remain private.
- Photo download URLs are issued only after backend authorization and expire after 5 minutes.
- R2 credentials remain server-side.

### Audit logging
Security and administrative actions are recorded in audit_events.
Logged examples include authentication events, logout, password changes/resets, refresh-token reuse, account deletion, role changes, device/session revocation, job assignment changes, and administrative job/completion changes.
Secrets, passwords, access tokens, and refresh tokens must never be written to audit metadata.

## Database migrations
- 016_refresh_token_security.sql
- 018_login_rate_limits.sql
- 019_audit_events.sql
- 020_offline_sync_server_timestamps.sql
- 021_photo_security.sql
- 022_hard_delete_history.sql

Run the normal backend migration command before deploying a backend version that uses these fields.

## Important release requirement
The mobile app SQLCipher configuration is not available in Expo Go. A native EAS/development build must be used to validate production storage encryption.

## Security limitation
No Internet-connected application can honestly guarantee zero compromise. The target is defense in depth: server-side authorization, short-lived credentials, rotating sessions, device controls, encrypted local storage, private object storage, auditability, and strict validation.
Before public release, perform an independent penetration test against the deployed API and production mobile build.