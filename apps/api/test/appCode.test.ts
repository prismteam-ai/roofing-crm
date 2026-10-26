// B-07 AC-2: the duplicate-lead code must reach the browser. tRPC drops `cause` from the wire
// error, so `withAppCode` copies a string `cause.code` into `data.appCode`.
import { describe, expect, it } from "vitest";
import { withAppCode } from "../src/trpc.js";

describe("withAppCode", () => {
  const shape = { data: { code: "CONFLICT", httpStatus: 409 } };

  it("exposes a string cause.code as data.appCode", () => {
    const cause = Object.assign(new Error("exists"), { code: "ALREADY_EXISTS" });
    expect(withAppCode(shape, cause).data).toEqual({ ...shape.data, appCode: "ALREADY_EXISTS" });
  });

  it("leaves the shape unchanged when the cause has no string code", () => {
    expect(withAppCode(shape, new Error("x")).data).toEqual(shape.data);
    expect(withAppCode(shape, undefined).data).toEqual(shape.data);
    expect(withAppCode(shape, { code: 7 }).data).toEqual(shape.data);
  });
});
