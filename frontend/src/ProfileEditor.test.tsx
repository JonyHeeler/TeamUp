import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ProfileEditor from "./ProfileEditor";
import type { ProfileInput } from "./api/client";

it("lets the owner control visibility of required profile fields", async () => {
  const save = vi.fn();
  const initial: ProfileInput = {
    nickname: "小明",
    qq: "DEMO-QQ-1",
    college: "学院",
    major: "专业",
    grade: "大三",
    contribution: "数据分析",
    skills: ["data-analysis"],
    publicFields: {
      qq: true,
      college: true,
      major: false,
      grade: false,
      experience: false,
      competitionIntent: false,
    },
  };
  function Editor() {
    const [profile, setProfile] = useState(initial);
    return (
      <ProfileEditor
        profile={profile}
        onChange={setProfile}
        fieldError={() => null}
        onSave={() => save(profile)}
        busy={false}
      >
        {null}
      </ProfileEditor>
    );
  }
  render(<Editor />);
  const college = within(screen.getByRole("group", { name: "学院可见范围" }));
  const major = within(screen.getByRole("group", { name: "专业可见范围" }));
  const grade = within(screen.getByRole("group", { name: "年级可见范围" }));
  expect(college.getByRole("button", { name: "公开" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(major.getByRole("button", { name: "隐藏" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await userEvent.click(college.getByRole("button", { name: "隐藏" }));
  await userEvent.click(major.getByRole("button", { name: "公开" }));
  await userEvent.click(grade.getByRole("button", { name: "公开" }));
  await userEvent.click(screen.getByRole("button", { name: "发布名片" }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      publicFields: expect.objectContaining({
        college: false,
        major: true,
        grade: true,
      }),
    }),
  );
});
