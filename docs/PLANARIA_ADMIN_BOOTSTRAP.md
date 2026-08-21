# Planaria first-admin bootstrap

Planaria has no public admin registration. Normal Supabase signup always
creates the server-owned `user` role. Once production deployment is separately
authorized, an operator may create the first `super_admin` exactly once through
`planaria-admin-bootstrap`.

## Preconditions

1. Apply the version-controlled migrations and deploy the Edge Function from
   this repository.
2. Store a random value of at least 32 characters as the backend-only
   `PLANARIA_ADMIN_BOOTSTRAP_TOKEN` secret. Do not use a desktop/renderer
   environment variable or commit the value.
3. Confirm there is currently no `admin` or `super_admin`. The database repeats
   this check under an advisory lock, so the instruction is not the security
   boundary.

From a trusted operator PowerShell session, keep the token and password in
memory and send them directly to the Edge endpoint:

```powershell
$bootstrapToken = Read-Host 'One-time bootstrap token'
$securePassword = Read-Host 'Initial admin password' -AsSecureString
$credential = [System.Net.NetworkCredential]::new('', $securePassword)
$headers = @{ 'x-planaria-bootstrap-token' = $bootstrapToken }
$body = @{
  email = 'admin@example.com'
  username = 'initial.admin'
  password = $credential.Password
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://PROJECT.supabase.co/functions/v1/planaria-admin-bootstrap' -Headers $headers -ContentType 'application/json' -Body $body
$bootstrapToken = $null
$securePassword = $null
$credential = $null
$body = $null
```

The function creates the Auth user with the server-only Admin API, then calls
the atomic zero-admin bootstrap RPC. If another admin already exists or the RPC
fails, the newly created Auth user is removed. Revoke/delete the bootstrap
secret immediately after success. Later admins are created from Planaria by a
`super_admin` or an admin with the private `can_manage_admins` permission and
receive only the `admin` role.

Never put the backend secret key, service-role key, bootstrap token, or an
administrator password in Git, renderer storage, logs, analytics, screenshots,
or support bundles.
