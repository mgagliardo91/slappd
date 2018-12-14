# Slappd

AWS lambda used to send slack notifications from untappd checkins.

This lambda works by storing the last known `checkinId` and using this ID to request new checkins for each invocation. The `checkinId` will be stored in a file in S3 `slappd/LastSeenID.txt` and updated with each run.

# Setup

This lambda function runs off of a few different environmental variables:

- UNTAPPD_ID: Untappd API id for the account
- UNTAPPD_SECRET: Untappd API secret for the account
- UNTAPPD_TOKEN: Untappd API token for the account
- SLACK_TOKEN: Slack API app slug _format (TXXXXXXXX/BXXXXXXXX/TXXXXXXXXXXXXXXXXXXXXXXX)
- USERS: Comma-separated list of usernames (lowercase) the lambda should process

1. Clone this repo
2. Create a AWS lambda and give it a role that has permission to access S3
3. Run `npm install` to create a bundle. Create a zip containing `index.js` and `node_modules`
4. Upload the zip to the lambda config
5. Add the above env variables to the lambda
6. Set a trigger. I used a CloudWatchEvent `rate()` trigger
