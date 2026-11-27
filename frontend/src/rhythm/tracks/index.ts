import { buildTrack } from "../chart";
import { arcade } from "./arcade";
import { classroomSignal } from "./classroomSignal";
import { clubFunk } from "./clubFunk";
import { lateCampus } from "./lateCampus";

export const tracks = [classroomSignal, lateCampus, clubFunk, arcade].map(
  buildTrack,
);
