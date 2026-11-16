# Moderation and account requests

Google Play expects apps with chat and user uploads to act on reports. This page covers the day-to-day work.

## Make yourself a moderator

1. Sign in to Groups & chat with the account you'll moderate from.
2. Find your account ID by opening `/api/community/me` in the same browser. Copy `user.id`, which looks like `chatgpt:…` or `email:…`.
3. In the Worker's runtime settings, set `MODERATOR_IDS` to that ID. For several moderators, separate the IDs with commas. Then redeploy.
4. Reload Groups & chat. A **Review reports** button appears on the home screen.

For local testing, run `MODERATOR_IDS=chatgpt:local-mod PORT=3120 node scripts/community-local.mjs`. Then sign in with the cookie `community-local-user=mod`.

## Handling a report

Each card shows:

- What was reported, with a copy of the content as it was when reported
- The reason and the reporter's note
- How many people reported the same thing

Choose one action:

| Action | Effect |
| --- | --- |
| **Remove** | Deletes the message, removes the photo, cancels the game, or hides the court listing. Hiding a court also cancels its upcoming games, and their players are alerted. |
| **Remove & suspend** | Removes the content, then suspends its author. They can still read, leave groups and delete their account, but can't post, host, join or add courts. |
| **Suspend player** | For reports about a player rather than a single item. |
| **Dismiss** | Closes the report without changes. |

Any action resolves every open report on the same item. The **Resolved** tab keeps a history.

To restore a suspended player, send `POST /api/community/moderation/users/<id>` with `{"suspended":false}` from a moderator session.

If a report describes a threat to someone's safety or the exploitation of a child, don't stop at removing the content. Report it to the authorities. For child sexual abuse material, report it to NCMEC (CyberTipline).

## Account deletion requests by email

The deletion page tells people who can't sign in to email `SUPPORT_EMAIL`.

1. Confirm the request comes from the account owner. For example, reply to the email address on the account, or ask for a detail only they would know, such as a group they're in.
2. Ask them to delete the account in the app if they can. If they can't, find their account ID in the D1 console:

   ```sql
   SELECT id, name FROM community_profiles WHERE name LIKE '%Jordan%';
   ```

   Then, from your moderator session, send `DELETE /api/community/moderation/users/<url-encoded id>` with the JSON body `{"confirm":"DELETE"}`. This runs the same full deletion as the in-app button.
3. Email sign-in only: delete the user from Supabase's **Authentication → Users** within 30 days, as the deletion page promises.
4. Reply to confirm the deletion is done.
