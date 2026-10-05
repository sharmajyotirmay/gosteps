import courseJson from "../../curriculum/go.course.json";
import dsaJson from "../../curriculum/dsa.track.json";
import { indexCourse, type Course } from "@/engine/course";
import { indexDsa, type DsaTrack } from "@/engine/dsa-track";

// Built by `pnpm course:build` and validated there. Adding a course = adding a JSON file.
export const course = courseJson as unknown as Course;
export const idx = indexCourse(course);

// The DSA track runs alongside the Go course and feeds the same player.
export const dsaTrack = dsaJson as unknown as DsaTrack;
export const dsa = indexDsa(dsaTrack);

/** Every stat shown on the player: the course's stats plus the DSA track's. */
export const stats = [...course.stats, ...dsaTrack.stats.filter((s) => !course.stats.some((c) => c.id === s.id))];
