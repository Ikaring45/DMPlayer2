import assert from "node:assert/strict";
import test from "node:test";

import { parseLrc } from "../app/lib/lyrics.ts";

test("expands multiple timestamps on one LRC line", () => {
  assert.deepEqual(parseLrc("[00:10.00][00:20.00]chorus"), [
    { time: 10, text: "chorus" },
    { time: 20, text: "chorus" },
  ]);
});

test("parses minutes, seconds, and one to three fractional digits", () => {
  assert.deepEqual(
    parseLrc([
      "[1:02.1]one digit",
      "[12:03.12]two digits",
      "[123:04.123]three digits",
      "[00:05]whole second",
      "[00:06:25]colon fraction",
    ].join("\n")),
    [
      { time: 5, text: "whole second" },
      { time: 6.25, text: "colon fraction" },
      { time: 62.1, text: "one digit" },
      { time: 723.12, text: "two digits" },
      { time: 7384.123, text: "three digits" },
    ],
  );
});

test("ignores metadata, malformed timestamps, and empty lyric text", () => {
  assert.deepEqual(
    parseLrc([
      "[ar:Artist]",
      "[al:Album]",
      "[ti:Title]",
      "[by:Editor]",
      "[offset:250]",
      "[00:60.00]invalid seconds",
      "[00:01.1234]invalid fraction",
      "[00:02.00]   ",
      "[00:03.00]\t",
      "plain text",
      "[00:04.00]kept",
    ].join("\n")),
    [{ time: 4, text: "kept" }],
  );
});

test("sorts chronologically and preserves source order for equal timestamps", () => {
  assert.deepEqual(
    parseLrc([
      "[00:20.00]later",
      "[00:10.00]first at ten",
      "[00:10.000]second at ten",
      "[00:05.00][00:10.00]third at ten",
    ].join("\n")),
    [
      { time: 5, text: "third at ten" },
      { time: 10, text: "first at ten" },
      { time: 10, text: "second at ten" },
      { time: 10, text: "third at ten" },
      { time: 20, text: "later" },
    ],
  );
});
