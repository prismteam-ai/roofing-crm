const small: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const tens: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const numberWord = [
  ...Object.keys(small),
  ...Object.keys(tens),
  "hundred",
].join("|");
export const NUMBER =
  "(?:-?\\d+(?:\\.\\d+)?|(?:minus\\s+)?(?:" +
  numberWord +
  ")(?:[ -]+(?:and[ -]+)?(?:" +
  numberWord +
  ")){0,4})";
export function cardinal(text: string): number | undefined {
  const normalized = text.toLowerCase().trim();
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    const n = Number(normalized);
    return Number.isFinite(n) ? n : undefined;
  }
  const tokens = normalized
    .replaceAll("-", " ")
    .split(/\s+/)
    .filter((x) => x !== "and");
  const sign = tokens[0] === "minus" ? (tokens.shift(), -1) : 1;
  let result = 0;
  if (
    tokens.length >= 2 &&
    Object.hasOwn(small, tokens[0]) &&
    small[tokens[0]] > 0 &&
    tokens[1] === "hundred"
  ) {
    result = small[tokens[0]] * 100;
    tokens.splice(0, 2);
  }
  if (tokens.length === 1 && Object.hasOwn(small, tokens[0]))
    result += small[tokens[0]];
  else if (tokens.length === 1 && Object.hasOwn(tens, tokens[0]))
    result += tens[tokens[0]];
  else if (
    tokens.length === 2 &&
    Object.hasOwn(tens, tokens[0]) &&
    Object.hasOwn(small, tokens[1]) &&
    small[tokens[1]] > 0 &&
    small[tokens[1]] < 10
  )
    result += tens[tokens[0]] + small[tokens[1]];
  else if (tokens.length !== 0) return undefined;
  return sign * result;
}

export const numeric = "(?<n>" + NUMBER + ")";
