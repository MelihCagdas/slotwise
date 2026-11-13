# Jira Sprint Calendar

See your Jira sprint tickets in Google Calendar, laid out across the days of the sprint.

One script, copied into your own Google account. No server, no app to install, nothing to tune. It reads Jira and never changes it.

```
            Mon        Tue        Wed        Thu        Fri
all day   [ APP-12 Login flow (3 pt)  ]
                                 [ APP-15 Fix export (1 pt) ]
                                            [ APP-9 Add audit log (2 pt)   ]
09:00       your meetings, untouched
```

## What it does

Every morning it:

1. Reads your open tickets in the active sprint.
2. Puts the work you have in progress first, then the rest in board order.
3. Gives each ticket a share of the remaining sprint days, based on its story points.
4. Draws each ticket as an all-day bar in a separate calendar called **Jira plan**.

The bars are marked "free", so they never block your time or show you as busy. Each bar links back to its ticket.

## Set up in 5 minutes

You need a Jira Cloud account and a Google account.

1. **Create a Jira API token.** Go to <https://id.atlassian.com/manage-profile/security/api-tokens>, choose **Create API token**, and copy it.
2. **Create the script.** Go to <https://script.google.com>, choose **New project**, delete the sample code, and paste in the whole of [`Code.gs`](Code.gs). Save.
3. **Add your details.** Open **Project Settings** (the gear icon), scroll to **Script Properties**, and add:

   | Property | Value |
   |---|---|
   | `JIRA_SITE` | Your Jira address, for example `your-team.atlassian.net` |
   | `JIRA_EMAIL` | The email you sign in to Jira with |
   | `JIRA_TOKEN` | The token from step 1 |

4. **Run it once.** Back in the editor, pick `setup` in the function list and press **Run**. Google asks for permission to manage your calendars and to contact Jira. Approve it.

Open Google Calendar. A new calendar called **Jira plan** now shows your tickets. It refreshes by itself every morning.

To refresh at any time, run `sync`.

## How it decides

- **Which tickets.** Tickets assigned to you, in an open sprint, that are not done.
- **Order.** Tickets in the status "In Progress" come first. Next come other started work, such as tickets in review. Last come tickets you have not started. Inside each group the order is your board's rank.
- **Size.** Story points, when your tickets have them. If none do, the original time estimate. If there is neither, every ticket counts the same. A ticket with no size gets the average of the others.
- **Spread.** Each ticket gets a share of the remaining working days equal to its share of the total size, rounded to whole days. A large ticket spans several days. Small tickets share a day. Everything always fits inside the sprint.
- **Days.** Monday to Friday. Days where you have an out-of-office event covering 09:00 to 17:00 are skipped.
- **No sprint.** If you have no open sprint, for example on a Kanban board, it takes your first 20 open tickets and spreads them over the next 10 working days.

Because the spread is proportional, there is no "hours per point" setting. It works the same whether your team treats a point as an hour or as a day.

Each morning it redraws from today forward. Earlier days are left as they were, so you keep a record of what was planned.

## Optional settings

Add any of these as Script Properties. None are required.

| Property | Default | What it does |
|---|---|---|
| `ACTIVE_STATUSES` | `In Progress` | Status names that go first. Separate several with commas. |
| `SKIP_STATUSES` | none | Status names to leave out, for example `Ready for QA`. |
| `WORKING_DAYS` | `1,2,3,4,5` | Working days as numbers, where 0 is Sunday and 6 is Saturday. |
| `RUN_HOUR` | `7` | Hour of the day for the daily refresh. Run `setup` again after changing it. |
| `POINTS_FIELD` | found automatically | The Jira field ID for story points, for example `customfield_10016`. Only needed if the wrong field is picked. |

## Remove it

Run `remove`. It deletes the daily timer and the **Jira plan** calendar. Nothing else in your calendar is touched. You can then delete the script project and revoke the Jira token.

## Privacy

The script runs inside your own Google account. Your Jira token is stored in your script's properties and is sent only to your Jira site. No data goes anywhere else.

## Limits

- Jira Cloud only. Jira Server and Data Center are not supported.
- Google Calendar only.
- Shows your own tickets only.
- It plans whole days. It does not schedule hours around your meetings.

## If something goes wrong

Open **Executions** in the script editor to see the last run. The message says what to check:

- "Check JIRA_EMAIL and JIRA_TOKEN": the email or token is wrong, or the token has expired.
- "Check JIRA_SITE": the Jira address is wrong.
- "Missing Script Properties": one of the three required values is not set.

When a run fails, the calendar is left exactly as it was.

## Development

The planning logic is plain JavaScript with no Google calls, so it can be tested with Node 20 or later:

```
npm test
```

[`DESIGN.md`](DESIGN.md) explains the design and the choices behind it.

## Licence

MIT. See [`LICENSE`](LICENSE).
