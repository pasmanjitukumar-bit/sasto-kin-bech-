# Phone OTP activation (not yet activated)

Code is ready; no provider account, token, Supabase dashboard access or real SMS test has been supplied. Do not enable the availability flag before completing this setup.

## Provider information
This adapter uses Twilio. Obtain Account SID, Auth Token and Messaging Service SID. Confirm Nepal (+977) delivery, permitted sender, geographical permissions, funded balance, per-message price and any required sender registration directly with the provider. Never paste tokens or received OTPs into chat or Git.

## Server secret environment
Supabase Dashboard → Edge Functions → Secrets: enter `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `SEND_SMS_HOOK_SECRET`. These are server environment variables for the SMS function, not Vercel public variables. Do not use a NEXT_PUBLIC_ prefix.

Deploy `supabase/functions/send-sms` as an Edge Function with JWT verification disabled for this hook only; the function independently verifies Supabase's signed webhook with standardwebhooks. Configure Authentication → Hooks → Send SMS → HTTPS endpoint `https://viowxacragkwuczogyxf.supabase.co/functions/v1/send-sms`. Generate the hook signing secret and enter the matching value into SEND_SMS_HOOK_SECRET. Enabling this hook replaces the default SMS sender. Never expose it as an unsigned send-SMS endpoint.

Authentication → Sign In / Providers → Phone: enable phone sign-in, require phone confirmation, OTP length 6 and OTP expiry 300 seconds. Do not set automatic phone confirmation or production test codes. Authentication → Rate Limits: set SMS resend interval 60 seconds, initial project SMS send cap 30/hour and verification limit appropriate for expected traffic (start at 10/hour/IP). Read the dashboard's actual supported settings. These server limits, expiry and verification are authoritative; browser counters only improve usability. Enable CAPTCHA before broad public SMS rollout to reduce paid SMS abuse.

After configuration and a successful private test, Vercel → Project → Settings → Environment Variables: set `SMS_LOGIN_ENABLED=true` for Production and redeploy. This flag contains no token and only controls UI availability. Leave false until ready.

## Required real mobile test
Owner signs in to Supabase and enters credentials privately. On the website enter the owner's consented Nepal phone, request one SMS, and enter its code directly on the website. Verify successful session, wrong code rejection, expiry after 5 minutes, repeat-send blocking within 60 seconds, server rate-limit enforcement and invalid phone rejection. Reusing a redeemed OTP must fail. Check provider delivery logs without copying codes/tokens. No real-device test has yet occurred.

Official references: https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook and https://supabase.com/docs/guides/auth/rate-limits
