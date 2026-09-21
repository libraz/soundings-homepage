---
title: How an algorithm is identified
---

# How an algorithm is identified

Everything else on this site is a rearrangement of what a unit answered. This page is
about the one thing that is not: the claim that a particular algorithm is behind those
answers. That claim is made in the archive, under `inferences/`, and it is a different
kind of record from a measurement. A measurement is wrong only if the rig was. A claim
here can be wrong while every figure it rests on is right.

So it is made under a procedure, and the procedure is the reason the site is willing to
publish an implementation of one. What follows is that procedure, in the order it
happens.

## 1. A class, and a catalogue of what it could be

A byte is not approached alone. It is put in a class — a phaser, a delay time, a filter
section, a modulation rate — and the class carries a catalogue of readings it could
have, written before any of them is scored.

The catalogue is bounded by what was buildable when the unit was built. A part running
its effects on a fixed-point DSP below the converter's rate can afford eight all-pass
sections and cannot afford eight biquads, and one coefficient moving every section
costs what a coefficient per section does not. That reasoning is recorded as an *era
prior*, and every prior carries the thing that would make it wrong. A prior that cannot
be stated together with its refutation is not recorded as a prior at all.

Writing the catalogue first is what stops the last step from being circular: a model
only ever compared against itself always wins. There are three ways a fit can pass
without being right, and that is the first. The other two are how the comparison set is
chosen (step 3) and how the rival candidate is chosen (step 4).

## 2. A model is a file, not code

A candidate becomes a *model*: a small declarative file. It names the chain, the rate it
runs at, and one map per parameter byte — a table, a window, a set of states, or a
handful of read settings interpolated between. Nothing in it is a program. It holds the
figures and the structure and nothing else, which is what lets the same file be
rendered, drawn as a curve, and printed as code without the three drifting apart.

Every map says where it was read from, and whether what it holds is a law or a readout.
A corner fitted per setting from that setting's own notches is a readout: what is being
claimed is the section count and the rate, and the corner's own figure is that reading's
rounding error.

## 3. Rendering it, and reading it back the same way

The model is rendered and the rendering is read through the same pipeline the unit's own
takes were read through.

**Waveforms are never compared.** Two clocks drift by tens of parts per million over a
take, and the coherence between two recordings of one setting has already been measured
collapsing by two kilohertz. What is compared is the quantities the archive publishes —
band profiles, notch positions, arrival times — on both sides.

**The comparison set is generated, not chosen.** It is every published reading for that
type, taken from the archive's own index. Choosing which records a model is scored
against is the second way a fit passes without being right, and a record left out has
to be named with the reason it was left out.

## 4. Four gates, and no threshold on the residual

The residual is reported and, between the gross gate and the noise floor, never
optimised: driving it down measures the room and the converters rather than the model,
and no candidate passes or fails on it. What decides are four gates.

**The gross gate** asks the residual against the span the effect itself commands over
the tested range. That is scale-free, so no absolute decibel figure has to be invented
and the gate calibrates itself per class. Failing it fails the model whatever the other
three say.

**The qualitative gate** asks whether the model's readings have the properties the
unit's readings have. No arithmetic over a residual rescues a model that stands still
where the unit modulates, or cuts where the unit boosts.

**The power gate** runs the strongest competing candidate in the catalogue over the same
comparison set and asks how far behind it came. The rival is not chosen: it is whichever
candidate scored second, so a straw man cannot be put up in its place. That is the third
way a fit passes without being right. A class holding one candidate is a catalogue that
is unfinished, and that is a finding rather than a pass.

**The breakdown gate** asks where the model stops following the unit. A model tested only
in the middle of a byte's range has no claim on its ends, and the ends are where a model
breaks.

A person may also listen to the two. That is recorded as what it is, and it is used to
fail a model and never to pass one. A verdict of *similar* guarantees nothing; a verdict
of *obviously different* holds whatever the figures did.

## 5. The verdict, and what is still standing beside it

The gates come to a verdict, and the verdict is the archive's word rather than a figure
this site works out. Two verdicts close a claim: `reproduces` and `equivalent under this
test`. Four leave it open — `breaks down`, `domain too narrow`, `candidates too few` and
`rejected` — and each names the one thing that would move it.

`equivalent under this test` is not an open question. It says the test does not separate
two readings — stated plainly so that anyone downstream can pick either and know that is
what they are doing.

Every reading the same evidence still leaves standing is listed beside the claim. Where
one could be told from the claim, the measurement that would do so is computed rather
than proposed: an observable where the two predict different things by more than this
rig resolves there, with the margin written down. A measurement whose margin is below
one could not have answered, so it is not queued. A run that could not have answered is
the negative this project already refuses to publish.

## 6. Three rounds, then the claim is parked

A model may be revised three times. Past that the claim is parked with what is missing,
so that one effect type cannot absorb the project. A parked claim stays open and stops
consuming rounds.

A claim that turns out wrong is retracted, not corrected, and it carries the list of
other claims resting on it so that retracting one is a bounded operation rather than a
search.

**A claim holds what it is called apart from what it says.** The name is the first part
to be retracted: calling one type a comb cost four readings and a quantity of device
time before a printed page said it was a filter. Dropping the name must not drop the
structural claim under it.

## What this site does with all that

Two levels, both read off the archive and neither worked out here.

**Identified** means the archive still stands behind the claim *and* its own verdict on
the rendered model says the model reproduced what the unit did. Both are needed, because
the two fail apart: a claim can stand on its evidence while the model built for it was
rejected outright.

**Under investigation** is everything else, with the reason it is still open printed
beside it.

**Identified is a statement about one comparison, not a grade of accuracy.** It says a
model was rendered, read back through the pipeline the unit's takes were read through,
and matched them within the gates listed beside it — and that rival candidates were run
and lost. It does not say the claim is finished: the archive prints what a claim does not
settle, and most identified ones carry that list. It does not say the residual is
inaudible, because no gate here is a perceptual one; worst-case residuals of several
decibels sit beside median ones of a tenth, and where a residual is small the reason is
often that the rig resolves three orders finer than the thing being identified. And it
does not say the bytes agree exactly — though on this kind of unit that is reachable
rather than fanciful, because what is behind these bytes is arithmetic on a fixed-point
clock rather than a continuous circuit. One claim here returns the reading's own value at
five hundred and fifty-two of six hundred and sixty settings. There is no level above
identified today, and nothing on this site should be read as claiming one.

**An implementation is published for an identified claim and for no other.** Printing a
rejected model as C++ would publish an algorithm the archive refused, in the form a
reader is most likely to take away and compile.

The implementation is generated from the model file rather than written by hand, so a
model the archive revises is a code example that changes with it. Every constant, every
section count and every structural choice in it is the archive's. The difference
equations are the ordinary realisations of the sections the model names, which is this
site's arithmetic rather than a measurement; the banner at the top of every generated
file says which is which. Where a model has a shape no example is generated from yet,
the page says so instead. A partial one is not printed, because a chain missing a
section is a different effect.

The curves beside it are the same model asked at every setting of the byte, with the
settings a run actually read marked on them. The line between two readings is this
project's interpolation, so it is drawn differently from the readings themselves.

### What is checked about that implementation, and what is not

Published code raises a question a reader cannot answer by looking: is this a final
draft, or has it quietly stopped working? Three things are checked, and one important
thing is not.

**It compiles.** Every published example is compiled, at every release, by a check that
fails the build rather than warning.

**It returns what the same law returns.** The check runs each generated function at all
128 settings of its byte and compares the result against an evaluation, in another
language, of the very constants printed in the file. The two sides apply the same
arithmetic to the same inputs, so what is left between them is the difference between
two implementations of `exp` and `log` — the tolerance is set at that, not at a printing
precision.

**It returns what the figure above it draws.** Each of those values, rounded the way the
chart rounds, must equal the plotted point exactly. This is the actual promise the page
makes to a reader: the curve is what this code computes.

**What is not checked is the one comparison that matters most: against the unit
itself.** That comparison was made by the archive, and it was made against the *model* —
not against this code. The code is a rendering of the model into C++ by this site, and
nothing has ever played it into hardware and listened. A claim's standing says how the
archive's comparison went; it says nothing about this file beyond the three checks above.

### Six words for where a claim stands

A claim page says its standing in one word before anything else, because the two facts
underneath it fail apart and a reader should not have to work them back into a state.
**Withdrawn** is a claim the archive no longer stands behind. **Closed** is a model that
reproduced what the unit did. **Exhausted** is a claim that used every revision it was
allowed — a limit on how long it was pursued, not a verdict on the model, which is why a
model under an exhausted claim can still have reproduced the readings and is still drawn
as one that did. **Not closed** is a model that was built, compared, and did not settle;
the verdict beside it says whether that was the model's doing or the test's. **Undecided**
is a comparison that ran and carries no verdict. **Not yet modelled** is a claim nothing
has been compared against at all — which is not a failure, because nothing has happened
yet that could have failed.
