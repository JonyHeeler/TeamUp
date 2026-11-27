import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AppHeader from "../ui/AppHeader";
import { laneForKey } from "./chart";
import RhythmGame from "./RhythmGame";
import { hitWindow, Round } from "./round";
import { tracks } from "./tracks";

const { notes: chart, cues } = tracks[0];

afterEach(cleanup);

it("navigates to the standalone game on the third logo click", () => {
  const move = vi.fn();
  render(
    <AppHeader
      page="welcome"
      mode={null}
      me={null}
      restoring={false}
      switching={false}
      move={move}
      switchPersona={vi.fn()}
    />,
  );
  const logo = screen.getByRole("button", { name: /TeamUP/ });
  fireEvent.click(logo);
  fireEvent.click(logo);
  expect(move).toHaveBeenCalledExactlyOnceWith("/", undefined, "push", false);
  fireEvent.click(logo);
  expect(move).toHaveBeenLastCalledWith("/rhythm", undefined, "push", false);
});

it("accepts F and J without turning Shift, held keys, or shortcuts into strikes", () => {
  expect(laneForKey(new KeyboardEvent("keydown", { code: "KeyF" }))).toBe(
    "left",
  );
  expect(laneForKey(new KeyboardEvent("keydown", { key: "j" }))).toBe("right");
  expect(
    laneForKey(new KeyboardEvent("keydown", { code: "ShiftRight" })),
  ).toBeUndefined();
  expect(
    laneForKey(new KeyboardEvent("keydown", { code: "KeyJ", repeat: true })),
  ).toBeUndefined();
  expect(
    laneForKey(new KeyboardEvent("keydown", { code: "KeyJ", ctrlKey: true })),
  ).toBeUndefined();
});

it("lights both pads before a round and exits with Escape", () => {
  const exit = vi.fn();
  render(<RhythmGame exit={exit} />);
  fireEvent.keyDown(window, { code: "KeyF" });
  fireEvent.keyDown(window, { code: "KeyJ" });
  expect(screen.getByRole("button", { name: /F 左手/ })).toHaveAttribute(
    "data-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: /J 右手/ })).toHaveAttribute(
    "data-pressed",
    "true",
  );
  fireEvent.keyDown(window, { key: "Escape" });
  expect(exit).toHaveBeenCalledOnce();
});

it("switches the song metadata and opens the selected chart at its own tempo", () => {
  render(<RhythmGame exit={vi.fn()} />);
  const picker = screen.getByRole("combobox", { name: "曲目" });
  expect(picker).toHaveValue(tracks[0].id);
  expect(screen.getAllByRole("option")).toHaveLength(tracks.length);
  for (const track of tracks.slice(1)) {
    fireEvent.change(picker, { target: { value: track.id } });
    expect(screen.getByText(track.bpm + " BPM")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "max",
      String(track.duration),
    );
  }
});

it("scores each note once on its own lane and resets combo on a miss", () => {
  const round = new Round(chart);
  const [first, second, third] = chart;
  round.strike("right", first.time);
  expect(round.points).toBe(0);
  round.strike(first.lane, first.time);
  round.strike(first.lane, first.time);
  expect(round.points).toBe(100);
  round.strike(second.lane, second.time - 0.1);
  expect(round.points).toBe(160);
  round.advance(third.time + hitWindow + 0.001);
  expect(round.missed).toBe(1);
  expect(round.combo).toBe(0);
});

it("awards one high five only when both hands strike a linked pair together", () => {
  const time = cues.find((cue) => cue.kind === "pair")!.time;
  const paired = new Round(chart);
  expect(paired.strike("right", time)).toBe("single");
  expect(paired.strike("left", time + 0.025)).toBe("pair");
  expect(paired.strike("left", time + 0.03)).toBeUndefined();
  expect(paired.highFives).toBe(1);
  expect(paired.points).toBe(240);

  const staggered = new Round(chart);
  staggered.strike("left", time - 0.075);
  expect(staggered.strike("right", time + 0.075)).toBe("single");
  expect(staggered.highFives).toBe(0);
});

it("counts three closely spaced taps on the same lane separately", () => {
  const firstRoll = chart.findIndex((note) => note.kind === "roll");
  const round = new Round(chart);
  for (const note of chart.slice(firstRoll, firstRoll + 3)) {
    expect(note.lane).toBe("left");
    expect(round.strike("left", note.time)).toBe("single");
  }
  expect(round.combo).toBe(3);
  expect(round.points).toBe(300);
});

it.each(tracks)(
  "keeps $title's full chart playable and synchronized",
  (track) => {
    const round = new Round(track.notes);
    if (track.music) expect(track.music.bars).toHaveLength(track.bars.length);
    for (const bar of track.bars)
      expect(bar.replaceAll(" ", "")).toMatch(/^[FJXfj.]{16}$/);
    expect(track.sections.map(({ name }) => name)).toEqual([
      "单拍",
      "双手同拍",
      "快速连拍",
    ]);
    expect(track.cues[0].time).toBe(0);

    for (const cue of track.cues) {
      const bar = track.music?.bars[Math.floor(cue.step / 16)];
      if (bar) {
        const onsets = [
          ...(bar.lead ?? []).map(([step]) => step),
          ...(bar.bass ?? []).map(([step]) => step),
          ...(bar.harmony ?? []).map(([step]) => step),
          ...(bar.kick ?? []),
          ...(bar.snare ?? []),
          ...(bar.hat ?? []),
        ];
        expect(onsets).toContain(cue.step % 16);
      }
      for (const note of cue.notes) round.strike(note.lane, note.time);
    }
    round.advance(track.duration);
    expect(round.missed).toBe(0);
    expect(round.bestCombo).toBe(track.notes.length);
    expect(round.highFives).toBe(
      track.cues.filter(({ kind }) => kind === "pair").length,
    );
  },
);
