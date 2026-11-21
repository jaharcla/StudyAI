# Contributing to StudyAI

Thanks for being here. Small, well-described changes are very welcome — you do not need to know the whole codebase to help.

## Get it running

The README has the local setup commands. If anything is unclear, open an issue and ask; that's a useful contribution too.

A normal clone is about 50 MB. StudyAI downloads no models or data as part of a clone; those are created locally under the gitignored `data/` directory. Upstream source archives used for reference are also gitignored and stay on your machine — please don't commit them.

## Pick something to work on

Look for issues labelled `good first issue` and comment on one before you start, so two people don't do the same thing. If you have an idea that isn't an issue yet, open one and we'll talk it through.

## Send a change

Fork the repo, make a branch, run `npm run verify`, then open a pull request describing what changed and why. If you can't run everything, say so — we'll figure it out together. Imperfect English is completely fine.

## What to expect

A welcome reply and a first-PR response within a day. Review is about making the change work, not about testing you.

## Boundaries

StudyAI is single-user and runs on your machine; AI features may use local models or cloud providers you configure. There is no hosted multi-user service. Please don't put study data, API keys, or personal file paths in issues or pull requests.
