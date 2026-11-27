import type { components } from "./schema";
export type Schemas = components["schemas"];
export type Persona = Schemas["SessionInput"]["persona"];
export type AuthMode = Schemas["AuthCapabilities"]["mode"];
export type Me =
  | Schemas["SessionUser"]
  | (Schemas["StudentSessionUser"] & { persona?: never });
export type Profile = Schemas["PublicProfile"];
export type OwnProfile = Schemas["Profile"] & {
  publicFields: Schemas["PublicFields"];
};
export type Recruitment = Schemas["Recruitment"];
export type RecruitmentRequirement = Schemas["RecruitmentRequirement"];
export type Competition = Schemas["Competition"];
export type Intent = Schemas["Intent"];
export type IntentDetail = Schemas["IntentDetail"];
export type IntentInput = Schemas["IntentInput"];
export type RecruitmentInput = Schemas["RecruitmentInput"];
export type ProfileInput = Schemas["ProfileInput"] & {
  publicFields: Schemas["PublicFields"];
};
export type Skill = Profile["skills"][number];
