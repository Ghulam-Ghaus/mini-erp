# Tips for building this project with Antigravity

(For you, not for the agent. Do not put this file in the agent's rules.)

## Setup

1. Create the project folder, run `git init`, and open that folder in Antigravity.
2. Copy `PROJECT_START.md` and `AGENTS.md` into the **root** of the folder.
3. Antigravity should pick up `AGENTS.md` as project rules. Antigravity's file names and settings can change between versions, so check its Rules / Customizations settings to confirm the file is loaded. If it isn't, add the same text as a workspace rule there.
4. Make your first commit before the agent writes anything, so you can always roll back.

## Prompting

- **One phase per conversation.** Start with: *"Read PROJECT_START.md and AGENTS.md. Start Phase N only. Give me a plan first."*
- **Plan first, code second.** Ask for the plan, read it, fix anything wrong, then say "go ahead". It is far cheaper to correct a plan than a codebase.
- **Be specific.** "Add batch close with actual output weight and recalculate cost per kg, with tests" works better than "finish batches".
- **Ask for tests first** on money, stock and ledger logic (Phases 4 to 7).
- **Quote the section.** Say "follow section 4.5c for returns" instead of re-explaining.
- When something is wrong, paste the **exact error message**, not a description.

## Keeping control

- Review the diff after each task. Pay special attention to anything touching `prisma/`, money calculations and stock.
- Commit after every working step (`git commit -m "phase 4: batch costing"`).
- Run the app yourself after each phase and click through it. Don't trust "it works" without testing.
- If the agent starts going in the wrong direction, stop it, `git restore .` (or revert) and re-prompt with clearer instructions rather than piling fixes on top.
- Don't let two agents or two chats edit the same files at the same time.
- Keep conversations short. When a chat gets long and the agent starts forgetting rules, start a new one with the same opening prompt.

## Database safety

- Use a **separate development database**. Never point development at real business data.
- Never let the agent run `prisma migrate reset` or drop tables unless you asked for it.
- Back up the dev database before big migrations.
- Keep `.env` out of git.

## Order of work that saves pain

1. Phase 0 and 1 (scaffold and the standard components): get these right and every later screen is fast.
2. Phase 2 (setup wizard, login, roles).
3. Phases 3 to 6 (purchases, batches, sales and returns, payments) are the core. Test the numbers by hand with a small example, such as your notebook's 1000 kg batch.
4. Phase 8 (printing) early enough to test Urdu fonts on a real printer.
5. Backup and restore: test a real restore well before the end.

## Checking the numbers (do this every time)

Use one tiny example and calculate it by hand:
- Buy 1000 kg at 50 = 50,000. Labour 4,000. Rent 1,000. Total cost 55,000.
- Wastage 20% gives 800 kg output, so cost per kg is 68.75.
- Sell 100 kg at 80 = 8,000. Cost is 6,875, profit is 1,125.
- Return 10 kg resaleable: stock goes up by 10 kg, sales go down by 800, cost goes down by 687.50.

If the app's numbers don't match yours exactly, stop and fix it before moving on.

## When you get stuck

- Ask the agent to explain what it just did in plain words.
- Ask it to list the assumptions it made.
- Bring the problem here with the error text or a screenshot and I'll help.
