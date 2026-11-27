import type { Track } from "./chart";
import { tracks } from "./tracks";
import type { useTrackPreview } from "./useTrackPreview";

/** 列出可玩的曲目，并试听所选的音乐。 */
export default function TrackPicker({
  track,
  choose,
  preview,
  locked,
}: {
  track: Track;
  choose: (track: Track) => void;
  preview: ReturnType<typeof useTrackPreview>;
  locked: boolean;
}) {
  return (
    <section className="rhythm-track-picker" aria-label="曲目选择">
      <div className="rhythm-track-controls">
        <label>
          <span>曲目</span>
          <select
            value={track.id}
            onChange={(event) => {
              const selected = tracks.find(
                (item) => item.id === event.target.value,
              );
              if (selected && selected !== track) choose(selected);
            }}
          >
            {tracks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rhythm-preview-button"
          disabled={locked}
          onClick={() => void preview.toggle(track)}
        >
          {preview.state === "playing" ? "停止试听" : "试听"}
        </button>
      </div>
      <p className="rhythm-song">
        <span>{track.genre}</span>
        <span>{track.difficulty}</span>
        <span>{track.bpm} BPM</span>
      </p>
      {preview.state === "unavailable" && (
        <p role="status">当前浏览器无法播放试听。</p>
      )}
    </section>
  );
}
