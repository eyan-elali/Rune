import { typingSchedule } from "../../../foundation/time";
import { CHAPTER_1_LAST_TYPED, CHAPTER_1_RETURN_TYPED } from "../../../data/hollow";
import { BOARD, ENDING, MAP, RETURN } from "./script";

// The beats the picture and the sound share: when each typed character
// lands, and when the pointer clicks.

export const TYPING = {
  ending: typingSchedule(CHAPTER_1_LAST_TYPED, ENDING.typeAt, ENDING.seed, ENDING.pace),
  return: typingSchedule(CHAPTER_1_RETURN_TYPED, RETURN.typeAt, RETURN.seed, RETURN.pace),
};

export const CLICKS = [BOARD.open, MAP.open, RETURN.open];
