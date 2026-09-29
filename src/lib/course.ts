import courseJson from "../../curriculum/go.course.json";
import { indexCourse, type Course } from "@/engine/course";

// Built by `pnpm course:build` and validated there. Adding a course = adding a JSON file.
export const course = courseJson as unknown as Course;
export const idx = indexCourse(course);
