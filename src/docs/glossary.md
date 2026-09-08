---
title: Glossary
---

# Glossary

Terms as this archive uses them. Where a word is also a general MIDI term, the entry
says what it means *here*, which is sometimes narrower.

## Address

Three seven-bit bytes identifying one byte of the unit's parameter space, written
`40 11 30`. Every byte is seven bits wide, so an offset carries at `80` and not at
`100`: the address after `40 11 7F` is `40 12 00`.

## Region

A run of addresses the unit answered a single read at, given by its start address and
its size. Regions come from the sweep, which asked the whole address space; this
archive's SC-8850 has 854 of them.

## Block

The first two bytes of an address, e.g. `40 11`. The site shards its data by block,
so looking up one address fetches only the addresses that share its first two bytes.

## Bank

The top byte of an address, e.g. `40`. Nineteen of them answer on this unit.

## RQ1 / DT1

The two Roland system-exclusive messages this archive uses. RQ1 asks for a run of
bytes at an address; DT1 writes one. Both carry a checksum over the address and the
data.

## Sweep

The stage that maps which addresses answer at all, and what they held when asked.
Two independent sweeps that agree byte for byte are what makes the map trustworthy.

## Boundary

The stage that asks whether a region stops where the map says it does, by reading one
byte past its end and on forward while anything answers.

## Write probe

The stage that measures what an address accepts: a ladder of values written one at a
time, each read back, and the original put back afterwards. Its four verdicts are
*accepts*, *clamps*, *refuses out of range*, and *unchanging*.

## Hold probe

The stage that measures whether neighbouring addresses are separate addresses, by
giving a whole run different values before reading any of them back. This is what a
probe writing and reading one address at a time cannot do.

## Window

A block with no storage of its own: reading or writing an address in it reaches an
address in another block instead. Because the write points it there and the read
follows, such an address answers with whatever it was last given and passes every
test for being a store. It can only be told from one by writing to several addresses
before reading any of them back.

## Alias

A MIDI message measured to land in a particular address. A control change, an NRPN and
a DT1 write can be three routes to one byte. An alias says where a value is kept, not
that anything uses it.

## Stimulus

A named note, with its program, pitch, velocity and hold time, used to ask whether a
parameter changes the sound. Every audible verdict names the stimulus it was reached
under, because a null is a fact about the note as much as about the parameter.
Stimulus names are identifiers and are not translated.

## Repeatability

How closely two takes of one setting agree. Every audible verdict is read against it:
a change between two settings has to clear, by a margin, the difference two takes of
one setting already show, so a unit that repeats badly cannot be read as a parameter
that does something.

## Audible

That a parameter reached the signal path — two settings sounded different by more than
the repeatability figure allows. Not that it is useful, not that it is what the
parameter is for.

## Superseded

A verdict a later record replaced, usually because the address had to be asked a
second way. Both are kept and the site shows both, with the superseded one dimmed.

## Insertion effect

An effect placed in a part's signal path, selected by writing a two-byte type number.
This unit accepted 65 of the 16,384 type numbers it was offered.

## Map select

One of the alternative tone maps a bank-select LSB chooses between. The same bank and
program under a different map select can be a different tone.
