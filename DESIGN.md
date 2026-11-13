# Jira sprint on Google Calendar — design

Working name: `jira-sprint-calendar`. Date: 2026-11-13. Status: approved 2026-11-13.

## Intent

Anyone who uses Jira and Google Calendar can copy one script and see their
sprint tickets laid out across the days of the sprint in their calendar.
No server, no app, no account with us, nothing to tune.

## Goals

- Works for a stranger in about five minutes, with no settings they must understand.
- Shows the user's own open sprint tickets as all-day bars across the remaining
  sprint days: work in progress now, the rest on the following days.
- Uses the effort Jira already holds. When Jira holds none, still gives a
  sensible rough spread.
- Never touches the user's own calendar events.

## Not in the first version

- Jira Server / Data Center (Jira Cloud only).
- Outlook, Apple Calendar.
- Writing anything back to Jira.
- Team or manager views. Each person plans their own tickets.
- Hour-level scheduling around meetings.

## What would make it a failure

- It needs per-team calibration (hours per point, velocity) before it is useful.
- It edits, moves or deletes an event the user created.
- Setup needs a Google Cloud project, a server, or a paid service.

## Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| Plugin for an AI assistant | Least code, no tokens; only for people who use that assistant | Rejected: must work for everyone |
| **Google Apps Script** | Runs in the user's own Google account, daily timer, calendar access built in; user creates one Jira API token | **Chosen** |
| Command-line tool | Flexible; each user must set up their own Google sign-in project | Rejected: too much setup |
| Hosted calendar feed or Marketplace add-on | Smoothest install; needs hosting, review and upkeep | Rejected: not "less is more" |

## How it works

### Setup (once)

1. Copy the script into a new Apps Script project (README gives the link and steps).
2. Enter three values in Script Properties: Jira site address, Jira email, Jira API token.
3. Run `setup` once and approve Google's permission prompt. This creates the
   "Jira plan" calendar and a daily morning timer.

### Each run

1. **Read.** Fetch issues where assignee is the user, sprint is open, and the
   status category is not Done. Take key, summary, status, status category,
   rank, effort fields, and the sprint end date.
2. **Order.** Three groups, each in Jira board rank order:
   1. tickets whose status name is in the "active" list (default: "In Progress"),
   2. other tickets in the status category "In Progress" (review, QA and similar),
   3. tickets in the status category "To Do".
3. **Weigh.** One unit is chosen for the whole set, so points and hours are
   never mixed:
   1. if any ticket has story points, use story points;
   2. else if any ticket has an original time estimate, use that;
   3. else every ticket weighs 1 (equal spread).
   A ticket without a value in the chosen unit gets the average of the
   tickets that have one.
4. **Spread.** Count the working days from today to the sprint end. Lay the
   tickets end to end along those days, each taking a share of the days equal
   to its share of the total weight. Each bar is then snapped to whole days:
   start and end are rounded to the nearest day boundary, and a ticket that
   rounds to nothing takes one day at its rounded start. Small tickets share a
   day and large ones span several. Everything always fits; there is no
   overflow and no velocity setting.
   Worked example (5 days, weights 3, 1.5, 1.5, 2, 1, 0.5, 1, 1, 2 in order):
   Mon 1 ticket, Tue 1, Wed 2, Thu 2, Fri 3.
5. **Write.** In the "Jira plan" calendar, delete the tool's own events (it tags them) from today
   forward and create the new all-day events. Title: `KEY summary (N pt)`.
   Description: link to the ticket and its status. Events are marked "free"
   and have no reminders, so they never block the user's time. Group 1 uses
   a stronger colour than groups 2 and 3.

Past days are left alone, so they stay as a record of what was planned.

### Rules

- Working days are Monday to Friday by default. Days where an out-of-office
  event covers 09:00 to 17:00 are skipped.
- If the user has no open sprint (for example a Kanban board), take their
  first 20 open tickets by rank and spread them over the next 10 working days.
- If Jira cannot be reached, change nothing and log the error. Never leave the
  calendar half-written.
- The Jira token lives in Script Properties, never in the code.

### Optional settings (all have defaults)

- Working days.
- The "active" status names that go first (default: "In Progress").
- Statuses to leave out (for example a "Ready to QA" status that Jira counts
  as in progress but is no longer the user's work).
- Run time of the daily timer.
- Name of the story points field, only if auto-detection picks wrong.

## Repository

- `Code.gs` — the whole tool, one file.
- `README.md` — what it does, a sketch, the five-minute setup, the settings, how to remove it.
- `LICENSE` — MIT.

## Left to the builder

- Auto-detecting the sprint and story points fields from Jira's field list
  (sites can have both "Story Points" and "Story point estimate"; use
  whichever holds a value on the ticket).
- Paging through Jira results.
- How to test the spread logic outside Apps Script (it should be a pure
  function of tickets, dates and settings).

## My calls, for review

- All-day bars, not timed blocks.
- Proportional spread instead of a points-per-day rate.
- "To Do" tickets are ordered by board rank, not by status name, so the tool
  needs no knowledge of a team's status names.
- A separate "Jira plan" calendar instead of writing into the main one.
