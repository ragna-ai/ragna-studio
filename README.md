# Ragna Studio

## Purpose and status

A personal showcase project: it demonstrates AI capabilities (agents, chat, workflows, image generation) and the author's engineering skills. It currently has a single user, the author. Whether it ever ships to real production is open.

Consequences for decisions in this repo:

- No backward compatibility concerns. Breaking schema or API changes are fine.
- Clean architecture is non-negotiable; it is part of what the project showcases.
- Production concerns like quotas, billing, and multi-tenancy follow a "design for it, ship it later" rule: designs must not paint the app into a corner on these, but building them is deferred until needed.
- External-service constraints that only bite at scale or on public launch (e.g. OAuth app verification for restricted scopes) can be deferred: testing-mode limits are acceptable.

## Usage

pnpm gen package # interactive
pnpm gen package --args my-pkg "desc" # non-interactive
