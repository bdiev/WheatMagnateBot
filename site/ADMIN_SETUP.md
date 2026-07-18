# Secure site administrator setup

Public registration always creates an account with `role=user` and `status=pending`. A username never grants administrator access by itself.

## Bootstrap at server startup

Set both variables in the server environment:

```dotenv
SITE_ADMIN_USERNAME=site-owner
SITE_ADMIN_PASSWORD=
```

Supply a strong password through the hosting platform's secret manager, then start the site. Startup creates the account if it does not exist or refreshes the configured administrator's password and keeps it approved. If either variable is missing, no administrator is created or promoted.

After the first successful bootstrap, both variables may be removed together. The existing administrator remains unchanged. Never commit their values.

## Local CLI

The CLI reads the database connection from the root `.env` and takes the password from the temporary `SITE_ADMIN_CLI_PASSWORD` environment variable. The password is intentionally not accepted as a command-line argument.

PowerShell example:

```powershell
$credential = Get-Credential -UserName 'site-owner' -Message 'New site administrator'
$env:SITE_ADMIN_CLI_PASSWORD = $credential.GetNetworkCredential().Password
node site/scripts/create-admin.js --username $credential.UserName
Remove-Item Env:SITE_ADMIN_CLI_PASSWORD
```

Apply the default-only migration explicitly when deployments do not run the server's table bootstrap:

```powershell
psql $env:DATABASE_URL -f site/migrations/001_secure_registration_defaults.sql
```

The migration does not modify existing account roles or statuses. Existing approved users remain approved. Existing administrators cannot be deleted or demoted through the public admin API.
