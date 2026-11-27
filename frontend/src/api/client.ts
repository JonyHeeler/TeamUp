import { httpApi } from "./business";

export { authApi } from "./auth";
export { httpApi } from "./business";
export { ApiError } from "./http";
export type * from "./types";

export type Api = typeof httpApi;

const mockMethods = new Map<
  keyof Api,
  (...args: unknown[]) => Promise<unknown>
>();

export const api: Api =
  import.meta.env.VITE_TEAMUP_MOCK === "true"
    ? new Proxy({} as Api, {
        /** 按需加载并缓存模拟 API 方法。 */
        get(_target, key: keyof Api) {
          let method = mockMethods.get(key);
          if (!method) {
            method = (...args: unknown[]) =>
              import("./mock").then(({ mockApi }) =>
                (mockApi[key] as (...args: unknown[]) => Promise<unknown>)(
                  ...args,
                ),
              );
            mockMethods.set(key, method);
          }
          return method;
        },
      })
    : httpApi;
