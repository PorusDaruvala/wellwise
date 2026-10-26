# WhatsApp setup: sign-in and messaging

One Meta setup turns on all of Wellwise's WhatsApp features:
- **sign-in:** people send `SIGNIN 123456` to Wellwise's number
- **two-way messaging:** people send links, photos, documents or a few words, and get a tip back
- **tips sent to WhatsApp:** daily tips, calendar tips and near-you tips

Wellwise address used below: `https://wellwise-production.up.railway.app`

Meta's own guides: [Get started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) · [Access tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/) · [Webhooks test endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/set-up-whatsapp-echo-bot) · [Phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers) · [Register a number](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration) · [Templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) · [Template review](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review/)

Meta changes its screens often, so button names may differ slightly from what is written here.

---

## Part A · Free test setup (you plus up to 4 testers, about 30 minutes)

### 1. Developer account
1. Go to https://developers.facebook.com and log in with your Facebook account.
2. If asked, register as a developer and confirm your phone or email.

### 2. Create the app
1. Go to https://developers.facebook.com/apps and choose **Create app**.
2. For the use case, choose the WhatsApp one ("Connect with customers through WhatsApp"). If it isn't listed, choose **Other**, then **Business**.
3. Name it **Wellwise**. When asked for a business portfolio, create one called **Wellwise**. It's free.
4. Finish creating the app.

### 3. Get the test number's details
1. In the app's left menu, open **WhatsApp → API Setup**.
2. Meta has given you a **test phone number**. Copy these:
   - **Phone number ID**, which becomes `WHATSAPP_PHONE_NUMBER_ID`
   - the **test number** itself, for example `+1 555 …`, which becomes `WHATSAPP_DISPLAY_NUMBER`
   - **WhatsApp Business Account ID**, which you'll need in Part B

### 4. Add your testers' numbers
1. Under **To**, choose **Manage phone number list**.
2. Add your own WhatsApp number and up to 4 testers' numbers. Each person gets a code on WhatsApp to confirm.

The test number can only message the numbers on this list.

### 5. Make a permanent access token
The token on the API Setup page expires within a day, so make a permanent one ([Meta's guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/)).
1. Go to https://business.facebook.com/settings/system-users and choose **Add**. Name it `wellwise-server`, with the **Admin** role.
2. Choose **Assign assets**:
   - **Apps:** Wellwise, with **Full control**
   - **WhatsApp accounts:** your test WhatsApp account, with **Full control**
3. Choose **Generate token**:
   - App: **Wellwise**
   - Expiry: **Never**
   - Permissions: `whatsapp_business_messaging`, `whatsapp_business_management` and `business_management`
4. Copy the token. It becomes `WHATSAPP_TOKEN`.
5. Optional check: paste it into https://developers.facebook.com/tools/debug/accesstoken/ and confirm both `whatsapp_…` permissions are listed.

### 6. Copy the app secret
In the app dashboard, go to **App settings → Basic → App secret → Show**. Copy it. It becomes `WHATSAPP_APP_SECRET`, which lets Wellwise check that messages really come from Meta.

### 7. Choose a verify token
Make up any random string, for example by running `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`. It becomes `WHATSAPP_VERIFY_TOKEN`.

### 8. Add the values to Railway
In Railway, go to the service's **Variables** and add:

| Variable | Value |
|---|---|
| `WHATSAPP_TOKEN` | from step 5 |
| `WHATSAPP_PHONE_NUMBER_ID` | from step 3 |
| `WHATSAPP_DISPLAY_NUMBER` | the test number, for example `+1 555 123 4567` |
| `WHATSAPP_APP_SECRET` | from step 6 |
| `WHATSAPP_VERIFY_TOKEN` | from step 7 |

Wait until Railway shows the new deployment as **Active**. Meta checks the webhook address in the next step, so the server must be up first.

### 9. Connect Meta's webhook to Wellwise
1. In the app dashboard, go to **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL:** `https://wellwise-production.up.railway.app/webhooks/whatsapp`
3. **Verify token:** the same string as in step 7.
4. Choose **Verify and save**. If it fails, Railway hasn't finished deploying, or the two verify tokens don't match.
5. Under **Webhook fields**, choose **Manage**, and subscribe to **messages**.

### 10. Try it
1. **Sign in:** open Wellwise → **Settings → Your account → Sign in with WhatsApp**, tap **Open WhatsApp**, and send the `SIGNIN …` message. The Wellwise page signs you in by itself.
2. **Messaging:** in WhatsApp, send the Wellwise number a product link, a photo of a label, or "I'm not sleeping well". A tip comes back.
3. **Tips to WhatsApp:** in Wellwise → **Inbox**, set **Where** to **WhatsApp**.

**The 24-hour rule:** WhatsApp allows free-form messages only within 24 hours of the person's last message to Wellwise. A daily tip that comes later needs an approved template (Part C). Until then, it still arrives in the app and as a phone notification.

---

## Part B · A real number, for more testers

1. **Get a number that isn't on WhatsApp,** such as a new SIM or a virtual number that can receive an SMS or call. Your personal number can't be used unless you remove WhatsApp from it.
2. **Add it:** go to **WhatsApp → API Setup → Add phone number**. Enter the display name **Wellwise**, which Meta reviews, and confirm the SMS or voice code.
3. **Register it for the Cloud API** with a 6-digit PIN you choose ([Meta's guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration)):
   ```bash
   curl -X POST "https://graph.facebook.com/v25.0/PHONE_NUMBER_ID/register" -H "Authorization: Bearer WHATSAPP_TOKEN" -H "Content-Type: application/json" -d "{\"messaging_product\":\"whatsapp\",\"pin\":\"123456\"}"
   ```
4. **Give the system user access, and subscribe the app:**
   1. In https://business.facebook.com/settings/system-users, assign the number's WhatsApp account to `wellwise-server`.
   2. Subscribe the app to that account:
   ```bash
   curl -X POST "https://graph.facebook.com/v25.0/WHATSAPP_BUSINESS_ACCOUNT_ID/subscribed_apps" -H "Authorization: Bearer WHATSAPP_TOKEN"
   ```
5. **Add a payment method** in WhatsApp Manager (https://business.facebook.com/wa/manage/). Templates are charged per message.
6. **Update Railway:** change `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_DISPLAY_NUMBER` to the new number.
7. **Verify the business** in **Business settings → Security Center → Start verification** (https://business.facebook.com/settings/security). This lifts the limit on how many people you can message each day, and the cap on numbers, from 2 to 20.
8. **Publish the app:** if messages from people outside your tester list don't arrive, switch the app to **Live** at the top of the app dashboard. Meta asks for a privacy policy link for this, which Wellwise doesn't have yet.

---

## Part C · A template, so daily tips reach WhatsApp at any time

1. Go to **WhatsApp Manager → Message templates → Create template** (https://business.facebook.com/wa/manage/message-templates/).
2. **Category:** Marketing. Daily tips aren't transactions, so Meta would likely reclassify them from Utility anyway.
3. **Name:** `wellwise_tip`. **Language:** English.
4. **Body.** It must not start or end with a variable, and the variables must be in order ([template review](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review/)):
   ```
   Your Wellwise tip: {{1}}. Try this: {{2}}. Read more: {{3}} Reply STOP to stop these messages.
   ```
   Wellwise fills `{{1}}` with the tip title, `{{2}}` with the action and `{{3}}` with the link. Give sample values for each, then **Submit**. Approval can take up to 24 hours.
5. **In Railway,** set `WHATSAPP_TEMPLATE` to `wellwise_tip`. If the template's language code is not `en` (for example `en_US`), also set `WHATSAPP_TEMPLATE_LANG` to that code.

Marketing messages are charged per delivered message, by country. Industry estimates put them at roughly $0.01–0.02 in India, $0.025 in the US and $0.06 in the UK.
