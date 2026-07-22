import { describe, expect, it } from "vitest";
import { ApiError } from "./api-error";

describe("ApiError", () => {
  it("is an instance of Error and ApiError", () => {
    const err = new ApiError("boom", { code: "NETWORK_ERROR" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it("carries code, status, and details", () => {
    const err = new ApiError("bad response", {
      code: "VALIDATION_ERROR",
      status: 200,
      details: { fieldErrors: { reward: ["Required"] } },
    });
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(200);
    expect(err.details).toEqual({ fieldErrors: { reward: ["Required"] } });
    expect(err.name).toBe("ApiError");
  });

  it("leaves status and details undefined when not provided", () => {
    const err = new ApiError("network down", { code: "NETWORK_ERROR" });
    expect(err.status).toBeUndefined();
    expect(err.details).toBeUndefined();
  });
});
