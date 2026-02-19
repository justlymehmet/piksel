export type Nullable<T> = T | null;

export type TimestampLike =
  | number
  | string
  | Date
  | { seconds: number; nanoseconds?: number }
  | { toMillis: () => number }
  | { toDate: () => Date };

export type FirestoreDateInput = TimestampLike | null | undefined;

export type Uid = string;
export type DocId = string;

export type AsyncState = "idle" | "loading" | "success" | "error";
