import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MotionLab } from "../app/components/MotionLab";

async function openTestStep() {
  await userEvent.click(screen.getByRole("button", { name: /^03Test/ }));
}

describe("Crossing Lab controls", () => {
  it("navigates all stages and restores observed flow outside Test", async () => {
    render(<MotionLab />);

    expect(screen.getByRole("button", { name: /^01Watch/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await userEvent.click(screen.getByRole("button", { name: /^02Conflict/ }));
    expect(
      screen.getByRole("heading", {
        name: "The paths meet 0.23 seconds apart.",
      }),
    ).toBeInTheDocument();

    await openTestStep();
    await userEvent.click(screen.getByRole("button", { name: /^Early brake/ }));
    expect(screen.getByRole("button", { name: /^Early brake/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("1.37 s gap")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^01Watch/ }));
    await openTestStep();
    expect(screen.getByRole("button", { name: /^Observed flow/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: /^Protected turn/ }));
    await userEvent.click(screen.getByRole("button", { name: /^02Conflict/ }));
    expect(
      screen.getByRole("heading", {
        name: "The paths meet 0.23 seconds apart.",
      }),
    ).toBeInTheDocument();
  });

  it("persists the light and dark theme control", async () => {
    render(<MotionLab />);
    const lightButton = screen.getByRole("button", {
      name: "Switch to light theme",
    });
    await userEvent.click(lightButton);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("crossing-lab-theme")).toBe("light");
    const darkButton = screen.getByRole("button", {
      name: "Switch to dark theme",
    });
    await userEvent.click(darkButton);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("crossing-lab-theme")).toBe("dark");
  });

  it("plays, pauses, scrubs, and restarts the fixture clock", async () => {
    render(<MotionLab />);
    const timeline = screen.getByRole("slider", { name: "Fixture time" });

    await userEvent.click(
      screen.getByRole("button", { name: "Pause trajectory fixture" }),
    );
    expect(
      screen.getByRole("button", { name: "Play trajectory fixture" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Fixture paused");

    fireEvent.change(timeline, { target: { value: "5.5" } });
    expect(timeline).toHaveValue("5.5");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Fixture positioned with the timeline",
    );

    await userEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(timeline).toHaveValue("0");
    expect(
      screen.getByRole("button", { name: "Pause trajectory fixture" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Restarted from the beginning",
    );
  });

  it("selects actors and moves selection when pedestrian context is hidden", async () => {
    render(<MotionLab />);
    const pedestrian = screen.getByRole("button", {
      name: /P-04 · Crosswalk pedestrian/,
    });
    await userEvent.click(pedestrian);
    expect(pedestrian).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("P-04", { selector: "dd" })).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Pedestrian context" }),
    );
    expect(
      screen.queryByRole("button", { name: /P-04 · Crosswalk pedestrian/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("V-21", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pedestrian hidden; V-21 is now selected",
    );

    const throughVehicle = screen.getByRole("button", {
      name: /V-21 · Southeast through vehicle/,
    });
    expect(throughVehicle).toHaveAttribute("aria-pressed", "true");
  });

  it("runs every timing option and replays the selected result", async () => {
    render(<MotionLab />);
    await openTestStep();

    const observed = screen.getByRole("button", { name: /^Observed flow/ });
    const braking = screen.getByRole("button", { name: /^Early brake/ });
    const protectedTurn = screen.getByRole("button", {
      name: /^Protected turn/,
    });

    expect(observed).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("0.23 s gap")).toHaveLength(2);

    await userEvent.click(braking);
    expect(braking).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("15%", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("1.37 s gap")).toBeInTheDocument();

    await userEvent.click(protectedTurn);
    expect(protectedTurn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("4%", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("2.85 s gap")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Replay this timing/ }));
    expect(screen.getByRole("slider", { name: "Fixture time" })).toHaveValue("0");
    expect(
      screen.getByRole("button", { name: "Pause trajectory fixture" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Protected turn replay started",
    );

    await userEvent.click(observed);
    expect(observed).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("42%", { selector: "strong" })).toHaveLength(2);
  });
});
