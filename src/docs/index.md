---
title: Reading the archive
---

# Reading the archive

This site is a rearrangement of [soundings](https://github.com/libraz/soundings), an
archive of measurements taken off hardware MIDI sound modules. The archive is written
by measurement stage — one directory per command that produced it — because that is
the order the work happens in. A reader arrives with an address instead, so the site
cuts the same records the other way: one page per address, gathered from every stage
that touched it.

Nothing is added in the process. Every figure on every page came out of a file in the
archive, and every page says which one.

## What a measurement is here

The archive records what one unit did, on one measurement path, on one day. It does
not transcribe specifications, and it does not generalise. Three consequences follow,
and they shape every page on this site.

**An address has no name.** `40 11 30` is not labelled "vibrato rate", because that
label would come from a document rather than from the instrument. What the site can
say is what was measured: that an NRPN was found to land there, that it accepts `00`
to `7F`, and that a struck note sounded different at the two ends of that range.

**An absence is not a negative.** An address the archive has nothing for is one no run
has reached. The site shows that as *not measured*, never as zero, blank, or absent
from the unit. The distinction matters most where a run stopped early. `40 40 00`
answers, the four addresses after it answer, and then the unit goes quiet. What the
archive holds for that block is a record of a run that stopped, not of a block that
ends.

**A finding belongs to a unit.** `roland-sc8850-01` is one SC-8850, identified in
[its own record](https://github.com/libraz/soundings/blob/main/data/units/roland-sc8850-01/meta.json).
Another unit of the same model may differ, and nothing here says otherwise.

## The four states

Colour on this site carries exactly four meanings, and no page introduces a fifth.

| State | What it means |
|---|---|
| **heard** | The parameter reached the signal path: two settings of it sounded different by more than the unit fails to repeat itself by. |
| **silent** | It was asked under a named stimulus and nothing came back. Read this as a fact about the question as much as about the address. |
| **refused** | The unit would not take the value, or would not answer the read. |
| **not measured** | No run has put the question. An absence in the archive, drawn hollow so it cannot be mistaken for a finding. |

## An address, field by field

**Power-on value** — what the address held immediately after a power cycle, before
anything but a read request had been sent.

**Accepts** — what the write probe found. The probe writes a ladder of values rather
than all 128 and reads each one back, so "5 of the 15 values written" is the honest
form: the unit accepted five of the fifteen it was given. The classification beside it
is one of four. *Accepts* takes the value verbatim. *Clamps* pulls an out-of-range
value to the nearest end. *Refuses out of range* leaves the address alone. *Unchanging*
means the address never moved at all, which makes a clamp and a refusal
indistinguishable from outside.

**Neighbours** — whether the addresses either side of it are separate addresses. It is
measured by giving a whole run different values before reading any of them back, which
is the only way to tell a store from a window. A window answers with whatever it was
given last, so writing and reading one address at a time makes every window look like a
store.

**Reached by** — which MIDI message was measured to land in this address. A control
change, an NRPN and a system-exclusive write can all reach the same byte. That an
address stores a message's value says where the value is kept; it does not say that
anything uses it.

**Resets** — what each of the unit's resets put back. The probe writes a mark into
every writable address first, so an address a reset leaves alone reads as the mark
rather than as its default.

**Heard** — whether two settings of the address changed the sound. Each verdict names
the stimulus it was reached under, because a null is a fact about the note as much as
about the parameter: a filter asked with a note that decays in a fifth of a second may
be inaudible there and plain under a sustained one.

## Blocks that hold nothing

Twelve blocks of the SC-8850 have no storage of their own. An address in one of them
is not a place a value is kept: reading or writing it reaches one of two drum setup
stores instead, whichever of the two was addressed last.

The catch is that the write points it there and the read follows. Write `7F` to such
an address, read it straight back, and it answers `7F` — so it passes every test for
being a store, while what actually happened is that `7F` went into a different block
and came back out of it. Address it again after touching the other store and the same
address answers something else, with nothing having been written to it.

The site marks those blocks wherever they appear. Anything a record says about an
address in them describes what is being reached through it.

## Stimulus names

Names like `struck`, `struck_vibrato` and `unpitched` are identifiers, not prose, and
they are not translated in any language on this site. What each one is — the note, the
velocity, how long it was held, what it can see and what it is blind to — is recorded
in the archive and shown beside it on the observations page.

## What is behind a measurement

A measurement says what a unit answered. It does not say what produced that answer, and
the archive keeps the two apart. A claim that a particular algorithm is behind a byte
lives under `inferences/` rather than under `data/`, because it can be wrong while every
figure it rests on is right.

Those claims are on each unit's algorithms page. Each one carries:

- how far identifying it has got
- what it rests on
- what would show it wrong
- the readings the same evidence still leaves standing

A claim is *identified* only where two things hold: the archive still stands behind it,
and its own verdict on the model built from it says that model reproduced what the unit
did. Everything else is *under investigation*, with the reason it is still open beside
it.

An implementation in C++ is published for an identified claim and for no other, and it
is generated from the model file rather than written by hand. [How an algorithm is
identified](/docs/identifying-an-algorithm) is the procedure behind all of that.

Each claim is headed by the name a published manual prints for the effect type it is
about — the one place on this site where something is called by a name rather than by
its address. That name is a statement a document makes, so it carries the edition and
the printed page, and it is never shown as though the unit had answered it.

## The emulator

The [emulator](/units/roland-sc8850-01/emulator) is a model of the unit's control
surface built from these same measurements and nothing else. Send it a message and it
answers the way the archive says the unit answered, including the ways it failed. Ask it
for 256 bytes and it stops responding until you power-cycle it, because that is what the
unit did.

Where the archive has nothing, the emulator says so instead of producing a plausible
reply. That restriction is the point of it. A model that filled its gaps in would be a
guess about the instrument wearing the archive's authority.
