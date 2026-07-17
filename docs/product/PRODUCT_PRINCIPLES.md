# PRODUCT_PRINCIPLES.md — The DalyHub Product Handbook

> The product handbook. It explains **what** DalyHub is, **why** it exists, and **how it should feel** — the enduring product truths that outlast any single feature.
>
> This document guides *product* decisions. For *engineering* rules see [`AGENTS.md`](../../AGENTS.md); for *what to build next* see [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md); for *how it looks and behaves* see [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md).
>
> It deliberately avoids implementation detail. When a product question arises — "should this feature exist?", "how should this feel?" — the answer should be derivable from here.

---

## What DalyHub is

**DalyHub is a Personal Operating System — one calm place to run a whole life.**

It is the layer above task managers, note apps, calendars, and contact lists. Rather than being one more tool in a scattered stack, DalyHub is the coherent surface where the pieces of a life connect: your responsibilities, your intentions, your work, your people, your knowledge, and your reflection — all in one model, all cross-linked, all searchable, all yours.

It is a product for **one person running their life with intention**, not a team collaboration suite. Its ambition is depth, not breadth.

## Why it exists

Modern life is fragmented across tools that don't talk to each other. The cost isn't just annoyance — it's *incoherence*: you can't see whether your daily actions serve your actual goals, you lose the thread between a meeting and the work it created, you forget what matters to the people you care about, and reflection has nowhere to live.

DalyHub exists to make a life **legible and operable from one place** — to turn scattered activity into a system you can actually steer. It exists so that:

- nothing important is lost,
- everything is connected to everything it relates to,
- the gap between intention and action is visible, and
- an ordinary week can be run with calm instead of scramble.

## The philosophy behind the product

1. **The system is your memory.** DalyHub's first duty is to be the trustworthy place you put everything. Capture must be effortless; retrieval must be certain.
2. **Structure serves clarity.** The hierarchy exists to make life legible — never to create administrative overhead. Any structure that isn't earning clarity is removed.
3. **The value is in the links.** Lists are commodity. DalyHub's edge is that a task knows its project, a project knows its goal, a meeting knows its people, and a note knows what it's about. Connection is the product.
4. **Calm is a feature.** DalyHub reduces anxiety. No manufactured urgency, no attention traps, no guilt mechanics. It should feel like a quiet, well-ordered study — not a slot machine.
5. **You are always in control** — of your data, and especially of the AI, which proposes and never acts on its own.
6. **Consistency is kindness.** One design language means the product is learnable once and known everywhere.
7. **Your data is yours.** Portable formats, Markdown text, export always available. No lock-in, ever.

## How users should feel

DalyHub is a success when the user feels:

- **In control** — "I can see everything and steer it." The system never surprises them or acts behind their back.
- **Clear-headed** — "I know what matters today and why." The noise is filtered; the signal is obvious.
- **Calm** — "This lowers my stress instead of adding to it." Opening DalyHub is a relief, not a chore.
- **Trusting** — "If I put it here, it's safe and I'll find it." The system has earned reliance.
- **Capable** — "I can move fast." Power-user velocity through keyboard and command palette, without a manual.
- **Cared-for, and caring** — "This helps me show up for my people and my goals." The product reflects the user's better intentions back to them.

The feelings we actively design *against*: overwhelmed, nagged, guilty, boxed-in, watched.

---

## The entities

These are the nouns of DalyHub — the building blocks of the model. Every module is a lens onto some combination of them. Definitions here are semantic (what they *mean* to the user); the engineering model is in [`AGENTS.md §4`](../../AGENTS.md#4-the-area--goal--project--task-model) and [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md).

### Areas
The **ongoing domains of your life** — Health, Career, Home, Finances, Relationships. Areas are permanent and few. They don't get "completed"; they get *tended*. An Area is the answer to "which part of my life does this belong to?" Everything ultimately lives in an Area.

### Goals
The **outcomes you're aiming for** within an Area. A Goal has a direction and a definition of done ("run a half-marathon," "be debt-free," "ship the book"). Goals are optional — not all work needs one — but when present they give projects a *why* and let the system show whether your effort is moving what you said matters.

### Projects
**Finite bodies of work with a clear outcome.** A Project has a beginning and an end ("plan the trip," "renovate the kitchen," "12-week training block"). It may serve a Goal or sit directly in an Area. Projects are where sustained effort is organised.

### Tasks
The **atomic units of action** — the things you actually do. A Task is done or not done. It belongs to a Project, or floats in an Area as a one-off. Tasks are what fill your Today. Everything else exists to make sure the *right* tasks get done.

### Notes
**Markdown documents that hold what you know and think** — references, drafts, meeting notes, research, ideas. A Note can be linked to any entity, so knowledge lives next to the work it informs rather than in a separate silo. Notes are the knowledge layer of the OS.

### Meetings
**Time-bound interactions with people** — calls, one-on-ones, appointments. A Meeting records who was there, what was discussed and decided, and what it produced. Meetings are a primary *source* of tasks and notes: the system's job is to make sure nothing said in a room is lost.

### People
The **humans in your world** — colleagues, friends, family, contacts. A Person accumulates a timeline: meetings had, commitments made, things you've learned about them. People are woven through the whole product so DalyHub can help you *remember and show up*, not manage a pipeline. This is care, not CRM. (See [`AGENTS.md §5`](../../AGENTS.md#5-relationship-philosophy).)

### Assets
The **things of value you track** — physical (a car, equipment), digital (domains, accounts), or financial. An Asset carries its own metadata and history: warranties, renewals, maintenance, value over time. Assets are the "possessions and holdings" layer of a life.

### Diary
Your **daily narrative** — a dated log of what happened, how it felt, what you noticed. The Diary is the personal, reflective thread running through everything. It's private by nature and links to the day's meetings, tasks, and people without forcing structure onto the act of writing.

### Review
The **reflection ritual** — daily, weekly, monthly, quarterly cadences that operate *over* the whole system. Review is where you close loops: process what's captured, celebrate what's done, re-plan what's next, and check that daily action still matches stated goals. Review turns DalyHub from a passive store into a living practice.

### AI
The **assistant that helps you steer.** AI in DalyHub reads across the model and offers *proposals* — suggested tasks from a meeting, links you might have missed, a draft plan for a project, a summary for review. It never acts on its own; it makes the user faster and more thoughtful while leaving every decision with them. (See [`AGENTS.md §8`](../../AGENTS.md#8-ai-philosophy).)

---

## How these fit together (the shape of a day)

A concrete picture, to keep the abstractions honest:

> You have a **Meeting** with a colleague (**Person**). During it you capture notes and three follow-ups. DalyHub's **AI** proposes turning two of them into **Tasks** and one into a **Note**; you accept with an edit. The tasks attach to the **Project** they belong to, which serves a **Goal** in your Career **Area**. Tomorrow morning, **Today** shows you those tasks alongside everything else due; you knock them out. That evening your **Diary** entry links back to the day. On Sunday, **Review** shows the project moved forward and the goal is on track — and reminds you it's been a while since you spoke to that person.

Every arrow in that story is an **EntityLink**, and every change is written to a shared **Activity** timeline. That connectedness *is* DalyHub.

---

## Product principles for making decisions

When evaluating whether to build something, or how, apply these tests:

1. **Does it serve a life well-run, or just a demo?** Optimise for the user living with this for years.
2. **Does it add clarity or clutter?** If it doesn't make the whole more legible, it's probably debt.
3. **Does it reuse the shared language?** New one-off patterns fragment the product. Reuse first (see [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md)).
4. **Does it keep the user in control?** Especially of the AI and their data.
5. **Does it stay calm?** If it introduces urgency, guilt, or noise, redesign it.
6. **Is it connected?** A feature that produces islands of data works against the core value.

If a proposed feature fails these tests, the right answer is often *not to build it* — and that is a good product decision.

---

## Related documents

- [`AGENTS.md`](../../AGENTS.md) — the engineering & product constitution (this handbook's operational counterpart).
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — how these principles become sequenced work.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — how "how it should feel" becomes concrete patterns.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) — the products that inform this vision.
- [`docs/README.md`](../README.md) — full documentation index.
