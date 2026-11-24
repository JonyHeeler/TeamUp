import pdfMake from "pdfmake/build/pdfmake";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { OwnProfile } from "../api/client";
import { copy as t } from "../copy";

import type { ResumeSection } from "./resumeSections";

type ResumeExport = {
  name: string;
  profile: OwnProfile;
  visible: Record<ResumeSection, boolean>;
  evidenceUrls: string[];
};

const ink = "#192333";
const muted = "#5D6B81";
const accent = "#3353A4";
const assetUrl = (path: string) =>
  new URL(import.meta.env.BASE_URL + path, window.location.origin).href;

async function evidenceImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(
    1,
    1200 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理经历证明图片。");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function downloadResume({
  name,
  profile,
  visible,
  evidenceUrls,
}: ResumeExport) {
  const font = assetUrl("fonts/NotoSansSC-Regular.ttf");
  pdfMake.addFonts({ NotoSansSC: { normal: font } });
  const displayName = name.trim() || profile.nickname;
  const [evidence, logo] = await Promise.all([
    visible.evidence ? Promise.all(evidenceUrls.map(evidenceImage)) : [],
    visible.credit
      ? fetch(assetUrl("brand/high-five-mark.svg")).then((response) => {
          if (!response.ok) throw new Error("无法加载平台标志。");
          return response.text();
        })
      : "",
  ]);

  const metadata = [
    visible.college && profile.college,
    visible.major && profile.major,
    visible.grade && profile.grade,
    visible.qq && profile.qq && `QQ ${profile.qq}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const content: Content[] = [
    {
      unbreakable: true,
      stack: [
        { text: displayName, fontSize: 28, color: ink },
        ...(metadata ? [{ text: metadata, style: "metadata" }] : []),
        {
          canvas: [
            {
              type: "line",
              x1: 0,
              y1: 0,
              x2: 499,
              y2: 0,
              lineColor: accent,
              lineWidth: 1.4,
            },
          ],
          margin: [0, 10, 0, 2],
        },
      ],
    },
  ];

  function section(title: string, ...body: Content[]) {
    content.push({ text: title, style: "section", headlineLevel: 1 }, ...body);
  }

  if (visible.contribution && profile.contribution)
    section("自我介绍", profile.contribution);
  if (visible.competitionIntent && profile.competitionIntent)
    section("比赛意向", profile.competitionIntent);
  const skills = [
    ...profile.skills.map((skill) => t.skillNames[skill]),
    ...(profile.customSkills ?? []),
  ];
  if (visible.skills && skills.length) section("技能", skills.join("  ·  "));
  if (visible.experience && profile.experience)
    section("经历", profile.experience);
  if (visible.projects && profile.projects?.length) {
    section(
      "项目经历",
      ...profile.projects.map((project) => ({
        unbreakable: true,
        margin: [0, 0, 0, 5] as [number, number, number, number],
        stack: [
          { text: project.competition, style: "projectTitle" },
          ...(project.role || project.award
            ? [
                {
                  text: [project.role, project.award]
                    .filter(Boolean)
                    .join(" · "),
                  style: "metadata",
                },
              ]
            : []),
          ...(project.description ? [project.description] : []),
        ],
      })),
    );
  }
  if (evidence.length) {
    content.push({
      unbreakable: true,
      stack: [
        { text: "经历证明", style: "section" },
        {
          columns: evidence.map((image) => ({
            image,
            fit: [150, 90],
            width: 150,
          })),
          columnGap: 10,
        },
      ],
    });
  }

  const document: TDocumentDefinitions = {
    info: { title: `${displayName}的简历` },
    pageSize: "A4",
    pageMargins: [48, 38, 48, 50],
    defaultStyle: {
      font: "NotoSansSC",
      fontSize: 10.25,
      color: ink,
      lineHeight: 1.16,
    },
    styles: {
      metadata: { fontSize: 9.5, color: muted },
      section: { fontSize: 13, color: accent, margin: [0, 10, 0, 3] },
      projectTitle: { fontSize: 11.25, color: ink },
    },
    content,
    pageBreakBefore: (node, following) =>
      node.headlineLevel === 1 &&
      (Array.isArray(following)
        ? following.length === 0
        : (
            following as { getFollowingNodesOnPage(): unknown[] }
          ).getFollowingNodesOnPage().length === 0),
    ...(logo
      ? {
          footer: () => ({
            margin: [48, 9, 48, 0],
            columns: [
              { svg: logo, width: 17 },
              {
                text: "一拍即合 TeamUP",
                width: "auto",
                fontSize: 8,
                color: muted,
                margin: [0, 3, 0, 0],
              },
            ],
            columnGap: 5,
          }),
        }
      : {}),
  };
  const safeName = displayName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  await pdfMake.createPdf(document).download(`${safeName}-简历.pdf`);
}
